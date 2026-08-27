const multer = require('multer')
const fs = require('fs')
const path = require('path')

// Separate multer instance for images (profile pictures) — upload.js stays
// video-only since it's shared with the existing Bulletin Board media route.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR)
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, Date.now() + '-' + safe)
  }
})

const uploadImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5 MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

module.exports = uploadImage
