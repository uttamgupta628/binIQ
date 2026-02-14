const express = require('express');
const { createProduct, getProducts, getTrendingProducts, getActivityFeed, updateProduct, deleteProduct } = require('../controllers/productController');
const { authenticate } = require('../utils/auth');

const router = express.Router();

router.post('/', authenticate, createProduct);
router.get('/', authenticate, getProducts);
router.get('/trending', authenticate, getTrendingProducts);
router.get('/activity', authenticate, getActivityFeed);
router.put('/:product_id', authenticate, updateProduct);
router.delete('/:product_id', authenticate, deleteProduct);

module.exports = router;