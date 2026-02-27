const express = require('express');
const router = express.Router();
const {createPaymentIntent, stripeWebhook} = require('../controllers/paymentController');

router.post('/webhook', express.raw({type: 'application/json'}), stripeWebhook);

router.post('/create-payment-intent', createPaymentIntent);

module.exports = router;