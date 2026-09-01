const mongoose = require('mongoose')

const mediaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  // Cloudinary's public_id for videoUrl — needed to delete the video from
  // Cloudinary when this record is deleted.
  publicId: {
    type: String,
    default: ''
  }
}, { timestamps: true })

module.exports = mongoose.model('Media', mediaSchema)