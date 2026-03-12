  const mongoose = require("mongoose");
  const { v4: uuidv4 } = require("uuid");

const userSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  full_name: { type: String, required: true },
  store_name: { type: String, default: null },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: Number, enum: [1, 2, 3], required: true }, // 1: Admin, 2: Reseller, 3: Store Owner
  dob: { type: Date, default: null },
  gender: {
    type: String,
    enum: ["male", "female", "other", null],
    default: null,
  },
  phone_number: { type: String, default: null },
  address: { type: String, default: null },
  verified: { type: Boolean, default: false },
  card_information: {
    card_number: { type: String, default: null },
    cardholder_name: { type: String, default: null },
    expiry_month: { type: String, default: null },
    expiry_year: { type: String, default: null },
    cvc: { type: String, default: null },
  },
  expertise_level: {
    type: String,
    enum: ["beginner", "intermediate", "expert", null],
    default: null,
  },
  profile_image: { type: String, default: null },
  subscription: {
    type: String,
    ref: "Subscription",
    default: null,
  },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  subscription_end_time: { type: Date, default: null },
  total_promotions: { type: Number, default: 0 },
  used_promotions: { type: Number, default: 0 },
  promotions: [{ type: String, ref: "Promotion", default: [] }],
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
    total_scans: { type: Number, default: 0 },
    scans_used: [{ type: String, default: [] }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  });

  module.exports = mongoose.model("User", userSchema);
