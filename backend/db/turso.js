'use strict';
/**
 * backend/db/turso.js — Turso (libSQL) Connection & Schema
 * ─────────────────────────────────────────────────────────
 * Single client instance. Call connect() once at startup.
 * All queries use parameterised statements (SQL-injection safe).
 *
 * Environment variables required:
 *   TURSO_DATABASE_URL   e.g. libsql://your-db.turso.io
 *   TURSO_AUTH_TOKEN     your Turso auth token
 */

const { createClient } = require('@libsql/client');

let _client = null;

// ── Schema ────────────────────────────────────────────────────
const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uid             TEXT    UNIQUE NOT NULL,
  email           TEXT    UNIQUE NOT NULL,
  password_hash   TEXT,
  display_name    TEXT    DEFAULT '',
  photo_url       TEXT    DEFAULT '',
  role            TEXT    NOT NULL DEFAULT 'User',
  account_status  TEXT    NOT NULL DEFAULT 'active',
  email_verified  INTEGER NOT NULL DEFAULT 0,
  provider        TEXT    DEFAULT 'email',
  bio             TEXT    DEFAULT '',
  preferences     TEXT    DEFAULT '{}',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login      DATETIME
);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT    UNIQUE NOT NULL,
  expires_at    DATETIME NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked       INTEGER  DEFAULT 0
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT    UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used       INTEGER  DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS narratives (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  driver_name       TEXT,
  route             TEXT,
  starting_location TEXT,
  destination       TEXT,
  landmarks         TEXT,
  highlights        TEXT,
  trip_date         TEXT,
  vehicle_type      TEXT    DEFAULT 'Sedan',
  tone              TEXT    DEFAULT 'Adventurous',
  style             TEXT    DEFAULT 'Adventure',
  prompt            TEXT,
  ai_response       TEXT,
  title             TEXT,
  summary           TEXT,
  social_caption    TEXT,
  hashtags          TEXT    DEFAULT '[]',
  image_prompt      TEXT,
  image_url         TEXT,
  visibility        TEXT    DEFAULT 'Public',
  shares_count      INTEGER DEFAULT 0,
  wishlist_count    INTEGER DEFAULT 0,
  avg_rating        REAL,
  ratings_count     INTEGER DEFAULT 0,
  views_count       INTEGER DEFAULT 0,
  rating            INTEGER,
  comment           TEXT,
  firestore_id      TEXT,
  is_deleted        INTEGER DEFAULT 0,
  deleted_at        DATETIME,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ratings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  narrative_id INTEGER NOT NULL REFERENCES narratives(id) ON DELETE CASCADE,
  user_id      TEXT    NOT NULL,
  user_name    TEXT,
  rating       INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review       TEXT    DEFAULT '',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(narrative_id, user_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  narrative_id INTEGER NOT NULL REFERENCES narratives(id) ON DELETE CASCADE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, narrative_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  narrative_id INTEGER NOT NULL REFERENCES narratives(id) ON DELETE CASCADE,
  reported_by  TEXT,
  reason       TEXT    NOT NULL,
  status       TEXT    DEFAULT 'Pending',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME
);

CREATE TABLE IF NOT EXISTS trip_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  narrative_id INTEGER REFERENCES narratives(id) ON DELETE SET NULL,
  user_id      TEXT,
  filename     TEXT,
  mime_type    TEXT,
  data         TEXT,
  size         INTEGER,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  type       TEXT,
  message    TEXT,
  read       INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     TEXT,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  detail       TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_narratives_user    ON narratives(user_id);
CREATE INDEX IF NOT EXISTS idx_narratives_deleted ON narratives(is_deleted);
CREATE INDEX IF NOT EXISTS idx_narratives_created ON narratives(created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_narrative  ON ratings(narrative_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user      ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token     ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_uid          ON users(uid);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
`;

// ── Helpers ───────────────────────────────────────────────────

/** Run a batch of DDL statements from the SCHEMA string */
async function _runSchema(client) {
  // Split on semicolons, filter blanks
  const stmts = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  for (const sql of stmts) {
    await client.execute(sql);
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * connect() — initialize client and ensure schema exists.
 * Call once at server startup; awaited before listen().
 */
async function connect() {
  if (_client) return _client;

  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL is not set in environment variables.\n   → Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in backend/.env');

  // For local file: URLs, authToken is not required
  const isLocal = url.startsWith('file:') || url === ':memory:';
  if (!isLocal && !token) {
    throw new Error('TURSO_AUTH_TOKEN is not set in environment variables.\n   → Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in backend/.env');
  }

  _client = createClient({ url, authToken: token });

  // Verify connectivity
  await _client.execute('SELECT 1');

  // Ensure all tables exist
  await _runSchema(_client);

  console.log('✅ Turso (libSQL) connected and schema applied.');
  return _client;
}

/**
 * execute(sql, args?) — run a single parameterised query.
 * Returns a ResultSet with { rows, columns, rowsAffected, lastInsertRowid }
 */
async function execute(sql, args = []) {
  if (!_client) throw new Error('Turso not connected. Call connect() first.');
  return _client.execute({ sql, args });
}

/**
 * batch(statements) — run multiple statements in a single round-trip.
 * Each statement: { sql, args }
 */
async function batch(statements) {
  if (!_client) throw new Error('Turso not connected. Call connect() first.');
  return _client.batch(statements.map(s => ({ sql: s.sql, args: s.args || [] })));
}

/**
 * isReady() — returns true if the client is initialized.
 */
function isReady() {
  return !!_client;
}

module.exports = { connect, execute, batch, isReady };
