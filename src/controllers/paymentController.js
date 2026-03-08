// controllers/paymentController.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const User = require('../models/User');
const Store = require('../models/Store');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { sendMail } = require('../utils/mailer');

// ── Tier config (matches PDF chart) ──────────────────────────────────────────
const promotionLimits = {
  tier1: 20,
  tier2: 50,
  tier3: 100,
};

const planDurations = {
  tier1: 30,
  tier2: 60,
  tier3: 90,
};

// Amount in cents — matches frontend TIER_AMOUNTS
const planAmounts = {
  tier1: 2900,  // $29
  tier2: 5900,  // $59
  tier3: 9900,  // $99
};

// ── Order ID generator ────────────────────────────────────────────────────────
const generateOrderId = async () => {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const lastSubscription = await Subscription.findOne({
    order_id: { $regex: `^${prefix}` },
  })
    .sort({ order_id: -1 })
    .select('order_id');
  let sequence = 1;
  if (lastSubscription) {
    const parts = lastSubscription.order_id.split('-');
    const lastSequence = parseInt(parts[parts.length - 1]);
    sequence = lastSequence + 1;
  }
  return `${prefix}${sequence.toString().padStart(3, '0')}`;
};

// ── POST /api/payments/create-payment-intent ──────────────────────────────────
const createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const { currency = 'usd', email, name, plan = 'tier1' } = req.body;

    // Use server-side amounts to prevent tampering
    const amount = planAmounts[plan];
    if (!amount) {
      return res.status(400).json({ success: false, message: `Invalid plan: ${plan}` });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      receipt_email: email || user.email || undefined,
      metadata: {
        user_id: userId,
        plan,
        name: name || user.full_name || '',
        email: email || user.email || '',
      },
    });

    return res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment setup failed',
      error: error.message,
    });
  }
};

// ── POST /api/payments/confirm-verification ───────────────────────────────────
const confirmVerification = async (req, res) => {
  try {
    const { payment_intent_id, plan } = req.body;
    const userId = req.user.userId;

    if (!payment_intent_id) {
      return res
        .status(400)
        .json({ success: false, message: 'payment_intent_id is required' });
    }

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${paymentIntent.status}`,
      });
    }

    // Ensure this payment belongs to the requesting user
    if (paymentIntent.metadata?.user_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: 'Payment does not belong to this user.' });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, message: 'User not found' });

    const activePlan = plan || paymentIntent.metadata?.plan || 'tier1';

    // Validate plan
    if (!planDurations[activePlan]) {
      return res.status(400).json({ success: false, message: `Invalid plan: ${activePlan}` });
    }

    const duration = planDurations[activePlan];
    const totalPromotions = promotionLimits[activePlan];

    // Create Subscription record
    const order_id = await generateOrderId();
    const subscription = new Subscription({
      _id: uuidv4(),
      order_id,
      user_id: userId,
      user_name: user.full_name,
      type: user.role === 3 ? 'store_owner' : 'reseller',
      plan: activePlan,
      amount: paymentIntent.amount,
      status: 'completed',
      duration,
      date: new Date(),
      payment_method: {
        card_number: '0000000000000000',   // placeholder — real card handled by Stripe
        cardholder_name: paymentIntent.metadata?.name || user.full_name || 'Cardholder',
        expiry_month: '01',
        expiry_year: '9999',
        cvc: '000',
      },
    });
    await subscription.save();

    // Update user
    user.verified = true;
    user.subscription = subscription._id.toString();
    user.subscription_end_time = moment().add(duration, 'days').toDate();
    user.total_promotions = totalPromotions;
    user.used_promotions = 0;
    user.updated_at = Date.now();
    await user.save();

    // Mark store verified (store owners)
    if (user.role === 3) {
      await Store.findOneAndUpdate(
        { user_id: userId },
        { $set: { verified: true, updated_at: Date.now() } },
        { new: true }
      );
    }

    // In-app notification
    const notification = new Notification({
      _id: uuidv4(),
      user_id: userId,
      heading: 'Subscription Active! 🎉',
      content: `You are now on the ${activePlan} plan. You can create up to ${totalPromotions} promotions. Subscription ends on ${moment(user.subscription_end_time).format('YYYY-MM-DD')}.`,
      type: user.role === 3 ? 'store_owner' : 'reseller',
    });
    await notification.save();

    // Email confirmation
    try {
      await sendMail(
        user.email,
        '🎉 Your BinIQ Subscription is Active!',
        `Hi ${user.full_name},\n\nYou are now subscribed to the ${activePlan} plan.\nYou can create up to ${totalPromotions} promotions.\nSubscription ends on: ${moment(user.subscription_end_time).format('YYYY-MM-DD')}.\n\nBest regards,\nThe BinIQ Team`
      );
    } catch (mailError) {
      console.warn('Email send failed:', mailError.message);
    }

    return res.json({
      success: true,
      message: `Subscribed to ${activePlan} plan successfully`,
      plan: activePlan,
      total_promotions: totalPromotions,
      subscription_end_time: user.subscription_end_time,
    });
  } catch (error) {
    console.error('Confirm verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message,
    });
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
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const userId = pi.metadata?.user_id;
    const activePlan = pi.metadata?.plan || 'tier1';
    const duration = planDurations[activePlan] || 30;
    const totalPromotions = promotionLimits[activePlan] || 20;

    if (userId) {
      try {
        await User.findByIdAndUpdate(userId, {
          verified: true,
          updated_at: Date.now(),
          subscription_end_time: moment().add(duration, 'days').toDate(),
          total_promotions: totalPromotions,
          used_promotions: 0,
        });
        await Store.findOneAndUpdate(
          { user_id: userId },
          { $set: { verified: true, updated_at: Date.now() } }
        );
        console.log(`✅ User ${userId} subscription activated via webhook — plan: ${activePlan}`);
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