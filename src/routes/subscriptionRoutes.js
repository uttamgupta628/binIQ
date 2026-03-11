const express = require("express");
const {
  subscribe,
  getSubscriptions,
  cancelSubscription,
  getSubscriptionTiers,
  updateSubscriptionTiers,
  getAllSubscriptions,
  manageSubscriptionCounts,
  getRevenueAnalytics,
} = require("../controllers/subscriptionController");
const { authenticate } = require("../utils/auth");

const router = express.Router();

router.get("/tiers", authenticate, getSubscriptionTiers);
router.put("/tiers", authenticate, ...updateSubscriptionTiers);
router.get("/all", authenticate, getAllSubscriptions);
router.put("/manage-counts", authenticate, ...manageSubscriptionCounts);
router.post("/subscribe", authenticate, ...subscribe);
router.get("/", authenticate, getSubscriptions);
router.post("/cancel", authenticate, cancelSubscription);
router.get("/revenue-analytics", authenticate, getRevenueAnalytics);
module.exports = router;
