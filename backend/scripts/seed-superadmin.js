#!/usr/bin/env node
/**
 * backend/scripts/seed-superadmin.js
 * ────────────────────────────────────
 * Creates the initial SuperAdmin account.
 * Run ONCE after first deployment:
 *
 *   node scripts/seed-superadmin.js
 *
 * Reads from environment:
 *   SUPERADMIN_EMAIL     — required
 *   SUPERADMIN_PASSWORD  — required (min 8 chars)
 *
 * Idempotent: skips silently if the email already exists.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const turso    = require('../db/turso');

async function seed() {
  const email    = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌  Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in backend/.env');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌  SUPERADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  console.log('🔗  Connecting to Turso…');
  await turso.connect();

  // Check if already exists
  const existing = await turso.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    console.log(`ℹ️   SuperAdmin already exists for ${email} — skipping.`);
    process.exit(0);
  }

  const uid  = uuidv4();
  const hash = await bcrypt.hash(password, 12);
  const now  = new Date().toISOString();

  await turso.execute(`
    INSERT INTO users
      (uid, email, password_hash, display_name, photo_url, role, account_status, email_verified, provider, created_at, updated_at, last_login)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `, [uid, email.toLowerCase().trim(), hash, 'Super Admin', '', 'SuperAdmin', 'active', 1, 'email', now, now, now]);

  console.log(`\n✅  SuperAdmin created successfully!`);
  console.log(`   Email : ${email}`);
  console.log(`   Role  : SuperAdmin`);
  console.log(`   UID   : ${uid}`);
  console.log('\nLogin at: http://localhost:3001/admin-login.html\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
