const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database');
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
    pool.query('SELECT * FROM admin_users WHERE id = $1', [decoded.userId], (err, result) => {
      if (err || result.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Not authorized as admin' });
      }

      req.adminId = result.rows[0].id;
      req.admin = result.rows[0];
      next();
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1 AND isActive = 1',
      [username]
    );

    if (admin.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const adminUser = admin.rows[0];
    const passwordMatch = bcrypt.compareSync(password, adminUser.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: adminUser.id, role: 'admin' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Log admin login
    await pool.query(
      'INSERT INTO admin_logs (adminId, action, details) VALUES ($1, $2, $3)',
      [adminUser.id, 'LOGIN', `Admin ${adminUser.username} logged in`]
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

// Get pending deposits
router.get('/pending-deposits', adminMiddleware, async (req, res) => {
  try {
    const deposits = await pool.query(`
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
    `);

    res.json({
      success: true,
      deposits: deposits.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Get all deposits
router.get('/all-deposits', adminMiddleware, async (req, res) => {
  try {
    const deposits = await pool.query(`
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
    `);

    res.json({
      success: true,
      deposits: deposits.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Confirm deposit
router.put('/confirm-deposit/:depositId', adminMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { transactionHash } = req.body;

    const deposit = await pool.query('SELECT * FROM deposits WHERE id = $1', [depositId]);
    if (deposit.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    const depositData = deposit.rows[0];
    if (depositData.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    await pool.query(
      `UPDATE deposits
       SET status = 'confirmed', confirmedAt = CURRENT_TIMESTAMP, confirmedBy = $1, transactionHash = $2
       WHERE id = $3`,
      [req.adminId, transactionHash || null, depositId]
    );

    // Get or create wallet for user
    let wallet = await pool.query(
      'SELECT * FROM wallets WHERE userId = $1 AND currency = $2',
      [depositData.userid, depositData.cryptocurrency]
    );

    if (wallet.rows.length === 0) {
      await pool.query(
        'INSERT INTO wallets (userId, currency, balance) VALUES ($1, $2, $3)',
        [depositData.userid, depositData.cryptocurrency, depositData.amount]
      );
      wallet = await pool.query(
        'SELECT * FROM wallets WHERE userId = $1 AND currency = $2',
        [depositData.userid, depositData.cryptocurrency]
      );
    } else {
      // Update existing wallet balance
      await pool.query(
        'UPDATE wallets SET balance = balance + $1 WHERE id = $2',
        [depositData.amount, wallet.rows[0].id]
      );
    }

    // Create transaction record
    await pool.query(
      `INSERT INTO transactions (userId, walletId, type, amount, status, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        depositData.userid,
        wallet.rows[0].id,
        'deposit',
        depositData.amount,
        'completed',
        `Deposit of ${depositData.amount} ${depositData.cryptocurrency}`
      ]
    );

    // Log action
    await pool.query(
      'INSERT INTO admin_logs (adminId, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'CONFIRM_DEPOSIT', `Confirmed deposit of ${depositData.amount} ${depositData.cryptocurrency} for user ${depositData.userid}`]
    );

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
router.put('/reject-deposit/:depositId', adminMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { reason } = req.body;

    const deposit = await pool.query('SELECT * FROM deposits WHERE id = $1', [depositId]);
    if (deposit.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    const depositData = deposit.rows[0];
    if (depositData.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    await pool.query(
      'UPDATE deposits SET status = $1 WHERE id = $2',
      ['rejected', depositId]
    );

    // Log action
    await pool.query(
      'INSERT INTO admin_logs (adminId, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'REJECT_DEPOSIT', `Rejected deposit of ${depositData.amount} ${depositData.cryptocurrency} for user ${depositData.userid}. Reason: ${reason || 'No reason provided'}`]
    );

    res.json({
      success: true,
      message: 'Deposit rejected successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rejecting deposit', error: error.message });
  }
});

// Get crypto addresses (ADMIN ONLY)
router.get('/crypto-addresses', adminMiddleware, async (req, res) => {
  try {
    const addresses = await pool.query(`
      SELECT id, cryptocurrency, symbol, address, isActive, createdAt, updatedAt
      FROM crypto_addresses
      ORDER BY symbol ASC
    `);

    res.json({
      success: true,
      addresses: addresses.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching addresses', error: error.message });
  }
});

// PUBLIC: Get crypto addresses (NO AUTHENTICATION REQUIRED)
router.get('/crypto-addresses-public', async (req, res) => {
  try {
    const addresses = await pool.query(`
      SELECT id, cryptocurrency, symbol, address, isActive, createdAt, updatedAt
      FROM crypto_addresses
      WHERE isActive = 1
      ORDER BY symbol ASC
    `);

    res.json({
      success: true,
      addresses: addresses.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching addresses', error: error.message });
  }
});

// Update crypto address
router.put('/crypto-address/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }

    const cryptoAddress = await pool.query('SELECT * FROM crypto_addresses WHERE id = $1', [id]);
    if (cryptoAddress.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Crypto address not found' });
    }

    const crypto = cryptoAddress.rows[0];
    await pool.query(
      'UPDATE crypto_addresses SET address = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2',
      [address, id]
    );

    // Log action
    await pool.query(
      'INSERT INTO admin_logs (adminId, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'UPDATE_ADDRESS', `Updated ${crypto.symbol} address to ${address}`]
    );

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: {
        id,
        symbol: crypto.symbol,
        address
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating address', error: error.message });
  }
});

// Get all users
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const users = await pool.query(`
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
    `);

    res.json({
      success: true,
      users: users.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
  }
});

// Get user details
router.get('/user/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await pool.query('SELECT id, firstName, lastName, email, createdAt FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const wallets = await pool.query('SELECT * FROM wallets WHERE userId = $1', [userId]);
    const deposits = await pool.query('SELECT * FROM deposits WHERE userId = $1 ORDER BY createdAt DESC', [userId]);
    const transactions = await pool.query('SELECT * FROM transactions WHERE userId = $1 ORDER BY createdAt DESC', [userId]);

    res.json({
      success: true,
      user: {
        ...user.rows[0],
        wallets: wallets.rows,
        deposits: deposits.rows,
        transactions: transactions.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user details', error: error.message });
  }
});

// Get admin logs
router.get('/logs', adminMiddleware, async (req, res) => {
  try {
    const logs = await pool.query(`
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
    `);

    res.json({
      success: true,
      logs: logs.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching logs', error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalDeposits = await pool.query('SELECT COUNT(*) as count FROM deposits');
    const pendingDeposits = await pool.query('SELECT COUNT(*) as count FROM deposits WHERE status = $1', ['pending']);
    const confirmedDeposits = await pool.query('SELECT COUNT(*) as count FROM deposits WHERE status = $1', ['confirmed']);
    const totalDepositAmount = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = $1', ['confirmed']);

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        totalDeposits: parseInt(totalDeposits.rows[0].count),
        pendingDeposits: parseInt(pendingDeposits.rows[0].count),
        confirmedDeposits: parseInt(confirmedDeposits.rows[0].count),
        totalDepositAmount: parseFloat(totalDepositAmount.rows[0].total)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
});

module.exports = router;
