const express = require('express');
const db = require('../database');
const { sendGiveawayRegistration, sendTestMessage } = require('../services/telegramService');
const { verifyToken } = require('../utils/jwt');

const router = express.Router();

/**
 * POST /api/giveaway/register
 * Register for a giveaway and send details to Telegram
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, country, message, giveawayId, giveawayName } = req.body;

    // Validate required fields
    if (!fullName || !email || !phone || !country) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fullName, email, phone, country'
      });
    }

    // Get user ID from token if available
    const token = req.headers.authorization?.split(' ')[1];
    let userId = null;

    if (token) {
      try {
        const decoded = verifyToken(token);
        userId = decoded?.userId;
      } catch (error) {
        // Token verification failed, but we'll continue without user ID
      }
    }

    // Save registration to database
    try {
      db.prepare(`
        INSERT INTO giveaway_registrations 
        (userId, fullName, email, phone, country, message, giveawayId, giveawayName, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId || null,
        fullName,
        email,
        phone,
        country,
        message || null,
        giveawayId || null,
        giveawayName || 'Unknown Giveaway',
        'pending'
      );
    } catch (dbError) {
      console.log('ℹ️  Database table might not exist yet, continuing with Telegram send');
    }

    // Send to Telegram
    const registrationData = {
      fullName,
      email,
      phone,
      country,
      message
    };

    const telegramResult = await sendGiveawayRegistration(
      registrationData,
      giveawayName || 'Unknown Giveaway'
    );

    res.json({
      success: true,
      message: 'Registration submitted successfully',
      telegramStatus: telegramResult.success,
      details: {
        fullName,
        email,
        phone,
        country,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process registration',
      error: error.message
    });
  }
});

/**
 * POST /api/giveaway/test-telegram
 * Test the Telegram bot connection
 */
router.post('/test-telegram', async (req, res) => {
  try {
    const result = await sendTestMessage();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test message',
      error: error.message
    });
  }
});

/**
 * GET /api/giveaway/registrations
 * Get all giveaway registrations (admin only)
 */
router.get('/registrations', async (req, res) => {
  try {
    const registrations = db.prepare(`
      SELECT * FROM giveaway_registrations
      ORDER BY createdAt DESC
    `).all();

    res.json({
      success: true,
      registrations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations',
      error: error.message
    });
  }
});

/**
 * GET /api/giveaway/registrations/:giveawayId
 * Get registrations for a specific giveaway
 */
router.get('/registrations/:giveawayId', async (req, res) => {
  try {
    const { giveawayId } = req.params;

    const registrations = db.prepare(`
      SELECT * FROM giveaway_registrations
      WHERE giveawayId = ?
      ORDER BY createdAt DESC
    `).all(giveawayId);

    res.json({
      success: true,
      giveawayId,
      count: registrations.length,
      registrations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations',
      error: error.message
    });
  }
});

module.exports = router;
