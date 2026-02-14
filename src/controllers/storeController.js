const { check, validationResult } = require("express-validator");
const Store = require("../models/Store");
const User = require("../models/User");

// Haversine formula to calculate distance between two points (in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
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
    } = req.body;

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

const updateStore = async (req, res) => {
  try {
    const { user_id, ...updates } = req.body;

    if (!user_id) {
      return res
        .status(400)
        .json({ message: "user_id is required in the request body" });
    }

    if (user_id !== req.user.userId) {
      return res.status(403).json({
        message: "Unauthorized: user_id does not match authenticated user",
      });
    }

    const store = await Store.findOneAndUpdate(
      { user_id },
      { $set: { ...updates, updated_at: Date.now() } },
      { new: true }
    );

    if (!store) {
      return res
        .status(404)
        .json({ message: "Store not found for the provided user_id" });
    }

    res.json({ message: "Store updated successfully", store });
  } catch (error) {
    console.error("Update store error:", {
      message: error.message,
      stack: error.stack,
      user_id: req.body.user_id,
      updates,
      authenticatedUserId: req.user.userId,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllStores = async (req, res) => {
  try {
    const stores = await Store.find();
    res.json(stores);
  } catch (error) {
    console.error("Get all stores error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const viewStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;

    try {
      const store = await Store.findById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      store.views_count += 1;
      await store.save();
      res.json({
        message: "Store view recorded",
        views_count: store.views_count,
      });
    } catch (error) {
      console.error("View store error:", {
        message: error.message,
        stack: error.stack,
        store_id,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const likeStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await Store.findById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.liked_by)) {
        store.liked_by = [];
      }

      const isLiked = store.liked_by.includes(userId);

      if (isLiked) {
        store.liked_by = store.liked_by.filter((id) => id !== userId);
        store.likes = Math.max(0, store.likes - 1);
        await store.save();
        res.json({
          message: "Store unliked",
          isLiked: false,
          likes: store.likes,
        });
      } else {
        store.liked_by.push(userId);
        store.likes += 1;
        await store.save();
        res.json({ message: "Store liked", isLiked: true, likes: store.likes });
      }
    } catch (error) {
      console.error("Like store error:", {
        message: error.message,
        stack: error.stack,
        store_id,
        userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const followStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await Store.findById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.followed_by)) {
        store.followed_by = [];
      }

      const isFollowed = store.followed_by.includes(userId);

      if (isFollowed) {
        store.followed_by = store.followed_by.filter((id) => id !== userId);
        store.followers = Math.max(0, store.followers - 1);
        await store.save();
        res.json({
          message: "Store unfollowed",
          isFollowed: false,
          followers: store.followers,
        });
      } else {
        store.followed_by.push(userId);
        store.followers += 1;
        await store.save();
        res.json({
          message: "Store followed",
          isFollowed: true,
          followers: store.followers,
        });
      }
    } catch (error) {
      console.error("Follow store error:", {
        message: error.message,
        stack: error.stack,
        store_id,
        userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

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
      const store = await Store.findById(store_id);
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
      console.error("Comment on store error:", {
        message: error.message,
        stack: error.stack,
        store_id,
        userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getStoreDetails = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.params;

    try {
      const store = await Store.findById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      store.views_count += 1;
      await store.save();

      res.json(store);
    } catch (error) {
      console.error("Get store details error:", {
        message: error.message,
        stack: error.stack,
        store_id,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const favoriteStore = [
  check("store_id").notEmpty().withMessage("Store ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { store_id } = req.body;
    const userId = req.user.userId;

    try {
      const store = await Store.findById(store_id);
      if (!store) return res.status(404).json({ message: "Store not found" });

      if (!Array.isArray(store.favorited_by)) {
        store.favorited_by = [];
      }

      const isFavorited = store.favorited_by.includes(userId);

      if (isFavorited) {
        store.favorited_by = store.favorited_by.filter((id) => id !== userId);
        await store.save();
        res.json({
          message: "Store removed from favorites",
          isFavorited: false,
        });
      } else {
        store.favorited_by.push(userId);
        await store.save();
        res.json({ message: "Store added to favorites", isFavorited: true });
      }
    } catch (error) {
      console.error("Favorite store error:", {
        message: error.message,
        stack: error.stack,
        store_id,
        userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getFavoriteStores = async (req, res) => {
  try {
    const stores = await Store.find({ favorited_by: req.user.userId }).select(
      "store_name address city user_latitude user_longitude views_count likes followers comments"
    );
    res.json(stores);
  } catch (error) {
    console.error("Get favorite stores error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getFavoriteStoresByUserId = [
  check("user_id").notEmpty().withMessage("User ID is required"),
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
        "store_name address city user_latitude user_longitude views_count likes followers comments"
      );
      res.json(stores);
    } catch (error) {
      console.error("Get favorite stores by user ID error:", {
        message: error.message,
        stack: error.stack,
        user_id,
        authenticatedUserId: req.user.userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getNearbyStores = [
  check("latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),
  check("longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),
  check("radius")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Radius must be a positive number"),
  check("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { latitude, longitude, radius = 10, limit = 10 } = req.query;

    try {
      // Fetch stores with valid coordinates
      const stores = await Store.find({
        user_latitude: { $ne: null },
        user_longitude: { $ne: null },
      }).select("store_name user_latitude user_longitude");

      // Calculate distances and filter
      const userLat = parseFloat(latitude);
      const userLon = parseFloat(longitude);
      const nearbyStores = stores
        .map((store) => {
          const distance = calculateDistance(
            userLat,
            userLon,
            store.user_latitude,
            store.user_longitude
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
      console.error("Get nearby stores error:", {
        message: error.message,
        stack: error.stack,
        latitude,
        longitude,
        radius,
        limit,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

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
};
