const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Initialize database
const db = require('./database');

// Middleware
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/giveaway', require('./routes/giveaway'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api', require('./routes/crypto-public')); // Public crypto addresses

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'TeslasCap Backend API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      health: '/api/health'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8000'}`);
  console.log(`📧 Email Service: ${process.env.EMAIL_SERVICE || 'gmail'}`);
  console.log(`\n📚 API Endpoints:`);
  console.log(`  POST   /api/auth/register`);
  console.log(`  POST   /api/auth/verify-email`);
  console.log(`  POST   /api/auth/login`);
  console.log(`  GET    /api/wallet/balances`);
  console.log(`  POST   /api/wallet/deposit`);
  console.log(`  GET    /api/wallet/transactions`);
  console.log(`  POST   /api/admin/login`);
  console.log(`  GET    /api/admin/pending-deposits`);
  console.log(`  GET    /api/admin/all-deposits`);
  console.log(`  PUT    /api/admin/confirm-deposit/:depositId`);
  console.log(`  PUT    /api/admin/reject-deposit/:depositId`);
  console.log(`  GET    /api/admin/crypto-addresses`);
  console.log(`  PUT    /api/admin/crypto-address/:id`);
  console.log(`  GET    /api/admin/users`);
  console.log(`  GET    /api/admin/logs`);
  console.log(`  GET    /api/admin/stats`);
  console.log(`  POST   /api/giveaway/register`);
  console.log(`  POST   /api/giveaway/test-telegram`);
  console.log(`  GET    /api/giveaway/registrations`);
  console.log(`  GET    /api/giveaway/registrations/:giveawayId`);
  console.log(`  POST   /api/kyc/submit`);
  console.log(`  GET    /api/kyc/submissions`);
  console.log(`  GET    /api/kyc/submission/:userId`);
});

module.exports = app;
