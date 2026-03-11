const User = require("../models/User");
const { exportCSV, exportExcel } = require("../utils/exportHelper");

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

module.exports = {
  exportStoreOwners,
};