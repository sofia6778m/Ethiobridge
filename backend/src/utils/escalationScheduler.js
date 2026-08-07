/**
 * escalationScheduler.js
 *
 * Runs every 15 minutes and auto-escalates:
 *  1. WorkflowComplaint  — whose escalationDeadline has passed and
 *     workflowStatus is still 'pending' / 'pending_escalation'.
 *  2. Municipal complaints — 48h SLA exceeded -> Subcity Department,
 *     5-day SLA exceeded  -> Subcity Administrator.
 *  3. Service Governance complaints — past their response deadline.
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
const { _escalateToSubcity } = require('../controllers/workflowComplaintController');
const { runEscalationPass: runMunicipalEscalationPass } = require('../controllers/municipalComplaintController');
const { runGovernanceEscalationPass } = require('../controllers/governanceComplaintController');

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

    // ── Pass 2: municipal complaints ─────────────────────────────────────────
    // Stage 1: 48h no response at Woreda level -> Subcity Department.
    // Stage 2: 5 days no action after escalation -> Subcity Administrator.
    await runMunicipalEscalationPass(io);

    // ── Pass 3: service governance complaints ────────────────────────────────
    // Flags complaints past their response deadline and woreda requests whose
    // due date has elapsed (notifies the subcity governance office).
    await runGovernanceEscalationPass(io);
  } catch (err) {
    console.error('[Escalation] Pass error:', err.message);
  }
}

module.exports = { startEscalationScheduler, runEscalationPass };
