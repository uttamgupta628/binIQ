const express = require('express');
const router = express.Router();
const { createPaymentIntent, confirmVerification, stripeWebhook } = require('../controllers/paymentController');
const { authenticate } = require('../utils/auth');

// Webhook - raw body already applied in server.js
router.post('/webhook', stripeWebhook);

// Protected routes
router.post('/create-payment-intent', authenticate, createPaymentIntent);
router.post('/confirm-verification', authenticate, confirmVerification);

module.exports = router;