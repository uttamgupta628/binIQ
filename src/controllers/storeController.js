const { check, validationResult, param, query } = require("express-validator");
const Store = require("../models/Store");
const User = require("../models/User");

// Haversine formula to calculate distance between two points (in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─────────────────────────────────────────────────────────────────────────────
// UUID-safe lookup — Store._id is a plain string, findById() casts to ObjectId
// and silently returns null. findOne({ _id }) does an exact string match.
// ─────────────────────────────────────────────────────────────────────────────
const findStoreById = (id) => Store.findOne({ _id: id });

// ─────────────────────────────────────────────────────────────────────────────
// Daily-rates validation
// ─────────────────────────────────────────────────────────────────────────────
const VALID_DAYS = [
  "Friday", "Saturday", "Sunday",
  "Monday", "Tuesday", "Wednesday", "Thursday",
];

const VALID_PRICES = [
  "15.00", "14.00", "13.00", "12.00", "11.00", "10.00",
  "9.00",  "8.00",  "7.00",  "6.00",  "5.00",  "4.00",
  "3.00",  "2.00",  "1.00",  "0.50",
];

/**
 * Validate and sanitise a daily_rates payload.
 * Returns { valid: true, sanitised } or { valid: false, error }.
 */
const sanitiseDailyRates = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "daily_rates must be a plain object" };
  }
  const sanitised = {};
  for (const [day, price] of Object.entries(raw)) {
    if (!VALID_DAYS.includes(day)) {
      return { valid: false, error: `Invalid day key in daily_rates: "${day}"` };
    }
    if (price !== null && !VALID_PRICES.includes(String(price))) {
      return {
        valid: false,
        error: `Invalid price "${price}" for ${day}. Allowed: ${VALID_PRICES.join(", ")} or null`,
      };
    }
    sanitised[day] = price ?? null;
  }
  return { valid: true, sanitised };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STORE
// ─────────────────────────────────────────────────────────────────────────────
const createStore = [
  check("user_latitude")
    .optional()
    .isFloat()
    .withMessage("User latitude must be a number"),
  check("user_longitude")
    .optional()
    .isFloat()
    .withMessage("User longitude must be a number"),
  check("address").optional().notEmpty().withMessage("Address cannot be empty"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      store_name,
      user_latitude,
      user_longitude,
      address,
      city,
      state,
      zip_code,
      country,
      google_maps_link,
      website_url,
      working_days,
      working_time,
      phone_number,
      store_email,
      facebook_link,
      instagram_link,
      twitter_link,
      whatsapp_link,
      store_image,
      store_images,
      daily_rates,
    } = req.body;

    // Validate daily_rates if provided
    let sanitisedRates = {};
    if (daily_rates != null) {
      const result = sanitiseDailyRates(daily_rates);
      if (!result.valid)
        return res.status(400).json({ message: result.error });
      sanitisedRates = result.sanitised;
    }

    try {
      let store = await Store.findOne({ user_id: req.user.userId });
      let user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (store)
        return res
          .status(400)
          .json({ message: "Store already exists for this user" });

      store = new Store({
        _id: require("uuid").v4(),
        user_id: req.user.userId,
        store_name: store_name || user.store_name,
        user_latitude,
        user_longitude,
        address,
        city,
        state,
        zip_code,
        country,
        google_maps_link,
        website_url,
        working_days,
        working_time,
        phone_number,
        store_email,
        facebook_link,
        instagram_link,
        twitter_link,
        whatsapp_link,
        store_image,
        store_images: Array.isArray(store_images) ? store_images : [],  
        daily_rates: sanitisedRates,
        favorited_by: [],
        liked_by: [],
        followed_by: [],
        comments: [],
      });

      await store.save();
      res
        .status(201)
        .json({ store_id: store._id, message: "Store created successfully" });
    } catch (error) {
      console.error("Create store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET STORE (own store for logged-in user)
// ─────────────────────────────────────────────────────────────────────────────
const getStore = async (req, res) => {
  try {
    const store = await Store.findOne({ user_id: req.user.userId });
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
  } catch (error) {
    console.error("Get store error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STORE
// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIX: user_id is no longer required in the request body.
//    The authenticated user's ID comes from req.user.userId (JWT token).
//    This matches how the frontend sends data — no user_id in the payload.
// ─────────────────────────────────────────────────────────────────────────────
const updateStore = async (req, res) => {
  try {
    const { user_id: _ignored, daily_rates, ...rest } = req.body;
    if (rest.store_images != null) {
  if (!Array.isArray(rest.store_images)) {
    return res.status(400).json({ message: "store_images must be an array of URLs" });
  }
  if (rest.store_images.length > 10) {
    return res.status(400).json({ message: "Maximum 10 store images allowed" });
  }
}
    const userId = req.user.userId;

    const updates = { ...rest, updated_at: Date.now() };

    if (daily_rates != null) {
      const result = sanitiseDailyRates(daily_rates);
      if (!result.valid)
        return res.status(400).json({ message: result.error });
      for (const [day, price] of Object.entries(result.sanitised)) {
        updates[`daily_rates.${day}`] = price;
      }
    }

    const result = await Store.collection.updateOne(
      { user_id: userId },
      { $set: updates },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Store not found for this user" });
    }

    const updated = await Store.collection.findOne({ user_id: userId });
    res.json({ message: "Store updated successfully", store: updated });
  } catch (error) {
    console.error("Update store error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL STORES
// ─────────────────────────────────────────────────────────────────────────────
const getAllStores = async (req, res) => {
  try {
    const stores = await Store.find();
    res.json(stores);
  } catch (error) {
    console.error("Get all stores error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEW STORE
// ─────────────────────────────────────────────────────────────────────────────
const viewStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });
      store.views_count += 1;
      await store.save();
      res.json({
        message: "Store view recorded",
        views_count: store.views_count,
      });
    } catch (error) {
      console.error("View store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LIKE STORE
// ─────────────────────────────────────────────────────────────────────────────
const likeStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.liked_by)) store.liked_by = [];

      const isLiked = store.liked_by.some((id) => id.toString() === userId);
      if (isLiked) {
        store.liked_by = store.liked_by.filter(
          (id) => id.toString() !== userId,
        );
        store.likes = Math.max(0, store.likes - 1);
        await store.save();
        res.json({ message: "Store unliked", isLiked: false, likes: store.likes });
      } else {
        store.liked_by.push(userId);
        store.likes += 1;
        await store.save();
        res.json({ message: "Store liked", isLiked: true, likes: store.likes });
      }
    } catch (error) {
      console.error("Like store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW STORE
// ─────────────────────────────────────────────────────────────────────────────
const followStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.followed_by)) store.followed_by = [];

      const isFollowed = store.followed_by.some(
        (id) => id.toString() === userId,
      );
      if (isFollowed) {
        store.followed_by = store.followed_by.filter(
          (id) => id.toString() !== userId,
        );
        store.followers = Math.max(0, store.followers - 1);
        await store.save();
        res.json({ message: "Store unfollowed", isFollowed: false, followers: store.followers });
      } else {
        store.followed_by.push(userId);
        store.followers += 1;
        await store.save();
        res.json({ message: "Store followed", isFollowed: true, followers: store.followers });
      }
    } catch (error) {
      console.error("Follow store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMMENT ON STORE
// ─────────────────────────────────────────────────────────────────────────────
const commentOnStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  check("content").notEmpty().withMessage("Comment content is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id, content } = req.body;
    const userId = req.user.userId;

    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const comment = {
        content,
        user_id: userId,
        user_name: user.full_name,
        user_image: user.profile_image || null,
        created_at: new Date(),
      };

      store.comments.push(comment);
      await store.save();
      res.json({ message: "Comment added", comment });
    } catch (error) {
      console.error("Comment on store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET STORE DETAILS (public, by :store_id)
// ─────────────────────────────────────────────────────────────────────────────
const getStoreDetails = [
  param("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.params;
    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });
      store.views_count += 1;
      await store.save();
      res.json(store);
    } catch (error) {
      console.error("Get store details error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FAVORITE STORE
// ─────────────────────────────────────────────────────────────────────────────
const favoriteStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await findStoreById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.favorited_by)) store.favorited_by = [];

      const isFavorited = store.favorited_by.some(
        (id) => id.toString() === userId,
      );
      if (isFavorited) {
        store.favorited_by = store.favorited_by.filter(
          (id) => id.toString() !== userId,
        );
        await store.save();
        res.json({ message: "Store removed from favorites", isFavorited: false });
      } else {
        store.favorited_by.push(userId);
        await store.save();
        res.json({ message: "Store added to favorites", isFavorited: true });
      }
    } catch (error) {
      console.error("Favorite store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET FAVORITE STORES (own)
// ─────────────────────────────────────────────────────────────────────────────
const getFavoriteStores = async (req, res) => {
  try {
    const stores = await Store.find({ favorited_by: req.user.userId }).select(
      "store_name address city user_latitude user_longitude views_count likes followers comments store_image store_images image daily_rates",
    );
    res.json(stores);
  } catch (error) {
    console.error("Get favorite stores error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET FAVORITE STORES BY USER ID
// ─────────────────────────────────────────────────────────────────────────────
const getFavoriteStoresByUserId = [
  param("user_id").notEmpty().withMessage("User ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { user_id } = req.params;
    const authenticatedUser = await User.findById(req.user.userId);

    if (user_id !== req.user.userId && authenticatedUser.role !== 1) {
      return res.status(403).json({
        message:
          "Unauthorized: You can only view your own favorites or must be an admin",
      });
    }

    try {
      const stores = await Store.find({ favorited_by: user_id }).select(
        "store_name address city user_latitude user_longitude views_count likes followers comments store_image store_images image daily_rates",
      );
      res.json(stores);
    } catch (error) {
      console.error("Get favorite stores by user ID error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET NEARBY STORES
// ─────────────────────────────────────────────────────────────────────────────
const getNearbyStores = [
  query("latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),
  query("longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),
  query("radius")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Radius must be a positive number"),
  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { latitude, longitude, radius = 10, limit = 10 } = req.query;

    try {
      const stores = await Store.find({
        user_latitude: { $ne: null },
        user_longitude: { $ne: null },
      }).select("store_name user_latitude user_longitude");

      const userLat = parseFloat(latitude);
      const userLon = parseFloat(longitude);
      const nearbyStores = stores
        .map((store) => {
          const distance = calculateDistance(
            userLat, userLon,
            store.user_latitude, store.user_longitude,
          );
          return {
            ...store.toObject(),
            distance_km: parseFloat(distance.toFixed(2)),
          };
        })
        .filter((store) => store.distance_km <= parseFloat(radius))
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, parseInt(limit));

      if (nearbyStores.length === 0) {
        return res
          .status(200)
          .json({ message: `No stores found within ${radius} km`, stores: [] });
      }

      res.json(nearbyStores);
    } catch (error) {
      console.error("Get nearby stores error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CHECK IN / OUT
// ─────────────────────────────────────────────────────────────────────────────
const checkInStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await Store.findOne({ _id: store_id });
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.checked_in_by)) store.checked_in_by = [];

      const isCheckedIn = store.checked_in_by.some(
        (id) => id.toString() === userId,
      );

      if (isCheckedIn) {
        store.checked_in_by = store.checked_in_by.filter(
          (id) => id.toString() !== userId,
        );
        await store.save();
        return res.json({ message: "Checked out successfully", isCheckedIn: false });
      } else {
        store.checked_in_by.push(userId);
        await store.save();
        return res.json({ message: "Checked in successfully", isCheckedIn: true });
      }
    } catch (error) {
      console.error("Check in store error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET TOP STORES
// ─────────────────────────────────────────────────────────────────────────────
const getTopStores = async (req, res) => {
  try {
    const stores = await Store.aggregate([
      {
        $addFields: {
          popularity_score: { $add: ["$views_count", "$followers"] },
        },
      },
      { $sort: { popularity_score: -1 } },
      { $limit: 5 },
      {
        $project: {
          store_name: 1,
          address: 1,
          city: 1,
          views_count: 1,
          followers: 1,
          popularity_score: 1,
          store_image: 1,
          store_images: 1,
          ratings: 1,
          daily_rates: 1,
        },
      },
    ]);

    res.json({ success: true, count: stores.length, data: stores });
  } catch (error) {
    console.error("Get top stores error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET CHECKED-IN STORES
// ─────────────────────────────────────────────────────────────────────────────
const getCheckedInStores = async (req, res) => {
  try {
    const stores = await Store.find({
      checked_in_by: req.user.userId,
    }).select(
      "store_name address city user_latitude user_longitude store_image store_images image ratings likes followers daily_rates",
    );
    res.json(stores);
  } catch (error) {
    console.error("Get checked-in stores error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createStore,
  getStore,
  updateStore,
  getAllStores,
  viewStore,
  likeStore,
  followStore,
  commentOnStore,
  getStoreDetails,
  favoriteStore,
  getFavoriteStores,
  getFavoriteStoresByUserId,
  getNearbyStores,
  getTopStores,
  checkInStore,
  getCheckedInStores,
};