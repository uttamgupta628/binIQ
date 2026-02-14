const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const promotionSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, ref: "User", required: true },
  category_id: { type: String, ref: "ProductCategory", required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  upc_id: { type: String, required: true, unique: true },
  tags: [{ type: String }],
  created_at: { type: Date, default: Date.now },
  price: { type: Number, required: true },
  status: { type: String, enum: ["Active", "Inactive"], required: true },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  visibility: { type: String, enum: ["On", "Off"], required: true },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Promotion", promotionSchema);
