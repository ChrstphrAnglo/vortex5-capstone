const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
const {
  getMyDevices,
  registerDevice,
  editDevice,
  shareDevice,
  unshareDevice,
  getDeviceUsers,
  deleteDevice,
  resetDevice,
  setDevicePower
} = require('../controllers/deviceController')

const router = express.Router()

router.use(requireAuth)

router.get('/',                        getMyDevices)
router.post('/',           requireAdmin, registerDevice)
router.patch('/:deviceId',        requireAdmin, editDevice)
router.post('/:deviceId/share',   requireAdmin, shareDevice)
router.post('/:deviceId/unshare', requireAdmin, unshareDevice)
router.get('/:deviceId/users',    requireAdmin, getDeviceUsers)
router.post('/:deviceId/reset',   requireAdmin, resetDevice)
router.post('/:deviceId/power',   requireAdmin, setDevicePower)
router.delete('/:deviceId',       requireAdmin, deleteDevice)

module.exports = router
