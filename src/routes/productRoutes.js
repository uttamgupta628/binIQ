const express = require("express");
const {
  createProduct,
  getProducts,
  getTrendingProducts,
  getActivityFeed,
  updateProduct,
  deleteProduct,
  likeProduct,
} = require("../controllers/productController");
const { authenticate } = require("../utils/auth");

const router = express.Router();

router.post("/", authenticate, createProduct);
router.get("/", authenticate, getProducts);
router.get("/trending", authenticate, getTrendingProducts);
router.get("/activity", authenticate, getActivityFeed);
router.put("/:product_id", authenticate, updateProduct);
router.delete("/:product_id", authenticate, deleteProduct);
// ── NEW: like / unlike a product ─────────────────────────────────────────────
// POST /api/products/:product_id/like
// Any authenticated user (reseller or store owner) can call this.
// Returns: { isLiked, likes, type, trending_notice? }
router.post("/:product_id/like", authenticate, likeProduct);

module.exports = router;
