const express = require("express");
const {
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
  getUserMetrics,
  adminchangePassword,
  createStoreOwner,
  getFeedbackRatingTrends,
  getUserAnalytics,
  getUserAddressesAndStatus,
} = require("../controllers/userController");
const { authenticate } = require("../utils/auth");
const {
  recordScan,
  getScans,
  deleteScan,
  getUserScansAdmin,
  getAllUsersScansAdmin,
} = require("../controllers/scanController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", authenticate, getProfile);
router.get("/details/:userId", authenticate, ...getUserDetails);
router.get("/all-details-store-owner", authenticate, getAllStoreOwnerDetails);
router.get("/all-details-resellar", authenticate, getAllResellerDetails);
router.put("/profile", authenticate, ...updateProfile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);
router.post("/change-password", authenticate, ...changePassword);
router.delete("/delete-account", authenticate, ...deleteAccount);
router.post("/feedback", authenticate, ...submitFeedback);
router.get("/feedback", authenticate, getFeedback);
router.get("/feedback/trends", authenticate, getFeedbackRatingTrends);
router.post("/feedback/reply", authenticate, ...replyFeedback);
router.post("/approve-store-owner", authenticate, ...approveStoreOwner);
router.post("/reject-store-owner", authenticate, ...rejectStoreOwner);
router.post("/scan", authenticate, recordScan);
router.get("/scans", authenticate, getScans);
router.delete("/scans/:scan_id", authenticate, deleteScan);
router.get("/user-count", authenticate, getUserCounts);
router.patch("/admin-change-password", authenticate, ...adminchangePassword);
router.post("/create-store-owner", authenticate, createStoreOwner);
router.get("/user-analytics", authenticate, getUserAnalytics);
router.get("/locationDetails", authenticate, getUserAddressesAndStatus);

// admin 
router.get("/all-scans", authenticate, getAllUsersScansAdmin);    
router.get("/:user_id/scans", authenticate, getUserScansAdmin);

module.exports = router;
