const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLogModel');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

// GET all audit logs
router.get('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ date: -1 }); // latest first
        res.status(200).json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
