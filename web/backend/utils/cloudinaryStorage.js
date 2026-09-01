const cloudinary = require('./cloudinary')

// A minimal multer storage engine that streams uploads directly to
// Cloudinary instead of writing to the server's own local disk. Local disk
// on Render is ephemeral — it gets wiped on every redeploy and whenever the
// free-tier service spins back up after being idle, which is why uploaded
// profile pictures and bulletin board videos used to silently disappear.
//
// Written by hand instead of using the multer-storage-cloudinary package:
// that package only declares support for cloudinary v1.x, but v2.x is
// needed here for a patched high-severity CVE (arbitrary argument
// injection, GHSA-g4mf-96x5-5m2c) — the version mismatch was too risky to
// trust blindly for something this small and well-documented to write
// directly against the official SDK.
class CloudinaryStorage {
  constructor({ folder, resourceType = 'image', transformation } = {}) {
    this.folder = folder
    this.resourceType = resourceType
    this.transformation = transformation
  }

  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: this.folder,
        resource_type: this.resourceType,
        transformation: this.transformation,
      },
      (err, result) => {
        if (err) return cb(err)
        // Mirrors the shape multer's own diskStorage produces (path,
        // filename), so existing code reading req.file.path/.filename
        // doesn't need to change — path is now a full Cloudinary URL
        // instead of a local file path, and filename is the public_id
        // (needed later to delete the asset from Cloudinary).
        cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
        })
      }
    )
    file.stream.pipe(uploadStream)
  }

  _removeFile(req, file, cb) {
    // Best-effort cleanup if a later middleware/handler fails after the
    // upload already succeeded.
    cloudinary.uploader
      .destroy(file.filename, { resource_type: this.resourceType })
      .then(() => cb(null))
      .catch(cb)
  }
}

module.exports = CloudinaryStorage
