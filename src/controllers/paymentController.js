const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const {sendMail} = require('../utils/mailer');

// POST /api/payments/create-payment-intent
const createPaymentIntent = async (req, res) => {
  try {
    const {amount = 9999, currency = 'usd', email, name} = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,      
      currency,
      receipt_email: email || undefined,
      metadata: {
        plan: 'premium',
        name: name || '',
        email: email || '',
      },
    });

    return res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment setup failed',
      error: error.message,
    });
  }
};

// POST /api/payments/webhook
const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    console.log(`✅ Payment succeeded: ${pi.id} for ${pi.metadata?.email}`);
  }

  if (event.type === 'payment_intent.payment_failed') {
    console.log(`❌ Payment failed: ${event.data.object.id}`);
  }

  res.json({received: true});
};

module.exports = {createPaymentIntent, stripeWebhook};