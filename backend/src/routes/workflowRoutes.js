const express = require('express');
const router = express.Router();
const {
  getLevelReports, getReportDetail, forwardReport, resolveReport,
  closeCase, addComment, getWorkflowStats, getOfficersAtLevel, getHierarchy,
} = require('../controllers/workflowController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('government'));

router.get('/stats', getWorkflowStats);
router.get('/hierarchy', getHierarchy);
router.get('/reports', getLevelReports);
router.get('/reports/:id', getReportDetail);
router.post('/reports/:id/forward', forwardReport);
router.post('/reports/:id/resolve', resolveReport);
router.post('/reports/:id/close', closeCase);
router.post('/reports/:id/comment', addComment);
router.get('/officers/:level', getOfficersAtLevel);

module.exports = router;
