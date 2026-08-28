const express = require('express')
const {
  inputAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
  updateAnnouncement
} = require('../controllers/announcementController')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')

const router = express.Router()

// Get all announcements — stays public: the kiosk bulletin display
// (web/frontend BulletinBoard.jsx) is unauthenticated by design and reads
// this without a token, same as the mobile app's own bulletin feed.
router.get('/', getAnnouncements)

// Creating, editing, and deleting announcements is admin-only
router.post('/', requireAuth, requireAdmin, inputAnnouncement)
router.delete('/:id', requireAuth, requireAdmin, deleteAnnouncement)
router.put('/:id', requireAuth, requireAdmin, updateAnnouncement)

module.exports = router