const { check, validationResult } = require('express-validator');
const ProductCategory = require('../models/ProductCategory');

const createCategory = async (req, res) => {
  const { categories } = req.body;

  try {
    const data = categories.map(name => ({ category_name: name }));
    const result = await ProductCategory.insertMany(data);

    res.status(201).json({
      message: "Categories added successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await ProductCategory.find()
      .sort({ category_name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

module.exports = { createCategory, getCategories };