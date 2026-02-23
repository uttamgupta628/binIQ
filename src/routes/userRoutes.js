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
} = require("../controllers/userController");
const { authenticate } = require("../utils/auth");
const { recordScan, getScans, deleteScan } = require("../controllers/scanController");

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
router.post("/feedback/reply", authenticate, ...replyFeedback);
router.post("/approve-store-owner", authenticate, ...approveStoreOwner);
router.post("/reject-store-owner", authenticate, ...rejectStoreOwner);
<<<<<<< HEAD
router.post("/scan", authenticate, recordScan);
router.get("/scans", authenticate, getScans);
router.delete("/scans/:scan_id", authenticate, deleteScan);

=======
router.get("/user-count", authenticate, getUserCounts);
// total users (store owners and resellers)
>>>>>>> 3dd5ad51cb7bbe20c6c2fbd0000f6545133e69b3
module.exports = router;
