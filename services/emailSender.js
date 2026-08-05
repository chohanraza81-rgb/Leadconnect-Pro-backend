const { Resend } = require('resend');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const { resendApiKey } = getConfig();
  if (!resendApiKey) throw new Error('Resend API key not configured. Add it in Settings or .env');

  const resend = new Resend(resendApiKey);

  const mailOptions = {
    from: 'LeadConnect Pro <onboarding@resend.dev>',
    to,
    subject,
    html,
    attachments: attachments.map(att => ({
      filename: att.filename,
      content: att.content,           // base64 string without data URI prefix
      content_type: att.content_type || 'application/octet-stream',
    })),
  };

  const { data, error } = await resend.emails.send(mailOptions);
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { sendEmail };
