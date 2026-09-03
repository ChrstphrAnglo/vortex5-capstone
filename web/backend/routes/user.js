const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
const { emailCodeLimiter } = require('../middleware/rateLimit')
const uploadImage = require('../middleware/uploadImage')
const cloudinary = require('../utils/cloudinary')
const {
    signupUser,
    sendSignupCode,
    forgotPassword,
    resetPassword,
    loginUser,
    getUsers,
    createUserByAdmin,
    deactivateUser,
    reactivateUser,
    deleteUser,
    approveUser,
    updateUserRole,
    getMyProfile,
    updateMyProfile,
    updateMyPicture,
    changeMyPassword,
    deleteMyAccount,
} = require('../controllers/userController')

const router = express.Router()

// Wrap multer to convert its errors (e.g. non-image file, over the size
// limit) into clean JSON responses instead of an unhandled HTML error page —
// same convention as the media/video upload route in routes/media.js.
const uploadPicture = (req, res, next) => {
    if (!cloudinary.isConfigured) {
        console.error('[upload] Cloudinary not configured — rejecting picture upload')
        return res.status(503).json({
            error: 'Image uploads are not configured on the server. Please contact an administrator.'
        })
    }
    uploadImage.single('picture')(req, res, (err) => {
        if (err) {
            console.error('[upload] multer error:', err.message)
            return res.status(400).json({ error: err.message })
        }
        next()
    })
}

// Public auth routes
router.post('/login', loginUser)
router.post('/signup/send-code', emailCodeLimiter, sendSignupCode)
router.post('/signup', signupUser)
router.post('/forgot-password', emailCodeLimiter, forgotPassword)
router.post('/reset-password', resetPassword)

// Self-service routes (any authenticated user)
router.get('/me',            requireAuth, getMyProfile)
router.patch('/me',          requireAuth, updateMyProfile)
router.patch('/me/picture',  requireAuth, uploadPicture, updateMyPicture)
router.post('/me/password',  requireAuth, changeMyPassword)
router.delete('/me',         requireAuth, deleteMyAccount)

// Admin-only user management
router.get('/',                    requireAuth, requireAdmin, getUsers)
router.post('/',                   requireAuth, requireAdmin, createUserByAdmin)
router.patch('/:id/deactivate',    requireAuth, requireAdmin, deactivateUser)
router.patch('/:id/reactivate',    requireAuth, requireAdmin, reactivateUser)
router.patch('/:id/approve',       requireAuth, requireAdmin, approveUser)
router.patch('/:id',               requireAuth, requireAdmin, updateUserRole)
router.delete('/:id',              requireAuth, requireAdmin, deleteUser)

module.exports = router
