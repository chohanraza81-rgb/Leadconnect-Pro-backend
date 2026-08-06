const nodemailer = require('nodemailer');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html, attachments = [] }) {
  const { gmail, appPassword } = getConfig();

  if (!gmail || !appPassword) {
    throw new Error('Gmail credentials not configured. Add them in Settings page.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmail,
      pass: appPassword,
    },
  });

  const mailOptions = {
    from: gmail,
    to,
    subject,
    html,
    // Attachments not supported via Nodemailer in this simple setup;
    // if needed, you can add file paths here later.
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
}

module.exports = { sendEmail };
