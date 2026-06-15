const express = require('express');
const router = express.Router();
const { getPlans, createOrder, createSubscription, verifyPayment, webhook } = require('../controllers/paymentsController');
const { authenticate } = require('../middleware/auth');

router.get('/plans', getPlans);
router.post('/order', authenticate, createOrder);
router.post('/subscription', authenticate, createSubscription);
router.post('/verify', authenticate, verifyPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), webhook);

module.exports = router;
