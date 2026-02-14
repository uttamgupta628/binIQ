const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const faqSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  type: { type: Number, enum: [2, 3], required: true }, // 1 = Reseller app, 2 = Admin app
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FAQ", faqSchema);
