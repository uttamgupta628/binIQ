const express = require("express");
const router = express.Router();
const { exportStoreOwners } = require("../controllers/exportControllers");
const { authenticate } = require("../utils/auth");

router.get("/store-owners", authenticate, exportStoreOwners);

module.exports = router;