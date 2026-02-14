const express = require("express");
const {
  getPaidUsers,
  getStoreOwners,
  getResellers,
  getRevenue,
  getRecentActivity,
  getRecentFeedbacks,
  getQuickStats,
} = require("../controllers/statsController");
const { authenticate } = require("../utils/auth");

const router = express.Router();

router.get("/paid-users", authenticate, getPaidUsers);
router.get("/store-owners", authenticate, getStoreOwners);
router.get("/resellers", authenticate, getResellers);
router.get("/revenue", authenticate, getRevenue);
router.get("/recent-activity", authenticate, getRecentActivity);
router.get("/recent-feedbacks", authenticate, getRecentFeedbacks);
router.get("/quick-stats", authenticate, getQuickStats);

module.exports = router;
