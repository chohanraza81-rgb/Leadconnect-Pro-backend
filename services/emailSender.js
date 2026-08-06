const nodemailer = require('nodemailer');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html }) {
  const config = getConfig();
  
  if (config.brevoApiKey) {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      auth: { user: 'apikey', pass: config.brevoApiKey },
    });
    const from = config.gmail || 'noreply@leadconnect.pro';
    await transporter.sendMail({ from, to, subject, html });
    return { success: true };
  }
  
  if (config.gmail && config.appPassword) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.gmail, pass: config.appPassword },
    });
    await transporter.sendMail({ from: config.gmail, to, subject, html });
    return { success: true };
  }
  
  throw new Error('No email configured. Add Brevo key or Gmail in Settings.');
}

module.exports = { sendEmail };
