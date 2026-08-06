const { Resend } = require('resend');
const { getConfig } = require('./config');
const fs = require('fs');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const { resendApiKey } = getConfig();
  
  if (!resendApiKey || !resendApiKey.startsWith('re_')) {
    throw new Error('Resend API key not configured or invalid. Must start with re_');
  }

  console.log('Sending via Resend to:', to);
  const resend = new Resend(resendApiKey);

  // Process attachments (path → base64)
  const processedAttachments = attachments.map(att => {
    if (att.path) {
      const fileBuffer = fs.readFileSync(att.path);
      return {
        filename: att.filename,
        content: fileBuffer.toString('base64'),
        content_type: att.content_type || 'application/octet-stream',
      };
    }
    return {
      filename: att.filename,
      content: att.content,
      content_type: att.content_type || 'application/octet-stream',
    };
  });

  try {
    const { data, error } = await resend.emails.send({
      from: 'LeadConnect Pro <onboarding@resend.dev>',
      to,
      subject,
      html,
      attachments: processedAttachments,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }

    console.log('Resend sent:', data?.id);
    return data;
  } catch (e) {
    console.error('Resend send error:', e);
    throw e;
  }
}

module.exports = { sendEmail };
