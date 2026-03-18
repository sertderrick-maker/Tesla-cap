const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { verifyToken } = require('../utils/jwt');

const router = express.Router();

// Admin middleware to verify admin token
const adminMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Check if user is admin
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(decoded.userId);
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Not authorized as admin' });
    }

    req.adminId = admin.id;
    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// Admin Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND isActive = 1').get(username);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordMatch = bcrypt.compareSync(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: admin.id, role: 'admin' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Log admin login
    db.prepare(`
      INSERT INTO admin_logs (adminId, action, details)
      VALUES (?, ?, ?)
    `).run(admin.id, 'LOGIN', `Admin ${admin.username} logged in`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

// Get pending deposits
router.get('/pending-deposits', adminMiddleware, (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT 
        d.id,
        d.userId,
        d.amount,
        d.cryptocurrency,
        d.walletAddress,
        d.status,
        d.createdAt,
        u.firstName,
        u.lastName,
        u.email
      FROM deposits d
      JOIN users u ON d.userId = u.id
      WHERE d.status = 'pending'
      ORDER BY d.createdAt DESC
    `).all();

    res.json({
      success: true,
      deposits
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Get all deposits
router.get('/all-deposits', adminMiddleware, (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT 
        d.id,
        d.userId,
        d.amount,
        d.cryptocurrency,
        d.walletAddress,
        d.status,
        d.createdAt,
        d.confirmedAt,
        u.firstName,
        u.lastName,
        u.email
      FROM deposits d
      JOIN users u ON d.userId = u.id
      ORDER BY d.createdAt DESC
    `).all();

    res.json({
      success: true,
      deposits
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Confirm deposit
router.put('/confirm-deposit/:depositId', adminMiddleware, (req, res) => {
  try {
    const { depositId } = req.params;
    const { transactionHash } = req.body;

    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    db.prepare(`
      UPDATE deposits
      SET status = 'confirmed', confirmedAt = CURRENT_TIMESTAMP, confirmedBy = ?, transactionHash = ?
      WHERE id = ?
    `).run(req.adminId, transactionHash || null, depositId);

    // Get or create wallet for user
    let wallet = db.prepare(`
      SELECT * FROM wallets WHERE userId = ? AND currency = ?
    `).get(deposit.userId, deposit.cryptocurrency);

    if (!wallet) {
      db.prepare(`
        INSERT INTO wallets (userId, currency, balance)
        VALUES (?, ?, ?)
      `).run(deposit.userId, deposit.cryptocurrency, deposit.amount);
    } else {
      // Update existing wallet balance
      db.prepare(`
        UPDATE wallets SET balance = balance + ? WHERE id = ?
      `).run(deposit.amount, wallet.id);
    }

    // Create transaction record
    wallet = db.prepare(`
      SELECT * FROM wallets WHERE userId = ? AND currency = ?
    `).get(deposit.userId, deposit.cryptocurrency);

    db.prepare(`
      INSERT INTO transactions (userId, walletId, type, amount, status, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      deposit.userId,
      wallet.id,
      'deposit',
      deposit.amount,
      'completed',
      `Deposit of ${deposit.amount} ${deposit.cryptocurrency}`
    );

    // Log action
    db.prepare(`
      INSERT INTO admin_logs (adminId, action, details)
      VALUES (?, ?, ?)
    `).run(req.adminId, 'CONFIRM_DEPOSIT', `Confirmed deposit of ${deposit.amount} ${deposit.cryptocurrency} for user ${deposit.userId}`);

    res.json({
      success: true,
      message: 'Deposit confirmed successfully',
      deposit: {
        id: depositId,
        status: 'confirmed',
        confirmedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error confirming deposit', error: error.message });
  }
});

// Reject deposit
router.put('/reject-deposit/:depositId', adminMiddleware, (req, res) => {
  try {
    const { depositId } = req.params;
    const { reason } = req.body;

    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    db.prepare(`
      UPDATE deposits
      SET status = 'rejected'
      WHERE id = ?
    `).run(depositId);

    // Log action
    db.prepare(`
      INSERT INTO admin_logs (adminId, action, details)
      VALUES (?, ?, ?)
    `).run(req.adminId, 'REJECT_DEPOSIT', `Rejected deposit of ${deposit.amount} ${deposit.cryptocurrency} for user ${deposit.userId}. Reason: ${reason || 'No reason provided'}`);

    res.json({
      success: true,
      message: 'Deposit rejected successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rejecting deposit', error: error.message });
  }
});

// Get crypto addresses (ADMIN ONLY)
router.get('/crypto-addresses', adminMiddleware, (req, res) => {
  try {
    const addresses = db.prepare(`
      SELECT id, cryptocurrency, symbol, address, isActive, createdAt, updatedAt
      FROM crypto_addresses
      ORDER BY symbol ASC
    `).all();

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching addresses', error: error.message });
  }
});

// PUBLIC: Get crypto addresses (NO AUTHENTICATION REQUIRED)
router.get('/crypto-addresses-public', (req, res) => {
  try {
    const addresses = db.prepare(`
      SELECT id, cryptocurrency, symbol, address, isActive, createdAt, updatedAt
      FROM crypto_addresses
      WHERE isActive = 1
      ORDER BY symbol ASC
    `).all();

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching addresses', error: error.message });
  }
});

// Update crypto address
router.put('/crypto-address/:id', adminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }

    const cryptoAddress = db.prepare('SELECT * FROM crypto_addresses WHERE id = ?').get(id);
    if (!cryptoAddress) {
      return res.status(404).json({ success: false, message: 'Crypto address not found' });
    }

    db.prepare(`
      UPDATE crypto_addresses
      SET address = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(address, id);

    // Log action
    db.prepare(`
      INSERT INTO admin_logs (adminId, action, details)
      VALUES (?, ?, ?)
    `).run(req.adminId, 'UPDATE_ADDRESS', `Updated ${cryptoAddress.symbol} address to ${address}`);

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: {
        id,
        symbol: cryptoAddress.symbol,
        address
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating address', error: error.message });
  }
});

// Get all users
router.get('/users', adminMiddleware, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        u.createdAt,
        COUNT(DISTINCT d.id) as totalDeposits,
        COALESCE(SUM(d.amount), 0) as totalDepositAmount
      FROM users u
      LEFT JOIN deposits d ON u.id = d.userId AND d.status = 'confirmed'
      GROUP BY u.id
      ORDER BY u.createdAt DESC
    `).all();

    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
  }
});

// Get user details
router.get('/user/:userId', adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;

    const user = db.prepare('SELECT id, firstName, lastName, email, createdAt FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const wallets = db.prepare('SELECT * FROM wallets WHERE userId = ?').all(userId);
    const deposits = db.prepare('SELECT * FROM deposits WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const transactions = db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    res.json({
      success: true,
      user: {
        ...user,
        wallets,
        deposits,
        transactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user details', error: error.message });
  }
});

// Get admin logs
router.get('/logs', adminMiddleware, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT 
        l.id,
        l.adminId,
        l.action,
        l.details,
        l.createdAt,
        a.username
      FROM admin_logs l
      JOIN admin_users a ON l.adminId = a.id
      ORDER BY l.createdAt DESC
      LIMIT 100
    `).all();

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching logs', error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', adminMiddleware, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalDeposits = db.prepare('SELECT COUNT(*) as count FROM deposits').get().count;
    const pendingDeposits = db.prepare('SELECT COUNT(*) as count FROM deposits WHERE status = "pending"').get().count;
    const confirmedDeposits = db.prepare('SELECT COUNT(*) as count FROM deposits WHERE status = "confirmed"').get().count;
    const totalDepositAmount = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = "confirmed"').get().total;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDeposits,
        pendingDeposits,
        confirmedDeposits,
        totalDepositAmount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
});

module.exports = router;
