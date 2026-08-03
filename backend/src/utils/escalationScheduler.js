/**
 * escalationScheduler.js
 *
 * Runs every 15 minutes and auto-escalates:
 *  1. WorkflowComplaint  — whose escalationDeadline has passed and
 *     workflowStatus is still 'pending' / 'pending_escalation'.
 *  2. PublicComplaint    — 48h SLA exceeded  -> Subcity office
 *                         5-day SLA exceeded -> Subcity Administrator.
 *
 * Requires: node-cron  (install: npm i node-cron)
 */

let cron;
try {
  cron = require('node-cron');
} catch {
  console.warn('[Escalation] node-cron not installed — scheduler disabled. Run: npm i node-cron');
}

const WorkflowComplaint = require('../models/WorkflowComplaint');
const PublicComplaint = require('../models/PublicComplaint');
const { _escalateToSubcity } = require('../controllers/workflowComplaintController');
const {
  escalateToSubcity: escalatePublicToSubcity,
  escalateToSubcityAdmin,
} = require('../controllers/publicComplaintController');
const { runEscalationPass: runMunicipalEscalationPass } = require('../controllers/municipalComplaintController');

let _io = null;

/**
 * Call once from index.js after the socket.io server is created.
 * @param {import('socket.io').Server} io
 */
function startEscalationScheduler(io) {
  _io = io;

  if (!cron) return;

  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runEscalationPass(_io);
  });

  console.log('[Escalation] Scheduler started — checks every 15 minutes.');
}

/**
 * Single pass: find overdue complaints and escalate them.
 * Exported so it can be tested or triggered manually via an admin endpoint.
 */
async function runEscalationPass(io) {
  try {
    const now = new Date();

    // ── Pass 1: workflow (infrastructure) complaints ─────────────────────────
    const overdueWorkflows = await WorkflowComplaint.find({
      workflowStatus: { $in: ['pending', 'pending_escalation'] },
      escalationDeadline: { $lte: now },
    });

    for (const complaint of overdueWorkflows) {
      try {
        await _escalateToSubcity(complaint, io);
        console.log(`[Escalation] Workflow escalated: ${complaint.trackingNumber}`);
      } catch (err) {
        console.error(`[Escalation] Workflow failed for ${complaint.trackingNumber}:`, err.message);
      }
    }

    // ── Pass 2: public complaints — 48h -> Subcity office ────────────────────
    const overdueSubcity = await PublicComplaint.find({
      status: { $nin: ['Resolved', 'Rejected', 'Closed'] },
      escalatedToSubcityAt: { $exists: false },
      escalationDeadline: { $lte: now },
    });

    for (const complaint of overdueSubcity) {
      try {
        await escalatePublicToSubcity(complaint, io);
        console.log(`[Escalation] Public complaint -> subcity: ${complaint.trackingNumber}`);
      } catch (err) {
        console.error(`[Escalation] Public -> subcity failed for ${complaint.trackingNumber}:`, err.message);
      }
    }

    // ── Pass 3: public complaints — 5 days -> Subcity Administrator ──────────
    const overdueAdmin = await PublicComplaint.find({
      status: { $nin: ['Resolved', 'Rejected', 'Closed'] },
      escalatedToSubcityAdminAt: { $exists: false },
      subcityEscalationDeadline: { $lte: now },
    });

    for (const complaint of overdueAdmin) {
      try {
        await escalateToSubcityAdmin(complaint, io);
        console.log(`[Escalation] Public complaint -> administrator: ${complaint.trackingNumber}`);
      } catch (err) {
        console.error(`[Escalation] Public -> admin failed for ${complaint.trackingNumber}:`, err.message);
      }
    }

    // ── Pass 4: municipal complaints ─────────────────────────────────────────
    // Stage 1: 48h no response at Woreda level -> Subcity Department.
    // Stage 2: 5 days no action after escalation -> Subcity Administrator.
    await runMunicipalEscalationPass(io);
  } catch (err) {
    console.error('[Escalation] Pass error:', err.message);
  }
}

module.exports = { startEscalationScheduler, runEscalationPass };
