const express = require("express");
const router = express.Router();
const { exportStoreOwners,exportResellers } = require("../controllers/exportControllers");
const { authenticate } = require("../utils/auth");

router.get("/store-owners", authenticate, exportStoreOwners);
router.get("/resellers", authenticate, exportResellers);


module.exports = router;