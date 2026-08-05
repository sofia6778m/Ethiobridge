/**
 * alertScheduler.js
 *
 * Runs every minute and manages the PublicAlert lifecycle:
 *  1. Publish scheduled alerts whose scheduledAt has arrived → status 'active',
 *     sets publishedAt, notifies matching citizens, and emits `alert:new`.
 *  2. Expire active alerts whose expiresAt has passed → status 'expired',
 *     emits `alert:statusUpdate`.
 *
 * Requires: node-cron  (already a dependency).
 */

let cron;
try {
  cron = require('node-cron');
} catch {
  console.warn('[AlertScheduler] node-cron not installed — scheduler disabled. Run: npm i node-cron');
}

const PublicAlert = require('../models/PublicAlert');
const { LIVE_STATUSES } = require('./alertMetadata');
const { notifyCitizens } = require('../controllers/alertController');

let _io = null;

/**
 * Call once from index.js after the socket.io server is created.
 * @param {import('socket.io').Server} io
 */
function startAlertScheduler(io) {
  _io = io;

  if (!cron) return;

  // Check every minute — scheduled windows can be tight.
  cron.schedule('* * * * *', async () => {
    await runAlertSchedulerPass(_io);
  });

  console.log('[AlertScheduler] Started — publishes scheduled alerts, expires overdue alerts every minute.');
}

/**
 * Single pass: publish due alerts, then expire past-due alerts.
 * Exported so it can be tested or triggered manually.
 */
async function runAlertSchedulerPass(io) {
  const now = new Date();

  // ── Pass 1: publish scheduled alerts whose time has come ──────────────────
  const due = await PublicAlert.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
  });

  for (const alert of due) {
    try {
      alert.status = 'published';
      alert.publishedAt = now;
      alert.auditHistory.push({ action: 'published', userName: 'System', userRole: 'scheduler', at: now });
      await alert.save();

      const stats = await notifyCitizens(alert, io);
      alert.deliveryStats = stats;
      await alert.save();

      if (io) {
        io.emit('alert:new', {
          _id: alert._id,
          title: alert.title,
          category: alert.category,
          severity: alert.severity,
          description: alert.description,
          scope: alert.scope,
          subcityName: alert.subcityName,
          woredaName: alert.woredaName,
          status: alert.status,
          pinned: alert.pinned,
          publishedAt: alert.publishedAt,
          expiresAt: alert.expiresAt,
          createdByName: alert.createdByName,
          createdAt: alert.createdAt,
        });
      }
      console.log(`[AlertScheduler] Published scheduled alert: ${alert.title}`);
    } catch (err) {
      console.error(`[AlertScheduler] Publish failed for ${alert._id}:`, err.message);
    }
  }

  // ── Pass 2: expire live alerts past their expiry ───────────────────────────
  const overdue = await PublicAlert.find({
    status: { $in: LIVE_STATUSES },
    expiresAt: { $lte: now },
  });

  for (const alert of overdue) {
    try {
      alert.status = 'expired';
      alert.auditHistory.push({ action: 'expired', userName: 'System', userRole: 'scheduler', at: now });
      await alert.save();

      if (io) {
        io.emit('alert:statusUpdate', { _id: alert._id, status: 'expired', severity: alert.severity });
      }
      console.log(`[AlertScheduler] Expired alert: ${alert.title}`);
    } catch (err) {
      console.error(`[AlertScheduler] Expire failed for ${alert._id}:`, err.message);
    }
  }
}

module.exports = { startAlertScheduler, runAlertSchedulerPass };
