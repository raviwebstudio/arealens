const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Webhook must receive raw body BEFORE express.json() ───────────────────
// Razorpay webhook route gets raw buffer for signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ─── Global Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
try {
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 60 * 1000,      // 1 minute
    max: 10,                   // 10 requests per minute per IP (PRD security req)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' }
  });
  // Apply to all API routes
  app.use('/api/', limiter);

  // Stricter limit for scan uploads (AI calls are expensive)
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many scan uploads. Please wait a minute.' }
  });
  app.use('/api/scans/upload', uploadLimiter);
} catch (e) {
  console.warn('⚠️  express-rate-limit not installed. Run: npm install express-rate-limit');
}

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/scans', require('./src/routes/scans'));
app.use('/api/calculations', require('./src/routes/calculations'));
app.use('/api/payments', require('./src/routes/payments'));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'AreaLens API v1 running ✅',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (req, res) => {
  try {
    const pool = require('./src/db');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n🏠 AreaLens API v1.0`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
