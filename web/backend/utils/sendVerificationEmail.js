const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
})

async function sendVerificationEmail(toEmail, code) {
    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: toEmail,
        subject: 'Your BewAir verification code',
        html: `<p>Your BewAir verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
    })
}

module.exports = sendVerificationEmail
