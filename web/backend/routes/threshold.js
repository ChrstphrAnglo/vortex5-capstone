const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
const {
  getThresholds,
  createThreshold,
  setActiveThreshold,
  deleteThreshold,
  addAdvisory,
  updateThreshold,
  updateAdvisory,
  deleteAdvisory
} = require('../controllers/thresholdController')

const router = express.Router()

router.get('/',    requireAuth, getThresholds)
router.post('/',   requireAuth, requireAdmin, createThreshold)
router.delete('/:id', requireAuth, requireAdmin, deleteThreshold)
router.put('/:id', requireAuth, requireAdmin, updateThreshold)
router.patch('/:id/active', requireAuth, requireAdmin, setActiveThreshold)

/* ADVISORY ROUTES */
router.post('/:id/advisory',             requireAuth, requireAdmin, addAdvisory)
router.put('/:id/advisory/:index',       requireAuth, requireAdmin, updateAdvisory)
router.delete('/:id/advisory/:index',    requireAuth, requireAdmin, deleteAdvisory)

module.exports = router
