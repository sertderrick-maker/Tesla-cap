const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();

// Admin middleware to verify admin token
const adminMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    if (!decoded || decoded.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    req.adminId = decoded.userId;
    next();
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

    // Query admin_users table - note: isactive is lowercase
    const admin = await db.query(
      'SELECT * FROM admin_users WHERE username = $1 AND isactive = 1',
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
    try {
      await db.query(
        'INSERT INTO admin_logs (adminid, action, details) VALUES ($1, $2, $3)',
        [adminUser.id, 'LOGIN', `Admin ${adminUser.username} logged in`]
      );
    } catch (logError) {
      console.error('Error logging admin login:', logError.message);
      // Don't fail login if logging fails
    }

    console.log(`✅ Admin logged in: ${adminUser.username}`);

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
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

// Get pending deposits
router.get('/pending-deposits', adminMiddleware, async (req, res) => {
  try {
    const deposits = await db.query(`
      SELECT 
        d.id,
        d.userid,
        d.amount,
        d.cryptocurrency,
        d.walletaddress,
        d.status,
        d.createdat,
        u.firstname,
        u.lastname,
        u.email
      FROM deposits d
      JOIN users u ON d.userid = u.id
      WHERE d.status = 'pending'
      ORDER BY d.createdat DESC
    `);

    res.json({
      success: true,
      deposits: deposits.rows
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Get all deposits
router.get('/all-deposits', adminMiddleware, async (req, res) => {
  try {
    const deposits = await db.query(`
      SELECT 
        d.id,
        d.userid,
        d.amount,
        d.cryptocurrency,
        d.walletaddress,
        d.status,
        d.createdat,
        d.confirmedat,
        u.firstname,
        u.lastname,
        u.email
      FROM deposits d
      JOIN users u ON d.userid = u.id
      ORDER BY d.createdat DESC
    `);

    res.json({
      success: true,
      deposits: deposits.rows
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ success: false, message: 'Error fetching deposits', error: error.message });
  }
});

// Confirm deposit
router.put('/confirm-deposit/:depositId', adminMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { transactionHash } = req.body;

    const deposit = await db.query('SELECT * FROM deposits WHERE id = $1', [depositId]);
    if (deposit.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    const depositData = deposit.rows[0];
    if (depositData.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    await db.query(
      `UPDATE deposits
       SET status = 'confirmed', confirmedat = CURRENT_TIMESTAMP, confirmedby = $1, transactionhash = $2
       WHERE id = $3`,
      [req.adminId, transactionHash || null, depositId]
    );

    // Get or create wallet for user
    let wallet = await db.query(
      'SELECT * FROM wallets WHERE userid = $1 AND currency = $2',
      [depositData.userid, depositData.cryptocurrency]
    );

    if (wallet.rows.length === 0) {
      await db.query(
        'INSERT INTO wallets (userid, currency, balance) VALUES ($1, $2, $3)',
        [depositData.userid, depositData.cryptocurrency, depositData.amount]
      );
      wallet = await db.query(
        'SELECT * FROM wallets WHERE userid = $1 AND currency = $2',
        [depositData.userid, depositData.cryptocurrency]
      );
    } else {
      // Update existing wallet balance
      await db.query(
        'UPDATE wallets SET balance = balance + $1 WHERE id = $2',
        [depositData.amount, wallet.rows[0].id]
      );
    }

    // Create transaction record
    await db.query(
      `INSERT INTO transactions (userid, walletid, type, amount, status, description)
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
    await db.query(
      'INSERT INTO admin_logs (adminid, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'CONFIRM_DEPOSIT', `Confirmed deposit of ${depositData.amount} ${depositData.cryptocurrency} for user ${depositData.userid}`]
    );

    console.log(`✅ Deposit confirmed: ${depositId}`);

    res.json({
      success: true,
      message: 'Deposit confirmed successfully',
      deposit: {
        id: depositId,
        status: 'confirmed',
        confirmedat: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error confirming deposit:', error);
    res.status(500).json({ success: false, message: 'Error confirming deposit', error: error.message });
  }
});

// Reject deposit
router.put('/reject-deposit/:depositId', adminMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { reason } = req.body;

    const deposit = await db.query('SELECT * FROM deposits WHERE id = $1', [depositId]);
    if (deposit.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    const depositData = deposit.rows[0];
    if (depositData.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit already processed' });
    }

    // Update deposit status
    await db.query(
      'UPDATE deposits SET status = $1 WHERE id = $2',
      ['rejected', depositId]
    );

    // Log action
    await db.query(
      'INSERT INTO admin_logs (adminid, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'REJECT_DEPOSIT', `Rejected deposit of ${depositData.amount} ${depositData.cryptocurrency} for user ${depositData.userid}. Reason: ${reason || 'No reason provided'}`]
    );

    console.log(`✅ Deposit rejected: ${depositId}`);

    res.json({
      success: true,
      message: 'Deposit rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    res.status(500).json({ success: false, message: 'Error rejecting deposit', error: error.message });
  }
});

// Get crypto addresses (ADMIN ONLY)
router.get('/crypto-addresses', adminMiddleware, async (req, res) => {
  try {
    const addresses = await db.query(`
      SELECT id, cryptocurrency, symbol, address, isactive, createdat, updatedat
      FROM crypto_addresses
      ORDER BY symbol ASC
    `);

    res.json({
      success: true,
      addresses: addresses.rows
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ success: false, message: 'Error fetching addresses', error: error.message });
  }
});

// PUBLIC: Get crypto addresses (NO AUTHENTICATION REQUIRED)
router.get('/crypto-addresses-public', async (req, res) => {
  try {
    const addresses = await db.query(`
      SELECT id, cryptocurrency, symbol, address, isactive, createdat, updatedat
      FROM crypto_addresses
      WHERE isactive = 1
      ORDER BY symbol ASC
    `);

    res.json({
      success: true,
      addresses: addresses.rows
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
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

    const cryptoAddress = await db.query('SELECT * FROM crypto_addresses WHERE id = $1', [id]);
    if (cryptoAddress.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Crypto address not found' });
    }

    const crypto = cryptoAddress.rows[0];
    await db.query(
      'UPDATE crypto_addresses SET address = $1, updatedat = CURRENT_TIMESTAMP WHERE id = $2',
      [address, id]
    );

    // Log action
    await db.query(
      'INSERT INTO admin_logs (adminid, action, details) VALUES ($1, $2, $3)',
      [req.adminId, 'UPDATE_ADDRESS', `Updated ${crypto.symbol} address to ${address}`]
    );

    console.log(`✅ Address updated: ${crypto.symbol}`);

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
    console.error('Error updating address:', error);
    res.status(500).json({ success: false, message: 'Error updating address', error: error.message });
  }
});

// Get admin logs
router.get('/logs', adminMiddleware, async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT id, adminid, action, details, createdat
      FROM admin_logs
      ORDER BY createdat DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      logs: logs.rows
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, message: 'Error fetching logs', error: error.message });
  }
});

// Get dashboard stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await db.query('SELECT COUNT(*) as count FROM users');
    const totalDeposits = await db.query('SELECT SUM(amount) as total FROM deposits WHERE status = \'confirmed\'');
    const pendingDeposits = await db.query('SELECT COUNT(*) as count FROM deposits WHERE status = \'pending\'');

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        totalDeposits: totalDeposits.rows[0].total || 0,
        pendingDeposits: parseInt(pendingDeposits.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
});

module.exports = router;
