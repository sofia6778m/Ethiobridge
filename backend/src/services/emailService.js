/**
 * Email delivery service built on Nodemailer (SMTP).
 *
 * Behaviour when SMTP is not configured:
 *   • never throws
 *   • logs the would-be message and returns { ok: false, skipped: true }
 * This keeps local/dev environments and the test suite free of real sends.
 */
const nodemailer = require('nodemailer');

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST) && Boolean(process.env.SMTP_PORT);

const buildTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) return { ok: false, skipped: true, reason: 'no recipient' };
  if (!isConfigured()) {
    console.log(`[EMAIL-HOOK] SMTP not configured — skipping email to ${to}: ${subject}`);
    return { ok: false, skipped: true, reason: 'SMTP not configured' };
  }
  try {
    const transporter = buildTransporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'EthioBridge <no-reply@ethiobridge.et>';
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EMAIL-HOOK] send failed:', err.message);
    return { ok: false, error: err.message };
  }
};

module.exports = { sendEmail, isConfigured };
