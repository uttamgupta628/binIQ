const express = require("express");
const {
  createProduct,
  getProducts,
  getProductById,   // ✅ NEW
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
router.get("/trending", authenticate, getTrendingProducts);   // ← must stay ABOVE /:product_id
router.get("/activity", authenticate, getActivityFeed);       // ← must stay ABOVE /:product_id
router.get("/:product_id", authenticate, getProductById);     // ✅ NEW — single product by ID
router.put("/:product_id", authenticate, updateProduct);
router.delete("/:product_id", authenticate, deleteProduct);
router.post("/:product_id/like", authenticate, likeProduct);

module.exports = router;