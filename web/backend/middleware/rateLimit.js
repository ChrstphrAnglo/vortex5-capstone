const rateLimit = require('express-rate-limit')

// Guards the endpoints that trigger an outbound email (signup verification
// code, password reset code). Without this, nothing stops a script from
// repeatedly hitting these routes to spam a real person's inbox with codes
// or burn through the app's Brevo sending quota. Limited per IP — this app
// runs as a single Render instance, so an in-memory store is sufficient.
const emailCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
})

module.exports = { emailCodeLimiter }
