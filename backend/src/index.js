require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('mongo-sanitize');
const http = require('http');
const net = require('net');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { protect, protectOptional, authorize } = require('./middleware/auth');
const { generalLimiter } = require('./middleware/rateLimiter');
const { trackLimiter } = require('./middleware/rateLimiter');
const { publicTrack } = require('./controllers/publicTrackController');

// Import routes
const authRoutes = require('./routes/authRoutes');
const infrastructureRoutes = require('./routes/infrastructureRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const newsRoutes = require('./routes/newsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const dropdownRoutes = require('./routes/dropdownRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const alertRoutes = require('./routes/alertRoutes');
const subcityRoutes = require('./routes/subcityRoutes');
const woredaRoutes = require('./routes/woredaRoutes');
const adminWoredaRoutes = require('./routes/adminWoredaRoutes');
const adminDepartmentRoutes = require('./routes/adminDepartmentRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const workflowComplaintRoutes = require('./routes/workflowComplaintRoutes');
const municipalComplaintRoutes = require('./routes/municipalComplaintRoutes');
const governanceComplaintRoutes = require('./routes/governanceComplaintRoutes');
const governanceManagementRoutes = require('./routes/governanceManagementRoutes');
const subcityGovernanceRoutes = require('./routes/subcityGovernanceRoutes');
const hierarchyRoutes = require('./routes/hierarchyRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const donationRoutes = require('./routes/donationRoutes');

// ── Startup admin account guard ───────────────────────────────────────────────
// Ensures a working admin account always exists. Runs once after the DB
// connection is established — completely idempotent. All logic lives in
// src/utils/adminAccount.js (seed + migrate + dedupe + startup validation).
const { ensureAdminAccount, validateAdminOnStartup } = require('./utils/adminAccount');

const app = express();
const server = http.createServer(app);

// Socket.io for real-time notifications
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Make io accessible in routes/controllers
app.set('io', io);

// ── Startup marker — confirms the NEW code (DB-validated subcities) is loaded ─
console.log('========================================');
console.log('  EthioBridge API — new build loaded');
console.log('  Subcity validation: LIVE DB (not hardcoded)');
console.log('  Build time:', new Date().toISOString());
console.log('========================================');

// Start escalation scheduler (auto-escalates overdue complaints every 15 min)
const { startEscalationScheduler } = require('./utils/escalationScheduler');
startEscalationScheduler(io);

// Start alert scheduler (publishes scheduled alerts + expires overdue every minute)
const { startAlertScheduler } = require('./utils/alertScheduler');
startAlertScheduler(io);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Trust proxy (for rate limiter behind reverse proxy) — must be set before rate limiters
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize body AFTER json parser so req.body is populated
app.use((req, res, next) => {
  mongoSanitize(req.body);
  mongoSanitize(req.query);
  mongoSanitize(req.params);
  next();
});

// Global rate limiter
app.use('/api', generalLimiter);

// Routes
app.use('/api', dropdownRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/infrastructure', infrastructureRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/subcity', subcityRoutes);
app.use('/api/woreda', woredaRoutes);
app.use('/api/woredas', adminWoredaRoutes);
app.use('/api/departments', adminDepartmentRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/workflow-complaints', workflowComplaintRoutes);
app.use('/api/municipal-complaints', municipalComplaintRoutes);
app.use('/api/governance-complaints', governanceComplaintRoutes);
app.use('/api/governance-management', governanceManagementRoutes);
// Subcity-scoped governance management — exclusively for Subcity Admin users.
// Mirrors /api/governance-management/* but restricted to subcity_* roles so the
// ownership boundary is enforced at the route level as well as the controller.
app.use('/api/subcity', subcityGovernanceRoutes);
// Public alias routes for governance master data (specified REST endpoints):
//   GET  /api/government-offices
//   POST /api/government-offices
//   GET  /api/government-offices/by-subcity/:subcityId   (dynamic dropdown)
//   GET  /api/government-offices/:id
//   PUT  /api/government-offices/:id
//   DELETE /api/government-offices/:id
//   GET  /api/governance-users
//   POST /api/governance-users
//   GET  /api/governance-users/:id
//   PUT  /api/governance-users/:id
//   DELETE /api/governance-users/:id
// The /api/government-offices/by-subcity/:subcityId route MUST be registered
// before /api/government-offices/:id so Express doesn't treat "by-subcity" as
// an office id. Reads are protectOptional (public complaint form + scoped admin
// reads); writes are restricted to Subcity Admin roles — the controller also
// enforces subcity isolation as a second layer of defence.
const {
  getOffices,
  getOffice,
  getOfficesBySubcityId,
  getCategories,
  createOffice,
  updateOffice,
  deleteOffice,
  getOfficers,
  getOfficer,
  createOfficer,
  updateOfficer,
  deleteOfficer,
} = require('./controllers/governanceManagementController');
const subcityGovernanceRoles = ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin', 'subcity_bole'];

// Reads (public dropdowns + scoped admin reads)
app.get('/api/government-offices/by-subcity/:subcityId', protectOptional, getOfficesBySubcityId);
// NOTE: GET /api/government-offices stays middleware-free so the public
// complaint form (which passes ?subcityId=) always gets the public branch.
app.get('/api/government-offices', getOffices);
app.get('/api/government-offices/:id', protectOptional, getOffice);
app.get('/api/complaint-categories', getCategories);

// Government office writes — Subcity Admin only
app.post('/api/government-offices', protect, authorize(...subcityGovernanceRoles), createOffice);
app.put('/api/government-offices/:id', protect, authorize(...subcityGovernanceRoles), updateOffice);
app.delete('/api/government-offices/:id', protect, authorize(...subcityGovernanceRoles), deleteOffice);

// Governance user (officer) endpoints — Subcity Admin only
app.get('/api/governance-users', protect, authorize(...subcityGovernanceRoles), getOfficers);
app.post('/api/governance-users', protect, authorize(...subcityGovernanceRoles), createOfficer);
app.get('/api/governance-users/:id', protect, authorize(...subcityGovernanceRoles), getOfficer);
app.put('/api/governance-users/:id', protect, authorize(...subcityGovernanceRoles), updateOfficer);
app.delete('/api/governance-users/:id', protect, authorize(...subcityGovernanceRoles), deleteOfficer);
app.use('/api/hierarchy', hierarchyRoutes);
app.use('/api/users', userRoutes);
// Unified public submission endpoints — each form posts to its own route so the
// report_type (and destination collection) is always correct, for logged-in
// and anonymous citizens alike.
app.use('/api/reports', reportRoutes);

// Campaign / fundraising / donation module
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donations', donationRoutes);

// Public complaint tracking — no authentication. Phone + tracking id lookup,
// rate-limited to deter enumeration. Returns a redacted record only when the
// tracking id AND the phone number match.
app.post('/api/public-track', trackLimiter, publicTrack);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'EthioBridge API is running', timestamp: new Date() });
});

// Server clock — lets the alert form validate against the REAL server time
// instead of the browser clock (which may be skewed or stale).
app.get('/api/time', (req, res) => {
  res.json({
    success: true,
    timezone: 'Africa/Addis_Ababa',
    now: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Check if port is already in use before attempting to bind
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '::');
  });
}

// MongoDB refuses a compound index over two array fields ("cannot index
// parallel arrays [woredaIds] [subcityIds]"). Older schema versions created a
// `targetType_1_subcityIds_1_woredaIds_1` index that survives in existing
// databases and makes every INSERT fail once both arrays are populated. On
// boot, drop any leftover index that keys both array fields together so alert
// creation keeps working — the schema defines single-field multikey indexes.
async function fixPublicAlertParallelArrayIndexes() {
  try {
    const collection = mongoose.connection.db.collection('publicalerts');
    const indexes = await collection.indexes();
    const stale = indexes.filter((i) => i.key.subcityIds !== undefined && i.key.woredaIds !== undefined);
    for (const index of stale) {
      await collection.dropIndex(index.name);
      console.log(`[PublicAlert] Dropped stale parallel-array index "${index.name}" (subcityIds + woredaIds)`);
    }
  } catch (err) {
    console.error('[PublicAlert] Index fix-up failed:', err.message);
  }
}

async function startServer() {
  // Seed admin after DB is ready
  await connectDB();

  await fixPublicAlertParallelArrayIndexes();

  // Align the Department collection's indexes with the schema. Drops the legacy
  // `unique_subcity_department` index so a subcity-level and a woreda-level
  // department may share the same name within one subcity, then ensures the new
  // `unique_subcity_woreda_department` ({ subcityId, woredaId, name }) exists.
  const Department = require('./models/Department');
  const deptIndexes = await Department.collection.indexes();
  const legacyDeptIndex = deptIndexes.find((i) => i.name === 'unique_subcity_department');
  if (legacyDeptIndex) {
    await Department.collection.dropIndex('unique_subcity_department');
    console.log('[Department] Dropped legacy unique_subcity_department index');
  }
  await Department.init();

  await ensureAdminAccount();
  await validateAdminOnStartup();

  // Startup validation for report-ID counters — ensures new IR-YYYY-000001
  // style IDs never re-issue an ID that already exists in the database.
  const { ensureReportCounters } = require('./utils/reportIdGenerator');
  await ensureReportCounters();

  // Seed the built-in municipal issue templates (Electricity / Water / Road)
  const { seedIssueTemplates } = require('./utils/municipalSeed');
  await seedIssueTemplates();

  // Align governance complaint counters so GOV-YYYY-000001 style IDs never
  // re-issue an ID that already exists in the database.
  const { ensureGovernanceCounters } = require('./utils/governanceIdGenerator');
  await ensureGovernanceCounters();

  // Seed the DB-driven governance master data (GovernmentOffices +
  // ComplaintCategories per subcity) — idempotent, safe on every boot.
  const { seedGovernanceMasterData } = require('./utils/governanceSeed');
  await seedGovernanceMasterData();

  // Align donation reference counters so DON-YYYY-NNNNNN refs never re-issue
  // an existing reference after a redeploy.
  const { ensureDonationCounters } = require('./utils/donationReference');
  await ensureDonationCounters();

  const available = await isPortAvailable(PORT);

  if (!available) {
    console.error(`\n========================================`);
    console.error(`  ERROR: Port ${PORT} is already in use!`);
    console.error(`========================================`);
    console.error(`  Another EthioBridge server instance may already be running on port ${PORT}.`);
    console.error(`  You can:`);
    console.error(`    1. Stop the other instance and restart.`);
    console.error(`    2. Kill the process using port ${PORT}:`);
    console.error(`       - Windows:  netstat -ano | findstr :${PORT}  then taskkill /PID <PID> /F`);
    console.error(`       - Linux/Mac: lsof -i :${PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`);
    console.error(`    3. Use a different port by setting PORT=5001 in your .env file`);
    console.error(`========================================\n`);
    process.exit(1);
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} became unavailable after check. Another process may have taken it.`);
      console.error(`Try setting PORT=5001 in your .env file and restarting.\n`);
    } else {
      console.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(PORT, '::', () => {
    console.log(`EthioBridge server running on port ${PORT}`);
  });
}

startServer();
