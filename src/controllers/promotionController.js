const { check, validationResult } = require("express-validator");
const Promotion = require("../models/Promotion");
const ProductCategory = require("../models/ProductCategory");
const User = require("../models/User");
const moment = require("moment");

const createPromotion = [
  check("category_id").notEmpty().withMessage("Category ID is required"),
  check("title").notEmpty().withMessage("Title is required"),
  check("description").notEmpty().withMessage("Description is required"),
  check("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  check("status")
    .isIn(["Active", "Inactive"])
    .withMessage("Status must be Active or Inactive"),
  check("visibility")
    .isIn(["On", "Off"])
    .withMessage("Visibility must be On or Off"),
  check("start_date").isISO8601().withMessage("Valid start date is required"),
  check("end_date").isISO8601().withMessage("Valid end date is required"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      category_id,
      title,
      description,
      upc_id,
      tags,
      price,
      status,
      start_date,
      end_date,
      visibility,
      banner_image,
    } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // ── Allow role 2 (Reseller) AND role 3 (Store Owner) ──────────────
      if (user.role !== 2 && user.role !== 3) {
        return res.status(403).json({
          success: false,
          message: "Only resellers and store owners can create promotions",
        });
      }

      // ── Must be verified + approved ────────────────────────────────────
      const isVerified = user.verified === true || user.status === "approved";
      if (!isVerified) {
        return res.status(403).json({
          success: false,
          message: "Your account is not verified. Please complete the Get Verified payment first.",
        });
      }

      // ── Subscription must not be expired ───────────────────────────────
      const hasActiveSubscription =
        user.subscription_end_time &&
        moment().isBefore(user.subscription_end_time);
      if (!hasActiveSubscription) {
        return res.status(403).json({
          success: false,
          message: "Your verification has expired. Please renew to create promotions.",
        });
      }

      // ── Promotion limit check (-1 = unlimited) ─────────────────────────
      if (user.total_promotions !== -1 && user.used_promotions >= user.total_promotions) {
        return res.status(403).json({
          success: false,
          message: `Promotion limit reached. You have used ${user.used_promotions} of ${user.total_promotions} promotions.`,
        });
      }

      // ── Validate category ──────────────────────────────────────────────
      const category = await ProductCategory.findById(category_id);
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found" });
      }

      // ── Duplicate UPC check ────────────────────────────────────────────
      if (upc_id) {
  const existingPromotion = await Promotion.findOne({ upc_id });
  if (existingPromotion) {
    return res.status(400).json({ success: false, message: "UPC ID already exists" });
  }
}

      // ── Create promotion ───────────────────────────────────────────────
      const promotion = new Promotion({
        user_id: userId,
        category_id,
        title,
        description,
        upc_id,
        tags,
        price,
        status,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        visibility,
        banner_image: banner_image || null,
      });

      await promotion.save();

      // ── Update user promotion count (always track, even for unlimited) ─
      user.used_promotions += 1;
      user.promotions.push(promotion._id);
      await user.save();

      return res.status(201).json({
        success: true,
        promotion_id: promotion._id,
        message: "Promotion created successfully",
      });
    } catch (error) {
      console.error("Create promotion error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getPromotions = async (req, res) => {
  const { status, visibility, user_id } = req.query;

  try {
    const query = {};

    // Only filter by user_id if explicitly passed
    if (user_id) query.user_id = user_id;

    // Public feed — only show Active + On promotions
    // Store owner viewing their own — show all statuses
    if (!user_id) {
      query.status = 'Active';
      query.visibility = 'On';
    } else {
      if (status) query.status = status;
      if (visibility) query.visibility = visibility;
    }

    const promotions = await Promotion.find(query)
      .populate('category_id', 'category_name')
      .sort({ start_date: -1 });

    res.json({ success: true, data: promotions });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

const updatePromotion = [
  check("category_id").optional().notEmpty().withMessage("Category ID cannot be empty"),
  check("title").optional().notEmpty().withMessage("Title cannot be empty"),
  check("description").optional().notEmpty().withMessage("Description cannot be empty"),
  check("upc_id").optional().notEmpty().withMessage("UPC ID cannot be empty"),
  check("price").optional().isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  check("status").optional().isIn(["Active", "Inactive"]).withMessage("Status must be Active or Inactive"),
  check("visibility").optional().isIn(["On", "Off"]).withMessage("Visibility must be On or Off"),
  check("start_date").optional().isISO8601().withMessage("Valid start date is required"),
  check("end_date").optional().isISO8601().withMessage("Valid end date is required"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { promotion_id } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    try {
      const promotion = await Promotion.findOne({ _id: promotion_id, user_id: userId });
      if (!promotion) {
        return res.status(404).json({ success: false, message: "Promotion not found" });
      }

      if (updates.category_id) {
        const category = await ProductCategory.findById(updates.category_id);
        if (!category) {
          return res.status(404).json({ success: false, message: "Category not found" });
        }
      }

      if (updates.upc_id) {
        const existingPromotion = await Promotion.findOne({
          upc_id: updates.upc_id,
          _id: { $ne: promotion_id },
        });
        if (existingPromotion) {
          return res.status(400).json({ success: false, message: "UPC ID already exists" });
        }
      }

      Object.assign(promotion, updates, { updated_at: Date.now() });
      await promotion.save();

      res.json({ success: true, message: "Promotion updated successfully" });
    } catch (error) {
      console.error("Update promotion error:", error.message);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const deletePromotion = async (req, res) => {
  const { promotion_id } = req.params;
  const userId = req.user.userId;

  try {
    const promotion = await Promotion.findOne({ _id: promotion_id, user_id: userId });
    if (!promotion) {
      return res.status(404).json({ success: false, message: "Promotion not found" });
    }

    await Promotion.deleteOne({ _id: promotion_id });

    const user = await User.findById(userId);
    if (user && user.used_promotions > 0) {
      user.used_promotions -= 1;
      user.promotions = user.promotions.filter(
        (id) => id.toString() !== promotion_id,
      );
      await user.save();
    }

    res.json({ success: true, message: "Promotion deleted successfully" });
  } catch (error) {
    console.error("Delete promotion error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  createPromotion,
  getPromotions,
  updatePromotion,
  deletePromotion,
};