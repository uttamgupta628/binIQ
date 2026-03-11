
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

module.exports = {
  getSubscriptions,
  getAllSubscriptions,
  verifyStoreOwnerSubscription,
};