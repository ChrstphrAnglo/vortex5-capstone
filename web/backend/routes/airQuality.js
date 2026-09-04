const express = require('express')
const { getBands } = require('../controllers/airQualityController')

const router = express.Router()

// No requireAuth. The band table is published-standard reference data, and the
// logged-out landing page plus the mobile app's pre-login screens need it.
router.get('/bands', getBands)

module.exports = router
