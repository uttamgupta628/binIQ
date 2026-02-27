const { v4: uuidv4 } = require("uuid");
const { check, validationResult } = require("express-validator");
const User = require("../models/User");

// POST /api/users/scan
// Saves a QR scan result to the user's scans_used array and increments total_scans
const recordScan = [
  check("qr_data").notEmpty().withMessage("QR data is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { qr_data, product_name, category, image } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Check scan limit
      if (user.total_scans >= 100) {
        return res.status(403).json({
          success: false,
          message: "Scan limit reached (100/100). Upgrade your plan to scan more.",
        });
      }

      // Build scan record to store
      const scanRecord = {
        scan_id: uuidv4(),
        qr_data,
        product_name: product_name || "Unknown Product",
        category: category || "Uncategorized",
        image: image || null,
        scanned_at: new Date().toISOString(),
      };

      // Store as JSON string in scans_used array (schema uses String[])
      user.scans_used.push(JSON.stringify(scanRecord));
      user.total_scans = user.scans_used.length;
      user.updated_at = Date.now();
      await user.save();

      return res.status(201).json({
        success: true,
        message: "Scan recorded successfully",
        scan: scanRecord,
        total_scans: user.total_scans,
        scans_remaining: 100 - user.total_scans,
      });
    } catch (error) {
      console.error("Record scan error:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// GET /api/users/scans
// Returns all scans for the logged-in user
const getScans = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "full_name total_scans scans_used"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    // Parse each scan record from JSON string
    const parsedScans = user.scans_used.map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return { qr_data: s, scanned_at: null };
      }
    });

    return res.json({
      success: true,
      total_scans: user.total_scans,
      scans_remaining: 100 - user.total_scans,
      scans: parsedScans,
    });
  } catch (error) {
    console.error("Get scans error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE /api/users/scans/:scan_id
// Removes a specific scan from user's library
const deleteScan = async (req, res) => {
  const { scan_id } = req.params;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const originalLength = user.scans_used.length;
    user.scans_used = user.scans_used.filter((s) => {
      try {
        const parsed = JSON.parse(s);
        return parsed.scan_id !== scan_id;
      } catch {
        return true;
      }
    });

    if (user.scans_used.length === originalLength) {
      return res.status(404).json({ success: false, message: "Scan not found" });
    }

    user.total_scans = user.scans_used.length;
    user.updated_at = Date.now();
    await user.save();

    return res.json({ success: true, message: "Scan deleted successfully" });
  } catch (error) {
    console.error("Delete scan error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/users/:user_id/scans
// Admin: view a specific user's scans
const getUserScansAdmin = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester)
      return res.status(404).json({ message: "Requester not found" });
    if (requester.role !== 1)
      return res.status(403).json({
        success: false,
        message: "Only admins can access other users' scans",
      });

    const { user_id } = req.params;
    const user = await User.findById(user_id).select(
      "full_name email role total_scans scans_used"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const parsedScans = user.scans_used.map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return { qr_data: s, scanned_at: null };
      }
    });

    return res.json({
      success: true,
      user: {
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role === 2 ? "reseller" : "store_owner",
        total_scans: user.total_scans,
        scans_remaining: 100 - user.total_scans,
      },
      scans: parsedScans,
    });
  } catch (error) {
    console.error("Get user scans admin error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/users/all-scans
// Admin: view all scans from all users
const getAllUsersScansAdmin = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester)
      return res.status(404).json({ message: "Requester not found" });
    if (requester.role !== 1)
      return res.status(403).json({
        success: false,
        message: "Only admins can access all scans",
      });

    const users = await User.find({
      role: { $in: [2, 3] },
    }).select("full_name email role total_scans scans_used");

    const allUsersScans = users.map((user) => {
      const parsedScans = user.scans_used.map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return { qr_data: s, scanned_at: null };
        }
      });

      return {
        user: {
          _id: user._id,
          full_name: user.full_name,
          email: user.email,
          role: user.role === 2 ? "reseller" : "store_owner",
          total_scans: user.total_scans,
          scans_remaining: 100 - user.total_scans,
        },
        scans: parsedScans,
      };
    });

    return res.json({
      success: true,
      total_users: users.length,
      total_scans_across_all_users: users.reduce(
        (sum, u) => sum + u.total_scans,
        0
      ),
      data: allUsersScans,
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