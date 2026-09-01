const multer = require('multer')
const CloudinaryStorage = require('../utils/cloudinaryStorage')

// Uploads go straight to Cloudinary (see utils/cloudinaryStorage.js) instead
// of local disk — Render's disk is ephemeral, wiped on every redeploy and
// whenever the free-tier service spins back up after being idle, which is
// why uploaded videos used to silently disappear.
const storage = new CloudinaryStorage({
  folder: 'bewair/bulletin-videos',
  resourceType: 'video',
})

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,   // 100 MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Only video files are allowed'), false)
    }
  }
})

module.exports = upload
