const express = require('express');
const { createCategory, getCategories } = require('../controllers/categoryController');
const { authenticate } = require('../utils/auth');

const router = express.Router();

router.post('/', authenticate, createCategory);
router.get('/', getCategories);

module.exports = router;