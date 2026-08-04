const nodemailer = require('nodemailer');
const { getConfig } = require('./config');

async function sendEmail({ to, subject, html }) {
  const { gmail, appPassword } = getConfig();
  if (!gmail || !appPassword) throw new Error('Gmail credentials not configured');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmail, pass: appPassword },
  });
  await transporter.sendMail({ from: gmail, to, subject, html });
  return true;
}

module.exports = { sendEmail };
