const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const User = require('../models/User');
const Store = require('../models/Store');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { sendMail } = require('../utils/mailer');

// ── Config ────────────────────────────────────────────────────────────────────
const promotionLimits = { tier1: 20, tier2: 50, tier3: 100 };
const scanLimits      = { tier1: 1000, tier2: 5000, tier3: 10000 };

const planDurations = {
  tier1: { monthly: 30, yearly: 365 },
  tier2: { monthly: 30, yearly: 365 },
  tier3: { monthly: 30, yearly: 365 },
};

const planAmounts = {
  tier1: { monthly: 2900,  yearly: 30000  },
  tier2: { monthly: 5900,  yearly: 60000  },
  tier3: { monthly: 9900,  yearly: 99900  },
};

// ── Order ID generator ────────────────────────────────────────────────────────
const generateOrderId = async () => {
  const year   = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const last   = await Subscription.findOne({ order_id: { $regex: `^${prefix}` } })
    .sort({ order_id: -1 })
    .select('order_id');
  let sequence = 1;
  if (last) {
    const parts = last.order_id.split('-');
    sequence = parseInt(parts[parts.length - 1]) + 1;
  }
  return `${prefix}${sequence.toString().padStart(3, '0')}`;
};

// ── POST /api/payments/create-payment-intent ──────────────────────────────────
const createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user   = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const {
      currency      = 'usd',
      email,
      name,
      plan          = 'tier1',
      billing_cycle = 'monthly',
      type,
    } = req.body;

    // ── Store verification payment (role 3 / explicit type only) ──
    const isVerificationPayment = type === 'store_verification' || user.role === 3;

    if (isVerificationPayment) {
      if (user.verified && user.subscription_end_time) {
        const expiry = new Date(user.subscription_end_time);
        if (expiry > new Date()) {
          return res.json({ success: true, already_verified: true });
        }
      }

      const amount = 199700; // $1,997 fixed for store owners

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        receipt_email: email || user.email || undefined,
        metadata: {
          user_id:       userId,
          plan:          'tier1',
          billing_cycle: 'yearly',
          type:          'store_verification',
          name:          name || user.full_name || '',
          email:         email || user.email || '',
        },
      });

      return res.json({
        success:         true,
        clientSecret:    paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    }

    // ── Reseller tier subscription (role 2) ──
    if (!planAmounts[plan]) {
      return res.status(400).json({ success: false, message: `Invalid plan: ${plan}` });
    }
    if (!['monthly', 'yearly'].includes(billing_cycle)) {
      return res.status(400).json({ success: false, message: `Invalid billing_cycle: ${billing_cycle}` });
    }

    const amount = planAmounts[plan][billing_cycle];

    console.log(`Creating PaymentIntent — user: ${userId} | plan: ${plan} | billing: ${billing_cycle} | amount: ${amount}`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      receipt_email: email || user.email || undefined,
      metadata: {
        user_id:       userId,
        plan,
        billing_cycle,
        type:          'subscription',
        name:          name || user.full_name || '',
        email:         email || user.email || '',
      },
    });

    return res.json({
      success:         true,
      clientSecret:    paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    return res.status(500).json({ success: false, message: 'Payment setup failed', error: error.message });
  }
};

// ── POST /api/payments/confirm-verification ───────────────────────────────────
const confirmVerification = async (req, res) => {
  try {
    const { payment_intent_id, plan: reqPlan, billing_cycle: reqBillingCycle } = req.body;
    const userId = req.user.userId;

    console.log('=== confirmVerification called ===');
    console.log('userId:', userId);
    console.log('payment_intent_id:', payment_intent_id);
    console.log('req.body:', JSON.stringify(req.body));

    if (!payment_intent_id) {
      return res.status(400).json({ success: false, message: 'payment_intent_id is required' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    console.log('Stripe paymentIntent.status:', paymentIntent.status);
    console.log('Stripe metadata.user_id:', paymentIntent.metadata?.user_id);
    console.log('req userId:', userId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${paymentIntent.status}`,
      });
    }

    if (paymentIntent.metadata?.user_id !== userId) {
      console.log('❌ userId mismatch — metadata:', paymentIntent.metadata?.user_id, 'req:', userId);
      return res.status(403).json({ success: false, message: 'Payment does not belong to this user.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    console.log('User found:', user._id, '| role:', user.role, '| verified before:', user.verified);

    const activePlan    = reqPlan || paymentIntent.metadata?.plan || 'tier1';
    const billing_cycle = reqBillingCycle || paymentIntent.metadata?.billing_cycle || 'yearly';

    const duration   = planDurations[activePlan][billing_cycle];
    const isReseller = user.role === 2;
    const scanLimit  = scanLimits[activePlan];
    const promoLimit = promotionLimits[activePlan];
    const isUpgrade  = !!user.subscription;

    console.log('activePlan:', activePlan, '| billing_cycle:', billing_cycle, '| duration:', duration);

    if (isUpgrade) {
      await Subscription.findByIdAndUpdate(user.subscription, {
        $set: {
          plan:          activePlan,
          billing_cycle,
          amount:        paymentIntent.amount,
          duration,
          status:        'completed',
          date:          new Date(),
          payment_method: {
            card_number:     '0000000000000000',
            cardholder_name: paymentIntent.metadata?.name || user.full_name || 'Cardholder',
            expiry_month:    '01',
            expiry_year:     '9999',
            cvc:             '000',
          },
        },
      });
      console.log('✅ Subscription updated (upgrade)');
    } else {
      const order_id     = await generateOrderId();
      const subscription = new Subscription({
        _id:           uuidv4(),
        order_id,
        user_id:       userId,
        user_name:     user.full_name,
        type:          user.role === 3 ? 'store_owner' : 'reseller',
        plan:          activePlan,
        billing_cycle,
        amount:        paymentIntent.amount,
        status:        'completed',
        duration,
        date:          new Date(),
        payment_method: {
          card_number:     '0000000000000000',
          cardholder_name: paymentIntent.metadata?.name || user.full_name || 'Cardholder',
          expiry_month:    '01',
          expiry_year:     '9999',
          cvc:             '000',
        },
      });
      await subscription.save();
      user.subscription = subscription._id.toString();
      console.log('✅ New subscription created:', subscription._id);
    }

    // ── Update user ──────────────────────────────────────────────────────────
    user.verified              = true;
    user.status                = 'approved';
    user.subscription_end_time = moment().add(duration, 'days').toDate();
    user.updated_at            = Date.now();

    if (isReseller) {
      user.total_scans = scanLimit;
      user.scans_used  = isUpgrade ? user.scans_used : [];
    } else {
      user.total_promotions = promoLimit;
      user.used_promotions  = 0;
    }

    await user.save();
    console.log('✅ User saved — verified:', user.verified, '| status:', user.status);

    // ── Update store ─────────────────────────────────────────────────────────
    const storeUpdate = await Store.findOneAndUpdate(
      { user_id: userId },
      { $set: { verified: true, updated_at: Date.now() } },
      { new: true },
    );
    console.log('✅ Store update result:', storeUpdate ? `store verified: ${storeUpdate.verified}` : '❌ NO STORE FOUND for user_id: ' + userId);

    // ── Notification ─────────────────────────────────────────────────────────
    const billingLabel = billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const endDateStr   = moment(user.subscription_end_time).format('YYYY-MM-DD');
    const notifContent = isReseller
      ? `You are now verified on the ${activePlan} (${billingLabel}) plan. You can scan up to ${scanLimit.toLocaleString()} items. Verification ends on ${endDateStr}.`
      : `You are now verified on the ${activePlan} (${billingLabel}) plan. You can create up to ${promoLimit} promotions. Verification ends on ${endDateStr}.`;

    const notification = new Notification({
      _id:     uuidv4(),
      user_id: userId,
      heading: isUpgrade ? 'Verification Renewed 🎉' : 'Store Verified! 🎉',
      content: notifContent,
      type:    user.role === 3 ? 'store_owner' : 'reseller',
    });
    await notification.save();

    try {
      await sendMail(
        user.email,
        isUpgrade ? '🎉 Your BinIQ Verification Renewed!' : '🎉 Your BinIQ Store is Now Verified!',
        `Hi ${user.full_name},\n\n${notifContent}\n\nBest regards,\nThe BinIQ Team`,
      );
    } catch (mailError) {
      console.warn('Email send failed:', mailError.message);
    }

    return res.json({
      success:               true,
      message:               isUpgrade ? 'Verification renewed successfully' : 'Store verified successfully',
      plan:                  activePlan,
      billing_cycle,
      is_upgrade:            isUpgrade,
      verified:              true,
      status:                'approved',
      total_scans:           isReseller ? scanLimit  : undefined,
      total_promotions:      isReseller ? undefined  : promoLimit,
      subscription_end_time: user.subscription_end_time,
    });

  } catch (error) {
    console.error('❌ confirmVerification FULL ERROR:', error);
    return res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
  }
};

// ── Stripe Webhook (backup) ───────────────────────────────────────────────────
const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi           = event.data.object;
    const userId       = pi.metadata?.user_id;
    const activePlan   = pi.metadata?.plan || 'tier1';
    const billingCycle = pi.metadata?.billing_cycle || 'yearly';
    const duration     = planDurations[activePlan]?.[billingCycle] || 365;
    const promoLimit   = promotionLimits[activePlan] || 20;

    if (userId) {
      try {
        await User.findByIdAndUpdate(userId, {
          verified:              true,
          status:                'approved',
          updated_at:            Date.now(),
          subscription_end_time: moment().add(duration, 'days').toDate(),
          total_promotions:      promoLimit,
          used_promotions:       0,
        });

        // Update store for all roles
        await Store.findOneAndUpdate(
          { user_id: userId },
          { $set: { verified: true, updated_at: Date.now() } },
        );

        console.log(`✅ User ${userId} verified via webhook — plan: ${activePlan}`);
      } catch (err) {
        console.error('Webhook update failed:', err.message);
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    console.log(`❌ Payment failed: ${event.data.object.id}`);
  }

  res.json({ received: true });
};

module.exports = { createPaymentIntent, confirmVerification, stripeWebhook };