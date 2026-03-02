require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

// Import middleware
const { testConnection, ensureAccessControlSchema } = require('./src/config/database');
const { errorHandler, notFound, requestLogger } = require('./src/middleware/errorHandler');
const {
  startAuditLogRetentionJob,
  stopAuditLogRetentionJob
} = require('./src/services/auditRetentionService');
const {
  startAutoReminderJob,
  stopAutoReminderJob
} = require('./src/services/reminderService');

// Import routes
const authRoutes = require('./src/routes/auth');
const patientRoutes = require('./src/routes/patients');
const visitRoutes = require('./src/routes/visits');
const documentRoutes = require('./src/routes/documents');
const clinicalNoteRoutes = require('./src/routes/clinicalNotes');
const queueRoutes = require('./src/routes/queue');
const caseRoutes = require('./src/routes/cases');
const inventoryRoutes = require('./src/routes/inventory');
const userRoutes = require('./src/routes/users');
const reportRoutes = require('./src/routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving (for favicon and other assets)
app.use(express.static('public'));

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'src/uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OrthoFlow API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/clinical-notes', clinicalNoteRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'OrthoFlow API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      visits: '/api/visits',
      documents: '/api/documents',
      clinicalNotes: '/api/clinical-notes',
      queue: '/api/queue',
      cases: '/api/cases',
      inventory: '/api/inventory',
      users: '/api/users',
      reports: '/api/reports'
    },
    documentation: 'https://github.com/your-repo/orthoflow-backend'
  });
});

// Favicon handler - prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // Return No Content
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Close server & exit process
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  stopAuditLogRetentionJob();
  stopAutoReminderJob();
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  stopAuditLogRetentionJob();
  stopAutoReminderJob();
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await testConnection();
    await ensureAccessControlSchema();
    console.log('✅ Database connected successfully');
    startAuditLogRetentionJob();
    startAutoReminderJob();
    
    const PORT = process.env.PORT || 3000;
    
    app.listen(PORT, () => {
      console.log(`
🚀 OrthoFlow Backend Server Started Successfully!
📍 Server: http://localhost:${PORT}
🏥 Environment: ${process.env.NODE_ENV || 'development'}
📊 Health Check: http://localhost:${PORT}/health
      `);
      
      // Auto-open browser in development mode (only for API docs)
      if (process.env.NODE_ENV === 'development') {
        const open = require('open');
        setTimeout(() => {
          open(`http://localhost:${PORT}/api`);
        }, 2000); // Wait 2 seconds for server to start
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
