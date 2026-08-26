const mongoose = require('mongoose')

const Schema = mongoose.Schema

const passwordResetSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    code: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 0
    },
    attempts: {
        type: Number,
        default: 0
    }
})

module.exports = mongoose.model('PasswordReset', passwordResetSchema)
