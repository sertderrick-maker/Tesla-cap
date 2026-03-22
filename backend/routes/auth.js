const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId, timestamp: Date.now() },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
}

// ✅ REGISTER - With automatic wallet creation
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if user already exists
    const existingUserResult = await db.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUserResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert user (account created immediately, no verification needed)
    const result = await db.pool.query(
      'INSERT INTO users (firstName, lastName, email, password, isVerified) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [firstName, lastName, email, hashedPassword, 1]
    );

    const userId = result.rows[0].id;

    // ✅ NEW: Fetch all active crypto addresses and create wallets for new user
    try {
      const cryptoResult = await db.pool.query(
        'SELECT cryptocurrency, symbol, address FROM crypto_addresses WHERE isActive = 1'
      );
      const cryptoAddresses = cryptoResult.rows;

      // Create wallet for each cryptocurrency
      for (const crypto of cryptoAddresses) {
        await db.pool.query(
          'INSERT INTO wallets (userId, currency, address, balance) VALUES ($1, $2, $3, $4)',
          [userId, crypto.symbol, crypto.address, 0]
        );
      }

      console.log(`✅ Created ${cryptoAddresses.length} wallets for new user: ${email}`);
    } catch (walletError) {
      console.error('Warning: Could not create wallets for new user:', walletError.message);
      // Don't fail registration if wallet creation fails
    }

    // Generate token immediately
    const token = generateToken(userId);

    console.log(`✅ User registered and verified: ${email} (${firstName} ${lastName})`);

    res.json({
      success: true,
      message: 'Registration successful. You are now logged in.',
      token,
      user: {
        id: userId,
        firstName,
        lastName,
        email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// ✅ LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const userResult = await db.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check password
    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // ✅ NEW: Check if user has wallets, if not create them with current admin addresses
    try {
      const walletResult = await db.pool.query('SELECT COUNT(*) as count FROM wallets WHERE userId = $1', [user.id]);
      const existingWallets = parseInt(walletResult.rows[0].count);
      
      if (existingWallets === 0) {
        // User doesn't have wallets, create them with current admin-set addresses
        const cryptoResult = await db.pool.query(
          'SELECT cryptocurrency, symbol, address FROM crypto_addresses WHERE isActive = 1'
        );
        const cryptoAddresses = cryptoResult.rows;

        for (const crypto of cryptoAddresses) {
          await db.pool.query(
            'INSERT INTO wallets (userId, currency, address, balance) VALUES ($1, $2, $3, $4)',
            [user.id, crypto.symbol, crypto.address, 0]
          );
        }

        console.log(`✅ Created ${cryptoAddresses.length} wallets for existing user on login: ${email}`);
      }
    } catch (walletError) {
      console.error('Warning: Could not create wallets on login:', walletError.message);
      // Don't fail login if wallet creation fails
    }

    console.log(`✅ User logged in: ${email} (${user.firstName} ${user.lastName})`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// ✅ GET PROFILE
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const userResult = await db.pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// ✅ UPDATE PROFILE
router.put('/update-profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const { firstName, lastName, email, dateOfBirth } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Check if new email is already taken by another user
    if (email) {
      const existingResult = await db.pool.query(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, decoded.userId]
      );
      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // Update user
    await db.pool.query(
      'UPDATE users SET firstName = $1, lastName = $2, email = $3, dateOfBirth = $4 WHERE id = $5',
      [firstName, lastName, email, dateOfBirth || null, decoded.userId]
    );

    console.log(`✅ Profile updated: ${email}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: decoded.userId,
        firstName,
        lastName,
        email
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// ✅ CHANGE PASSWORD
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    // Get user
    const userResult = await db.pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const passwordMatch = bcrypt.compareSync(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password
    await db.pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, decoded.userId]);

    console.log(`✅ Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
});

module.exports = router;
