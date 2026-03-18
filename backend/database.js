const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// Create database file in backend directory
const dbPath = path.join(__dirname, 'teslascap.db');

let db;
try {
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      verificationCode TEXT,
      isVerified INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      currency TEXT NOT NULL,
      balance REAL DEFAULT 0,
      address TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(userId, currency)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      walletId INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount REAL NOT NULL,
      cryptocurrency TEXT NOT NULL,
      walletAddress TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      transactionHash TEXT,
      confirmedAt DATETIME,
      confirmedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (confirmedBy) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crypto_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cryptocurrency TEXT NOT NULL,
      symbol TEXT NOT NULL,
      address TEXT NOT NULL,
      isActive INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adminId INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (adminId) REFERENCES admin_users(id) ON DELETE CASCADE
    );
  `);

  // Initialize admin user if not exists
  try {
    const adminExists = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync('admin1!', 10);
      db.prepare(`
        INSERT INTO admin_users (username, password, email, role, isActive)
        VALUES (?, ?, ?, ?, ?)
      `).run('admin', hashedPassword, 'admin@teslascap.com', 'admin', 1);
      console.log('✅ Admin user created: admin / admin1!');
    }
  } catch (error) {
    console.log('ℹ️  Admin user already exists');
  }

  // Initialize crypto addresses if not exists
  try {
    const cryptoCount = db.prepare('SELECT COUNT(*) as count FROM crypto_addresses').get().count;
    if (cryptoCount === 0) {
      const addresses = [
        { cryptocurrency: 'Bitcoin', symbol: 'BTC', address: '1A1z7agoat2LWQLQ1qhkzNVrCF5sGHwSqX' },
        { cryptocurrency: 'Ethereum', symbol: 'ETH', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0' },
        { cryptocurrency: 'Litecoin', symbol: 'LTC', address: 'LN2ijVjJrDMsF3sEesuoNWRS6DA7UdADqJ' },
        { cryptocurrency: 'USDT', symbol: 'USDT', address: 'TN3W4H6rK8cKX2oJ7L9M1N3P5R7S9U1V3X' }
      ];

      addresses.forEach(addr => {
        db.prepare(`
          INSERT INTO crypto_addresses (cryptocurrency, symbol, address, isActive)
          VALUES (?, ?, ?, ?)
        `).run(addr.cryptocurrency, addr.symbol, addr.address, 1);
      });
      console.log('✅ Crypto addresses initialized');
    }
  } catch (error) {
    console.log('ℹ️  Crypto addresses already exist');
  }

  console.log('✅ Database initialized at:', dbPath);
  console.log('✅ Admin panel tables created');
  console.log('✅ Crypto addresses configured');
} catch (error) {
  console.error('❌ Database initialization error:', error.message);
  if (error.message.includes('bcryptjs')) {
    console.error('\n⚠️  Please install bcryptjs: npm install bcryptjs');
  }
  process.exit(1);
}

module.exports = db;
