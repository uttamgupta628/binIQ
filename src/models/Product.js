const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const productSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, ref: "User", required: true },
  category_id: { type: String, ref: "ProductCategory", required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  upc_id: { type: String, required: true, unique: true },
  tags: [{ type: String }],
  created_at: { type: Date, default: Date.now },
  price: { type: Number, required: true },
  offer_price: { type: Number },
  image_inner: { type: String }, // S3 URL
  image_outer: { type: String }, // S3 URL
  likes: {
    type: Number,
    default: 0,
  },

  liked_by: {
    // Array of user IDs (strings) who have liked this product
    type: [String],
    default: [],
  },

  original_type: {
    // Stores the type the store owner originally set (1 or 2).
    // Used to revert the product back when likes drop below the threshold.
    type: Number,
    enum: [1, 2],
    default: 2,
  },
  type: { type: Number, enum: [1, 2], required: true }, // 1 = Trending, 2 = Activity Feed
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Product", productSchema);
