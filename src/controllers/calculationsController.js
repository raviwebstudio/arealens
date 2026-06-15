/**
 * AreaLens Calculations Engine v1.0
 * All Indian real estate area formulas per RERA standards
 */

const pool = require('../db');

// ─── Unit Conversion Helpers ─────────────────────────────────────────────────

const toSqMetres = (length, width, inputUnit) => {
  const l = parseFloat(length);
  const w = parseFloat(width);
  if (inputUnit === 'sqft' || inputUnit === 'ft' || inputUnit === 'feet') return l * w * 0.092903;
  if (inputUnit === 'sqyd' || inputUnit === 'yd') return l * w * 0.836127;
  if (inputUnit === 'mm') return (l / 1000) * (w / 1000);
  return l * w; // already metres
};

const fromSqMetres = (sqm, targetUnit) => {
  if (targetUnit === 'sqft') return sqm * 10.7639;
  if (targetUnit === 'sqm')  return sqm;
  if (targetUnit === 'sqyd') return sqm * 1.19599;
  return sqm * 10.7639; // default sqft
};

const round2 = (n) => parseFloat(n.toFixed(2));

// ─── Core Calculation Engine ─────────────────────────────────────────────────

const runCalculations = (rooms, options = {}) => {
  const {
    wall_thickness = 0.15,
    loading_factor_percent = 30,
    plot_area = null,
    unit = 'sqft'
  } = options;

  let carpetSqM   = 0;
  let balconySqM  = 0;
  const roomBreakdown = [];

  for (const room of rooms) {
    const { name, length, width, type = 'room', inputUnit = unit } = room;
    if (!length || !width) continue;

    const areaSqM = toSqMetres(length, width, inputUnit);
    const areaOut  = fromSqMetres(areaSqM, unit);

    roomBreakdown.push({
      name:   name || 'Room',
      type,
      length: parseFloat(length),
      width:  parseFloat(width),
      area:   round2(areaOut),
      unit
    });

    if (type === 'balcony' || type === 'terrace') {
      balconySqM += areaSqM;
    } else {
      carpetSqM += areaSqM;
    }
  }

  // RERA: 50% of balcony area is added to carpet area
  const reraBalconyAdditionSqM = balconySqM * 0.5;
  const effectiveCarpetSqM     = carpetSqM + reraBalconyAdditionSqM;

  // Wall area ≈ 12% of carpet (industry standard when plan doesn't show wall thickness)
  const wallAreaSqM    = effectiveCarpetSqM * 0.12;

  // Built-up area
  const builtupSqM     = effectiveCarpetSqM + wallAreaSqM;

  // Super built-up area
  const lf             = parseFloat(loading_factor_percent) / 100;
  const superBuiltupSqM = builtupSqM * (1 + lf);

  // Derived values
  const commonAreaSqM  = superBuiltupSqM - builtupSqM;
  const efficiencyRatio = (effectiveCarpetSqM / superBuiltupSqM) * 100;

  // Floor Area Ratio (optional — needs plot_area)
  let far = null;
  if (plot_area) {
    const plotSqM = toSqMetres(Math.sqrt(parseFloat(plot_area)), Math.sqrt(parseFloat(plot_area)), unit);
    far = round2(builtupSqM / plotSqM);
  }

  // Convert everything to requested output unit
  const ca  = round2(fromSqMetres(effectiveCarpetSqM, unit));
  const caEx = round2(fromSqMetres(carpetSqM, unit));
  const ba  = round2(fromSqMetres(balconySqM, unit));
  const wa  = round2(fromSqMetres(wallAreaSqM, unit));
  const bua = round2(fromSqMetres(builtupSqM, unit));
  const sba = round2(fromSqMetres(superBuiltupSqM, unit));
  const com = round2(fromSqMetres(commonAreaSqM, unit));
  const rer = round2(fromSqMetres(reraBalconyAdditionSqM, unit));

  return {
    unit,
    carpet_area:                    ca,
    carpet_area_excluding_balcony:  caEx,
    balcony_area:                   ba,
    wall_area:                      wa,
    buildup_area:                   bua,
    super_buildup_area:             sba,
    common_area:                    com,
    loading_factor_percent:         parseFloat(loading_factor_percent),
    efficiency_ratio:               round2(efficiencyRatio),
    floor_area_ratio:               far,
    wall_thickness_m:               parseFloat(wall_thickness),
    rooms:                          roomBreakdown,
    formula_breakdown: {
      carpet_area:        `Sum of all internal room areas + 50% balcony (RERA). Rooms: ${caEx} + Balcony 50%: ${rer} = ${ca} ${unit}`,
      wall_area:          `Carpet Area × 12% (industry standard) = ${ca} × 0.12 = ${wa} ${unit}`,
      buildup_area:       `Carpet Area + Wall Area = ${ca} + ${wa} = ${bua} ${unit}`,
      super_buildup_area: `Built-up × (1 + ${loading_factor_percent}% loading) = ${bua} × ${(1 + lf).toFixed(2)} = ${sba} ${unit}`,
      loading_factor:     `((Super BUA − BUA) / BUA) × 100 = ((${sba} − ${bua}) / ${bua}) × 100 = ${loading_factor_percent}%`,
      common_area:        `Super BUA − Built-up = ${sba} − ${bua} = ${com} ${unit}`,
      efficiency_ratio:   `(Carpet / Super BUA) × 100 = (${ca} / ${sba}) × 100 = ${round2(efficiencyRatio)}%`,
      balcony_note:       `Full balcony: ${ba} ${unit}. Added 50% (${rer} ${unit}) to carpet per RERA.`,
      rera_note:          'Carpet area computed as per RERA 2016 definition.'
    }
  };
};

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/calculations
 * Authenticated: runs calculation and saves to DB
 */
const calculate = async (req, res) => {
  try {
    const { rooms = [], wall_thickness, loading_factor_percent, plot_area, unit, scan_id } = req.body;

    if (!rooms || rooms.length === 0) {
      return res.status(400).json({ error: 'At least one room with dimensions is required' });
    }

    const result = runCalculations(rooms, { wall_thickness, loading_factor_percent, plot_area, unit });

    // Save to DB
    try {
      const lf = parseFloat(loading_factor_percent || 30) / 100;
      const saved = await pool.query(
        `INSERT INTO calculations
          (scan_id, user_id, carpet_area, wall_area, buildup_area, super_buildup_area,
           loading_factor, balcony_area, common_area, efficiency_ratio, floor_area_ratio,
           plot_area, wall_thickness, unit, formula_breakdown)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          scan_id || null,
          req.user.id,
          result.carpet_area,
          result.wall_area,
          result.buildup_area,
          result.super_buildup_area,
          lf,
          result.balcony_area,
          result.common_area,
          result.efficiency_ratio,
          result.floor_area_ratio,
          plot_area ? parseFloat(plot_area) : null,
          parseFloat(wall_thickness || 0.15),
          result.unit,
          JSON.stringify(result.formula_breakdown)
        ]
      );
      result.calculation_id = saved.rows[0].id;
    } catch (dbErr) {
      // Don't fail the request if DB save fails — still return calculation
      console.error('DB save warning:', dbErr.message);
    }

    res.json({ success: true, calculations: result });
  } catch (err) {
    console.error('Calculate error:', err);
    res.status(500).json({ error: 'Calculation failed' });
  }
};

/**
 * POST /api/calculations/quick
 * Public: no auth, no save — for demo / landing page use
 */
const quickCalculate = (req, res) => {
  try {
    const { rooms = [], wall_thickness, loading_factor_percent, plot_area, unit } = req.body;

    if (!rooms || rooms.length === 0) {
      return res.status(400).json({ error: 'At least one room is required' });
    }

    const result = runCalculations(rooms, { wall_thickness, loading_factor_percent, plot_area, unit });
    res.json({ success: true, calculations: result });
  } catch (err) {
    console.error('Quick calculate error:', err);
    res.status(500).json({ error: 'Calculation failed' });
  }
};

/**
 * GET /api/calculations/history
 * Authenticated: returns user's saved calculations
 */
const getHistory = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
         c.id, c.carpet_area, c.buildup_area, c.super_buildup_area,
         c.efficiency_ratio, c.loading_factor, c.unit, c.created_at,
         s.property_name, s.ai_confidence_score
       FROM calculations c
       LEFT JOIN scans s ON s.id = c.scan_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM calculations WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      calculations: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to get calculation history' });
  }
};

/**
 * GET /api/calculations/:id
 * Authenticated: get single calculation with full formula breakdown
 */
const getCalculation = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, s.property_name, s.rooms AS scan_rooms, s.ai_confidence_score
       FROM calculations c
       LEFT JOIN scans s ON s.id = c.scan_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calculation not found' });
    }

    res.json({ calculation: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get calculation' });
  }
};

module.exports = { calculate, quickCalculate, getHistory, getCalculation, runCalculations };
