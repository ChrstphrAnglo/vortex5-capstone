// Uses Brevo's HTTPS transactional email API (not SMTP) — Render's free tier
// blocks outbound SMTP ports, so this goes over normal HTTPS instead.
async function sendVerificationEmail(toEmail, code) {
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
            subject: 'Your BewAir verification code',
            htmlContent: `<p>Your BewAir verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
        })
    })

    if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Brevo send failed (${res.status}): ${errBody}`)
    }
}

module.exports = sendVerificationEmail
