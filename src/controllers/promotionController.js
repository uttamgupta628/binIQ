const { check, validationResult } = require("express-validator");
const Promotion = require("../models/Promotion");
const ProductCategory = require("../models/ProductCategory");
const User = require("../models/User");
const moment = require("moment");

const createPromotion = [
  check("category_id").notEmpty().withMessage("Category ID is required"),
  check("title").notEmpty().withMessage("Title is required"),
  check("description").notEmpty().withMessage("Description is required"),
  check("upc_id").notEmpty().withMessage("UPC ID is required"),
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
    } = req.body;
    const userId = req.user.userId;

    try {
      // Check if user is a store owner
      const user = await User.findById(userId).populate("subscription");
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      if (user.role !== 3) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Only store owners can create promotions",
          });
      }

      // Check for active subscription
      if (
        !user.subscription ||
        !user.subscription_end_time ||
        moment().isAfter(user.subscription_end_time)
      ) {
        return res
          .status(403)
          .json({ success: false, message: "No active subscription" });
      }

      // Check promotion limit
      if (user.used_promotions >= user.total_promotions) {
        return res
          .status(403)
          .json({ success: false, message: "Promotion limit reached" });
      }

      // Validate category
      const category = await ProductCategory.findById(category_id);
      if (!category)
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });

      // Check for duplicate UPC ID
      const existingPromotion = await Promotion.findOne({ upc_id });
      if (existingPromotion) {
        return res
          .status(400)
          .json({ success: false, message: "UPC ID already exists" });
      }

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
      });

      await promotion.save();

      // Update user promotions
      user.used_promotions += 1;
      user.promotions.push(promotion._id);
      await user.save();

      res.status(201).json({
        success: true,
        promotion_id: promotion._id,
        message: "Promotion created successfully",
      });
    } catch (error) {
      console.error("Create promotion error:", {
        message: error.message,
        stack: error.stack,
      });
      res
        .status(500)
        .json({
          success: false,
          message: "Server error",
          error: error.message,
        });
    }
  },
];

const getPromotions = async (req, res) => {
  const { status, visibility } = req.query;

  try {
    const query = { user_id: req.user.userId };
    if (status) query.status = status;
    if (visibility) query.visibility = visibility;

    const promotions = await Promotion.find(query)
      .populate("category_id", "category_name")
      .sort({ start_date: -1 });
    res.json({ success: true, data: promotions });
  } catch (error) {
    console.error("Get promotions error:", {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const updatePromotion = [
  check("category_id")
    .optional()
    .notEmpty()
    .withMessage("Category ID cannot be empty"),
  check("title").optional().notEmpty().withMessage("Title cannot be empty"),
  check("description")
    .optional()
    .notEmpty()
    .withMessage("Description cannot be empty"),
  check("upc_id").optional().notEmpty().withMessage("UPC ID cannot be empty"),
  check("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  check("status")
    .optional()
    .isIn(["Active", "Inactive"])
    .withMessage("Status must be Active or Inactive"),
  check("visibility")
    .optional()
    .isIn(["On", "Off"])
    .withMessage("Visibility must be On or Off"),
  check("start_date")
    .optional()
    .isISO8601()
    .withMessage("Valid start date is required"),
  check("end_date")
    .optional()
    .isISO8601()
    .withMessage("Valid end date is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { promotion_id } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    try {
      const promotion = await Promotion.findOne({
        _id: promotion_id,
        user_id: userId,
      });
      if (!promotion)
        return res
          .status(404)
          .json({ success: false, message: "Promotion not found" });

      if (updates.category_id) {
        const category = await ProductCategory.findById(updates.category_id);
        if (!category)
          return res
            .status(404)
            .json({ success: false, message: "Category not found" });
      }

      if (updates.upc_id) {
        const existingPromotion = await Promotion.findOne({
          upc_id: updates.upc_id,
          _id: { $ne: promotion_id },
        });
        if (existingPromotion) {
          return res
            .status(400)
            .json({ success: false, message: "UPC ID already exists" });
        }
      }

      Object.assign(promotion, updates, { updated_at: Date.now() });
      await promotion.save();
      res.json({ success: true, message: "Promotion updated successfully" });
    } catch (error) {
      console.error("Update promotion error:", {
        message: error.message,
        stack: error.stack,
      });
      res
        .status(500)
        .json({
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
    const promotion = await Promotion.findOne({
      _id: promotion_id,
      user_id: userId,
    });
    if (!promotion)
      return res
        .status(404)
        .json({ success: false, message: "Promotion not found" });

    await Promotion.deleteOne({ _id: promotion_id });

    // Decrement used_promotions
    const user = await User.findById(userId);
    if (user && user.used_promotions > 0) {
      user.used_promotions -= 1;
      user.promotions = user.promotions.filter(
        (id) => id.toString() !== promotion_id
      );
      await user.save();
    }

    res.json({ success: true, message: "Promotion deleted successfully" });
  } catch (error) {
    console.error("Delete promotion error:", {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  createPromotion,
  getPromotions,
  updatePromotion,
  deletePromotion,
};
