/**
 * database.js — sql.js (pure WebAssembly SQLite)
 * No native compilation required — works on any Node.js version.
 *
 * Exports a function-based API so routes never touch raw SQL directly.
 * Call db.init() once at server startup (awaited before listen()).
 * The DB is persisted to disk as a binary .db file after every write.
 *
 * Schema v3: added is_deleted + deleted_at for soft-delete support.
 */

const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'trips.db');

let SQL = null;  // sql.js constructor
let db  = null;  // open Database instance

// ── Persistence helpers ─────────────────────────────────────
function saveDb() {
  const data   = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Run SELECT → array of plain objects */
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Run SELECT → first row or null */
function queryOne(sql, params = []) {
  return query(sql, params)[0] ?? null;
}

/** Run INSERT / UPDATE / DELETE — saves DB to disk */
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ── Lifecycle ───────────────────────────────────────────────
async function init() {
  SQL = await require('sql.js')();

  // Ensure DB directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  // Load existing file or create new DB
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  // ── Schema v3 ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      driver_name   TEXT     NOT NULL,
      route         TEXT     NOT NULL,
      landmarks     TEXT,
      highlights    TEXT,
      trip_date     TEXT,
      vehicle_type  TEXT     DEFAULT 'Sedan',
      tone          TEXT     DEFAULT 'Adventurous',
      prompt        TEXT,
      ai_response   TEXT     NOT NULL,
      title         TEXT,
      summary       TEXT     DEFAULT NULL,
      social_caption TEXT    DEFAULT NULL,
      starting_location TEXT DEFAULT NULL,
      destination   TEXT     DEFAULT NULL,
      style         TEXT     DEFAULT 'Adventure',
      rating        INTEGER  DEFAULT NULL,
      comment       TEXT     DEFAULT NULL,
      user_id       TEXT     DEFAULT NULL,
      firestore_id  TEXT     DEFAULT NULL,
      is_deleted    INTEGER  DEFAULT 0,
      deleted_at    TEXT     DEFAULT NULL,
      created_at    TEXT     DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  // ── Migration: add new columns to existing DB ─────────────
  // Safe to run even if columns already exist — we catch the error.
  const migrateColumns = [
    "ALTER TABLE generations ADD COLUMN user_id TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN firestore_id TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN summary TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN social_caption TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN starting_location TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN destination TEXT DEFAULT NULL",
    "ALTER TABLE generations ADD COLUMN style TEXT DEFAULT 'Adventure'",
    "ALTER TABLE generations ADD COLUMN is_deleted INTEGER DEFAULT 0",
    "ALTER TABLE generations ADD COLUMN deleted_at TEXT DEFAULT NULL",
  ];
  migrateColumns.forEach(sql => {
    try { db.run(sql); } catch (_) { /* column already exists */ }
  });

  saveDb();
  console.log(`✅ SQLite (sql.js/WASM) ready at: ${DB_PATH}`);
}

// ── Generations ─────────────────────────────────────────────
function insertGeneration({
  driverName, route, landmarks, highlights, tripDate,
  vehicleType, tone, prompt, aiResponse, title,
  summary, socialCaption, startingLocation, destination, style,
  userId = null, firestoreId = null,
}) {
  run(
    `INSERT INTO generations
       (driver_name, route, landmarks, highlights, trip_date, vehicle_type,
        tone, prompt, ai_response, title, summary, social_caption, starting_location, destination, style, user_id, firestore_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      driverName, route,
      landmarks   ?? null, highlights ?? null, tripDate ?? null,
      vehicleType ?? 'Sedan', tone ?? 'Adventurous',
      prompt, aiResponse, title ?? null,
      summary ?? null, socialCaption ?? null, startingLocation ?? null, destination ?? null, style ?? 'Adventure',
      userId ?? null, firestoreId ?? null,
    ]
  );
  return queryOne('SELECT last_insert_rowid() as id')?.id ?? null;
}

function updateFirestoreId(sqliteId, firestoreId) {
  run('UPDATE generations SET firestore_id = ? WHERE id = ?', [firestoreId, sqliteId]);
}

function getGenerations({ page = 1, limit = 12, search = '', userId = null } = {}) {
  const offset = (page - 1) * limit;
  // Always exclude soft-deleted records
  const conditions = ['(is_deleted = 0 OR is_deleted IS NULL)'];
  const params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }
  if (search) {
    conditions.push('(driver_name LIKE ? OR route LIKE ? OR title LIKE ?)');
    const t = `%${search}%`;
    params.push(t, t, t);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const total = queryOne(`SELECT COUNT(*) as count FROM generations ${where}`, params)?.count ?? 0;
  const data  = query(
    `SELECT id, driver_name, route, landmarks, highlights, trip_date,
            vehicle_type, tone, title, summary, social_caption, starting_location, destination, style, rating, comment, user_id,
            firestore_id, created_at
     FROM generations ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { data, total };
}

function getGeneration(id) {
  // Only return non-deleted records
  return queryOne('SELECT * FROM generations WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)', [id]);
}

function updateRating(id, rating, comment) {
  run('UPDATE generations SET rating = ?, comment = ? WHERE id = ?', [rating, comment ?? null, id]);
}

/**
 * Soft-delete: marks a generation as deleted but preserves the record.
 * Sets is_deleted = 1 and records the deletion timestamp.
 * The record can be recovered later by calling restoreGeneration().
 */
function deleteGeneration(id) {
  run(
    `UPDATE generations SET is_deleted = 1, deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
    [id]
  );
}

/**
 * Restore a soft-deleted generation.
 */
function restoreGeneration(id) {
  run('UPDATE generations SET is_deleted = 0, deleted_at = NULL WHERE id = ?', [id]);
}

// ── Analytics ────────────────────────────────────────────────
function getAnalytics() {
  const activeFilter = '(is_deleted = 0 OR is_deleted IS NULL)';
  const total      = queryOne(`SELECT COUNT(*) as total FROM generations WHERE ${activeFilter}`)?.total ?? 0;
  const avgRating  = queryOne(`SELECT ROUND(AVG(CAST(rating AS REAL)), 1) as avg FROM generations WHERE ${activeFilter} AND rating IS NOT NULL`)?.avg ?? 0;
  const ratedCount = queryOne(`SELECT COUNT(*) as count FROM generations WHERE ${activeFilter} AND rating IS NOT NULL`)?.count ?? 0;

  const perDay = query(`
    SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) as count
    FROM   generations
    WHERE  ${activeFilter}
    AND    created_at >= strftime('%Y-%m-%d', 'now', '-30 days')
    GROUP  BY strftime('%Y-%m-%d', created_at)
    ORDER  BY day ASC
  `);
  const toneDistribution = query(`SELECT tone, COUNT(*) as count FROM generations WHERE ${activeFilter} GROUP BY tone ORDER BY count DESC`);
  const topRoutes        = query(`SELECT route, COUNT(*) as count FROM generations WHERE ${activeFilter} GROUP BY route ORDER BY count DESC LIMIT 5`);
  const ratingDist       = query(`SELECT rating, COUNT(*) as count FROM generations WHERE ${activeFilter} AND rating IS NOT NULL GROUP BY rating ORDER BY rating ASC`);
  const topDrivers       = query(`SELECT driver_name, COUNT(*) as count FROM generations WHERE ${activeFilter} GROUP BY driver_name ORDER BY count DESC LIMIT 5`);
  const recentHighRated  = query(`SELECT id, driver_name, route, title, rating, created_at FROM generations WHERE ${activeFilter} AND rating >= 4 ORDER BY created_at DESC LIMIT 5`);

  return { kpis: { total, avgRating, ratedCount }, perDay, toneDistribution, topRoutes, ratingDist, topDrivers, recentHighRated };
}

// ── Admin ─────────────────────────────────────────────────────
function getAdminData({ page = 1, limit = 20, search = '', tone = '', rating = '' } = {}) {
  const offset     = (page - 1) * limit;
  // Always exclude soft-deleted records from admin view (use separate archived view if needed)
  const conditions = ['(is_deleted = 0 OR is_deleted IS NULL)'];
  const params     = [];

  if (search) { conditions.push('(driver_name LIKE ? OR route LIKE ? OR title LIKE ?)'); const t = `%${search}%`; params.push(t, t, t); }
  if (tone)   { conditions.push('tone = ?');   params.push(tone); }
  if (rating) { conditions.push('rating = ?'); params.push(parseInt(rating, 10)); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = queryOne(`SELECT COUNT(*) as count FROM generations ${where}`, params)?.count ?? 0;
  const data  = query(
    `SELECT id, driver_name, route, landmarks, highlights, trip_date,
            vehicle_type, tone, title, summary, social_caption, starting_location, destination, style, rating, comment, user_id, created_at
     FROM generations ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { data, total };
}

function getAllForExport() {
  return query(
    `SELECT id, driver_name, route, landmarks, highlights, trip_date,
            vehicle_type, tone, title, summary, social_caption, starting_location, destination, style, rating, comment, user_id, created_at
     FROM generations ORDER BY created_at DESC`
  );
}

module.exports = {
  init,
  insertGeneration,
  updateFirestoreId,
  getGenerations,
  getGeneration,
  updateRating,
  deleteGeneration,
  getAnalytics,
  getAdminData,
  getAllForExport,
};
