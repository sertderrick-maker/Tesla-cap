const express = require('express');
const pool = require('../database');

const router = express.Router();

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

module.exports = router;
