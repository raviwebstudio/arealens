const express = require('express');
const router = express.Router();
const { calculate, quickCalculate, getHistory, getCalculation } = require('../controllers/calculationsController');
const { authenticate } = require('../middleware/auth');

// POST /api/calculations/quick  — public, no auth, no DB save (demo use)
router.post('/quick', quickCalculate);

// GET  /api/calculations/history — authenticated, paginated history
router.get('/history', authenticate, getHistory);

// GET  /api/calculations/:id     — authenticated, single calculation detail
router.get('/:id', authenticate, getCalculation);

// POST /api/calculations          — authenticated, saves to DB
router.post('/', authenticate, calculate);

module.exports = router;
