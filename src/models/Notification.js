const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const notificationSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  user_id: { type: String, ref: "User", required: true },
  heading: { type: String, required: true },
  content: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ["reseller", "store_owner", "all"],
    required: true,
  },
  read: { type: Boolean, default: false },
});

// notificationSchema.index({ user_id: 1, read: 1 });
// notificationSchema.index({ created_at: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
