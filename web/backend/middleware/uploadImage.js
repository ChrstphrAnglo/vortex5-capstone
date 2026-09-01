const multer = require('multer')
const CloudinaryStorage = require('../utils/cloudinaryStorage')

// Separate multer instance for images (profile pictures) — upload.js stays
// video-only since it's shared with the existing Bulletin Board media route.
// Uploads go straight to Cloudinary (see utils/cloudinaryStorage.js) instead
// of local disk, since Render's disk is ephemeral.
const storage = new CloudinaryStorage({
  folder: 'bewair/profile-pictures',
  resourceType: 'image',
  // Cap the stored size — no reason to keep a full-resolution upload for a
  // small circular avatar, and it keeps free-tier storage from filling up.
  transformation: [{ width: 800, height: 800, crop: 'limit' }],
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
