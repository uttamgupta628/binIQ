const express = require("express");
const router = express.Router();
const {
  submitClaim,
  getClaimStatus,
} = require("../controllers/storeClaimController");

// All public — claimant has no account yet
router.post("/claim", submitClaim);
router.get("/claim/status", getClaimStatus);

module.exports = router;