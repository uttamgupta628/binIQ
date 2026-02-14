const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const planSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  type: { type: String, enum: ["reseller", "store_owner"], required: true },
  tier: { type: String, enum: ["tier1", "tier2", "tier3"], required: true },
  amount: { type: Number, required: true, min: 0 },
  duration: { type: Number, required: true, min: 1 }, // Duration in days
  updated_at: { type: Date, default: Date.now },
});

planSchema.index({ type: 1, tier: 1 }, { unique: true });

module.exports = mongoose.model("Plan", planSchema);
