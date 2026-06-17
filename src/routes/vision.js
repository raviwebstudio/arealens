const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const { authenticate } = require("../middleware/auth");
const { checkUploadLimit } = require("../middleware/planCheck");
const { uploadAndScan } = require("../controllers/scansController");

// Multer config (same limits as scans)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only JPG, PNG, WEBP, HEIC images are allowed"), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// POST /api/scan-floorplan
router.post(
  "/",
  authenticate,
  checkUploadLimit,
  upload.single("floor_plan"),
  uploadAndScan,
);

module.exports = router;
