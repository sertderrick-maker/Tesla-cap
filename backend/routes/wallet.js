const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ✅ GET USER'S TOTAL BALANCE (USD equivalent)
router.get('/total-balance', authMiddleware, (req, res) => {
  try {
    const balances = db.prepare(`
      SELECT SUM(balance) as totalBalance FROM wallets WHERE userId = ?
    `).get(req.userId);

    res.json({
      success: true,
      totalBalance: balances?.totalBalance || 0
    });
  } catch (error) {
    console.error('Get total balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch total balance',
      error: error.message
    });
  }
});

// ✅ GET ALL WALLET BALANCES FOR USER
router.get('/balances', authMiddleware, (req, res) => {
  try {
    // ✅ NEW: Check if user has wallets, if not create them with current admin addresses
    const existingWallets = db.prepare('SELECT COUNT(*) as count FROM wallets WHERE userId = ?').get(req.userId).count;
    
    if (existingWallets === 0) {
      // User doesn't have wallets, create them with current admin-set addresses
      try {
        const cryptoAddresses = db.prepare(`
          SELECT cryptocurrency, symbol, address 
          FROM crypto_addresses 
          WHERE isActive = 1
        `).all();

        for (const crypto of cryptoAddresses) {
          db.prepare(`
            INSERT INTO wallets (userId, currency, address, balance)
            VALUES (?, ?, ?, ?)
          `).run(req.userId, crypto.symbol, crypto.address, 0);
        }

        console.log(`✅ Created ${cryptoAddresses.length} wallets for user on wallet access: ${req.userId}`);
      } catch (walletError) {
        console.error('Warning: Could not create wallets on wallet access:', walletError.message);
      }
    }

    const balances = db.prepare(`
      SELECT id, cryptocurrency, balance, address FROM wallets WHERE userId = ?
    `).all(req.userId);

    res.json({
      success: true,
      balances: balances || []
    });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balances',
      error: error.message
    });
  }
});

// ✅ GET SPECIFIC CRYPTOCURRENCY BALANCE
router.get('/balance/:cryptocurrency', authMiddleware, (req, res) => {
  try {
    const { cryptocurrency } = req.params;

    const wallet = db.prepare(`
      SELECT balance FROM wallets WHERE userId = ? AND cryptocurrency = ?
    `).get(req.userId, cryptocurrency);

    res.json({
      success: true,
      cryptocurrency,
      balance: wallet ? wallet.balance : 0
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balance',
      error: error.message
    });
  }
});

// ✅ SUBMIT DEPOSIT (Creates pending deposit record)
router.post('/deposit', authMiddleware, (req, res) => {
  try {
    const { cryptocurrency, amount, walletAddress } = req.body;

    if (!cryptocurrency || !amount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Cryptocurrency, amount, and wallet address are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Create pending deposit record
    const result = db.prepare(`
      INSERT INTO deposits (userId, cryptocurrency, amount, walletAddress, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, cryptocurrency, amount, walletAddress, 'pending');

    console.log(`✅ Deposit submitted: User ${req.userId}, ${amount} ${cryptocurrency}, Status: Pending`);

    res.json({
      success: true,
      message: 'Deposit submitted successfully. Awaiting confirmation.',
      depositId: result.lastID,
      amount,
      cryptocurrency,
      status: 'pending'
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Deposit submission failed',
      error: error.message
    });
  }
});

// ✅ GET PENDING DEPOSITS FOR USER
router.get('/pending-deposits', authMiddleware, (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT id, cryptocurrency, amount, walletAddress, status, createdAt
      FROM deposits 
      WHERE userId = ? AND status = 'pending'
      ORDER BY createdAt DESC
    `).all(req.userId);

    res.json({
      success: true,
      pendingDeposits: deposits || []
    });
  } catch (error) {
    console.error('Get pending deposits error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending deposits',
      error: error.message
    });
  }
});

// ✅ GET ALL DEPOSITS FOR USER (including confirmed)
router.get('/deposits', authMiddleware, (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT id, cryptocurrency, amount, walletAddress, status, transactionHash, confirmedAt, createdAt
      FROM deposits 
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT 50
    `).all(req.userId);

    res.json({
      success: true,
      deposits: deposits || []
    });
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deposits',
      error: error.message
    });
  }
});

// ✅ ADMIN: CONFIRM DEPOSIT (Updates balance and marks deposit as completed)
router.put('/confirm-deposit/:depositId', authMiddleware, (req, res) => {
  try {
    const { depositId } = req.params;
    const { transactionHash, notes } = req.body;

    // Get deposit record
    const deposit = db.prepare(`
      SELECT * FROM deposits WHERE id = ?
    `).get(depositId);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`
      });
    }

    // Get or create wallet
    let wallet = db.prepare(`
      SELECT * FROM wallets WHERE userId = ? AND cryptocurrency = ?
    `).get(deposit.userId, deposit.cryptocurrency);

    if (!wallet) {
      db.prepare(`
        INSERT INTO wallets (userId, cryptocurrency, balance, address)
        VALUES (?, ?, ?, ?)
      `).run(deposit.userId, deposit.cryptocurrency, 0, deposit.walletAddress);
    }

    // Update wallet balance
    db.prepare(`
      UPDATE wallets 
      SET balance = balance + ? 
      WHERE userId = ? AND cryptocurrency = ?
    `).run(deposit.amount, deposit.userId, deposit.cryptocurrency);

    // Update deposit status to confirmed
    db.prepare(`
      UPDATE deposits 
      SET status = 'confirmed', transactionHash = ?, confirmedBy = ?, confirmedAt = CURRENT_TIMESTAMP, notes = ?
      WHERE id = ?
    `).run(transactionHash || null, req.userId, notes || null, depositId);

    // Record transaction
    db.prepare(`
      INSERT INTO transactions (userId, cryptocurrency, type, amount, walletAddress, status, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(deposit.userId, deposit.cryptocurrency, 'deposit', deposit.amount, deposit.walletAddress, 'completed', `Deposit confirmed by admin`);

    console.log(`✅ Deposit confirmed: ID ${depositId}, User ${deposit.userId}, Amount: ${deposit.amount} ${deposit.cryptocurrency}`);

    res.json({
      success: true,
      message: 'Deposit confirmed successfully',
      depositId,
      amount: deposit.amount,
      cryptocurrency: deposit.cryptocurrency,
      newBalance: wallet ? wallet.balance + deposit.amount : deposit.amount
    });
  } catch (error) {
    console.error('Confirm deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm deposit',
      error: error.message
    });
  }
});

// ✅ REJECT DEPOSIT
router.put('/reject-deposit/:depositId', authMiddleware, (req, res) => {
  try {
    const { depositId } = req.params;
    const { notes } = req.body;

    // Get deposit record
    const deposit = db.prepare(`
      SELECT * FROM deposits WHERE id = ?
    `).get(depositId);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`
      });
    }

    // Update deposit status to rejected
    db.prepare(`
      UPDATE deposits 
      SET status = 'rejected', confirmedBy = ?, confirmedAt = CURRENT_TIMESTAMP, notes = ?
      WHERE id = ?
    `).run(req.userId, notes || null, depositId);

    console.log(`❌ Deposit rejected: ID ${depositId}, User ${deposit.userId}, Amount: ${deposit.amount} ${deposit.cryptocurrency}`);

    res.json({
      success: true,
      message: 'Deposit rejected successfully',
      depositId
    });
  } catch (error) {
    console.error('Reject deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject deposit',
      error: error.message
    });
  }
});

// ✅ WITHDRAW FUNDS
router.post('/withdraw', authMiddleware, (req, res) => {
  try {
    const { cryptocurrency, amount, walletAddress } = req.body;

    if (!cryptocurrency || !amount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Cryptocurrency, amount, and wallet address are required'
      });
    }

    // Check balance
    const wallet = db.prepare(`
      SELECT balance FROM wallets WHERE userId = ? AND cryptocurrency = ?
    `).get(req.userId, cryptocurrency);

    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Update balance
    db.prepare(`
      UPDATE wallets 
      SET balance = balance - ? 
      WHERE userId = ? AND cryptocurrency = ?
    `).run(amount, req.userId, cryptocurrency);

    // Record transaction
    db.prepare(`
      INSERT INTO transactions (userId, cryptocurrency, type, amount, walletAddress, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.userId, cryptocurrency, 'withdrawal', amount, walletAddress, 'completed');

    console.log(`✅ Withdrawal successful: User ${req.userId}, ${amount} ${cryptocurrency}`);

    res.json({
      success: true,
      message: 'Withdrawal successful',
      amount,
      cryptocurrency
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({
      success: false,
      message: 'Withdrawal failed',
      error: error.message
    });
  }
});

// ✅ GET TRANSACTION HISTORY
router.get('/transactions', authMiddleware, (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT id, cryptocurrency, type, amount, walletAddress, status, description, createdAt
      FROM transactions 
      WHERE userId = ? 
      ORDER BY createdAt DESC 
      LIMIT 50
    `).all(req.userId);

    res.json({
      success: true,
      transactions: transactions || []
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

module.exports = router;
