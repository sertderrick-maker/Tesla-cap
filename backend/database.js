const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        verificationCode TEXT,
        isVerified INTEGER DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create wallets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        userId INTEGER NOT NULL,
        currency TEXT NOT NULL,
        balance REAL DEFAULT 0,
        address TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(userId, currency)
      );
    `);

    // Create transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        userId INTEGER NOT NULL,
        walletId INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        description TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE CASCADE
      );
    `);

    // Create investments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id SERIAL PRIMARY KEY,
        userId INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Create deposits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id SERIAL PRIMARY KEY,
        userId INTEGER NOT NULL,
        amount REAL NOT NULL,
        cryptocurrency TEXT NOT NULL,
        walletAddress TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        transactionHash TEXT,
        confirmedAt TIMESTAMP,
        confirmedBy INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (confirmedBy) REFERENCES admin_users(id)
      );
    `);

    // Create admin_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'admin',
        isActive INTEGER DEFAULT 1,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create crypto_addresses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crypto_addresses (
        id SERIAL PRIMARY KEY,
        cryptocurrency TEXT NOT NULL,
        symbol TEXT NOT NULL,
        address TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create admin_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        adminId INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (adminId) REFERENCES admin_users(id) ON DELETE CASCADE
      );
    `);

    // Initialize admin user if not exists
    try {
      const adminResult = await pool.query('SELECT * FROM admin_users WHERE username = $1', ['admin']);
      if (adminResult.rows.length === 0) {
        const hashedPassword = bcrypt.hashSync('admin1!', 10);
        await pool.query(
          'INSERT INTO admin_users (username, password, email, role, isActive) VALUES ($1, $2, $3, $4, $5)',
          ['admin', hashedPassword, 'admin@teslascap.com', 'admin', 1]
        );
        console.log('✅ Admin user created: admin / admin1!');
      }
    } catch (error) {
      console.log('ℹ️  Admin user already exists');
    }

    // Initialize crypto addresses if not exists
    try {
      const cryptoResult = await pool.query('SELECT COUNT(*) as count FROM crypto_addresses');
      if (parseInt(cryptoResult.rows[0].count) === 0) {
        const addresses = [
          { cryptocurrency: 'Bitcoin', symbol: 'BTC', address: '1A1z7agoat2LWQLQ1qhkzNVrCF5sGHwSqX' },
          { cryptocurrency: 'Ethereum', symbol: 'ETH', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0' },
          { cryptocurrency: 'Litecoin', symbol: 'LTC', address: 'LN2ijVjJrDMsF3sEesuoNWRS6DA7UdADqJ' },
          { cryptocurrency: 'USDT', symbol: 'USDT', address: 'TN3W4H6rK8cKX2oJ7L9M1N3P5R7S9U1V3X' }
        ];

        for (const addr of addresses) {
          await pool.query(
            'INSERT INTO crypto_addresses (cryptocurrency, symbol, address, isActive) VALUES ($1, $2, $3, $4)',
            [addr.cryptocurrency, addr.symbol, addr.address, 1]
          );
        }
        console.log('✅ Crypto addresses initialized');
      }
    } catch (error) {
      console.log('ℹ️  Crypto addresses already exist');
    }

    console.log('✅ PostgreSQL Database initialized');
    console.log('✅ Admin panel tables created');
    console.log('✅ Crypto addresses configured');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    process.exit(1);
  }
}

// Initialize on startup
initializeDatabase();

// Wrapper for prepare and run (for compatibility with existing code)
const db = {
  prepare: (sql) => {
    return {
      run: (...params) => {
        return pool.query(sql, params);
      },
      get: (...params) => {
        return pool.query(sql, params);
      },
      all: (...params) => {
        return pool.query(sql, params);
      }
    };
  },
  exec: (sql) => {
    return pool.query(sql);
  },
  query: (sql, params) => {
    return pool.query(sql, params);
  }
};

module.exports = db;
module.exports.pool = pool;
