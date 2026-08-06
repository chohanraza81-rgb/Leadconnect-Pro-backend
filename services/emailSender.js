const nodemailer = require('nodemailer');
const fs = require('fs');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const config = getConfig();

  // Process attachments
  const mailAttachments = [];
  for (const att of attachments) {
    if (att.path && fs.existsSync(att.path)) {
      mailAttachments.push({
        filename: att.filename || 'attachment',
        content: fs.readFileSync(att.path),
        contentType: att.content_type || 'application/octet-stream',
      });
    } else if (att.content) {
      mailAttachments.push({
        filename: att.filename || 'attachment',
        content: Buffer.from(att.content, 'base64'),
        contentType: att.content_type || 'application/octet-stream',
      });
    }
  }

  // Try Brevo first
  if (config.brevoApiKey) {
    console.log('📧 Sending via Brevo to:', to);
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: config.brevoApiKey,
      },
    });

    const from = config.gmail || 'noreply@leadconnect.pro';
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      attachments: mailAttachments,
    });

    console.log('✅ Brevo sent:', info.messageId);
    return { success: true, id: info.messageId };
  }

  // Fallback to Gmail SMTP
  if (config.gmail && config.appPassword) {
    console.log('📧 Sending via Gmail to:', to);
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmail,
        pass: config.appPassword,
      },
    });

    const info = await transporter.sendMail({
      from: config.gmail,
      to,
      subject,
      html,
      attachments: mailAttachments,
    });

    console.log('✅ Gmail sent:', info.messageId);
    return { success: true, id: info.messageId };
  }

  throw new Error('No email credentials configured. Add Brevo API key or Gmail in Settings.');
}

module.exports = { sendEmail };
