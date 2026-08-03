/**
 * SMS delivery service.
 *
 * Provider-agnostic HTTP adapter:
 *   SMS_ENABLED=true
 *   SMS_API_URL=https://provider.example/sms/send
 *   SMS_API_KEY=optional bearer key
 *   SMS_SENDER_ID=EthioBridge
 *
 * Posts { phone, message, sender } as JSON with an optional
 * `Authorization: Bearer <SMS_API_KEY>` header. Any provider that
 * accepts this shape can be wired in by pointing SMS_API_URL at it.
 *
 * When SMS is disabled/unconfigured it never throws and simply logs
 * the would-be message, keeping dev and tests free of real sends.
 */
const isConfigured = () =>
  String(process.env.SMS_ENABLED).toLowerCase() === 'true' &&
  Boolean(process.env.SMS_API_URL);

const sendSms = async ({ to, message }) => {
  if (!to) return { ok: false, skipped: true, reason: 'no recipient' };
  if (!isConfigured()) {
    console.log(`[SMS-HOOK] SMS not configured — skipping SMS to ${to}: ${message}`);
    return { ok: false, skipped: true, reason: 'SMS not configured' };
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.SMS_API_KEY) headers.Authorization = `Bearer ${process.env.SMS_API_KEY}`;
    const payload = {
      phone: to,
      message,
      sender: process.env.SMS_SENDER_ID || 'EthioBridge',
    };
    const response = await fetch(process.env.SMS_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`[SMS-HOOK] provider returned ${response.status}`);
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    console.error('[SMS-HOOK] send failed:', err.message);
    return { ok: false, error: err.message };
  }
};

module.exports = { sendSms, isConfigured };
