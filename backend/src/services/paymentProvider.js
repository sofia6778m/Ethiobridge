// paymentProvider.js
// ─────────────────────
// Ethiopian payment aggregator integration hooks for the Community Campaign
// platform. Two online payment channels are supported:
//
//   Chapa        — Ethiopian online payment gateway (card / Telebirr / CBE Birr)
//   Coopay Amole — Coopay Commerce payment gateway using Amole / CBE Birr
//
// The service NEVER throws: when the provider keys are not configured the
// hooks return { ok:false, skipped:true } so callers can fall back to the
// manual QR / bank-transfer flow. This mirrors the email/SMS gateway pattern.
//
// Required env:
//   CHAPA_SECRET_KEY          — Chapa merchant secret
//   CHAPA_BASE_URL            — default https://api.chapa.co/v1
//   COOPAY_API_KEY            — Coopay API key
//   COOPAY_BASE_URL           — default https://commerce.coopay.co/checkout/init
const crypto = require('crypto');

const isChapaConfigured = () => Boolean(process.env.CHAPA_SECRET_KEY);
const isCoopayConfigured = () => Boolean(process.env.COOPAY_API_KEY);

const isConfigured = () => isChapaConfigured() || isCoopayConfigured();

// ── Chapa ────────────────────────────────────────────────────────────────────
// Creates a checkout transaction. On success returns the checkout_url the
// donor is redirected to.
const initiateChapa = async ({ amount, currency = 'ETB', reference, donorName = 'Donor', donorEmail = '', returnUrl = '', customFields = {} }) => {
  if (!isChapaConfigured()) return { ok: false, skipped: true };

  try {
    const txRef = reference || `CHAPA-${Date.now()}`;
    const response = await fetch(`${process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1'}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: String(amount),
        currency,
        email: donorEmail || 'donor@ethiobridge.et',
        first_name: donorName.split(' ')[0] || 'Donor',
        last_name: donorName.split(' ').slice(1).join(' ') || 'Donor',
        tx_ref: txRef,
        callback_url: returnUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/donate/track?ref=${txRef}`,
        return_url: returnUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/donate/track?ref=${txRef}`,
        custom_fields: customFields,
      }),
    });

    const body = await response.json();
    if (body.status === 'success' && body.data?.checkout_url) {
      return { ok: true, provider: 'chapa', txRef, checkoutUrl: body.data.checkout_url, data: body.data };
    }
    return { ok: false, provider: 'chapa', error: body.message || 'Chapa could not initialize the transaction', data: body };
  } catch (error) {
    return { ok: false, provider: 'chapa', error: error.message };
  }
};

// Verifies the status of a Chapa transaction by its tx_ref.
const verifyChapaTransaction = async (txRef) => {
  if (!isChapaConfigured()) return { ok: false, skipped: true };

  try {
    const response = await fetch(`${process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1'}/transaction/verify/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` },
    });
    const body = await response.json();
    if (body.status === 'success' && body.data?.status === 'success') {
      return { ok: true, provider: 'chapa', txRef, paid: true, data: body.data };
    }
    return { ok: true, provider: 'chapa', txRef, paid: false, data: body.data || body };
  } catch (error) {
    return { ok: false, provider: 'chapa', error: error.message };
  }
};

// Validates the Chapa webhook HMAC signature (shared secret derived from the
// secret key). Returns a boolean so callers can drop forged webhooks.
const verifyChapaWebhookSignature = (payload, signature) => {
  try {
    if (!process.env.CHAPA_SECRET_KEY || !signature) return false;
    const expected = crypto.createHmac('sha256', process.env.CHAPA_SECRET_KEY).update(JSON.stringify(payload)).digest('hex');
    const received = String(signature).replace('sha256=', '');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

// ── Coopay Commerce (Amole / CBE Birr) ──────────────────────────────────────
// Initializes a Coopay checkout session. On success the provider returns an
// HTML form / iframe URL the donor uses to complete the Amole payment.
const initiateCoopayAmole = async ({ amount, currency = 'ETB', reference, donorName = 'Donor', returnUrl = '', phone = '' }) => {
  if (!isCoopayConfigured()) return { ok: false, skipped: true };

  try {
    const txRef = reference || `COOPAY-${Date.now()}`;
    const response = await fetch(process.env.COOPAY_BASE_URL || 'https://commerce.coopay.co/checkout/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.COOPAY_API_KEY,
      },
      body: JSON.stringify({
        amount: String(amount),
        currency,
        tx_ref: txRef,
        payer_name: donorName,
        payer_phone: phone || '',
        return_url: returnUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/donate/track?ref=${txRef}`,
        payment_method: 'amole',
      }),
    });

    const body = await response.json();
    if (body?.status === 'success' && (body?.data?.checkout_url || body?.checkout_url)) {
      return { ok: true, provider: 'coopay_amole', txRef, checkoutUrl: body.data?.checkout_url || body.checkout_url, data: body.data || body };
    }
    return { ok: false, provider: 'coopay_amole', error: body?.message || 'Coopay could not initialize the transaction', data: body };
  } catch (error) {
    return { ok: false, provider: 'coopay_amole', error: error.message };
  }
};

// Polls a Coopay checkout status.
const verifyCoopayTransaction = async (txRef) => {
  if (!isCoopayConfigured()) return { ok: false, skipped: true };

  try {
    const response = await fetch(`${process.env.COOPAY_BASE_URL || 'https://commerce.coopay.co/checkout'}/status/${encodeURIComponent(txRef)}`, {
      headers: { 'X-Api-Key': process.env.COOPAY_API_KEY },
    });
    const body = await response.json();
    const paid = body?.status === 'success' || body?.data?.status === 'success' || body?.data?.payment_status === 'success';
    return { ok: true, provider: 'coopay_amole', txRef, paid, data: body };
  } catch (error) {
    return { ok: false, provider: 'coopay_amole', error: error.message };
  }
};

module.exports = {
  isConfigured,
  isChapaConfigured,
  isCoopayConfigured,
  initiateChapa,
  verifyChapaTransaction,
  verifyChapaWebhookSignature,
  initiateCoopayAmole,
  verifyCoopayTransaction,
};
