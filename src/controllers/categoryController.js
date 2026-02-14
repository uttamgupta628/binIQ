const { check, validationResult } = require('express-validator');
const ProductCategory = require('../models/ProductCategory');

const createCategory = [
  check('category_name').notEmpty().withMessage('Category name is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category_name } = req.body;

    try {
      const category = new ProductCategory({ category_name });
      await category.save();
      res.status(201).json({ category_id: category._id, message: 'Category created successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
  },
];

const getCategories = async (req, res) => {
  try {
    const categories = await ProductCategory.find().sort({ category_name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

module.exports = { createCategory, getCategories };