const pool = require('../db');

const FREE_UPLOAD_LIMIT = 3;

const checkUploadLimit = async (req, res, next) => {
  try {
    const user = req.user;

    // Pro and Lifetime have unlimited uploads
    if (user.plan === 'pro' || user.plan === 'lifetime') {
      return next();
    }

    // Reset monthly counter if new month
    const resetDate = new Date(user.upload_reset_date);
    const now = new Date();
    const isNewMonth = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

    if (isNewMonth) {
      await pool.query(
        'UPDATE users SET uploads_used_this_month = 0, upload_reset_date = $1 WHERE id = $2',
        [now.toISOString().split('T')[0], user.id]
      );
      user.uploads_used_this_month = 0;
    }

    // Check free limit
    if (user.uploads_used_this_month >= FREE_UPLOAD_LIMIT) {
      return res.status(403).json({
        error: 'Free plan limit reached',
        message: `You have used all ${FREE_UPLOAD_LIMIT} free scans this month. Upgrade to Pro for unlimited scans.`,
        upgradeUrl: '/api/payments/plans'
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: 'Plan check failed' });
  }
};

module.exports = { checkUploadLimit };
