const { check, validationResult } = require("express-validator");
const Product = require("../models/Product");
const ProductCategory = require("../models/ProductCategory");

// ─── Threshold: number of likes before a product auto-promotes to Trending ───
const TRENDING_LIKE_THRESHOLD = 5;

const createProduct = [
  check("category_id").notEmpty().withMessage("Category ID is required"),
  check("title").notEmpty().withMessage("Title is required"),
  check("description").notEmpty().withMessage("Description is required"),
  check("upc_id").notEmpty().withMessage("UPC ID is required"),
  check("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  check("type")
    .isIn([1, 2])
    .withMessage("Type must be 1 (Trending) or 2 (Activity Feed)"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      category_id,
      title,
      description,
      upc_id,
      tags,
      price,
      offer_price,
      image_inner,
      image_outer,
      type,
    } = req.body;

    try {
      const category = await ProductCategory.findById(category_id);
      if (!category)
        return res.status(404).json({ message: "Category not found" });

      const product = new Product({
        user_id: req.user.userId,
        category_id,
        title,
        description,
        upc_id,
        tags,
        price,
        offer_price,
        image_inner,
        image_outer,
        type,
        // ── Like tracking fields ──
        likes: 0,
        liked_by: [],
        // ── Preserve original type so we can restore if likes drop back below threshold ──
        original_type: type,
      });

      await product.save();
      res.status(201).json({
        product_id: product._id,
        message: "Product created successfully",
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  },
];

const getProducts = async (req, res) => {
  const { type } = req.query;

  try {
    const query = { user_id: req.user.userId };
    if (type) query.type = parseInt(type);

    const products = await Product.find(query)
      .populate("category_id", "category_name")
      .sort({ created_at: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

const getTrendingProducts = async (req, res) => {
  try {
    const products = await Product.find({
      user_id: req.query.user_id || req.user.userId,
      type: 1,
    })
      .populate("category_id", "category_name")
      .sort({ created_at: -1 })
      .limit(50);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

const getActivityFeed = async (req, res) => {
  try {
    const products = await Product.find({
      user_id: req.query.user_id || req.user.userId,
      type: 2,
    })
      .populate("category_id", "category_name")
      .sort({ created_at: -1 })
      .limit(50);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NEW: Like / Unlike a product (resellers only)
//
// POST /api/products/:product_id/like
//
// Business rules:
//   • A reseller can like any product once (toggle — second tap unlikes).
//   • When a product's like count reaches TRENDING_LIKE_THRESHOLD (5) it is
//     automatically promoted to type=1 (Trending), regardless of who owns it.
//   • If likes later drop BELOW the threshold the product reverts to its
//     original_type (the type set when it was created).
//   • The existing manual type field and all existing routes are untouched.
// ─────────────────────────────────────────────────────────────────────────────
const likeProduct = async (req, res) => {
  const { product_id } = req.params;
  const userId = req.user.userId;

  try {
    const product = await Product.findById(product_id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Initialise arrays defensively
    if (!Array.isArray(product.liked_by)) product.liked_by = [];

    const alreadyLiked = product.liked_by.some(
      (id) => id.toString() === userId,
    );

    if (alreadyLiked) {
      // ── Unlike ──
      product.liked_by = product.liked_by.filter(
        (id) => id.toString() !== userId,
      );
      product.likes = Math.max(0, (product.likes || 1) - 1);
    } else {
      // ── Like ──
      product.liked_by.push(userId);
      product.likes = (product.likes || 0) + 1;
    }

    // ── Auto-trending promotion / demotion ──
    const previousType = product.type;

    if (product.likes >= TRENDING_LIKE_THRESHOLD) {
      // Promote to Trending
      product.type = 1;
    } else {
      // Revert to what the store owner originally set
      product.type = product.original_type || 2;
    }

    const becameTrending = previousType !== 1 && product.type === 1;
    const lostTrending = previousType === 1 && product.type !== 1;

    await product.save();

    return res.json({
      message: alreadyLiked ? "Product unliked" : "Product liked",
      isLiked: !alreadyLiked,
      likes: product.likes,
      type: product.type,
      ...(becameTrending && {
        trending_notice: "This product has been promoted to Trending!",
      }),
      ...(lostTrending && {
        trending_notice: "This product has been removed from Trending.",
      }),
    });
  } catch (error) {
    console.error("Like product error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateProduct = [
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
  check("type")
    .optional()
    .isIn([1, 2])
    .withMessage("Type must be 1 (Trending) or 2 (Activity Feed)"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { product_id } = req.params;
    const updates = req.body;

    try {
      const product = await Product.findOne({
        _id: product_id,
        user_id: req.user.userId,
      });
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      if (updates.category_id) {
        const category = await ProductCategory.findById(updates.category_id);
        if (!category)
          return res.status(404).json({ message: "Category not found" });
      }

      // If the owner manually changes type, update original_type too so
      // the auto-demotion logic reverts to the correct baseline.
      if (updates.type !== undefined) {
        updates.original_type = updates.type;
      }

      Object.assign(product, updates, { updated_at: Date.now() });
      await product.save();
      res.json({ message: "Product updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  },
];

const deleteProduct = async (req, res) => {
  const { product_id } = req.params;

  try {
    const product = await Product.findOneAndDelete({
      _id: product_id,
      user_id: req.user.userId,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getTrendingProducts,
  getActivityFeed,
  likeProduct, // ✅ NEW export
  updateProduct,
  deleteProduct,
};
