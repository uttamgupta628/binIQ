const mongoose = require("mongoose");
const moment = require("moment");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const Feedback = require("../models/Feedback");

const getPaidUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const totalPaidUsers = await Subscription.countDocuments({
      status: "completed",
    });
    const lastMonth = moment().subtract(1, "month").toDate();
    const lastMonthPaidUsers = await Subscription.countDocuments({
      status: "completed",
      date: { $lte: lastMonth },
    });
    const increasePercentage =
      lastMonthPaidUsers > 0
        ? (
            ((totalPaidUsers - lastMonthPaidUsers) / lastMonthPaidUsers) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totalPaidUsers,
        monthlyIncreasePercentage: parseFloat(increasePercentage),
      },
    });
  } catch (error) {
    console.error("Get paid users error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getStoreOwners = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const totalStoreOwners = await User.countDocuments({ role: 3 });
    const lastMonth = moment().subtract(1, "month").toDate();
    const lastMonthStoreOwners = await User.countDocuments({
      role: 3,
      created_at: { $lte: lastMonth },
    });
    const increasePercentage =
      lastMonthStoreOwners > 0
        ? (
            ((totalStoreOwners - lastMonthStoreOwners) / lastMonthStoreOwners) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totalStoreOwners,
        monthlyIncreasePercentage: parseFloat(increasePercentage),
      },
    });
  } catch (error) {
    console.error("Get store owners error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getResellers = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const totalResellers = await User.countDocuments({ role: 2 });
    const lastMonth = moment().subtract(1, "month").toDate();
    const lastMonthResellers = await User.countDocuments({
      role: 2,
      created_at: { $lte: lastMonth },
    });
    const increasePercentage =
      lastMonthResellers > 0
        ? (
            ((totalResellers - lastMonthResellers) / lastMonthResellers) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totalResellers,
        monthlyIncreasePercentage: parseFloat(increasePercentage),
      },
    });
  } catch (error) {
    console.error("Get resellers error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getRevenue = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const totalRevenueResult = await Subscription.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = totalRevenueResult[0]?.total || 0;

    const lastMonth = moment().subtract(1, "month").toDate();
    const lastMonthRevenueResult = await Subscription.aggregate([
      { $match: { status: "completed", date: { $lte: lastMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const lastMonthRevenue = lastMonthRevenueResult[0]?.total || 0;

    const increasePercentage =
      lastMonthRevenue > 0
        ? (
            ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        monthlyIncreasePercentage: parseFloat(increasePercentage),
      },
    });
  } catch (error) {
    console.error("Get revenue error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getRecentActivity = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const last24Hours = moment().subtract(24, "hours").toDate();
    const recentUsers = await User.find({
      created_at: { $gte: last24Hours },
      role: { $in: [2, 3] }, // Reseller or Store Owner
    }).select("full_name role created_at");

    const formattedUsers = recentUsers.map((user) => ({
      name: user.full_name,
      type: user.role === 2 ? "reseller" : "store_owner",
      timeInHours: moment().diff(moment(user.created_at), "hours"),
    }));

    res.json({
      success: true,
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Get recent activity error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getRecentFeedbacks = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    const last24Hours = moment().subtract(24, "hours").toDate();
    const feedbacks = await Feedback.find({
      created_at: { $gte: last24Hours },
    }).select(
      "rating user_name user_email suggestion type status reply created_at"
    );

    res.json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    console.error("Get recent feedbacks error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getQuickStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 1)
      return res
        .status(403)
        .json({
          success: false,
          message: "Only admins can access this endpoint",
        });

    // Premium users (tier2 or tier3)
    const totalUsers = await User.countDocuments({ role: { $in: [2, 3] } });
    const premiumUsers = await User.countDocuments({
      subscription: { $ne: null },
      $expr: {
        $in: [
          {
            $toLower: {
              $ifNull: [
                await Subscription.findOne({ _id: "$subscription" }).select(
                  "plan"
                ),
                "",
              ],
            },
          },
          ["tier2", "tier3"],
        ],
      },
    });
    const premiumPercentage =
      totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(2) : 0;

    // Average rating
    const feedbackStats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          pendingReplies: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
        },
      },
    ]);
    const averageRating = feedbackStats[0]?.avgRating?.toFixed(1) || 0;
    const pendingReplies = feedbackStats[0]?.pendingReplies || 0;

    // Active subscriptions
    const activeSubscriptions = await Subscription.countDocuments({
      status: "completed",
    });

    // New users today
    const todayStart = moment().startOf("day").toDate();
    const newUsersToday = await User.countDocuments({
      role: { $in: [2, 3] },
      created_at: { $gte: todayStart },
    });

    res.json({
      success: true,
      data: {
        premiumUsers: {
          count: premiumUsers,
          percentage: parseFloat(premiumPercentage),
        },
        averageRating: parseFloat(averageRating),
        pendingReplies,
        activeSubscriptions,
        newUsersToday,
      },
    });
  } catch (error) {
    console.error("Get quick stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  getPaidUsers,
  getStoreOwners,
  getResellers,
  getRevenue,
  getRecentActivity,
  getRecentFeedbacks,
  getQuickStats,
};
