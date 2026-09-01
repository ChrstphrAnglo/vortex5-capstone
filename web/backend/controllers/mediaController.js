const Media = require('../models/MediaModel')
const cloudinary = require('../utils/cloudinary')
const logAudit = require('../utils/logAudit')

/* GET ALL MEDIA */
const getMedia = async (req, res) => {
  const media = await Media.find().sort({ createdAt: -1 })
  res.status(200).json(media)
}

/* CREATE MEDIA */
const createMedia = async (req, res) => {
  try {
    console.log('FILE:', req.file)
    console.log('BODY:', req.body)

    const { title } = req.body
    const actor = req.user?.email || 'Unknown'

    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    // req.file.path is the Cloudinary secure URL, req.file.filename is its
    // public_id (see utils/cloudinaryStorage.js).
    const media = await Media.create({
      title,
      videoUrl: req.file.path,
      publicId: req.file.filename,
    })

    // Add audit log for upload
    await logAudit({
      module: 'Bulletin Board',
      action: `Video "${title || 'Untitled'}" was uploaded`,
      user: actor
    })

    res.status(200).json(media)
  } catch (error) {
    console.log('UPLOAD ERROR:', error)
    res.status(500).json({ error: error.message })
  }
}

/* DELETE MEDIA */
const deleteMedia = async (req, res) => {
  const { id } = req.params
  const actor = req.user?.email || 'Unknown'

  try {
    // Get the media before deleting to know the filename
    const media = await Media.findById(id)

    if (!media) {
      return res.status(404).json({ error: 'Media not found' })
    }

    // Delete the actual video from Cloudinary. invalidate: true also clears
    // the CDN cache — without it, the deleted video's URL can keep
    // resolving for a while even though it's gone from Cloudinary's storage.
    if (media.publicId) {
      try {
        await cloudinary.uploader.destroy(media.publicId, { resource_type: 'video', invalidate: true })
      } catch (err) {
        console.error('[media] failed to delete Cloudinary video:', err.message)
      }
    }

    await Media.findByIdAndDelete(id)

    // Add audit log for delete
    await logAudit({
      module: 'Bulletin Board',
      action: `Video "${media.title || 'Untitled'}" was deleted`,
      user: actor
    })

    res.status(200).json(media)
  } catch (error) {
    console.log('DELETE ERROR:', error)
    res.status(500).json({ error: error.message })
  }
}

module.exports = {
  getMedia,
  createMedia,
  deleteMedia
}