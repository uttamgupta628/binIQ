const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const { check, param, validationResult } = require("express-validator");
const StoreClaim = require("../models/StoreClaim");
const Store = require("../models/Store");
const User = require("../models/User");
const { sendMail } = require("../utils/mailer");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
};

/**
 * Normalize a string for loose comparison.
 * Lowercases, converts em/en dashes to hyphens, strips punctuation,
 * and collapses whitespace.
 */
const normalizeForMatch = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Given a business_name and store_address submitted by a claimant,
 * try to find a matching unassigned store in the database.
 * Returns the store _id if found, otherwise null.
 *
 * Matching logic (either condition is enough):
 *   1. Store name contains the submitted business name (or vice-versa)
 *   2. Store address starts with the same street number as submitted address
 */
const autoMatchStore = async (business_name, store_address) => {
  if (!business_name && !store_address) return null;

  const candidates = await Store.find({ user_id: "unassigned" }).select(
    "_id store_name address"
  );

  if (!candidates.length) return null;

  const normBusiness = normalizeForMatch(business_name);
  const normAddress  = normalizeForMatch(store_address);

  // Extract street number (first token) for address matching
  const streetNumber = normAddress.split(" ")[0];

  for (const store of candidates) {
    const normStoreName    = normalizeForMatch(store.store_name);
    const normStoreAddress = normalizeForMatch(store.address);

    const nameMatch =
      normBusiness &&
      (normStoreName.includes(normBusiness) ||
        normBusiness.includes(normStoreName));

    const addressMatch =
      streetNumber &&
      streetNumber.length > 1 &&
      normStoreAddress.startsWith(streetNumber);

    if (nameMatch || addressMatch) return store._id;
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Store owner submits claim (includes password)
// POST /api/stores/claim
// Body (JSON): { full_name, email, phone_number, business_name,
//               store_address, store_id?, licence_1, licence_2, password }
//
// If store_id is not provided (user came from the Login "Claim Your Store"
// button without selecting a specific store), we auto-match by name/address
// against admin-uploaded unassigned stores before saving.
// ─────────────────────────────────────────────────────────────────────────────
const submitClaim = [
  check("full_name").notEmpty().withMessage("Full name is required"),
  check("email").isEmail().withMessage("Valid email is required"),
  check("business_name").notEmpty().withMessage("Business name is required"),
  check("store_address").notEmpty().withMessage("Store address is required"),
  check("phone_number").notEmpty().withMessage("Phone number is required"),
  check("licence_1").notEmpty().withMessage("Licence document 1 is required"),
  check("licence_2").notEmpty().withMessage("Licence document 2 is required"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  async (req, res) => {
    if (validationErrors(req, res)) return;

    const {
      full_name,
      email,
      phone_number,
      business_name,
      store_id,       // may be undefined / null if user came from Login screen
      licence_1,
      licence_2,
      password,
      store_address,
    } = req.body;

    try {
      // ── 1. Resolve store_id ─────────────────────────────────────────────
      // If the mobile app passed a store_id, use it directly.
      // Otherwise attempt a fuzzy match so the claim links to an existing
      // admin-uploaded store instead of creating a ghost "New Store" entry.
      let resolvedStoreId = store_id || null;

      if (!resolvedStoreId) {
        resolvedStoreId = await autoMatchStore(business_name, store_address);
      }

      // ── 2. Validate the resolved store (if any) ─────────────────────────
      if (resolvedStoreId) {
        const store = await Store.findOne({ _id: resolvedStoreId });
        if (!store) {
          // Matched store was deleted — treat as new store
          resolvedStoreId = null;
        } else if (store.user_id && store.user_id !== "unassigned") {
          return res
            .status(409)
            .json({ message: "This store has already been claimed." });
        }
      }

      // ── 3. Prevent duplicate pending claims ─────────────────────────────
      const existing = await StoreClaim.findOne({
        email: email.trim().toLowerCase(),
        status: "pending",
        ...(resolvedStoreId ? { store_id: resolvedStoreId } : {}),
      });
      if (existing) {
        return res.status(409).json({
          message:
            "A pending claim for this email already exists. Please wait for admin review.",
        });
      }

      // ── 4. Prevent re-registration for existing users ───────────────────
      const existingUser = await User.findOne({
        email: email.trim().toLowerCase(),
      });
      if (existingUser) {
        return res.status(409).json({
          message:
            "An account with this email already exists. Please log in instead.",
        });
      }

      // ── 5. Hash password & save claim ───────────────────────────────────
      const hashedPassword = await bcrypt.hash(password, 12);
      const claimId = uuidv4();

      const claim = new StoreClaim({
        _id: claimId,
        store_id: resolvedStoreId,          // ← correctly null OR matched _id
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phone_number.trim(),
        business_name: business_name?.trim() || null,
        store_address: store_address?.trim() || null,
        licence_1,
        licence_2,
        hashed_password: hashedPassword,
        status: "pending",
      });

      await claim.save();

      // ── 6. Notify admin ─────────────────────────────────────────────────
      sendMail(
        process.env.ADMIN_EMAIL,
        "New Store Claim Submitted — Action Required",
        `A new store claim is waiting for your review.\n\nName: ${full_name}\nEmail: ${email}\nStore: ${
          business_name || resolvedStoreId || "Not specified"
        }\nMatched existing store: ${resolvedStoreId ? "Yes (" + resolvedStoreId + ")" : "No — will create new store on approval"}\nClaim ID: ${claimId}\n\nPlease review and approve or reject it in the admin panel.`
      ).catch(() => {});

      res.status(201).json({
        success: true,
        claim_id: claimId,
        matched_store_id: resolvedStoreId,  // useful for debugging
        message:
          "Claim submitted successfully. You will receive an email once reviewed.",
      });
    } catch (error) {
      console.error("Submit claim error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2A — Admin: get all claims
// GET /api/admin/claims?status=pending&page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
const getAllClaims = async (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: "Admin access required" });
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [claims, total] = await Promise.all([
      StoreClaim.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-hashed_password"),
      StoreClaim.countDocuments(filter),
    ]);

    // Attach store info for context
    const storeIds = claims.map((c) => c.store_id).filter(Boolean);
    const stores = await Store.find({ _id: { $in: storeIds } }).select(
      "_id store_name address city state"
    );
    const storeMap = Object.fromEntries(stores.map((s) => [s._id, s]));

    const enriched = claims.map((c) => ({
      ...c.toObject(),
      store: c.store_id ? storeMap[c.store_id] || null : null,
    }));

    res.json({
      claims: enriched,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get all claims error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2B — Admin: approve a claim
// PUT /api/admin/claims/:claim_id/approve
// ─────────────────────────────────────────────────────────────────────────────
const approveClaim = [
  param("claim_id").notEmpty(),

  async (req, res) => {
    if (validationErrors(req, res)) return;
    if (req.user.role !== 1) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { claim_id } = req.params;
    const { admin_note } = req.body;

    try {
      const claim = await StoreClaim.findOne({ _id: claim_id });
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      if (claim.status !== "pending") {
        return res
          .status(409)
          .json({ message: `Claim is already ${claim.status}` });
      }

      if (!claim.hashed_password) {
        return res.status(400).json({
          message:
            "No password found for this claim. The store owner must re-submit with a password.",
        });
      }

      const existingUser = await User.findOne({ email: claim.email });
      if (existingUser) {
        return res.status(409).json({
          message: "A user with this email already exists.",
        });
      }

      // ── 1. Create User account ──────────────────────────────────────────
      const newUserId = uuidv4();

      const user = new User({
        _id: newUserId,
        full_name: claim.full_name,
        email: claim.email,
        phone_number: claim.phone_number,
        password: claim.hashed_password,
        store_name: claim.business_name || null,
        role: 3,
        verified: true,
        status: "approved",
      });

      await user.save();

      // ── 2. Link or create Store ─────────────────────────────────────────
      if (claim.store_id) {
        // Claim of an admin-uploaded store — link it
        await Store.collection.updateOne(
          { _id: claim.store_id },
          {
            $set: {
              user_id: newUserId,
              verified: true,
              updated_at: Date.now(),
              ...(claim.business_name && { store_name: claim.business_name }),
            },
          }
        );
      } else {
        // No existing store — create a brand new one
        const newStore = new Store({
          _id: uuidv4(),
          user_id: newUserId,
          store_name: claim.business_name || "My Store",
          address: claim.store_address || null,
          verified: true,
          favorited_by: [],
          liked_by: [],
          followed_by: [],
          comments: [],
        });
        await newStore.save();
      }

      // ── 3. Update claim ─────────────────────────────────────────────────
      claim.status = "approved";
      claim.admin_note = admin_note || null;
      claim.reviewed_by = req.user.userId;
      claim.reviewed_at = new Date();
      claim.setup_completed = true;
      claim.user_id = newUserId;
      claim.hashed_password = undefined;
      claim.updated_at = new Date();
      await claim.save();

      // ── 4. Send approval email ──────────────────────────────────────────
      await sendMail(
        claim.email,
        "🎉 Your BinIQ Store Claim Has Been Approved!",
        `Hi ${claim.full_name},\n\nGreat news! Your claim for "${
          claim.business_name || "your store"
        }" has been approved.\n\nYou can now log in to BinIQ using:\n\n  📧 Email: ${claim.email}\n  🔑 Password: the one you set when submitting your claim\n\nOnce logged in, complete your store profile by adding images, working hours, and pricing to attract more shoppers!\n\nWelcome to BinIQ!\nThe BinIQ Team`
      );

      res.json({
        success: true,
        message: "Claim approved. User account created and approval email sent.",
        claim_id,
        user_id: newUserId,
      });
    } catch (error) {
      console.error("Approve claim error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2C — Admin: reject a claim
// PUT /api/admin/claims/:claim_id/reject
// ─────────────────────────────────────────────────────────────────────────────
const rejectClaim = [
  param("claim_id").notEmpty(),
  check("reason").notEmpty().withMessage("Rejection reason is required"),

  async (req, res) => {
    if (validationErrors(req, res)) return;
    if (req.user.role !== 1) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { claim_id } = req.params;
    const { reason } = req.body;

    try {
      const claim = await StoreClaim.findOne({ _id: claim_id });
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      if (claim.status !== "pending") {
        return res
          .status(409)
          .json({ message: `Claim is already ${claim.status}` });
      }

      claim.status = "rejected";
      claim.admin_note = reason;
      claim.reviewed_by = req.user.userId;
      claim.reviewed_at = new Date();
      claim.updated_at = new Date();
      await claim.save();

      await sendMail(
        claim.email,
        "Update on Your BinIQ Store Claim",
        `Hi ${claim.full_name},\n\nUnfortunately, your claim for "${
          claim.business_name || "the store"
        }" could not be approved at this time.\n\nReason: ${reason}\n\nIf you believe this is an error or have additional documentation, please contact our support team and resubmit your claim.\n\nThe BinIQ Team`
      );

      res.json({
        success: true,
        message: "Claim rejected and email sent.",
        claim_id,
      });
    } catch (error) {
      console.error("Reject claim error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Check claim status by email
// GET /api/stores/claim/status?email=xxx
// ─────────────────────────────────────────────────────────────────────────────
const getClaimStatus = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const claim = await StoreClaim.findOne({ email: email.toLowerCase() })
      .sort({ created_at: -1 })
      .select(
        "status setup_completed business_name store_id admin_note created_at"
      );

    if (!claim) {
      return res
        .status(404)
        .json({ message: "No claim found for this email" });
    }

    res.json({
      status: claim.status,
      setup_completed: claim.setup_completed,
      business_name: claim.business_name,
      admin_note: claim.status === "rejected" ? claim.admin_note : undefined,
      submitted_at: claim.created_at,
    });
  } catch (error) {
    console.error("Get claim status error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  submitClaim,
  getAllClaims,
  approveClaim,
  rejectClaim,
  getClaimStatus,
};