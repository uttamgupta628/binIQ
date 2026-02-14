const { check, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const Notification = require("../models/Notification");
const Plan = require("../models/Plan");
const { sendMail } = require("../utils/mailer");

const promotionLimits = {
  tier1: 20,
  tier2: 50,
  tier3: 100,
};

const scanLimits = {
  tier1: 20,
  tier2: 50,
  tier3: 100,
};
const generateOrderId = async () => {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const lastSubscription = await Subscription.findOne({
    order_id: { $regex: `^${prefix}` },
  })
    .sort({ order_id: -1 })
    .select("order_id");
  let sequence = 1;
  if (lastSubscription) {
    const lastSequence = parseInt(lastSubscription.order_id.split("-")[2]);
    sequence = lastSequence + 1;
  }
  return `${prefix}${sequence.toString().padStart(3, "0")}`;
};
const getSubscriptionTiers = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (user.role !== 1 && user.role !== 2)
      return res.status(403).json({
        success: false,
        message: "Only admins and resellers can access this endpoint",
      });

    const query = user.role === 1 ? {} : { type: "reseller" };
    const plans = await Plan.find(query).select("type tier amount duration");
    const formattedPlans = {
      reseller: {},
      store_owner: {},
    };
    plans.forEach((plan) => {
      formattedPlans[plan.type][plan.tier] = {
        plan_id: plan._id,
        amount: plan.amount,
        duration: plan.duration,
      };
    });

    if (user.role === 2) delete formattedPlans.store_owner;

    res.json({
      success: true,
      data: formattedPlans,
    });
  } catch (error) {
    console.error("Get subscription tiers error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const updateSubscriptionTiers = [
  check("tiers").isArray().withMessage("Tiers must be an array"),
  check("tiers.*.type")
    .isIn(["reseller", "store_owner"])
    .withMessage("Type must be reseller or store_owner"),
  check("tiers.*.tier")
    .isIn(["tier1", "tier2", "tier3"])
    .withMessage("Tier must be tier1, tier2, or tier3"),
  check("tiers.*.amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a non-negative number"),
  check("tiers.*.duration")
    .isInt({ min: 1 })
    .withMessage("Duration must be a positive integer"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { tiers } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({ success: false, message: "Only admins can update tiers" });

    try {
      for (const tier of tiers) {
        await Plan.updateOne(
          { type: tier.type, tier: tier.tier },
          {
            $set: {
              amount: tier.amount,
              duration: tier.duration,
              updated_at: Date.now(),
            },
          },
          { upsert: true }
        );
      }

      const updatedPlans = await Plan.find().select(
        "type tier amount duration"
      );
      const formattedPlans = {
        reseller: {},
        store_owner: {},
      };
      updatedPlans.forEach((plan) => {
        formattedPlans[plan.type][plan.tier] = {
          amount: plan.amount,
          duration: plan.duration,
        };
      });

      res.json({
        success: true,
        message: "Subscription tiers updated successfully",
        data: formattedPlans,
      });
    } catch (error) {
      console.error("Update subscription tiers error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getAllSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      console.error(`User not found for ID: ${req.user.userId}`);
      return res.status(404).json({
        success: false,
        message: "Requester not found",
      });
    }
    if (user.role !== 1) {
      console.error(
        `Non-admin user attempted access: ${user.email}, role: ${user.role}`
      );
      return res.status(403).json({
        success: false,
        message: "Only admins can access this endpoint",
      });
    }

    const subscriptions = await Subscription.find({ status: "completed" })
      .populate({
        path: "user_id",
        select:
          "full_name email role store_name total_promotions used_promotions total_scans",
      })
      .select("-payment_method.card_number -payment_method.cvc")
      .lean();

    if (!subscriptions.length) {
      console.log("No completed subscriptions found");
      return res.json({
        success: true,
        data: [],
      });
    }

    const formattedSubscriptions = subscriptions.map((sub) => {
      const userData = sub.user_id || {
        _id: null,
        full_name: "Unknown",
        email: "Unknown",
        role: null,
        store_name: null,
        total_promotions: 0,
        used_promotions: 0,
        total_scans: 0,
      };

      return {
        subscription_id: sub._id,
        order_id: sub.order_id,
        user: {
          user_id: userData._id,
          full_name: userData.full_name,
          email: userData.email,
          role:
            userData.role === 2
              ? "reseller"
              : userData.role === 3
              ? "store_owner"
              : "unknown",
          store_name: userData.store_name || null,
          total_promotions: userData.total_promotions || 0,
          used_promotions: userData.used_promotions || 0,
          total_scans: userData.total_scans || 0,
        },
        type: sub.type,
        plan: sub.plan,
        amount: sub.amount,
        status: sub.status,
        date: sub.date,
        duration: sub.duration,
        payment_method: {
          cardholder_name: sub.payment_method?.cardholder_name || null,
          expiry_month: sub.payment_method?.expiry_month || null,
          expiry_year: sub.payment_method?.expiry_year || null,
        },
      };
    });

    res.json({
      success: true,
      data: formattedSubscriptions,
    });
  } catch (error) {
    console.error("Get all subscriptions error:", {
      message: error.message,
      stack: error.stack,
      userId: req.user.userId,
    });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const manageSubscriptionCounts = [
  check("user_id").notEmpty().withMessage("User ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { user_id } = req.body;
    const admin = await User.findById(req.user.userId);
    if (!admin || admin.role !== 1)
      return res.status(403).json({
        success: false,
        message: "Only admins can manage subscription counts",
      });

    try {
      const user = await User.findById(user_id);
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      if (user.role === 1)
        return res
          .status(403)
          .json({ success: false, message: "Cannot manage counts for admins" });

      const subscription = await Subscription.findById(user.subscription);
      if (!subscription || subscription.status !== "completed") {
        user.total_promotions = user.role === 3 ? 0 : user.total_promotions;
        user.total_scans = user.role === 2 ? 0 : user.total_scans;
        await user.save();
        return res.json({
          success: true,
          message: "Counts reset due to no active subscription",
          data: {
            user_id: user._id,
            total_promotions: user.total_promotions,
            used_promotions: user.used_promotions || 0,
            total_scans: user.total_scans,
          },
        });
      }

      const limits = user.role === 2 ? scanLimits : promotionLimits;
      const limit = limits[subscription.plan] || 0;

      if (user.role === 3) {
        user.total_promotions = limit;
      } else if (user.role === 2) {
        user.total_scans = limit;
      }
      await user.save();

      const notification = new Notification({
        _id: uuidv4(),
        user_id: user._id,
        heading: "Subscription Limits Updated",
        content: `Your ${
          user.role === 3 ? "promotion" : "scan"
        } limit has been updated to ${limit} based on your ${
          subscription.plan
        } subscription.`,
        type: user.role === 3 ? "store_owner" : "reseller",
      });
      await notification.save();
      await sendMail(
        user.email,
        "Subscription Limits Updated",
        `Your ${
          user.role === 3 ? "promotion" : "scan"
        } limit has been updated to ${limit} based on your ${
          subscription.plan
        } subscription.`
      );

      res.json({
        success: true,
        message: "Subscription counts updated successfully",
        data: {
          user_id: user._id,
          total_promotions: user.total_promotions || 0,
          used_promotions: user.used_promotions || 0,
          total_scans: user.total_scans || 0,
        },
      });
    } catch (error) {
      console.error("Manage subscription counts error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const subscribe = [
  check("plan")
    .isIn(["tier1", "tier2", "tier3"])
    .withMessage("Plan must be tier1, tier2, or tier3"),
  check("payment_method.card_number")
    .notEmpty()
    .matches(/^\d{16}$/)
    .withMessage("Card number must be 16 digits"),
  check("payment_method.cardholder_name")
    .notEmpty()
    .withMessage("Cardholder name is required"),
  check("payment_method.expiry_month")
    .notEmpty()
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage("Valid expiry month (01-12) is required"),
  check("payment_method.expiry_year")
    .notEmpty()
    .matches(/^\d{4}$/)
    .withMessage("Valid expiry year is required"),
  check("payment_method.cvc")
    .notEmpty()
    .matches(/^\d{3,4}$/)
    .withMessage("Valid CVC (3-4 digits) is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { plan, payment_method } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === 1)
        return res.status(403).json({ message: "Admins cannot subscribe" });

      const type = user.role === 2 ? "reseller" : "store_owner";
      const planConfig = await Plan.findOne({ type, tier: plan });
      if (!planConfig)
        return res.status(400).json({ message: "Invalid plan for user type" });

      const paymentStatus = "completed";
      const order_id = await generateOrderId();
      const subscription = new Subscription({
        _id: uuidv4(),
        order_id,
        user_id: userId,
        user_name: user.full_name,
        type,
        plan,
        amount: planConfig.amount,
        status: paymentStatus,
        duration: planConfig.duration,
        date: new Date(),
        payment_method,
      });
      await subscription.save();

      user.subscription = subscription._id.toString();
      user.subscription_end_time = moment(subscription.date)
        .add(subscription.duration, "days")
        .toDate();
      if (user.role === 3) {
        user.total_promotions = promotionLimits[plan] || 0;
        user.used_promotions = 0;
      } else if (user.role === 2) {
        user.total_scans = scanLimits[plan] || 0;
      }
      await user.save();

      const notification = new Notification({
        _id: uuidv4(),
        user_id: userId,
        heading: "Subscription Successful",
        content: `Subscribed to ${plan} plan successfully. Subscription ends on ${moment(
          user.subscription_end_time
        ).format("YYYY-MM-DD")}. Your ${
          user.role === 3 ? "promotion" : "scan"
        } limit is ${
          user.role === 3 ? user.total_promotions : user.total_scans
        }.`,
        type,
      });
      await notification.save();
      await sendMail(
        user.email,
        "Subscription Confirmation",
        `You have subscribed to the ${plan} plan. Your subscription ends on ${moment(
          user.subscription_end_time
        ).format("YYYY-MM-DD")}. Your ${
          user.role === 3 ? "promotion" : "scan"
        } limit is ${
          user.role === 3 ? user.total_promotions : user.total_scans
        }.`
      );

      res.json({
        message: `Subscribed to ${plan} plan successfully`,
        subscription: {
          ...subscription.toObject(),
          payment_method: {
            cardholder_name: subscription.payment_method.cardholder_name,
            expiry_month: subscription.payment_method.expiry_month,
            expiry_year: subscription.payment_method.expiry_year,
          },
        },
      });
    } catch (error) {
      console.error("Subscribe error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const subscriptions = await Subscription.find({ user_id: user._id })
      .select("-payment_method.card_number -payment_method.cvc")
      .lean();

    const formattedSubscriptions = subscriptions.map((sub) => ({
      ...sub,
      payment_method: {
        cardholder_name: sub.payment_method?.cardholder_name || null,
        expiry_month: sub.payment_method?.expiry_month || null,
        expiry_year: sub.payment_method?.expiry_year || null,
      },
    }));

    res.json(formattedSubscriptions);
  } catch (error) {
    console.error("Get subscriptions error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === 1)
      return res
        .status(403)
        .json({ message: "Admins cannot cancel subscriptions" });
    if (!user.subscription)
      return res.status(400).json({ message: "No active subscription" });

    const subscription = await Subscription.findById(user.subscription);
    if (!subscription)
      return res.status(404).json({ message: "Subscription not found" });

    subscription.status = "failed";
    await subscription.save();

    user.subscription = null;
    user.subscription_end_time = null;
    user.total_promotions = user.role === 3 ? 0 : user.total_promotions;
    user.total_scans = user.role === 2 ? 0 : user.total_scans;
    await user.save();

    const type = user.role === 2 ? "reseller" : "store_owner";
    const notification = new Notification({
      _id: uuidv4(),
      user_id: user._id,
      heading: "Subscription Cancelled",
      content:
        "Your subscription has been cancelled. Your promotion/scan limit has been reset to 0.",
      type,
    });
    await notification.save();
    await sendMail(
      user.email,
      "Subscription Cancelled",
      "Your subscription has been cancelled. Your promotion/scan limit has been reset to 0."
    );

    res.json({ message: "Subscription cancelled successfully" });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getSubscriptionTiers,
  updateSubscriptionTiers,
  getAllSubscriptions,
  manageSubscriptionCounts,
  subscribe,
  getSubscriptions,
  cancelSubscription,
};
