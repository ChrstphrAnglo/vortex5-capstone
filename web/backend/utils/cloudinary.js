const cloudinary = require('cloudinary').v2

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env

// Loud warning at startup rather than a confusing per-request "Must supply
// api_key" later: without these, every profile-picture / bulletin-video
// upload fails, and the stored pictureUrl keeps pointing at a wiped
// /uploads/ path.
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.warn(
    '[cloudinary] CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET ' +
    'not all set — image and video uploads will fail. See web/backend/.env.example.'
  )
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
})

// True only when every credential is present. Upload routes can use this to
// return a clear 503 instead of a cryptic Cloudinary SDK error.
cloudinary.isConfigured = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
)

module.exports = cloudinary
