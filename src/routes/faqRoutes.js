const express = require("express");
const {
  createFAQ,
  getFAQs,
  updateFAQ,
  deleteFAQ,
} = require("../controllers/faqController");
const { authenticate } = require("../utils/auth");

const router = express.Router();

router.post("/", authenticate, ...createFAQ);
router.get("/", authenticate, getFAQs);
router.put("/:faq_id", authenticate, ...updateFAQ);
router.delete("/:faq_id", authenticate, ...deleteFAQ);

module.exports = router;
