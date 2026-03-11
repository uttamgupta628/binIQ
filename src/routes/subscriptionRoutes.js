
const express = require('express');
const router  = express.Router();
const {
  getSubscriptions,
  getAllSubscriptions,
  verifyStoreOwnerSubscription,
  adminAssignSubscription
} = require('../controllers/subscriptionController');
const { authenticate } = require('../utils/auth');

router.get('/all',                  authenticate, getAllSubscriptions);
router.get('/verify/:storeOwnerId', authenticate, verifyStoreOwnerSubscription);
router.get('/',                     authenticate, getSubscriptions);
router.post('/admin-assign', authenticate, adminAssignSubscription);

module.exports = router;