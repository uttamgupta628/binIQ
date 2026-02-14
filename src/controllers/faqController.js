const { check, validationResult } = require("express-validator");
const FAQ = require("../models/FAQ");
const User = require("../models/User");

const createFAQ = [
  check("question").notEmpty().withMessage("Question is required"),
  check("answer").notEmpty().withMessage("Answer is required"),
  check("type")
    .isIn([2, 3])
    .withMessage("Type must be 1 (Reseller app) or 2 (Admin app)"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { question, answer, type } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 1)
        return res.status(403).json({ message: "Only admins can create FAQs" });

      const faq = new FAQ({
        _id: require("uuid").v4(),
        question,
        answer,
        type,
      });
      await faq.save();

      res.status(201).json({ message: "FAQ created successfully", faq });
    } catch (error) {
      console.error("Create FAQ error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const getFAQs = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let faqs;
    if (user.role === 2) {
      faqs = await FAQ.find({ type: 2 }); // Reseller app FAQs
    } else if (user.role === 1) {
      faqs = await FAQ.find(); // All FAQs for admin
    } else {
      faqs = await FAQ.find({ type: 3 }); // Store owners get no FAQs (adjust if needed)
    }

    res.json(faqs);
  } catch (error) {
    console.error("Get FAQs error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateFAQ = [
  check("faq_id").notEmpty().withMessage("FAQ ID is required"),
  check("question")
    .optional()
    .notEmpty()
    .withMessage("Question cannot be empty"),
  check("answer").optional().notEmpty().withMessage("Answer cannot be empty"),
  check("type")
    .optional()
    .isIn([2, 3])
    .withMessage("Type must be 1 (Reseller app) or 2 (Admin app)"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { faq_id } = req.params;
    const { question, answer, type } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 1)
        return res.status(403).json({ message: "Only admins can update FAQs" });

      const faq = await FAQ.findById(faq_id);
      if (!faq) return res.status(404).json({ message: "FAQ not found" });

      faq.question = question || faq.question;
      faq.answer = answer || faq.answer;
      faq.type = type || faq.type;
      faq.updated_at = Date.now();
      await faq.save();

      res.json({ message: "FAQ updated successfully", faq });
    } catch (error) {
      console.error("Update FAQ error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

const deleteFAQ = [
  check("faq_id").notEmpty().withMessage("FAQ ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { faq_id } = req.params;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role !== 1)
        return res.status(403).json({ message: "Only admins can delete FAQs" });

      const faq = await FAQ.findById(faq_id);
      if (!faq) return res.status(404).json({ message: "FAQ not found" });

      await FAQ.deleteOne({ _id: faq_id });
      res.json({ message: "FAQ deleted successfully" });
    } catch (error) {
      console.error("Delete FAQ error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
];

module.exports = { createFAQ, getFAQs, updateFAQ, deleteFAQ };
