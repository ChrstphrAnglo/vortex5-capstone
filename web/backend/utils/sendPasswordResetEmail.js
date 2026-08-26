// Uses Brevo's HTTPS transactional email API (not SMTP) — Render's free tier
// blocks outbound SMTP ports, so this goes over normal HTTPS instead.
async function sendPasswordResetEmail(toEmail, code) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
            sender: { email: process.env.EMAIL_FROM, name: 'BewAir' },
            to: [{ email: toEmail }],
            subject: 'Your BewAir password reset code',
            htmlContent: `<p>Your BewAir password reset code is:</p><h2>${code}</h2><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`
        })
    })

    if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Brevo send failed (${res.status}): ${errBody}`)
    }
}

module.exports = sendPasswordResetEmail
