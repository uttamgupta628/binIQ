
const express = require('express');
const router  = express.Router();
const {
  getSubscriptions,
  getAllSubscriptions,
  manageSubscriptionCounts,
  getRevenueAnalytics,
    deleteSubscription,
     verifyStoreOwnerSubscription,
  adminAssignSubscription
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
router.delete("/:subscription_id", authenticate, deleteSubscription);
router.get('/verify/:storeOwnerId', authenticate, verifyStoreOwnerSubscription);
router.post('/admin-assign', authenticate, adminAssignSubscription);
module.exports = router;