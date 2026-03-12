const Store = require('../models/Store');  
const { v4: uuidv4 }         = require('uuid');
const User                   = require('../models/User');
const Subscription           = require('../models/Subscription');
const Notification           = require('../models/Notification');
const { sendMail }           = require('../utils/mailer');

// ── GET /api/subscriptions — user's own verification history ─────────────────
const getSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const subscriptions = await Subscription.find({ user_id: user._id })
      .select('-payment_method.card_number -payment_method.cvc')
      .lean();

    const formatted = subscriptions.map(sub => ({
      ...sub,
      payment_method: {
        cardholder_name: sub.payment_method?.cardholder_name || null,
        expiry_month:    sub.payment_method?.expiry_month    || null,
        expiry_year:     sub.payment_method?.expiry_year     || null,
      },
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ── GET /api/subscriptions/all — admin: all verified users ───────────────────
const getAllSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Requester not found' });
    if (user.role !== 1) {
      return res.status(403).json({ success: false, message: 'Only admins can access this endpoint' });
    }

    const subscriptions = await Subscription.find({ status: 'completed' })
      .populate({
        path:   'user_id',
        select: 'full_name email role store_name total_promotions used_promotions total_scans verified status',
      })
      .select('-payment_method.card_number -payment_method.cvc')
      .lean();

    if (!subscriptions.length) {
      return res.json({ success: true, data: [] });
    }

    const formatted = subscriptions.map(sub => {
      const u = sub.user_id || {};
      return {
        subscription_id: sub._id,
        order_id:        sub.order_id,
        user: {
          user_id:          u._id,
          full_name:        u.full_name,
          email:            u.email,
          role:             u.role === 2 ? 'reseller' : u.role === 3 ? 'store_owner' : 'unknown',
          store_name:       u.store_name    || null,
          verified:         u.verified      || false,
          status:           u.status        || 'pending',
          total_promotions: u.total_promotions || 0,
          used_promotions:  u.used_promotions  || 0,
          total_scans:      u.total_scans       || 0,
        },
        type:          sub.type,
        plan:          sub.plan,
        billing_cycle: sub.billing_cycle,
        amount:        sub.amount,
        status:        sub.status,
        date:          sub.date,
        duration:      sub.duration,
        payment_method: {
          cardholder_name: sub.payment_method?.cardholder_name || null,
          expiry_month:    sub.payment_method?.expiry_month    || null,
          expiry_year:     sub.payment_method?.expiry_year     || null,
        },
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Get all subscriptions error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ── GET /api/subscriptions/verify/:storeOwnerId ───────────────────────────────
const verifyStoreOwnerSubscription = async (req, res) => {
  try {
    const { storeOwnerId } = req.params;
    const user = await User.findById(storeOwnerId).select('role verified status subscription subscription_end_time');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // ── Verified if: verified flag true + status approved + not expired ──
    const now        = new Date();
    const notExpired = user.subscription_end_time && new Date(user.subscription_end_time) > now;
    const isVerified = user.verified === true && user.status === 'approved' && notExpired;

    return res.json({ success: true, verified: !!isVerified });
  } catch (error) {
    console.error('Verify subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ── POST /api/subscriptions/admin-assign — admin assigns plan to user ─────────
const adminAssignSubscription = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester || requester.role !== 1) {
      return res.status(403).json({ success: false, message: 'Only admins can assign subscriptions' });
    }

    const { userId, planType, durationDays } = req.body;

    if (!userId || !planType || !durationDays) {
      return res.status(400).json({ success: false, message: 'userId, planType and durationDays are required' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
    if (targetUser.role === 1) return res.status(400).json({ success: false, message: 'Cannot assign subscription to admin' });

    // ── Schema constraints ─────────────────────────────────────────────────
    // type enum:  "reseller" | "store_owner"
    // plan enum:  "tier1" | "tier2" | "tier3"
    // store owners get tier1 at $1,997 price — plan field must still be tier1/2/3
    // ──────────────────────────────────────────────────────────────────────

    const VALID_PLANS = ['tier1', 'tier2', 'tier3', 'store_verification'];

    if (!VALID_PLANS.includes(planType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid planType. Valid values: ${VALID_PLANS.join(', ')}`,
      });
    }

    // Role guard
    if (targetUser.role === 3 && planType !== 'store_verification') {
      return res.status(400).json({ success: false, message: 'Store owners must use store_verification plan' });
    }
    if (targetUser.role === 2 && planType === 'store_verification') {
      return res.status(400).json({ success: false, message: 'Resellers must use tier1, tier2, or tier3' });
    }

    // ── Map planType to schema-valid values ────────────────────────────────
    // type field:  "reseller" for role 2, "store_owner" for role 3
    // plan field:  tier1/tier2/tier3 only (store_verification maps to tier1)
    const schemaType = targetUser.role === 3 ? 'store_owner' : 'reseller';
    const schemaPlan = planType === 'store_verification' ? 'tier1' : planType;

    // ── Amounts ────────────────────────────────────────────────────────────
    const AMOUNTS = {
      store_verification: 1997,  // $1,997
      tier1:               29,   // $99
      tier2:              59,   // $199
      tier3:              99,   // $299
    };
    const LABELS = {
      store_verification: 'Store Verification',
      tier1: 'Tier 1',
      tier2: 'Tier 2',
      tier3: 'Tier 3',
    };

    const amount = AMOUNTS[planType];
    const label  = LABELS[planType];

    const now     = new Date();
    const endTime = new Date(now);
    endTime.setDate(endTime.getDate() + parseInt(durationDays));

    // ── Create Subscription ────────────────────────────────────────────────
    const subscription = new Subscription({
      _id:           uuidv4(),
      order_id:      `ADMIN-${uuidv4().slice(0, 8).toUpperCase()}`,
      user_id:       targetUser._id,
      user_name:     targetUser.full_name,           // ← required field
      type:          schemaType,                     // ← "reseller" | "store_owner"
      plan:          schemaPlan,                     // ← "tier1" | "tier2" | "tier3"
      billing_cycle: parseInt(durationDays) <= 31 ? 'monthly' : 'yearly',
      amount,
      status:        'completed',
      date:          now,
      duration:      parseInt(durationDays),
      payment_method: {
        card_number:     'ADMIN-ASSIGNED',            // ← required, dummy value
        cardholder_name: 'Admin Assigned',            // ← required
        expiry_month:    '01',                        // ← required
        expiry_year:     '9999',                      // ← required
        cvc:             '000',                       // ← required
      },
    });

    await subscription.save();

    // ── Update User ────────────────────────────────────────────────────────
    targetUser.subscription          = subscription._id;
    targetUser.subscription_end_time = endTime;
    targetUser.verified              = true;
    targetUser.status                = 'approved';
    targetUser.updated_at            = now;
    await targetUser.save();

    // ── Update Store if store owner ────────────────────────────────────────
    if (targetUser.role === 3) {
      await Store.findOneAndUpdate(
        { user_id: targetUser._id },
        { $set: { verified: true, updated_at: now } },
      );
    }

    // ── Notify user ────────────────────────────────────────────────────────
    const notification = new Notification({
      _id:     uuidv4(),
      user_id: targetUser._id,
      heading: 'Subscription Activated',
      content: `Your ${label} plan has been activated by admin. Valid until ${endTime.toDateString()}.`,
      type:    targetUser.role === 3 ? 'store_owner' : 'reseller',
    });
    await notification.save();

    try {
      await sendMail(
        targetUser.email,
        'Subscription Activated — BinIQ',
        `Hi ${targetUser.full_name},\n\nYour ${label} plan has been activated by admin.\nValid until: ${endTime.toDateString()}.\n\nBinIQ Team`,
      );
    } catch (mailErr) {
      console.warn('Mail send failed (non-fatal):', mailErr.message);
    }

    res.status(201).json({
      success: true,
      message: `${label} plan assigned successfully`,
      data: {
        subscription_id:       subscription._id,
        order_id:              subscription.order_id,
        user_id:               targetUser._id,
        user_name:             targetUser.full_name,
        type:                  schemaType,
        plan:                  schemaPlan,
        amount,
        subscription_end_time: endTime,
        verified:              true,
        status:                'approved',
      },
    });
  } catch (error) {
    console.error('Admin assign subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
module.exports = {
  getSubscriptions,
  getAllSubscriptions,
  verifyStoreOwnerSubscription,
  adminAssignSubscription,
};