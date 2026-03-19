const { v4: uuidv4 } = require("uuid");
const { check, validationResult } = require("express-validator");
const User = require("../models/User");

// ─── Scan limits per plan ─────────────────────────────────────────────────────
const SCAN_LIMITS = {
  free:  100,
  tier1: 1000,
  tier2: 5000,
  tier3: 10000,
};

const getUserScanLimit = (user) => {
  const sub = user.subscription;
  if (!sub) return SCAN_LIMITS.free;
  const plan = typeof sub === "object" ? sub.plan : null;
  return SCAN_LIMITS[plan] || SCAN_LIMITS.free;
};

// POST /api/users/scan
const recordScan = [
  check("qr_data").notEmpty().withMessage("QR data is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { qr_data, product_name, category, image } = req.body;
    const userId = req.user.userId;

    try {
      // Populate subscription so we can read the plan
      const user = await User.findById(userId).populate("subscription");
      if (!user) return res.status(404).json({ message: "User not found" });

      const scanLimit = getUserScanLimit(user);

      if (user.total_scans >= scanLimit) {
        return res.status(403).json({
          success: false,
          message: `Scan limit reached (${user.total_scans}/${scanLimit}). Upgrade your plan to scan more.`,
        });
      }

      const scanRecord = {
        scan_id:      uuidv4(),
        qr_data,
        product_name: product_name || "Unknown Product",
        category:     category     || "Uncategorized",
        image:        image        || null,   // Cloudinary URL saved here
        scanned_at:   new Date().toISOString(),
      };

      user.scans_used.push(JSON.stringify(scanRecord));
      user.total_scans  = user.scans_used.length;
      user.updated_at   = Date.now();
      await user.save();

      return res.status(201).json({
        success:         true,
        message:         "Scan recorded successfully",
        scan:            scanRecord,
        total_scans:     user.total_scans,
        scans_remaining: scanLimit - user.total_scans,
      });
    } catch (error) {
      console.error("Record scan error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// GET /api/users/scans
const getScans = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("full_name total_scans scans_used")
      .populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    const scanLimit = getUserScanLimit(user);

    const parsedScans = user.scans_used.map((s) => {
      try { return JSON.parse(s); }
      catch { return { qr_data: s, scanned_at: null }; }
    });

    return res.json({
      success:         true,
      total_scans:     user.total_scans,
      scans_remaining: scanLimit - user.total_scans,
      scans:           parsedScans,
    });
  } catch (error) {
    console.error("Get scans error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE /api/users/scans/:scan_id
const deleteScan = async (req, res) => {
  const { scan_id } = req.params;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const originalLength = user.scans_used.length;
    user.scans_used = user.scans_used.filter((s) => {
      try { return JSON.parse(s).scan_id !== scan_id; }
      catch { return true; }
    });

    if (user.scans_used.length === originalLength)
      return res.status(404).json({ success: false, message: "Scan not found" });

    user.total_scans = user.scans_used.length;
    user.updated_at  = Date.now();
    await user.save();

    return res.json({ success: true, message: "Scan deleted successfully" });
  } catch (error) {
    console.error("Delete scan error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/users/:user_id/scans  (admin)
const getUserScansAdmin = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ message: "Requester not found" });
    if (requester.role !== 1)
      return res.status(403).json({ success: false, message: "Only admins can access other users' scans" });

    const user = await User.findById(req.params.user_id)
      .select("full_name email role total_scans scans_used")
      .populate("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    const scanLimit   = getUserScanLimit(user);
    const parsedScans = user.scans_used.map((s) => {
      try { return JSON.parse(s); }
      catch { return { qr_data: s, scanned_at: null }; }
    });

    return res.json({
      success: true,
      user: {
        _id:             user._id,
        full_name:       user.full_name,
        email:           user.email,
        role:            user.role === 2 ? "reseller" : "store_owner",
        total_scans:     user.total_scans,
        scans_remaining: scanLimit - user.total_scans,
      },
      scans: parsedScans,
    });
  } catch (error) {
    console.error("Get user scans admin error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/users/all-scans  (admin)
const getAllUsersScansAdmin = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ message: "Requester not found" });
    if (requester.role !== 1)
      return res.status(403).json({ success: false, message: "Only admins can access all scans" });

    const users = await User.find({ role: { $in: [2, 3] } })
      .select("full_name email role total_scans scans_used")
      .populate("subscription");

    const allUsersScans = users.map((user) => {
      const scanLimit   = getUserScanLimit(user);
      const parsedScans = user.scans_used.map((s) => {
        try { return JSON.parse(s); }
        catch { return { qr_data: s, scanned_at: null }; }
      });
      return {
        user: {
          _id:             user._id,
          full_name:       user.full_name,
          email:           user.email,
          role:            user.role === 2 ? "reseller" : "store_owner",
          total_scans:     user.total_scans,
          scans_remaining: scanLimit - user.total_scans,
        },
        scans: parsedScans,
      };
    });

    return res.json({
      success:                       true,
      total_users:                   users.length,
      total_scans_across_all_users:  users.reduce((sum, u) => sum + u.total_scans, 0),
      data:                          allUsersScans,
    });
  } catch (error) {
    console.error("Get all users scans admin error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  recordScan,
  getScans,
  deleteScan,
  getUserScansAdmin,
  getAllUsersScansAdmin,
};