const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
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
    changeMyPassword,
    deleteMyAccount,
} = require('../controllers/userController')

const router = express.Router()

// Public auth routes
router.post('/login', loginUser)
router.post('/signup/send-code', sendSignupCode)
router.post('/signup', signupUser)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

// Self-service routes (any authenticated user)
router.get('/me',            requireAuth, getMyProfile)
router.patch('/me',          requireAuth, updateMyProfile)
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
