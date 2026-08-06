const nodemailer = require('nodemailer');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html }) {
  const config = getConfig();

  // 1. Try Brevo (Sendinblue) first
  if (config.brevoApiKey) {
    console.log('📧 Sending via Brevo...');
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',           // literal string
        pass: config.brevoApiKey,
      },
    });

    // Use Gmail as sender (must be verified in Brevo) or fallback
    const from = config.gmail || 'sender@example.com';
    await transporter.sendMail({ from, to, subject, html });
    console.log('✅ Brevo sent');
    return { success: true };
  }

  // 2. Fallback to Gmail SMTP
  if (config.gmail && config.appPassword) {
    console.log('📧 Sending via Gmail SMTP...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmail,
        pass: config.appPassword,
      },
    });
    await transporter.sendMail({ from: config.gmail, to, subject, html });
    console.log('✅ Gmail sent');
    return { success: true };
  }

  // 3. No credentials
  throw new Error('No email credentials configured. Add Brevo API key or Gmail credentials in Settings.');
}

module.exports = { sendEmail };
