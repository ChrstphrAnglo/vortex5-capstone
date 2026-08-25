const jwt = require('jsonwebtoken')
const User = require('../models/userModel')

const requireAuth = async (req, res, next) => {
  const { authorization } = req.headers
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' })
  }

  const token = authorization.split(' ')[1]
  try {
    const { _id } = jwt.verify(token, process.env.SECRET)
    const user = await User.findById(_id).select('-password')
    if (!user) return res.status(401).json({ error: 'User not found' })
    if (user.status === 'deactivated') return res.status(403).json({ error: 'Account deactivated' })
    if (user.status === 'pending') return res.status(403).json({ error: 'Account pending admin approval' })
    req.user = user
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { requireAuth, requireAdmin }
