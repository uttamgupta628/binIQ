
const express = require('express');
const router  = express.Router();
const {
  getSubscriptions,
  getAllSubscriptions,
  verifyStoreOwnerSubscription,
} = require('../controllers/subscriptionController');
const { authenticate } = require('../utils/auth');

router.get('/all',                  authenticate, getAllSubscriptions);
router.get('/verify/:storeOwnerId', authenticate, verifyStoreOwnerSubscription);
router.get('/',                     authenticate, getSubscriptions);

module.exports = router;