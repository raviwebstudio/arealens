/**
 * AreaLens — Payments Controller
 * Razorpay: subscriptions (Pro monthly/annual) + one-time (Lifetime)
 */

const Razorpay = require('razorpay');
const crypto   = require('crypto');
const pool     = require('../db');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ─── Get Plans ────────────────────────────────────────────────────────────────

const getPlans = (req, res) => {
  res.json({
    plans: [
      {
        id:                'free',
        name:              'Free',
        price:             0,
        currency:          'INR',
        display_price:     '₹0',
        interval:          null,
        uploads_per_month: 3,
        features: [
          '3 floor plan scans / month',
          'Basic area calculations',
          'Manual dimension entry',
          'RERA formula breakdown'
        ]
      },
      {
        id:                'pro_monthly',
        name:              'Pro',
        price:             24900,       // paise = ₹249
        currency:          'INR',
        display_price:     '₹249/month',
        interval:          'monthly',
        uploads_per_month: -1,          // unlimited
        features: [
          'Unlimited AI floor plan scans',
          'All area calculations',
          'PDF export (branded)',
          'Scan history',
          'Priority support'
        ]
      },
      {
        id:                'pro_annual',
        name:              'Pro Annual',
        price:             199900,      // paise = ₹1,999
        currency:          'INR',
        display_price:     '₹1,999/year',
        interval:          'annual',
        uploads_per_month: -1,
        savings:           '₹989/year vs monthly',
        features: [
          'Unlimited AI floor plan scans',
          'All area calculations',
          'PDF export (branded)',
          'Scan history',
          'Priority support',
          'Save ₹989 vs monthly plan'
        ]
      },
      {
        id:                'lifetime',
        name:              'Lifetime',
        price:             499900,      // paise = ₹4,999
        currency:          'INR',
        display_price:     '₹4,999 one-time',
        interval:          'one_time',
        uploads_per_month: -1,
        features: [
          'Unlimited scans forever',
          'All Pro features forever',
          'No recurring charges',
          'All future v1 updates included',
          'Best for builder firms'
        ]
      }
    ]
  });
};

// ─── Create Order (Lifetime one-time payment) ─────────────────────────────────

const createOrder = async (req, res) => {
  try {
    const { plan_id } = req.body;

    const PRICES = { lifetime: 499900 };

    if (!PRICES[plan_id]) {
      return res.status(400).json({ error: 'Invalid plan. Use "lifetime" for one-time payment.' });
    }

    const order = await razorpay.orders.create({
      amount:   PRICES[plan_id],
      currency: 'INR',
      receipt:  `arealens_${req.user.id.slice(0, 8)}_${Date.now()}`,
      notes:    { user_id: req.user.id, plan: plan_id }
    });

    res.json({
      order_id:   order.id,
      amount:     order.amount,
      currency:   order.currency,
      key_id:     process.env.RAZORPAY_KEY_ID,
      user_name:  req.user.full_name,
      user_email: req.user.email
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
};

// ─── Create Subscription (Pro monthly / annual) ───────────────────────────────

const createSubscription = async (req, res) => {
  try {
    const { plan_id } = req.body;

    const RAZORPAY_PLAN_IDS = {
      pro_monthly: process.env.RAZORPAY_PLAN_ID_MONTHLY,
      pro_annual:  process.env.RAZORPAY_PLAN_ID_ANNUAL
    };

    if (!RAZORPAY_PLAN_IDS[plan_id]) {
      return res.status(400).json({
        error:   'Invalid subscription plan',
        message: 'Use "pro_monthly" or "pro_annual"'
      });
    }

    if (!RAZORPAY_PLAN_IDS[plan_id]) {
      return res.status(500).json({
        error:   'Razorpay plan ID not configured',
        message: 'Please set RAZORPAY_PLAN_ID_MONTHLY / RAZORPAY_PLAN_ID_ANNUAL in your .env file'
      });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id:         RAZORPAY_PLAN_IDS[plan_id],
      customer_notify: 1,
      total_count:     plan_id === 'pro_annual' ? 1 : 120, // annual = 1 year, monthly = 10 years max
      notes:           { user_id: req.user.id, plan: plan_id }
    });

    res.json({
      subscription_id: subscription.id,
      key_id:          process.env.RAZORPAY_KEY_ID,
      plan_id,
      user_name:       req.user.full_name,
      user_email:      req.user.email
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
};

// ─── Verify Payment (client-side callback) ────────────────────────────────────

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_subscription_id,
      razorpay_signature,
      plan
    } = req.body;

    if (!razorpay_payment_id || !razorpay_signature || !plan) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    // Build signature string (order payment vs subscription payment)
    let signatureBody;
    if (razorpay_order_id) {
      signatureBody = `${razorpay_order_id}|${razorpay_payment_id}`;
    } else if (razorpay_subscription_id) {
      signatureBody = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    } else {
      return res.status(400).json({ error: 'Missing order_id or subscription_id' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(signatureBody)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // Update user plan
    const newPlan = plan === 'lifetime' ? 'lifetime' : 'pro';
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [newPlan, req.user.id]);

    // Record payment
    await pool.query(
      `INSERT INTO payments
         (user_id, razorpay_payment_id, razorpay_order_id, razorpay_subscription_id,
          plan, amount, status, payment_type)
       VALUES ($1,$2,$3,$4,$5,$6,'success',$7)`,
      [
        req.user.id,
        razorpay_payment_id,
        razorpay_order_id   || null,
        razorpay_subscription_id || null,
        plan,
        plan === 'lifetime' ? 499900 : (plan === 'pro_annual' ? 199900 : 24900),
        plan === 'lifetime' ? 'lifetime' : 'subscription'
      ]
    );

    res.json({
      success: true,
      message: `🎉 Payment verified. ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} plan activated!`,
      plan:    newPlan
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
};

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
// NOTE: This route receives raw body — set up in index.js BEFORE express.json()

const webhook = async (req, res) => {
  try {
    const signature        = req.headers['x-razorpay-signature'];
    const rawBody          = req.body; // Buffer (raw body via express.raw)
    const webhookSecret    = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody.toString());
    const { event } = payload;

    console.log(`📣 Razorpay webhook: ${event}`);

    if (event === 'subscription.activated' || event === 'subscription.charged') {
      const userId = payload.payload.subscription.entity.notes?.user_id;
      if (userId) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['pro', userId]);
        console.log(`✅ User ${userId} upgraded to Pro via webhook`);
      }
    }

    if (event === 'subscription.cancelled' || event === 'subscription.expired') {
      const userId = payload.payload.subscription.entity.notes?.user_id;
      if (userId) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
        console.log(`⬇️  User ${userId} downgraded to Free via webhook`);
      }
    }

    if (event === 'payment.captured') {
      // Handle lifetime one-time payment if not yet caught by verify endpoint
      const notes = payload.payload.payment?.entity?.notes;
      if (notes?.plan === 'lifetime' && notes?.user_id) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['lifetime', notes.user_id]);
        console.log(`⭐ User ${notes.user_id} granted Lifetime via webhook`);
      }
    }

    res.json({ received: true, event });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// ─── Get Payment History ──────────────────────────────────────────────────────

const getPaymentHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, plan, amount, currency, status, payment_type, created_at
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ payments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve payment history' });
  }
};

module.exports = { getPlans, createOrder, createSubscription, verifyPayment, webhook, getPaymentHistory };
