/**
 * alertScheduler.js
 *
 * Runs every minute and manages the PublicAlert lifecycle:
 *  1. Publish scheduled alerts whose start time has arrived → status 'published',
 *     sets publishedAt, syncs the schedule/scheduledAt mirrors, notifies matching
 *     citizens, and emits `alert:new`.
 *  2. Expire live alerts whose end time has passed → status 'expired',
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
  // A scheduled alert is due when EITHER the canonical `schedule.startAt` or the
  // legacy `scheduledAt` mirror has arrived (in case legacy rows were written
  // without a `schedule` subdoc). Alerts that have also already expired are
  // excluded here and handled by the expiry pass — we never publish an expired
  // alert. All comparisons use UTC `Date` values straight from MongoDB.
  const due = await PublicAlert.find({
    status: 'scheduled',
    $or: [
      { 'schedule.startAt': { $lte: now } },
      { scheduledAt: { $lte: now } },
    ],
  });

  for (const alert of due) {
    try {
      const start = alert.schedule?.startAt || alert.scheduledAt || null;
      const end = alert.schedule?.endAt || alert.expiresAt || null;

      // Safety net: if the alert expired before (or exactly when) it was due to
      // go live, mark it expired instead of broadcasting a dead alert.
      if (end && end <= now) {
        alert.status = 'expired';
        alert.auditHistory.push({ action: 'expired', userName: 'System', userRole: 'scheduler', at: now });
        await alert.save();
        if (io) {
          io.emit('alert:statusUpdate', { _id: alert._id, status: 'expired', severity: alert.severity });
        }
        console.log(`[AlertScheduler] Skipped publishing expired scheduled alert: ${alert.title}`);
        continue;
      }

      alert.status = 'published';
      alert.isPublished = true;
      alert.publishedAt = now;
      alert.schedule = { startAt: start, endAt: end };
      if (start) alert.scheduledAt = start;
      if (end) alert.expiresAt = end;
      alert.auditHistory.push({ action: 'published', userName: 'System', userRole: 'scheduler', at: now });
      await alert.save();

      const stats = await notifyCitizens(alert, io, null);
      alert.deliveryStats = stats;
      await alert.save();

      if (io) {
        io.emit('alert:new', {
          _id: alert._id,
          title: alert.title,
          category: alert.category,
          customCategory: alert.customCategory,
          severity: alert.severity,
          description: alert.description,
          targetType: alert.targetType,
          targetLabel: alert.targetLabel,
          scope: alert.scope,
          subcityName: alert.subcityName,
          subcityNames: alert.subcityNames || [],
          woredaName: alert.woredaName,
          woredaNames: alert.woredaNames || [],
          status: alert.status,
          pinned: alert.pinned,
          publishedAt: alert.publishedAt,
          expiresAt: alert.expiresAt,
          attachments: alert.attachments || [],
          createdByName: alert.createdByName,
          createdAt: alert.createdAt,
        });
      }
      console.log(`[AlertScheduler] Published scheduled alert: ${alert.title}`);
    } catch (err) {
      console.error(`[AlertScheduler] Publish failed for ${alert._id}:`, err.message);
    }
  }

  // ── Pass 2: expire live (or still-scheduled) alerts past their expiry ────
  // Expiry comes from the canonical `schedule.endAt` or the legacy `expiresAt`
  // mirror (which the model keeps in sync via pre('validate')). Comparisons use
  // UTC `Date` values stored in MongoDB. `scheduled` alerts are included so a
  // stale scheduled alert whose expiry has already passed is expired rather
  // than ever being published by pass 1.
  const overdue = await PublicAlert.find({
    status: { $in: [...LIVE_STATUSES, 'scheduled'] },
    $or: [
      { 'schedule.endAt': { $lte: now } },
      { expiresAt: { $lte: now } },
    ],
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
