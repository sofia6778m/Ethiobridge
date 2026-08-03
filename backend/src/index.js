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
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/authRoutes');
const infrastructureRoutes = require('./routes/infrastructureRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const newsRoutes = require('./routes/newsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const publicComplaintRoutes = require('./routes/publicComplaintRoutes');
const alertBroadcastRoutes = require('./routes/alertBroadcastRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const subcityRoutes = require('./routes/subcityRoutes');
const woredaRoutes = require('./routes/woredaRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const workflowComplaintRoutes = require('./routes/workflowComplaintRoutes');
const municipalComplaintRoutes = require('./routes/municipalComplaintRoutes');

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
app.use('/api/auth', authRoutes);
app.use('/api/infrastructure', infrastructureRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/public-complaints', publicComplaintRoutes);
app.use('/api/alerts', alertBroadcastRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/subcity', subcityRoutes);
app.use('/api/woreda', woredaRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/workflow-complaints', workflowComplaintRoutes);
app.use('/api/municipal-complaints', municipalComplaintRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'EthioBridge API is running', timestamp: new Date() });
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

async function startServer() {
  // Seed admin after DB is ready
  await connectDB();

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
