const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { check, validationResult } = require("express-validator");
const User = require("../models/User");
const Store = require("../models/Store");
const Feedback = require("../models/Feedback");
const Notification = require("../models/Notification");
const { sendMail } = require("../utils/mailer");

const initializeAdmin = async () => {
  try {
    const adminEmail = "admin@binIQ.com";
    const adminPassword = "Admin@123";
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = new User({
        _id: uuidv4(),
        full_name: "Admin User",
        email: adminEmail,
        password: hashedPassword,
        role: 1,
      });
      await admin.save();
      console.log("Admin user created:", adminEmail);
    }
  } catch (error) {
    console.error("Failed to initialize admin user:", error);
  }
};

initializeAdmin();

const register = [
  // Basic fields (always required)
  check("full_name").notEmpty().withMessage("Full name is required"),
  check("email").isEmail().withMessage("Valid email is required"),
  check("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  check("confirm_password")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),
  check("role")
    .isIn([1, 2, 3])
    .withMessage("Role must be 1 (Admin), 2 (Reseller), or 3 (Store Owner)"),

  // Store Owner specific validation
  check("store_name")
    .if((value, { req }) => req.body.role === 3)
    .notEmpty()
    .withMessage("Store name is required for Store Owner"),

  // Reseller Premium Plan specific validations
  // These only apply when role is 2 AND selected_plan is "premium"
  check("dob")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .isISO8601()
    .withMessage("Valid date of birth is required for Premium Plan"),
  check("gender")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other for Premium Plan"),
  check("phone_number")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Valid phone number is required for Premium Plan"),
  check("address")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .withMessage("Address is required for Premium Plan"),
  check("card_information.card_number")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .matches(/^\d{16}$/)
    .withMessage("Card number must be 16 digits for Premium Plan"),
  check("card_information.cardholder_name")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .withMessage("Cardholder name is required for Premium Plan"),
  check("card_information.expiry_month")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage("Valid expiry month (01-12) is required for Premium Plan"),
  check("card_information.expiry_year")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .matches(/^\d{4}$/)
    .withMessage("Valid expiry year is required for Premium Plan"),
  check("card_information.cvc")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .notEmpty()
    .matches(/^\d{3,4}$/)
    .withMessage("Valid CVC (3-4 digits) is required for Premium Plan"),
  check("expertise_level")
    .if(
      (value, { req }) =>
        req.body.role === 2 && req.body.selected_plan === "premium",
    )
    .isIn(["beginner", "intermediate", "expert"])
    .withMessage(
      "Expertise level must be beginner, intermediate, or expert for Premium Plan",
    ),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors
        .array()
        .map((err) => err.msg)
        .join(", ");
      return res.status(400).json({ success: false, error: errorMessages });
    }

    const {
      full_name,
      store_name,
      email,
      password,
      role,
      dob,
      gender,
      phone_number,
      address,
      card_information,
      expertise_level,
      profile_image,
      selected_plan,
    } = req.body;

    try {
      const existingUser = await User.findOne({ email });
      if (existingUser)
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user object with basic fields
      const userData = {
        _id: uuidv4(),
        full_name,
        email,
        password: hashedPassword,
        role,
      };

      // Add store_name for Store Owners
      if (role === 3) {
        userData.store_name = store_name;
        userData.used_promotions = 0;
      }

      // Add premium plan fields for Resellers with premium plan
      if (role === 2 && selected_plan === "premium") {
        userData.dob = new Date(dob);
        userData.gender = gender;
        userData.phone_number = phone_number;
        userData.address = address;
        userData.card_information = card_information;
        userData.expertise_level = expertise_level;
        if (profile_image) {
          userData.profile_image = profile_image;
        }
      }

      const user = new User(userData);
      await user.save();

      // Create store for Store Owners
      if (role === 3) {
        const existingStore = await Store.findOne({ user_id: user._id });
        if (existingStore) {
          return res.status(400).json({
            success: false,
            message: "Store already exists for this user",
          });
        }

        const store = new Store({
          _id: uuidv4(),
          user_id: user._id,
          store_name,
          user_latitude: null,
          user_longitude: null,
          address: null,
          favorited_by: [],
          liked_by: [],
          followed_by: [],
          comments: [],
        });
        await store.save();
      }

      res.status(201).json({
        success: true,
        user_id: user._id,
        message: "User registered successfully",
        plan: selected_plan || "free",
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        message: "Server error",
        error: error.message,
        success: false,
      });
    }
  },
];

// module.exports = { register };

const login = [
  check("email").isEmail().withMessage("Valid email is required"),
  check("password").notEmpty().withMessage("Password is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user)
        return res.status(400).json({ message: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: "Invalid credentials" });

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "30d",
      });
      res.json({ token, user_details: user });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("-password -card_information")
      .populate("subscription")
      .populate({
        path: "promotions",
        select:
          "category_id title description upc_id tags price status start_date end_date visibility created_at updated_at",
        populate: { path: "category_id", select: "category_name" },
      });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getUserDetails = [
  check("userId").notEmpty().withMessage("User ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { userId } = req.params;
    const requester = await User.findById(req.user.userId);
    if (!requester || requester.role !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access user details",
      });
    }

    try {
      const user = await User.findById(userId)
        .select("-password -card_information")
        .populate("subscription")
        .populate({
          path: "promotions",
          select:
            "category_id title description upc_id tags price status start_date end_date visibility created_at updated_at",
          populate: { path: "category_id", select: "category_name" },
        });
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      if (user.role === 1)
        return res.status(403).json({
          success: false,
          message: "Cannot fetch details of admin users",
        });

      let store = null;
      if (user.role === 3) {
        store = await Store.findOne({ user_id: user._id });
        if (!store)
          return res.status(404).json({
            success: false,
            message: "Store not found for store owner",
          });
      }

      const response = {
        success: true,
        data: {
          user: {
            _id: user._id,
            full_name: user.full_name,
            store_name: user.store_name || null,
            email: user.email,
            role: user.role === 2 ? "reseller" : "store_owner",
            dob: user.dob || null,
            gender: user.gender || null,
            phone_number: user.phone_number || null,
            address: user.address || null,
            expertise_level: user.expertise_level || null,
            profile_image: user.profile_image || null,
            subscription: user.subscription || null,
            subscription_end_time: user.subscription_end_time || null,
            total_promotions: user.total_promotions || 0,
            used_promotions: user.used_promotions || 0,
            promotions: user.promotions || [],
            verified: user.verified || false,
            total_scans: user.total_scans || 0,
            scans_used: user.scans_used || [],
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
          store:
            user.role === 3
              ? {
                  _id: store._id,
                  store_name: store.store_name,
                  user_latitude: store.user_latitude || null,
                  user_longitude: store.user_longitude || null,
                  address: store.address || null,
                  favorited_by: store.favorited_by || [],
                  liked_by: store.liked_by || [],
                  followed_by: store.followed_by || [],
                  comments: store.comments || [],
                }
              : null,
        },
      };

      res.json(response);
    } catch (error) {
      console.error("Get user details error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getAllStoreOwnerDetails = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester || requester.role !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access all users details",
      });
    }

    const users = await User.find({ role: 3 })
      .select("-password -card_information")
      .populate("subscription")
      .populate({
        path: "promotions",
        select:
          "category_id title description upc_id tags price status start_date end_date visibility created_at updated_at",
        populate: { path: "category_id", select: "category_name" },
      });

    const userDetails = await Promise.all(
      users.map(async (user) => {
        let store = null;
        if (user.role === 3) {
          store = await Store.findOne({ user_id: user._id });
        }

        return {
          user: {
            _id: user._id,
            full_name: user.full_name,
            store_name: user.store_name || null,
            email: user.email,
            role: "store_owner",
            dob: user.dob || null,
            gender: user.gender || null,
            phone_number: user.phone_number || null,
            address: user.address || null,
            expertise_level: user.expertise_level || null,
            profile_image: user.profile_image || null,
            subscription: user.subscription || null,
            subscription_end_time: user.subscription_end_time || null,
            total_promotions: user.total_promotions || 0,
            used_promotions: user.used_promotions || 0,
            promotions: user.promotions || [],
            status: user.status,
            total_scans: user.total_scans || 0,
            scans_used: user.scans_used || [],
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
          store: store
            ? {
                _id: store._id,
                store_name: store.store_name,
                user_latitude: store.user_latitude || null,
                user_longitude: store.user_longitude || null,
                address: store.address || null,
                favorited_by: store.favorited_by || [],
                liked_by: store.liked_by || [],
                followed_by: store.followed_by || [],
                comments: store.comments || [],
              }
            : null,
        };
      }),
    );

    res.json({
      success: true,
      data: userDetails,
    });
  } catch (error) {
    console.error("Get all store owners details error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getAllResellerDetails = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);

    if (!requester || requester.role !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access all reseller details",
      });
    }

    const users = await User.find({ role: 2 })
      .select("-password ")
      .populate("subscription")
      .populate({
        path: "promotions",
        select:
          "category_id title description upc_id tags price status start_date end_date visibility created_at updated_at",
        populate: { path: "category_id", select: "category_name" },
      });

    const userDetails = await Promise.all(
      users.map(async (user) => {
        return {
          user: {
            _id: user._id,
            full_name: user.full_name,
            store_name: user.store_name || null,
            email: user.email,
            role: "reseller",
            dob: user.dob || null,
            gender: user.gender || null,
            phone_number: user.phone_number || null,
            address: user.address || null,
            expertise_level: user.expertise_level || null,
            profile_image: user.profile_image || null,
            subscription: user.subscription || null,
            subscription_end_time: user.subscription_end_time || null,
            total_promotions: user.total_promotions || 0,
            used_promotions: user.used_promotions || 0,
            promotions: user.promotions || [],
            status: user.status,
            total_scans: user.total_scans || 0,
            scans_used: user.scans_used || [],
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
        };
      }),
    );

    res.json({
      success: true,
      data: userDetails,
    });
  } catch (error) {
    console.error("Get all resellers details error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const updateProfile = [
  check("full_name")
    .optional()
    .notEmpty()
    .withMessage("Full name cannot be empty"),
  check("store_name")
    .if((value, { req }) => req.body.role === 3)
    .optional()
    .notEmpty()
    .withMessage("Store name cannot be empty for Store Owner"),
  check("dob")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .isISO8601()
    .withMessage("Valid date of birth is required"),
  check("gender")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other"),
  check("phone_number")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Valid phone number is required"),
  check("address")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .notEmpty()
    .withMessage("Address cannot be empty"),
  check("card_information.card_number")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .matches(/^\d{16}$/)
    .withMessage("Card number must be 16 digits"),
  check("card_information.cardholder_name")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .notEmpty()
    .withMessage("Cardholder name cannot be empty"),
  check("card_information.expiry_month")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage("Valid expiry month (01-12) is required"),
  check("card_information.expiry_year")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .matches(/^\d{4}$/)
    .withMessage("Valid expiry year is required"),
  check("card_information.cvc")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .matches(/^\d{3,4}$/)
    .withMessage("Valid CVC (3-4 digits) is required"),
  check("expertise_level")
    .if((value, { req }) => req.body.role === 2)
    .optional()
    .isIn(["beginner", "intermediate", "expert"])
    .withMessage("Expertise level must be beginner, intermediate, or expert"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      user.full_name = req.body.full_name || user.full_name;
      user.store_name =
        req.body.role === 3 ? req.body.store_name || user.store_name : null;
      if (user.role === 2) {
        user.dob = req.body.dob ? new Date(req.body.dob) : user.dob;
        user.gender = req.body.gender || user.gender;
        user.phone_number = req.body.phone_number || user.phone_number;
        user.address = req.body.address || user.address;
        user.card_information =
          req.body.card_information || user.card_information;
        user.expertise_level = req.body.expertise_level || user.expertise_level;
        user.profile_image = req.body.profile_image || user.profile_image;
      }
      user.updated_at = Date.now();
      await user.save();

      res.json({
        message: "Profile updated successfully",
        user: user.toObject({ getters: true }),
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const forgotPassword = [
  check("email").isEmail().withMessage("Valid email is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: "User not found" });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetPasswordToken = otp;
      user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
      await user.save();

      await sendMail(
        email,
        "Password Reset OTP",
        `Your OTP for password reset is: ${otp}`,
      );
      res.status(200).json({ message: "OTP sent to email" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({
        message: "Server error",
        error: { code: error.code, message: error.message },
      });
    }
  },
];

const verifyOTP = [
  check("email").isEmail().withMessage("Valid email is required"),
  check("otp").notEmpty().withMessage("OTP is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, otp } = req.body;

    try {
      const user = await User.findOne({
        email,
        resetPasswordToken: otp,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user)
        return res.status(400).json({ message: "Invalid or expired OTP" });

      res.json({ message: "OTP verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const resetPassword = [
  check("email").isEmail().withMessage("Valid email is required"),
  check("new_password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  check("confirm_password")
    .custom((value, { req }) => value === req.body.new_password)
    .withMessage("Passwords do not match"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, new_password } = req.body;

    try {
      const user = await User.findOne({
        email,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user)
        return res.status(400).json({ message: "OTP expired or invalid" });

      // ✅ FIXED: Hash the password before saving!
      const hashedPassword = await bcrypt.hash(new_password, 10);
      user.password = hashedPassword;

      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;

      await user.save();

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const changePassword = [
  check("old_password").notEmpty().withMessage("Old password is required"),
  check("new_password")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { old_password, new_password } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const isMatch = await bcrypt.compare(old_password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: "Invalid old password" });

      user.password = await bcrypt.hash(new_password, 10);
      user.updated_at = Date.now();
      await user.save();

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const deleteAccount = [
  check("user_id").notEmpty().withMessage("User ID is required"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { user_id } = req.body;
    const requesterId = req.user.userId;

    try {
      const requester = await User.findById(requesterId);
      if (!requester || requester.role !== 1) {
        return res.status(403).json({
          message: "Only admins can delete store owners",
        });
      }

      const userToDelete = await User.findById(user_id);
      if (!userToDelete)
        return res.status(404).json({ message: "User not found" });

      await User.deleteOne({ _id: user_id });

      await Store.deleteOne({ user_id: user_id });

      res.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const submitFeedback = [
  check("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  check("suggestion").notEmpty().withMessage("Suggestion is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { rating, suggestion } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === 1)
        return res
          .status(403)
          .json({ message: "Admins cannot submit feedback" });

      const feedback = new Feedback({
        _id: uuidv4(),
        rating,
        user_name: user.full_name,
        user_email: user.email,
        suggestion,
        user_id: userId,
        type: user.role === 2 ? "reseller" : "store_owner",
      });
      await feedback.save();

      const admin = await User.findOne({ role: 1 });
      if (admin) {
        const notification = new Notification({
          _id: uuidv4(),
          user_id: admin._id,
          heading: "New Feedback Received",
          content: `New feedback from ${user.full_name} (${user.email}): Rating: ${rating}/5, Suggestion: ${suggestion}`,
          type: user.role === 2 ? "reseller" : "store_owner",
        });
        await notification.save();
        await sendMail(
          admin.email,
          "New Feedback Received",
          `Feedback from ${user.full_name} (${user.email}, ${
            user.role === 2 ? "reseller" : "store_owner"
          }): Rating: ${rating}/5, Suggestion: ${suggestion}`,
        );
      }

      res.status(201).json({ message: "Feedback submitted successfully" });
    } catch (error) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getFeedback = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== 1)
      return res.status(403).json({ message: "Only admins can view feedback" });

    const feedback = await Feedback.find();
    res.json(feedback);
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const replyFeedback = [
  check("feedback_id").notEmpty().withMessage("Feedback ID is required"),
  check("reply").notEmpty().withMessage("Reply is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { feedback_id, reply } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 1)
        return res
          .status(403)
          .json({ message: "Only admins can reply to feedback" });

      const feedback = await Feedback.findById(feedback_id);
      if (!feedback)
        return res.status(404).json({ message: "Feedback not found" });

      feedback.reply = reply;
      feedback.status = "replied";
      await feedback.save();

      const feedbackUser = await User.findById(feedback.user_id);
      if (feedbackUser) {
        await sendMail(
          feedbackUser.email,
          "Feedback Reply",
          `Admin replied to your feedback: ${reply}`,
        );
      }

      res.json({ message: "Feedback replied successfully", feedback });
    } catch (error) {
      console.error("Reply feedback error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const approveStoreOwner = [
  check("user_id").notEmpty().withMessage("User ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { user_id } = req.body;
    const requesterId = req.user.userId;

    try {
      const requester = await User.findById(requesterId);
      if (!requester)
        return res.status(404).json({ message: "Requester not found" });
      if (requester.role !== 1)
        return res
          .status(403)
          .json({ message: "Only admins can approve store owners" });

      const user = await User.findById(user_id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 3)
        return res.status(400).json({ message: "User is not a store owner" });

      user.status = "approved";
      await user.save();

      const notification = new Notification({
        _id: uuidv4(),
        user_id: user._id,
        heading: "Account Verified",
        content: "Your store owner account has been verified.",
        type: "store_owner",
      });
      await notification.save();
      await sendMail(
        user.email,
        "Account Verified",
        "Your store owner account has been verified.",
      );

      res.json({ message: "Store owner approved successfully" });
    } catch (error) {
      console.error("Approve store owner error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const rejectStoreOwner = [
  check("user_id").notEmpty().withMessage("User ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { user_id } = req.body;
    const requesterId = req.user.userId;

    try {
      const requester = await User.findById(requesterId);
      if (!requester)
        return res.status(404).json({ message: "Requester not found" });
      if (requester.role !== 1)
        return res
          .status(403)
          .json({ message: "Only admins can reject store owners" });

      const user = await User.findById(user_id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 3)
        return res.status(400).json({ message: "User is not a store owner" });

      user.status = "rejected";
      await user.save();

      const notification = new Notification({
        _id: uuidv4(),
        user_id: user._id,
        heading: "Account Verification Rejected",
        content: "Your store owner account verification was rejected.",
        type: "store_owner",
      });
      await notification.save();
      await sendMail(
        user.email,
        "Account Verification Rejected",
        "Your store owner account verification was rejected.",
      );

      res.json({ message: "Store owner rejected successfully" });
    } catch (error) {
      console.error("Reject store owner error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];
const getUserCounts = async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester || requester.role !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access user stats",
      });
    }
    const now = new Date();
    const last30Days = new Date();
    last30Days.setDate(now.getDate() - 30);

    const last60Days = new Date();
    last60Days.setDate(now.getDate() - 60);

    const totalCounts = await User.aggregate([
      {
        $match: {
          role: { $in: [2, 3] },
        },
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    let resellerCount = 0;
    let ownerCount = 0;

    totalCounts.forEach((item) => {
      if (item._id === 2) resellerCount = item.count;
      if (item._id === 3) ownerCount = item.count;
    });

    const currentMonthUsers = await User.countDocuments({
      role: { $in: [2, 3] },
      created_at: { $gte: last30Days, $lte: now },
    });

    const previousMonthUsers = await User.countDocuments({
      role: { $in: [2, 3] },
      created_at: { $gte: last60Days, $lt: last30Days },
    });

    let percentageChange = 0;

    if (previousMonthUsers === 0 && currentMonthUsers > 0) {
      percentageChange = 100;
    } else if (previousMonthUsers > 0) {
      percentageChange =
        ((currentMonthUsers - previousMonthUsers) / previousMonthUsers) * 100;
    }

    percentageChange = Number(percentageChange.toFixed(2));

    res.json({
      success: true,
      data: {
        total_users: resellerCount + ownerCount,
        resellers: resellerCount,
        store_owners: ownerCount,

        monthly_stats: {
          current_month_users: currentMonthUsers,
          previous_month_users: previousMonthUsers,
          percentage_change: percentageChange,
        },
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  getUserDetails,
  getAllStoreOwnerDetails,
  getAllResellerDetails,
  updateProfile,
  forgotPassword,
  verifyOTP,
  resetPassword,
  changePassword,
  deleteAccount,
  submitFeedback,
  getFeedback,
  replyFeedback,
  approveStoreOwner,
  rejectStoreOwner,
  getUserCounts,
};
