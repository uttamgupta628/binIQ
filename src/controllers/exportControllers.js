const User = require("../models/User");
const Subscription = require("../models/Subscription");
const { exportCSV, exportExcel, exportMultiSheetExcel } = require("../utils/exportHelper");

const exportStoreOwners = async (req, res) => {
  try {
    const admin = await User.findById(req.user.userId);

    if (!admin || admin.role !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only admins can export data",
      });
    }

    const format = req.query.format || "csv";

    const storeOwners = await User.find({ role: 3 }).select(
      "full_name store_name email phone_number status created_at"
    );

    const formatted = storeOwners.map((user) => ({
      Name: user.full_name,
      Store: user.store_name,
      Email: user.email,
      Phone: user.phone_number || "",
      Status: user.status,
      Joined: user.created_at,
    }));

    if (format === "excel") {
      return exportExcel(res, formatted, "store_owners");
    }

    return exportCSV(res, formatted, "store_owners");
  } catch (error) {
    console.error("Export store owners error:", error);
    res.status(500).json({
      success: false,
      message: "Export failed",
    });
  }
};
const exportResellers = async (req, res) => {
  try {
    const format = req.query.format || "csv";

    const resellers = await User.find({ role: 2 });

    const formatted = resellers.map((r) => ({
      Name: r.full_name,
      Email: r.email,
      Phone: r.phone_number || "",
      Address: r.address || "",
      Expertise: r.expertise_level || "Beginner",
      Status: r.status,
      Joined: r.created_at,
    }));

    if (format === "excel") {
      return exportExcel(res, formatted, "resellers");
    }

    return exportCSV(res, formatted, "resellers");
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Export failed" });
  }
};
const exportAnalytics = async (req, res) => {
  try {
    const format = req.query.format || "csv";

    const users = await User.find({ role: { $in: [2, 3] } });

    const subscriptions = await Subscription.find({ status: "completed" });

    const totalUsers = users.length;
    const resellers = users.filter((u) => u.role === 2).length;
    const storeOwners = users.filter((u) => u.role === 3).length;

    const totalRevenue = subscriptions.reduce(
      (sum, s) => sum + s.amount,
      0
    );

    const summary = [
      { Metric: "Total Users", Value: totalUsers },
      { Metric: "Resellers", Value: resellers },
      { Metric: "Store Owners", Value: storeOwners },
      { Metric: "Total Revenue", Value: totalRevenue },
      { Metric: "Total Subscriptions", Value: subscriptions.length },
    ];

    const userGrowth = users.map((u) => ({
      Name: u.full_name,
      Email: u.email,
      Role: u.role === 2 ? "Reseller" : "Store Owner",
      Joined: u.created_at,
      Status: u.status,
    }));

    const revenueGrowth = subscriptions.map((s) => ({
      User: s.user_name,
      Plan: s.plan,
      Amount: s.amount,
      Status: s.status,
      Date: s.date,
    }));

    if (format === "csv") {
      return exportCSV(res, summary, "analytics_summary");
    }

    return exportMultiSheetExcel (
      res,
      [
        { name: "Summary", data: summary },
        { name: "Users", data: userGrowth },
        { name: "Subscriptions", data: revenueGrowth },
      ],
      "analytics_report"
    );
  } catch (error) {
    console.error("Export analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Analytics export failed",
    });
  }
};

module.exports = {
  exportStoreOwners,
  exportResellers,
  exportAnalytics,
};