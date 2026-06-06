const mongoose = require("mongoose");

const StoreClaimSchema = new mongoose.Schema(
  {
    _id: { type: String },

    // Which admin-uploaded store is being claimed (null = new store)
    store_id: { type: String, default: null },

    // Claimant info
    full_name:     { type: String, required: true, trim: true },
    email:         { type: String, required: true, lowercase: true, trim: true },
    phone_number:  { type: String, required: true, trim: true },
    business_name: { type: String, default: null, trim: true },
    store_address: { type: String, default: null, trim: true },
    // Verification documents (Cloudinary URLs)
    licence_1: { type: String, required: true },
    licence_2: { type: String, required: true },

    // Password set by store owner at submission time, hashed with bcrypt.
    // Copied into User.password on approval then cleared.
    hashed_password: { type: String, default: null },

    // Claim lifecycle
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    admin_note:       { type: String, default: null },
    reviewed_by:      { type: String, default: null },   // admin user _id
    reviewed_at:      { type: Date,   default: null },
    setup_completed:  { type: Boolean, default: false },
    user_id:          { type: String, default: null },   // set after approval

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { _id: false } // we supply our own UUID _id
);

StoreClaimSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("StoreClaim", StoreClaimSchema);