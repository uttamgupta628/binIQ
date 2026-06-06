const express = require("express");
const router = express.Router();
const { authenticate } = require("../utils/auth");
const {
  getAllClaims,
  approveClaim,
  rejectClaim,
} = require("../controllers/storeClaimController");

router.get("/claims", authenticate, getAllClaims);
router.put("/claims/:claim_id/approve", authenticate, approveClaim);
router.put("/claims/:claim_id/reject", authenticate, rejectClaim);

module.exports = router;