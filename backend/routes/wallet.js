const express = require('express');
const pool = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ✅ GET USER'S TOTAL BALANCE (USD equivalent)
router.get('/total-balance', authMiddleware, async (req, res) => {
  try {
    const balances = await pool.query(
      'SELECT COALESCE(SUM(balance), 0) as totalBalance FROM wallets WHERE userId = $1',
      [req.userId]
    );

    res.json({
      success: true,
      totalBalance: parseFloat(balances.rows[0].totalbalance) || 0
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
router.get('/balances', authMiddleware, async (req, res) => {
  try {
    // ✅ NEW: Check if user has wallets, if not create them with current admin addresses
    const existingWallets = await pool.query(
      'SELECT COUNT(*) as count FROM wallets WHERE userId = $1',
      [req.userId]
    );
    
    const count = parseInt(existingWallets.rows[0].count);
    if (count === 0) {
      // User doesn't have wallets, create them with current admin-set addresses
      try {
        const cryptoAddresses = await pool.query(
          'SELECT cryptocurrency, symbol, address FROM crypto_addresses WHERE isActive = 1'
        );

        for (const crypto of cryptoAddresses.rows) {
          await pool.query(
            'INSERT INTO wallets (userId, currency, address, balance) VALUES ($1, $2, $3, $4)',
            [req.userId, crypto.symbol, crypto.address, 0]
          );
        }

        console.log(`✅ Created ${cryptoAddresses.rows.length} wallets for user on wallet access: ${req.userId}`);
      } catch (walletError) {
        console.error('Warning: Could not create wallets on wallet access:', walletError.message);
      }
    }

    const balances = await pool.query(
      'SELECT id, currency as cryptocurrency, balance, address FROM wallets WHERE userId = $1',
      [req.userId]
    );

    res.json({
      success: true,
      balances: balances.rows || []
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
router.get('/balance/:cryptocurrency', authMiddleware, async (req, res) => {
  try {
    const { cryptocurrency } = req.params;

    const wallet = await pool.query(
      'SELECT balance FROM wallets WHERE userId = $1 AND currency = $2',
      [req.userId, cryptocurrency]
    );

    res.json({
      success: true,
      cryptocurrency,
      balance: wallet.rows.length > 0 ? wallet.rows[0].balance : 0
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
router.post('/deposit', authMiddleware, async (req, res) => {
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
    const result = await pool.query(
      'INSERT INTO deposits (userId, cryptocurrency, amount, walletAddress, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.userId, cryptocurrency, amount, walletAddress, 'pending']
    );

    const depositId = result.rows[0].id;

    console.log(`✅ Deposit submitted: User ${req.userId}, ${amount} ${cryptocurrency}, Status: Pending`);

    res.json({
      success: true,
      message: 'Deposit submitted successfully. Awaiting confirmation.',
      depositId,
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
router.get('/pending-deposits', authMiddleware, async (req, res) => {
  try {
    const deposits = await pool.query(
      `SELECT id, cryptocurrency, amount, walletAddress, status, createdAt
       FROM deposits 
       WHERE userId = $1 AND status = 'pending'
       ORDER BY createdAt DESC`,
      [req.userId]
    );

    res.json({
      success: true,
      pendingDeposits: deposits.rows || []
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
router.get('/deposits', authMiddleware, async (req, res) => {
  try {
    const deposits = await pool.query(
      `SELECT id, cryptocurrency, amount, walletAddress, status, transactionHash, confirmedAt, createdAt
       FROM deposits 
       WHERE userId = $1
       ORDER BY createdAt DESC
       LIMIT 50`,
      [req.userId]
    );

    res.json({
      success: true,
      deposits: deposits.rows || []
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
router.put('/confirm-deposit/:depositId', authMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { transactionHash, notes } = req.body;

    // Get deposit record
    const depositResult = await pool.query(
      'SELECT * FROM deposits WHERE id = $1',
      [depositId]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`
      });
    }

    // Get or create wallet
    let walletResult = await pool.query(
      'SELECT * FROM wallets WHERE userId = $1 AND currency = $2',
      [deposit.userid, deposit.cryptocurrency]
    );

    if (walletResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO wallets (userId, currency, balance, address) VALUES ($1, $2, $3, $4)',
        [deposit.userid, deposit.cryptocurrency, 0, deposit.walletaddress]
      );
      walletResult = await pool.query(
        'SELECT * FROM wallets WHERE userId = $1 AND currency = $2',
        [deposit.userid, deposit.cryptocurrency]
      );
    }

    const wallet = walletResult.rows[0];

    // Update wallet balance
    await pool.query(
      'UPDATE wallets SET balance = balance + $1 WHERE userId = $2 AND currency = $3',
      [deposit.amount, deposit.userid, deposit.cryptocurrency]
    );

    // Update deposit status to confirmed
    await pool.query(
      `UPDATE deposits 
       SET status = 'confirmed', transactionHash = $1, confirmedBy = $2, confirmedAt = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [transactionHash || null, req.userId, depositId]
    );

    // Record transaction
    await pool.query(
      `INSERT INTO transactions (userId, walletId, type, amount, status, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deposit.userid, wallet.id, 'deposit', deposit.amount, 'completed', 'Deposit confirmed by admin']
    );

    console.log(`✅ Deposit confirmed: ID ${depositId}, User ${deposit.userid}, Amount: ${deposit.amount} ${deposit.cryptocurrency}`);

    res.json({
      success: true,
      message: 'Deposit confirmed successfully',
      depositId,
      amount: deposit.amount,
      cryptocurrency: deposit.cryptocurrency,
      newBalance: wallet.balance + deposit.amount
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
router.put('/reject-deposit/:depositId', authMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    const { notes } = req.body;

    // Get deposit record
    const depositResult = await pool.query(
      'SELECT * FROM deposits WHERE id = $1',
      [depositId]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Deposit not found'
      });
    }

    const deposit = depositResult.rows[0];

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`
      });
    }

    // Update deposit status to rejected
    await pool.query(
      `UPDATE deposits 
       SET status = 'rejected', confirmedBy = $1, confirmedAt = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.userId, depositId]
    );

    console.log(`❌ Deposit rejected: ID ${depositId}, User ${deposit.userid}, Amount: ${deposit.amount} ${deposit.cryptocurrency}`);

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
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { cryptocurrency, amount, walletAddress } = req.body;

    if (!cryptocurrency || !amount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Cryptocurrency, amount, and wallet address are required'
      });
    }

    // Check balance
    const wallet = await pool.query(
      'SELECT balance FROM wallets WHERE userId = $1 AND currency = $2',
      [req.userId, cryptocurrency]
    );

    if (wallet.rows.length === 0 || wallet.rows[0].balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Update balance
    await pool.query(
      'UPDATE wallets SET balance = balance - $1 WHERE userId = $2 AND currency = $3',
      [amount, req.userId, cryptocurrency]
    );

    // Get wallet ID for transaction record
    const walletResult = await pool.query(
      'SELECT id FROM wallets WHERE userId = $1 AND currency = $2',
      [req.userId, cryptocurrency]
    );

    // Record transaction
    await pool.query(
      `INSERT INTO transactions (userId, walletId, type, amount, status, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.userId, walletResult.rows[0].id, 'withdrawal', amount, 'completed', `Withdrawal to ${walletAddress}`]
    );

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
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const transactions = await pool.query(
      `SELECT id, type, amount, status, description, createdAt
       FROM transactions 
       WHERE userId = $1 
       ORDER BY createdAt DESC 
       LIMIT 50`,
      [req.userId]
    );

    res.json({
      success: true,
      transactions: transactions.rows || []
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
