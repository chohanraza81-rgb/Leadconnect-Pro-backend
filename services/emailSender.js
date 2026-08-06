const { Resend } = require('resend');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const { resendApiKey, gmail, appPassword } = getConfig();
  
  // Prefer Resend, fallback to Gmail
  if (resendApiKey && resendApiKey.startsWith('re_')) {
    console.log('Sending via Resend...');
    const resend = new Resend(resendApiKey);
    const mailOptions = {
      from: 'LeadConnect Pro <onboarding@resend.dev>',
      to,
      subject,
      html,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        content_type: att.content_type || 'application/octet-stream',
      })),
    };
    const { data, error } = await resend.emails.send(mailOptions);
    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }
    console.log('Resend sent:', data?.id);
    return data;
  }
  
  // Fallback to Nodemailer + Gmail
  if (gmail && appPassword) {
    console.log('Sending via Gmail SMTP...');
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmail, pass: appPassword },
    });
    await transporter.sendMail({ from: gmail, to, subject, html });
    return true;
  }
  
  throw new Error('No email credentials configured. Add Resend API key or Gmail credentials in Settings.');
}

module.exports = { sendEmail };
