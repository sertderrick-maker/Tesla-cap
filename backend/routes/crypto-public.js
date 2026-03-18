const express = require('express');
const db = require('../database');

const router = express.Router();

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

module.exports = router;
