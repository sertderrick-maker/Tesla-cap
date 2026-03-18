-- Database Migration: Remove Email Verification Fields
-- Run this SQL to update your database

-- Option 1: If you want to keep the table structure but just remove the verification columns
-- ALTER TABLE users DROP COLUMN verificationCode;
-- ALTER TABLE users DROP COLUMN isVerified;

-- Option 2: Recreate the users table with simplified schema (RECOMMENDED)
-- First, backup your existing data if needed

-- Drop the old table
DROP TABLE IF EXISTS users;

-- Create new simplified users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  dateOfBirth TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster email lookups
CREATE INDEX idx_users_email ON users(email);

-- If you have existing data and want to migrate it:
-- INSERT INTO users_new (id, firstName, lastName, email, password, createdAt)
-- SELECT id, firstName, lastName, email, password, createdAt FROM users_old;
