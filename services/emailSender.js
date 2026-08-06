const { Resend } = require('resend');
const { getConfig } = require('./config');
const fs = require('fs');
const path = require('path');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const { resendApiKey } = getConfig();
  if (!resendApiKey) throw new Error('Resend API key not configured');

  const resend = new Resend(resendApiKey);

  // Convert file paths to base64 if needed
  const processedAttachments = await Promise.all(
    attachments.map(async (att) => {
      if (att.path) {
        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(att.path);
        return {
          filename: att.filename,
          content: fileBuffer.toString('base64'),
          content_type: att.content_type || 'application/octet-stream',
        };
      }
      // Already base64
      return {
        filename: att.filename,
        content: att.content,
        content_type: att.content_type || 'application/octet-stream',
      };
    })
  );

  const mailOptions = {
    from: 'LeadConnect Pro <onboarding@resend.dev>',
    to,
    subject,
    html,
    attachments: processedAttachments,
  };

  const { data, error } = await resend.emails.send(mailOptions);
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { sendEmail };
