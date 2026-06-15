/**
 * AreaLens — Scans Controller
 * Handles floor plan upload, Claude Vision AI extraction, and history
 */

const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');
const fs   = require('fs');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── AI Prompt ────────────────────────────────────────────────────────────────

const FLOOR_PLAN_PROMPT = `You are an expert architectural analyst specialising in Indian residential floor plans.

Analyse this floor plan image and return ONLY a valid JSON object. No explanation, no markdown, no text outside the JSON.

Required JSON structure:
{
  "confidence_score": <integer 0-100>,
  "property_type": "<apartment|villa|office|plot|other>",
  "total_rooms": <integer>,
  "unit_detected": "<feet|metres|unknown>",
  "wall_thickness_inches": <number, default 6 if not visible>,
  "total_dimensions": {
    "length": <number or null>,
    "width": <number or null>
  },
  "rooms": [
    {
      "name": "<room label e.g. Master Bedroom, Kitchen, Living Room>",
      "type": "<bedroom|kitchen|hall|bathroom|balcony|store|passage|terrace|utility|other>",
      "length": <number in feet>,
      "width": <number in feet>,
      "notes": "<optional observation>"
    }
  ],
  "observations": "<brief note: image quality, what was detected, any caveats>"
}

Rules:
- confidence_score = how clearly the floor plan was readable (0 if not a floor plan)
- If dimensions are not labelled, estimate based on standard Indian apartment room sizes
- Always extract every visible room including bathrooms, passages, utility areas
- Balconies and terraces are separate room entries with type "balcony" or "terrace"
- All dimensions must be in FEET regardless of what unit is shown in the plan
- If image is not a floor plan, return confidence_score 0 and empty rooms array`;

// ─── Upload & AI Scan ─────────────────────────────────────────────────────────

const uploadAndScan = async (req, res) => {
  let imagePath = null;

  try {
    const { property_name, unit = 'sqft' } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    imagePath = req.file.path;

    // Validate file exists and is readable
    if (!fs.existsSync(imagePath)) {
      return res.status(400).json({ error: 'Uploaded file not found' });
    }

    const imageBuffer  = fs.readFileSync(imagePath);
    const base64Image  = imageBuffer.toString('base64');
    const mimeType     = req.file.mimetype || 'image/jpeg';

    // Create scan record (status: processing)
    const scanResult = await pool.query(
      `INSERT INTO scans (user_id, property_name, status, unit)
       VALUES ($1, $2, 'processing', $3)
       RETURNING id`,
      [req.user.id, property_name || 'My Property', unit]
    );
    const scanId = scanResult.rows[0].id;

    // ── Call Claude Vision API ──
    let aiData;
    try {
      const response = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image }
            },
            { type: 'text', text: FLOOR_PLAN_PROMPT }
          ]
        }]
      });

      const aiText = response.content[0].text.trim();
      const clean  = aiText.replace(/```json|```/g, '').trim();
      aiData = JSON.parse(clean);
    } catch (aiErr) {
      // AI failed — save failed scan, return error with manual entry option
      await pool.query(
        `UPDATE scans SET status = 'failed', ai_confidence_score = 0 WHERE id = $1`,
        [scanId]
      );
      if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      return res.status(422).json({
        error:      'AI could not read the floor plan',
        scan_id:    scanId,
        suggestion: 'Please use manual entry to enter room dimensions directly',
        manual_entry_available: true
      });
    }

    // ── Update scan with AI results ──
    await pool.query(
      `UPDATE scans SET
         ai_confidence_score = $1,
         ai_raw_response     = $2,
         rooms               = $3,
         status              = 'completed'
       WHERE id = $4`,
      [
        aiData.confidence_score || 0,
        JSON.stringify(aiData),
        JSON.stringify(aiData.rooms || []),
        scanId
      ]
    );

    // ── Increment free user usage counter ──
    if (req.user.plan === 'free') {
      await pool.query(
        'UPDATE users SET uploads_used_this_month = uploads_used_this_month + 1 WHERE id = $1',
        [req.user.id]
      );
    }

    // ── Cleanup temp file ──
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    const confidenceScore = aiData.confidence_score || 0;

    res.json({
      success:              true,
      scan_id:              scanId,
      confidence_score:     confidenceScore,
      property_type:        aiData.property_type,
      total_rooms:          aiData.total_rooms,
      rooms:                aiData.rooms || [],
      wall_thickness_inches: aiData.wall_thickness_inches || 6,
      total_dimensions:     aiData.total_dimensions || {},
      unit_detected:        aiData.unit_detected || 'unknown',
      observations:         aiData.observations,
      low_confidence:       confidenceScore < 70,
      message: confidenceScore < 70
        ? '⚠️ Low confidence scan — please review and edit room dimensions before calculating'
        : '✅ Floor plan scanned successfully. Review rooms and calculate.'
    });

  } catch (err) {
    if (imagePath && fs.existsSync(imagePath)) {
      try { fs.unlinkSync(imagePath); } catch (_) {}
    }
    console.error('Scan error:', err);
    res.status(500).json({
      error:      'Scan failed. Please try again.',
      suggestion: 'If the problem persists, use manual room entry instead.'
    });
  }
};

// ─── Get All Scans (History) ──────────────────────────────────────────────────

const getScans = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
         s.id, s.property_name, s.ai_confidence_score, s.status, s.unit, s.created_at,
         c.carpet_area, c.buildup_area, c.super_buildup_area, c.efficiency_ratio
       FROM scans s
       LEFT JOIN calculations c ON c.scan_id = s.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM scans WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      scans: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (err) {
    console.error('Get scans error:', err);
    res.status(500).json({ error: 'Failed to retrieve scans' });
  }
};

// ─── Get Single Scan ──────────────────────────────────────────────────────────

const getScan = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.property_name, s.ai_confidence_score, s.rooms,
              s.ai_raw_response, s.unit, s.status, s.created_at,
              c.id AS calculation_id, c.carpet_area, c.buildup_area,
              c.super_buildup_area, c.efficiency_ratio, c.loading_factor,
              c.balcony_area, c.common_area, c.formula_breakdown
       FROM scans s
       LEFT JOIN calculations c ON c.scan_id = s.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ scan: result.rows[0] });
  } catch (err) {
    console.error('Get scan error:', err);
    res.status(500).json({ error: 'Failed to retrieve scan' });
  }
};

// ─── Delete Scan ──────────────────────────────────────────────────────────────

const deleteScan = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM scans WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ message: 'Scan deleted successfully' });
  } catch (err) {
    console.error('Delete scan error:', err);
    res.status(500).json({ error: 'Failed to delete scan' });
  }
};

module.exports = { uploadAndScan, getScans, getScan, deleteScan };
