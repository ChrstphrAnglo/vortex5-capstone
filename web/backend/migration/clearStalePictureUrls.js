// One-off: clear profile pictureUrls that still point at the old local
// /uploads/ folder. Those files lived on the backend's own disk, which Render
// wipes on every redeploy/cold start, so the URLs 404 forever. Nulling them
// makes the UI fall back to initials instead of a broken image; affected
// users can simply re-upload (now Cloudinary-backed).
//
// Run once:  node migration/clearStalePictureUrls.js
const mongoose = require('mongoose')
require('dotenv').config()

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => { console.error('Connection error:', err); process.exit(1) })

const userSchema = new mongoose.Schema({}, { strict: false })
const User = mongoose.model('User', userSchema, 'users')

const migrate = async () => {
    try {
        const result = await User.updateMany(
            { pictureUrl: { $regex: '^/uploads/' } },
            { $set: { pictureUrl: '', picturePublicId: '' } }
        )
        console.log(`Cleared stale pictureUrl on ${result.modifiedCount} user(s)`)
        process.exit(0)
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }
}

migrate()
