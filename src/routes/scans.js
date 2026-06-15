const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { uploadAndScan, getScans, getScan, deleteScan } = require('../controllers/scansController');
const { authenticate } = require('../middleware/auth');
const { checkUploadLimit } = require('../middleware/planCheck');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WEBP, HEIC images are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
});

// Create uploads directory if not exists
const fs = require('fs');
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

router.get('/', authenticate, getScans);
router.get('/:id', authenticate, getScan);
router.post('/upload', authenticate, checkUploadLimit, upload.single('floor_plan'), uploadAndScan);
router.delete('/:id', authenticate, deleteScan);

module.exports = router;
