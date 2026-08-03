/**
 * clearLoginLockouts.js
 * ─────────────────────
 * One-shot script that clears all in-memory login lockouts by calling the
 * running server's admin unlock endpoint.
 *
 * Usage (from the backend/ directory):
 *   node clearLoginLockouts.js
 *
 * It will:
 *   1. Log in as admin to get a JWT token
 *   2. Call DELETE /api/auth/lockout to clear every active lockout
 *   3. Print the result and exit
 *
 * Set ADMIN_EMAIL / ADMIN_PASSWORD as env vars or edit the defaults below.
 */

require('dotenv').config();
const http  = require('http');
const https = require('https');

const BASE_URL     = process.env.API_URL          || `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL       || 'admin@zda.et';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD    || 'Admin@12345';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url     = new URL(BASE_URL + path);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload  ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token    ? { 'Authorization': `Bearer ${token}` }           : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  EthioBridge — Clear Login Lockouts   ');
  console.log('═══════════════════════════════════════');
  console.log(`Server : ${BASE_URL}`);
  console.log(`Admin  : ${ADMIN_EMAIL}`);
  console.log('');

  // Step 1: log in as admin
  console.log('Step 1: Authenticating as admin…');
  const loginRes = await request('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });

  if (loginRes.status !== 200 || !loginRes.body?.token) {
    console.error('❌ Admin login failed:', loginRes.body?.message || loginRes.body);
    console.error('');
    console.error('If the admin account itself is locked, restart the backend server.');
    console.error('That clears all in-memory lockouts immediately.');
    process.exit(1);
  }

  const token = loginRes.body.token;
  console.log('✅ Admin login successful');
  console.log('');

  // Step 2: clear all lockouts
  console.log('Step 2: Clearing all login lockouts…');
  const clearRes = await request('DELETE', '/auth/lockout', null, token);

  if (clearRes.status === 200) {
    console.log('✅', clearRes.body?.message || 'All lockouts cleared');
  } else {
    console.error('❌ Clear failed:', clearRes.body?.message || clearRes.body);
    process.exit(1);
  }

  console.log('');
  console.log('Done. All blocked users can now log in immediately.');
  console.log('═══════════════════════════════════════');
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
