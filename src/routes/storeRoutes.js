const express = require("express");
const router = express.Router();
const {
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
  a,
} = require("../controllers/storeController");
const { authenticate } = require("../utils/auth");

router.post("/", authenticate, createStore);
router.get("/my-store", authenticate, getStore);
router.put("/", authenticate, updateStore);
router.get("/", authenticate, getAllStores);
router.post("/view", authenticate, viewStore);
router.post("/like", authenticate, likeStore);
router.post("/follow", authenticate, followStore);
router.post("/comment", authenticate, commentOnStore);
router.get("/details/:store_id", authenticate, getStoreDetails);
router.post("/favorite", authenticate, favoriteStore);
router.get("/favorites", authenticate, getFavoriteStores);
router.get("/favorites/:user_id", authenticate, getFavoriteStoresByUserId);
router.get("/nearby", authenticate, getNearbyStores);

module.exports = router;
// const express = require("express");
// const {
//   createStore,
//   getStore,
//   updateStore,
// } = require("../controllers/storeController");
// const { authenticate } = require("../utils/auth");

// const router = express.Router();

// router.post("/", authenticate, createStore);
// router.get("/", authenticate, getStore);
// router.patch("/", authenticate, updateStore);

// module.exports = router;
