const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { verifyToken } = require('../middleware/verifyToken');

router.post('/:id', verifyToken, async (req, res) => {
  try {
    const narrativeId = Number(req.params.id);
    const { reason } = req.body;
    const userId = req.user.uid;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required to submit a report.' });
    }

    await db.createReport({
      narrativeId,
      reportedBy: userId,
      reason: reason.trim()
    });

    res.json({ success: true, message: 'Report submitted successfully. Administrators will review it.' });
  } catch (err) {
    console.error('[reports] POST /:id error:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

module.exports = router;
