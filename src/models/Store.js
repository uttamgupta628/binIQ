const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const commentSchema = new mongoose.Schema({
  content: { type: String, required: true },
  user_id: { type: String, ref: "User", required: true },
  user_name: { type: String, required: true },
  user_image: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

// One optional price string per day of the week (null = no rate set)
const dailyRatesSchema = new mongoose.Schema(
  {
    Friday:    { type: String, default: null },
    Saturday:  { type: String, default: null },
    Sunday:    { type: String, default: null },
    Monday:    { type: String, default: null },
    Tuesday:   { type: String, default: null },
    Wednesday: { type: String, default: null },
    Thursday:  { type: String, default: null },
  },
  { _id: false },
);

const storeSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, ref: "User", required: true, unique: true },
  store_name: { type: String, required: true },
  user_latitude: { type: Number, default: null },
  user_longitude: { type: Number, default: null },
  address: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  zip_code: { type: String, default: null },
  country: { type: String, default: null },
  google_maps_link: { type: String, default: null },
  website_url: { type: String, default: null },
  working_days: { type: String, default: null },
  working_time: { type: String, default: null },
  phone_number: { type: String, default: null },
  store_email: { type: String, default: null },
  facebook_link: { type: String, default: null },
  instagram_link: { type: String, default: null },
  twitter_link: { type: String, default: null },
  whatsapp_link: { type: String, default: null },
  followers: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  checked_in_by: { type: [String], default: [] },
  store_image: { type: String, default: null },
  store_images: { type: [String], default: [] }, 
  ratings: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },
  views_count: { type: Number, default: 0 },
  favorited_by: [{ type: String, ref: "User", default: [] }],
  liked_by: [{ type: String, ref: "User", default: [] }],
  followed_by: [{ type: String, ref: "User", default: [] }],
  comments: [commentSchema],
  daily_rates: { type: dailyRatesSchema, default: () => ({}) }, // ← added
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Store", storeSchema);