const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The router config requires Cloudinary credentials at import time.
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test';

const router = require('../src/routes/municipalComplaintRoutes');

const describePath = (layer) => {
  if (!layer.route) return null;
  return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`);
};

const routes = router.stack.flatMap(describePath).filter(Boolean);

describe('municipal complaint route ordering', () => {
  it('registers the expected routes', () => {
    const expected = [
      'GET /issue-templates',
      'GET /track/:trackingId',
      'GET /assignable',
      'GET /stats',
      'GET /export/pdf',
      'GET /export/excel',
      'GET /',
      'POST /',
      'POST /admin/run-escalation',
      'GET /:id/audit',
      'POST /:id/assess',
      'POST /:id/forward',
      'POST /:id/status',
      'POST /:id/notes',
      'POST /:id/escalate',
      'POST /:id/accept',
      'POST /:id/reject',
      'POST /:id/assign-inspector',
      'POST /:id/assign-technician',
      'POST /:id/start-work',
      'POST /:id/complete-work',
      'POST /:id/verify-resolution',
      'POST /:id/reopen',
      'POST /:id/close',
      'POST /:id/feedback',
      'GET /:id',
    ];
    for (const route of expected) {
      assert.ok(routes.includes(route), `missing route: ${route}`);
    }
  });

  it('registers public /track/:trackingId BEFORE the catch-all /:id', () => {
    const trackIdx = routes.indexOf('GET /track/:trackingId');
    const detailIdx = routes.indexOf('GET /:id');
    assert.ok(trackIdx >= 0 && detailIdx >= 0);
    assert.ok(trackIdx < detailIdx, 'GET /track/:trackingId must be registered before GET /:id');
  });

  it('registers /assignable and /stats and /export/* before the catch-all /:id', () => {
    const detailIdx = routes.indexOf('GET /:id');
    for (const route of ['GET /assignable', 'GET /stats', 'GET /export/pdf', 'GET /export/excel']) {
      assert.ok(routes.indexOf(route) < detailIdx, `${route} must be registered before GET /:id`);
    }
  });

  it('registers the list GET / before the catch-all /:id', () => {
    assert.ok(routes.indexOf('GET /') < routes.indexOf('GET /:id'));
  });
});
