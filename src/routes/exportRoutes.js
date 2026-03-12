const express = require("express");
const router = express.Router();
const { exportStoreOwners,exportResellers, exportAnalytics } = require("../controllers/exportControllers");
const { authenticate } = require("../utils/auth");

router.get("/store-owners", authenticate, exportStoreOwners);
router.get("/resellers", authenticate, exportResellers);
router.get("/analytics", authenticate, exportAnalytics);


module.exports = router;