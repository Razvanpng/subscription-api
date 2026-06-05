const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : path.join(__dirname, '..', 'subscriptions.db');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'trialing',
    trial_ends_at INTEGER NOT NULL,
    grace_ends_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscription_history (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at INTEGER NOT NULL
  );
`);

module.exports = db;