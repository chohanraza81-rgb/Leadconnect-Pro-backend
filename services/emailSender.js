const axios = require('axios');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html }) {
  const config = getConfig();

  // Try Brevo API first (HTTPS, no port blocking)
  if (config.brevoApiKey) {
    console.log('📧 Sending via Brevo API to:', to);
    
    try {
      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { email: config.gmail || 'marketmuse655@gmail.com' },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html,
        },
        {
          headers: {
            'api-key': config.brevoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      
      console.log('✅ Brevo sent:', response.data.messageId);
      return { success: true, id: response.data.messageId };
    } catch (e) {
      console.error('Brevo API error:', e.response?.data || e.message);
      throw new Error('Brevo send failed: ' + (e.response?.data?.message || e.message));
    }
  }

  // Fallback to Gmail SMTP
  if (config.gmail && config.appPassword) {
    console.log('📧 Sending via Gmail SMTP to:', to);
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.gmail, pass: config.appPassword },
    });
    const info = await transporter.sendMail({ from: config.gmail, to, subject, html });
    console.log('✅ Gmail sent:', info.messageId);
    return { success: true, id: info.messageId };
  }

  throw new Error('No email credentials configured.');
}

module.exports = { sendEmail };
