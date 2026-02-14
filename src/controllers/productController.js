const { check, validationResult } = require('express-validator');
const Product = require('../models/Product');
const ProductCategory = require('../models/ProductCategory');

const createProduct = [
  check('category_id').notEmpty().withMessage('Category ID is required'),
  check('title').notEmpty().withMessage('Title is required'),
  check('description').notEmpty().withMessage('Description is required'),
  check('upc_id').notEmpty().withMessage('UPC ID is required'),
  check('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  check('type').isIn([1, 2]).withMessage('Type must be 1 (Trending) or 2 (Activity Feed)'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category_id, title, description, upc_id, tags, price, offer_price, image_inner, image_outer, type } = req.body;

    try {
      const category = await ProductCategory.findById(category_id);
      if (!category) return res.status(404).json({ message: 'Category not found' });

      const product = new Product({
        user_id: req.user.userId,
        category_id,
        title,
        description,
        upc_id,
        tags,
        price,
        offer_price,
        image_inner,
        image_outer,
        type,
      });

      await product.save();
      res.status(201).json({ product_id: product._id, message: 'Product created successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
  },
];

const getProducts = async (req, res) => {
  const { type } = req.query;

  try {
    const query = { user_id: req.user.userId };
    if (type) query.type = parseInt(type);

    const products = await Product.find(query).populate('category_id', 'category_name').sort({ created_at: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const getTrendingProducts = async (req, res) => {
  try {
    const products = await Product.find({ user_id: req.user.userId, type: 1 })
      .populate('category_id', 'category_name')
      .sort({ created_at: -1 })
      .limit(50);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const getActivityFeed = async (req, res) => {
  try {
    const products = await Product.find({ user_id: req.user.userId, type: 2 })
      .populate('category_id', 'category_name')
      .sort({ created_at: -1 })
      .limit(50);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const updateProduct = [
  check('category_id').optional().notEmpty().withMessage('Category ID cannot be empty'),
  check('title').optional().notEmpty().withMessage('Title cannot be empty'),
  check('description').optional().notEmpty().withMessage('Description cannot be empty'),
  check('upc_id').optional().notEmpty().withMessage('UPC ID cannot be empty'),
  check('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  check('type').optional().isIn([1, 2]).withMessage('Type must be 1 (Trending) or 2 (Activity Feed)'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product_id } = req.params;
    const updates = req.body;

    try {
      const product = await Product.findOne({ _id: product_id, user_id: req.user.userId });
      if (!product) return res.status(404).json({ message: 'Product not found' });

      if (updates.category_id) {
        const category = await ProductCategory.findById(updates.category_id);
        if (!category) return res.status(404).json({ message: 'Category not found' });
      }

      Object.assign(product, updates, { updated_at: Date.now() });
      await product.save();
      res.json({ message: 'Product updated successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
  },
];

const deleteProduct = async (req, res) => {
  const { product_id } = req.params;

  try {
    const product = await Product.findOneAndDelete({ _id: product_id, user_id: req.user.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

module.exports = { createProduct, getProducts, getTrendingProducts, getActivityFeed, updateProduct, deleteProduct };