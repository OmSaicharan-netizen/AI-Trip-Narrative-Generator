'use strict';
/**
 * database.js — Turso (libSQL) persistence layer
 * ================================================
 * Drop-in replacement for the previous MongoDB implementation.
 * All exported function signatures are IDENTICAL — no route files change.
 *
 * Key mapping (legacy names preserved in toRow()):
 *   driver_name        ai_response       trip_date
 *   vehicle_type       social_caption    starting_location
 *   is_deleted         deleted_at        created_at / firestore_id / user_id
 */

const turso = require('./turso');

// ── Constants ─────────────────────────────────────────────────
const TOUR_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1501761095374-cf0a72b89ae1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1433838552652-f9a46b332c40?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=80',
];

// ── Row Normalizer ────────────────────────────────────────────
/**
 * Convert a Turso row object to the snake_case shape routes expect.
 * Preserves camelCase aliases so frontend code works without changes.
 */
function toRow(doc) {
  if (!doc) return null;

  const narrative =
    doc.ai_response || doc.narrative || doc.content || doc.story || '';

  const title = doc.title || doc.route || 'Untitled Journey';

  const socialCaption = doc.social_caption || '';

  let hashtags = [];
  try { hashtags = JSON.parse(doc.hashtags || '[]'); } catch { hashtags = []; }
  if (!Array.isArray(hashtags)) hashtags = [];

  const socialMediaContent = { caption: socialCaption, hashtags };

  const imagePrompt = doc.image_prompt ||
    `A scenic travel photograph of a road trip from ${doc.starting_location || ''} to ${doc.destination || doc.route || ''}`;

  const vehicleInfo  = { type: doc.vehicle_type || 'Sedan', driver: doc.driver_name || 'Unknown' };
  const routeInfo    = {
    startingLocation: doc.starting_location || '',
    destination:      doc.destination       || '',
    route:            doc.route             || '',
    landmarks:        doc.landmarks         || '',
  };

  return {
    // Integer ID (primary key)
    id:                doc.id,
    legacyId:          doc.id,
    // Snake_case (backward compat)
    driver_name:       doc.driver_name       ?? null,
    route:             doc.route             ?? null,
    landmarks:         doc.landmarks         ?? null,
    highlights:        doc.highlights        ?? null,
    trip_date:         doc.trip_date         ?? null,
    vehicle_type:      doc.vehicle_type      ?? 'Sedan',
    tone:              doc.tone              ?? 'Adventurous',
    style:             doc.style             ?? 'Adventure',
    prompt:            doc.prompt            ?? null,
    ai_response:       narrative,
    narrative:         narrative,
    title,
    summary:           doc.summary           ?? null,
    social_caption:    socialCaption,
    starting_location: doc.starting_location ?? null,
    destination:       doc.destination       ?? null,
    rating:            doc.rating            ?? null,
    comment:           doc.comment           ?? null,
    user_id:           doc.user_id           ?? null,
    firestore_id:      doc.firestore_id      ?? null,
    is_deleted:        doc.is_deleted ? 1 : 0,
    deleted_at:        doc.deleted_at        ?? null,
    created_at:        doc.created_at        ?? null,
    updated_at:        doc.updated_at        ?? null,
    visibility:        doc.visibility        ?? 'Public',
    image_url:         doc.image_url         ?? null,
    shares_count:      doc.shares_count      ?? 0,
    wishlist_count:    doc.wishlist_count    ?? 0,
    avg_rating:        doc.avg_rating        ?? null,
    ratings_count:     doc.ratings_count     ?? 0,
    views_count:       doc.views_count       ?? 0,
    // CamelCase aliases (frontend normalizeNarrative uses these)
    driverName:        doc.driver_name       ?? null,
    tripDate:          doc.trip_date         ?? null,
    vehicleType:       doc.vehicle_type      ?? 'Sedan',
    socialCaption,
    startingLocation:  doc.starting_location ?? null,
    userId:            doc.user_id           ?? null,
    firestoreId:       doc.firestore_id      ?? null,
    createdAt:         doc.created_at        ?? null,
    updatedAt:         doc.updated_at        ?? null,
    // Composite objects
    socialMediaContent,
    hashtags,
    imagePrompt,
    vehicleInfo,
    routeInfo,
    startDate:         doc.trip_date         ?? '',
    reachingDate:      doc.trip_date         ?? '',
  };
}

// ── Lifecycle ─────────────────────────────────────────────────
async function init() {
  await turso.connect();
}

// ── Narratives ────────────────────────────────────────────────

async function insertGeneration({
  driverName, route, landmarks, highlights, tripDate,
  vehicleType, tone, prompt, aiResponse, title,
  summary, socialCaption, startingLocation, destination, style,
  userId = null, firestoreId = null, visibility = 'Public', imageUrl = null,
}) {
  const now          = new Date().toISOString();
  const finalTitle   = title   || route  || 'Untitled Journey';
  const finalNarr    = aiResponse || '';
  const finalCaption = socialCaption || '';
  const hashArr      = (finalCaption.match(/#[\w\u0900-\u097F]+/g) || []);
  const hashJson     = JSON.stringify(hashArr);

  const res = await turso.execute(
    `INSERT INTO narratives
      (user_id, driver_name, route, starting_location, destination,
       landmarks, highlights, trip_date, vehicle_type, tone, style,
       prompt, ai_response, title, summary, social_caption, hashtags,
       image_prompt, image_url, visibility, firestore_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      userId, driverName, route, startingLocation || null, destination || null,
      landmarks || null, highlights || null, tripDate || null,
      vehicleType || 'Sedan', tone || 'Adventurous', style || 'Adventure',
      prompt || null, finalNarr, finalTitle, summary || null,
      finalCaption, hashJson,
      imageUrl || `A scenic travel photograph of a road trip from ${startingLocation || ''} to ${destination || route || ''}`,
      imageUrl || TOUR_IMAGES[Math.floor(Math.random() * TOUR_IMAGES.length)],
      visibility || 'Public',
      firestoreId || null,
      now, now,
    ]
  );
  return Number(res.lastInsertRowid);
}

async function updateFirestoreId(narrativeId, firestoreId) {
  await turso.execute(
    'UPDATE narratives SET firestore_id = ? WHERE id = ?',
    [firestoreId, Number(narrativeId)]
  );
}

async function getGenerations({ page = 1, limit = 12, search = '', userId = null } = {}) {
  const offset = (page - 1) * limit;
  const conditions = ['is_deleted = 0'];
  const args       = [];

  if (userId) { conditions.push('user_id = ?'); args.push(userId); }
  if (search) {
    conditions.push('(driver_name LIKE ? OR route LIKE ? OR title LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }

  const where = conditions.join(' AND ');

  const [countRes, dataRes] = await Promise.all([
    turso.execute(`SELECT COUNT(*) AS total FROM narratives WHERE ${where}`, args),
    turso.execute(
      `SELECT * FROM narratives WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
  ]);

  const total = Number(countRes.rows[0]?.total ?? 0);
  const data  = dataRes.rows.map(toRow);
  return { data, total };
}

async function getGeneration(id) {
  const res = await turso.execute(
    'SELECT * FROM narratives WHERE id = ? AND is_deleted = 0',
    [Number(id)]
  );
  return toRow(res.rows[0] ?? null);
}

async function updateRating(id, rating, comment) {
  await turso.execute(
    'UPDATE narratives SET rating = ?, comment = ?, updated_at = ? WHERE id = ?',
    [rating ?? null, comment ?? null, new Date().toISOString(), Number(id)]
  );
}

async function deleteGeneration(id) {
  const now = new Date().toISOString();
  await turso.execute(
    'UPDATE narratives SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, Number(id)]
  );
}

async function restoreGeneration(id) {
  const now = new Date().toISOString();
  await turso.execute(
    'UPDATE narratives SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?',
    [now, Number(id)]
  );
}

// ── Analytics ─────────────────────────────────────────────────
async function getAnalytics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    kpiRes, perDayRes, toneRes, routeRes, ratingDistRes,
    driverRes, recentHighRes, mostPopRes, trendingRes,
  ] = await Promise.all([
    turso.execute(`
      SELECT COUNT(*) AS total,
             AVG(rating) AS avg_rating,
             SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) AS rated_count,
             SUM(COALESCE(shares_count,0)) AS total_shares,
             SUM(COALESCE(wishlist_count,0)) AS total_wishlists
      FROM narratives WHERE is_deleted = 0`),
    turso.execute(`
      SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS count
      FROM narratives
      WHERE is_deleted = 0 AND created_at >= ?
      GROUP BY day ORDER BY day ASC`, [thirtyDaysAgo]),
    turso.execute(`
      SELECT tone, COUNT(*) AS count FROM narratives
      WHERE is_deleted = 0 GROUP BY tone ORDER BY count DESC`),
    turso.execute(`
      SELECT route, COUNT(*) AS count FROM narratives
      WHERE is_deleted = 0 GROUP BY route ORDER BY count DESC LIMIT 5`),
    turso.execute(`
      SELECT rating, COUNT(*) AS count FROM narratives
      WHERE is_deleted = 0 AND rating IS NOT NULL GROUP BY rating ORDER BY rating ASC`),
    turso.execute(`
      SELECT driver_name, COUNT(*) AS count FROM narratives
      WHERE is_deleted = 0 GROUP BY driver_name ORDER BY count DESC LIMIT 5`),
    turso.execute(`
      SELECT id, driver_name, route, title, rating, created_at FROM narratives
      WHERE is_deleted = 0 AND rating >= 4 ORDER BY created_at DESC LIMIT 5`),
    turso.execute(`
      SELECT * FROM narratives WHERE is_deleted = 0
      ORDER BY wishlist_count DESC, created_at DESC LIMIT 1`),
    turso.execute(`
      SELECT * FROM narratives WHERE is_deleted = 0
      ORDER BY avg_rating DESC, wishlist_count DESC LIMIT 5`),
  ]);

  const kpi = kpiRes.rows[0] || {};
  return {
    kpis: {
      total:          Number(kpi.total          ?? 0),
      avgRating:      kpi.avg_rating ? parseFloat(Number(kpi.avg_rating).toFixed(1)) : 0,
      ratedCount:     Number(kpi.rated_count    ?? 0),
      totalShares:    Number(kpi.total_shares   ?? 0),
      totalWishlists: Number(kpi.total_wishlists ?? 0),
    },
    perDay:           perDayRes.rows.map(r => ({ day: r.day, count: Number(r.count) })),
    toneDistribution: toneRes.rows.map(r => ({ tone: r.tone, count: Number(r.count) })),
    topRoutes:        routeRes.rows.map(r => ({ route: r.route, count: Number(r.count) })),
    ratingDist:       ratingDistRes.rows.map(r => ({ rating: r.rating, count: Number(r.count) })),
    topDrivers:       driverRes.rows.map(r => ({ driver_name: r.driver_name, count: Number(r.count) })),
    recentHighRated:  recentHighRes.rows.map(r => ({
      id: r.id, driver_name: r.driver_name, route: r.route,
      title: r.title, rating: r.rating, created_at: r.created_at,
    })),
    mostPopular: toRow(mostPopRes.rows[0] ?? null),
    trending:    trendingRes.rows.map(toRow),
  };
}

// ── Admin ─────────────────────────────────────────────────────
async function getAdminData({ page = 1, limit = 20, search = '', tone = '', rating = '' } = {}) {
  const offset     = (page - 1) * limit;
  const conditions = ['is_deleted = 0'];
  const args       = [];

  if (search) {
    conditions.push('(driver_name LIKE ? OR route LIKE ? OR title LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  if (tone)   { conditions.push('tone = ?');   args.push(tone); }
  if (rating) { conditions.push('rating = ?'); args.push(parseInt(rating, 10)); }

  const where = conditions.join(' AND ');

  const [countRes, dataRes] = await Promise.all([
    turso.execute(`SELECT COUNT(*) AS total FROM narratives WHERE ${where}`, args),
    turso.execute(
      `SELECT id, user_id, driver_name, route, starting_location, destination,
              landmarks, highlights, trip_date, vehicle_type, tone, style, title,
              summary, social_caption, hashtags, image_url, visibility,
              rating, comment, avg_rating, ratings_count, shares_count,
              wishlist_count, views_count, firestore_id,
              is_deleted, deleted_at, created_at, updated_at
       FROM narratives WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
  ]);

  return { data: dataRes.rows.map(toRow), total: Number(countRes.rows[0]?.total ?? 0) };
}

async function getAllForExport() {
  const res = await turso.execute(
    `SELECT id, user_id, driver_name, route, starting_location, destination,
            landmarks, highlights, trip_date, vehicle_type, tone, style, title,
            summary, social_caption, rating, comment, avg_rating, ratings_count,
            shares_count, wishlist_count, views_count, visibility, created_at, updated_at
     FROM narratives WHERE is_deleted = 0 ORDER BY created_at DESC`
  );
  return res.rows.map(toRow);
}

// ── Users ─────────────────────────────────────────────────────
async function upsertUser({ uid, email, displayName, photoURL, provider, emailVerified, role: inputRole, permissions }) {
  const now = new Date().toISOString();
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isDefaultAdmin = admins.includes((email || '').toLowerCase());
  let role = 'User';
  if (inputRole === 'SuperAdmin') role = 'SuperAdmin';
  else if (inputRole === 'Admin' || inputRole === 'admin' || isDefaultAdmin) role = 'Admin';

  await turso.execute(`
    INSERT INTO users (uid, email, display_name, photo_url, provider, email_verified, role, created_at, updated_at, last_login)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(uid) DO UPDATE SET
      email         = excluded.email,
      display_name  = COALESCE(excluded.display_name, display_name),
      photo_url     = COALESCE(excluded.photo_url, photo_url),
      provider      = excluded.provider,
      email_verified = excluded.email_verified,
      role          = CASE WHEN users.role = 'SuperAdmin' THEN 'SuperAdmin' ELSE excluded.role END,
      updated_at    = excluded.updated_at,
      last_login    = excluded.last_login
  `, [uid, email, displayName || '', photoURL || '', provider || 'email', emailVerified ? 1 : 0, role, now, now, now]);
}

async function getUserByUid(uid) {
  const res = await turso.execute('SELECT * FROM users WHERE uid = ?', [uid]);
  return res.rows[0] ?? null;
}

async function getUserByEmail(email) {
  const res = await turso.execute('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  return res.rows[0] ?? null;
}

async function getUsers() {
  const res = await turso.execute(
    'SELECT id, uid, email, display_name, photo_url, role, account_status, email_verified, provider, created_at, last_login FROM users ORDER BY created_at DESC'
  );
  return res.rows;
}

async function updateUserRoleAndPermissions(uid, role, _permissions) {
  // Protect SuperAdmin: cannot downgrade SuperAdmin via this function
  const targetRole = role === 'SuperAdmin' ? 'SuperAdmin' : (role === 'Admin' ? 'Admin' : 'User');
  await turso.execute(
    'UPDATE users SET role = ?, updated_at = ? WHERE uid = ? AND role != ?',
    [targetRole, new Date().toISOString(), uid, 'SuperAdmin']
  );
}

async function updateUserStatus(uid, accountStatus) {
  await turso.execute(
    'UPDATE users SET account_status = ?, updated_at = ? WHERE uid = ?',
    [accountStatus, new Date().toISOString(), uid]
  );
}

// ── Public Explore ────────────────────────────────────────────
async function getPublicGenerations({
  page = 1, limit = 12, search = '',
  sortBy = 'recent', destination = '', author = '', rating = '', date = '',
} = {}) {
  const offset     = (page - 1) * limit;
  const conditions = ['n.is_deleted = 0', "n.visibility = 'Public'"];
  const args       = [];

  if (search) {
    conditions.push('(n.driver_name LIKE ? OR n.route LIKE ? OR n.title LIKE ? OR n.destination LIKE ? OR n.starting_location LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like, like, like);
  }
  if (destination) {
    conditions.push('(n.destination LIKE ? OR n.route LIKE ?)');
    const like = `%${destination}%`;
    args.push(like, like);
  }
  if (rating) {
    conditions.push('n.avg_rating >= ?');
    args.push(parseFloat(rating));
  }
  if (date) {
    const now = new Date();
    let from;
    if (date === 'today')  from = new Date(now.setHours(0,0,0,0));
    if (date === 'week')   from = new Date(Date.now() - 7  * 86400000);
    if (date === 'month')  from = new Date(Date.now() - 30 * 86400000);
    if (date === 'year')   from = new Date(Date.now() - 365 * 86400000);
    if (from) { conditions.push('n.created_at >= ?'); args.push(from.toISOString()); }
  }

  const orderMap = {
    popular: 'n.wishlist_count DESC, n.created_at DESC',
    wishlisted: 'n.wishlist_count DESC, n.created_at DESC',
    shared: 'n.shares_count DESC, n.created_at DESC',
    rating: 'n.avg_rating DESC, n.created_at DESC',
    recent: 'n.created_at DESC',
  };
  const order = orderMap[sortBy] || orderMap[sortBy?.toLowerCase()] || 'n.created_at DESC';
  const where = conditions.join(' AND ');

  // If author filter — find matching user UIDs first
  let authorUids = null;
  if (author) {
    const authRes = await turso.execute(
      "SELECT uid FROM users WHERE display_name LIKE ?", [`%${author}%`]
    );
    authorUids = authRes.rows.map(r => r.uid);
    if (authorUids.length === 0) return { data: [], total: 0 };
    const placeholders = authorUids.map(() => '?').join(',');
    conditions.push(`n.user_id IN (${placeholders})`);
    args.push(...authorUids);
  }

  const finalWhere = conditions.join(' AND ');

  const [countRes, dataRes] = await Promise.all([
    turso.execute(`SELECT COUNT(*) AS total FROM narratives n WHERE ${finalWhere}`, args),
    turso.execute(
      `SELECT n.*, u.display_name AS author_name
       FROM narratives n
       LEFT JOIN users u ON u.uid = n.user_id
       WHERE ${finalWhere} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
  ]);

  const data = dataRes.rows.map(doc => {
    const row = toRow(doc);
    row.author_name = doc.author_name || 'Anonymous';
    return row;
  });
  return { data, total: Number(countRes.rows[0]?.total ?? 0) };
}

async function updateNarrative(id, userId, updates) {
  const res = await turso.execute('SELECT * FROM narratives WHERE id = ? AND is_deleted = 0', [Number(id)]);
  const doc = res.rows[0];
  if (!doc) throw new Error('Narrative not found.');
  if (doc.user_id && doc.user_id !== userId) throw new Error('Forbidden. You do not own this narrative.');

  const fields = [];
  const vals   = [];
  if (updates.title       !== undefined) { fields.push('title = ?');       vals.push(updates.title); }
  if (updates.aiResponse  !== undefined) { fields.push('ai_response = ?'); vals.push(updates.aiResponse); }
  if (updates.visibility  !== undefined) { fields.push('visibility = ?');  vals.push(updates.visibility); }
  if (updates.imageUrl    !== undefined) { fields.push('image_url = ?');   vals.push(updates.imageUrl); }
  if (!fields.length) return;
  fields.push('updated_at = ?'); vals.push(new Date().toISOString());
  vals.push(Number(id));
  await turso.execute(`UPDATE narratives SET ${fields.join(', ')} WHERE id = ?`, vals);
}

async function addRating({ narrativeId, userId, userName, rating, review }) {
  const nRes = await turso.execute('SELECT * FROM narratives WHERE id = ? AND is_deleted = 0', [Number(narrativeId)]);
  const narr = nRes.rows[0];
  if (!narr) throw new Error('Narrative not found.');
  if (narr.user_id === userId) throw new Error('You cannot rate your own narrative.');

  const now = new Date().toISOString();
  await turso.execute(
    `INSERT INTO ratings (narrative_id, user_id, user_name, rating, review, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(narrative_id, user_id) DO UPDATE SET rating=excluded.rating, review=excluded.review`,
    [Number(narrativeId), userId, userName || '', Number(rating), review || '', now]
  );

  const statsRes = await turso.execute(
    'SELECT AVG(rating) AS avg_r, COUNT(*) AS cnt FROM ratings WHERE narrative_id = ?',
    [Number(narrativeId)]
  );
  const avg = statsRes.rows[0]?.avg_r ? parseFloat(Number(statsRes.rows[0].avg_r).toFixed(1)) : 0;
  const cnt = Number(statsRes.rows[0]?.cnt ?? 0);
  await turso.execute(
    'UPDATE narratives SET avg_rating = ?, ratings_count = ?, updated_at = ? WHERE id = ?',
    [avg, cnt, now, Number(narrativeId)]
  );
}

async function getNarrativeRatings(narrativeId) {
  const res = await turso.execute(
    'SELECT * FROM ratings WHERE narrative_id = ? ORDER BY created_at DESC',
    [Number(narrativeId)]
  );
  return res.rows;
}

async function toggleWishlist({ userId, narrativeId }) {
  const existing = await turso.execute(
    'SELECT id FROM wishlist WHERE user_id = ? AND narrative_id = ?',
    [userId, Number(narrativeId)]
  );
  let added = false;
  if (existing.rows.length > 0) {
    await turso.execute('DELETE FROM wishlist WHERE user_id = ? AND narrative_id = ?', [userId, Number(narrativeId)]);
  } else {
    await turso.execute(
      'INSERT INTO wishlist (user_id, narrative_id, created_at) VALUES (?,?,?)',
      [userId, Number(narrativeId), new Date().toISOString()]
    );
    added = true;
  }
  const cntRes = await turso.execute('SELECT COUNT(*) AS cnt FROM wishlist WHERE narrative_id = ?', [Number(narrativeId)]);
  const wishlistCount = Number(cntRes.rows[0]?.cnt ?? 0);
  await turso.execute('UPDATE narratives SET wishlist_count = ? WHERE id = ?', [wishlistCount, Number(narrativeId)]);
  return { added, wishlistCount };
}

async function getUserWishlist(userId, { page = 1, limit = 12 } = {}) {
  const offset = (page - 1) * limit;
  const countRes = await turso.execute('SELECT COUNT(*) AS cnt FROM wishlist WHERE user_id = ?', [userId]);
  const total    = Number(countRes.rows[0]?.cnt ?? 0);
  if (total === 0) return { data: [], total };

  const res = await turso.execute(`
    SELECT n.*, u.display_name AS author_name
    FROM wishlist w
    JOIN narratives n ON n.id = w.narrative_id
    LEFT JOIN users u ON u.uid = n.user_id
    WHERE w.user_id = ? AND n.is_deleted = 0
    ORDER BY w.created_at DESC LIMIT ? OFFSET ?
  `, [userId, limit, offset]);

  const data = res.rows.map(doc => {
    const row = toRow(doc);
    row.author_name = doc.author_name || 'Anonymous';
    return row;
  });
  return { data, total };
}

async function isWishlisted(userId, narrativeId) {
  const res = await turso.execute(
    'SELECT id FROM wishlist WHERE user_id = ? AND narrative_id = ?',
    [userId, Number(narrativeId)]
  );
  return res.rows.length > 0;
}

async function createReport({ narrativeId, reportedBy, reason }) {
  await turso.execute(
    'INSERT INTO reports (narrative_id, reported_by, reason, status, created_at) VALUES (?,?,?,?,?)',
    [Number(narrativeId), reportedBy || null, reason, 'Pending', new Date().toISOString()]
  );
}

async function getReports({ page = 1, limit = 20 } = {}) {
  const offset   = (page - 1) * limit;
  const countRes = await turso.execute('SELECT COUNT(*) AS total FROM reports');
  const total    = Number(countRes.rows[0]?.total ?? 0);

  const res = await turso.execute(`
    SELECT r.*, n.title AS narrative_title, u.email AS reporter_email
    FROM reports r
    LEFT JOIN narratives n ON n.id = r.narrative_id
    LEFT JOIN users u ON u.uid = r.reported_by
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `, [limit, offset]);

  const data = res.rows.map(r => ({
    id:             r.id,
    narrativeId:    r.narrative_id,
    narrativeTitle: r.narrative_title || 'Deleted Narrative',
    reportedBy:     r.reported_by,
    reporterEmail:  r.reporter_email  || 'Unknown User',
    reason:         r.reason,
    status:         r.status,
    createdAt:      r.created_at,
  }));
  return { data, total };
}

async function updateReportStatus(reportId, status) {
  await turso.execute(
    'UPDATE reports SET status = ?, updated_at = ? WHERE id = ?',
    [status, new Date().toISOString(), Number(reportId)]
  );
}

async function incrementShares(id) {
  await turso.execute('UPDATE narratives SET shares_count = shares_count + 1 WHERE id = ?', [Number(id)]);
}

async function incrementViews(id) {
  await turso.execute('UPDATE narratives SET views_count = views_count + 1 WHERE id = ?', [Number(id)]);
}

// ── Settings ─────────────────────────────────────────────────
async function getSetting(key) {
  const res = await turso.execute('SELECT value FROM settings WHERE key = ?', [key]);
  return res.rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await turso.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, value, new Date().toISOString()]
  );
}

// ── User Dashboard ────────────────────────────────────────────
async function updateUserProfile(uid, { displayName, bio, photoURL }) {
  const fields = ['updated_at = ?'];
  const vals   = [new Date().toISOString()];
  if (displayName !== undefined) { fields.push('display_name = ?'); vals.push(displayName); }
  if (bio         !== undefined) { fields.push('bio = ?');          vals.push(bio); }
  if (photoURL    !== undefined) { fields.push('photo_url = ?');    vals.push(photoURL); }
  vals.push(uid);
  await turso.execute(`UPDATE users SET ${fields.join(', ')} WHERE uid = ?`, vals);
}

async function createNotification({ userId, type, message }) {
  await turso.execute(
    'INSERT INTO notifications (user_id, type, message, read, created_at) VALUES (?,?,?,0,?)',
    [userId, type || '', message || '', new Date().toISOString()]
  );
}

async function getUserNotifications(userId) {
  const res = await turso.execute(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return res.rows;
}

async function markNotificationsRead(userId) {
  await turso.execute('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
}

async function logActivity({ userId, action, detail }) {
  await turso.execute(
    'INSERT INTO activity_logs (user_id, action, detail, created_at) VALUES (?,?,?,?)',
    [userId, action, detail || '', new Date().toISOString()]
  );
}

async function getUserActivity(userId) {
  const res = await turso.execute(
    'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return res.rows;
}

async function getUserAnalyticsMetrics(userId) {
  const [perMonthRes, topViewedRes, topSharedRes, ratingTrendRes] = await Promise.all([
    turso.execute(`
      SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
      FROM narratives WHERE user_id = ? AND is_deleted = 0
      GROUP BY month ORDER BY month ASC LIMIT 6`, [userId]),
    turso.execute(`
      SELECT title, route, views_count FROM narratives
      WHERE user_id = ? AND is_deleted = 0 ORDER BY views_count DESC LIMIT 5`, [userId]),
    turso.execute(`
      SELECT title, route, shares_count FROM narratives
      WHERE user_id = ? AND is_deleted = 0 ORDER BY shares_count DESC LIMIT 5`, [userId]),
    turso.execute(`
      SELECT strftime('%Y-%m', created_at) AS month, AVG(avg_rating) AS avg_rating
      FROM narratives WHERE user_id = ? AND is_deleted = 0 AND avg_rating IS NOT NULL
      GROUP BY month ORDER BY month ASC`, [userId]),
  ]);
  return {
    perMonth:    perMonthRes.rows.map(r => ({ month: r.month, count: Number(r.count) })),
    topViewed:   topViewedRes.rows.map(r => ({ title: r.title || r.route || 'Untitled', views: Number(r.views_count || 0) })),
    topShared:   topSharedRes.rows.map(r => ({ title: r.title || r.route || 'Untitled', shares: Number(r.shares_count || 0) })),
    ratingTrend: ratingTrendRes.rows.map(r => ({ month: r.month, avgRating: parseFloat(Number(r.avg_rating).toFixed(1)) })),
  };
}

async function getUserDashboardStats(userId) {
  const [statsRes, unreadRes, activityRes] = await Promise.all([
    turso.execute(`
      SELECT COUNT(*) AS total_narratives,
             SUM(COALESCE(views_count,0)) AS total_views,
             SUM(COALESCE(wishlist_count,0)) AS total_saves,
             SUM(COALESCE(shares_count,0)) AS total_shares,
             AVG(avg_rating) AS avg_rating
      FROM narratives WHERE user_id = ? AND is_deleted = 0`, [userId]),
    turso.execute('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read = 0', [userId]),
    turso.execute('SELECT action, detail, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]),
  ]);
  const s = statsRes.rows[0] || {};
  return {
    totalNarratives:        Number(s.total_narratives ?? 0),
    totalViews:             Number(s.total_views      ?? 0),
    totalSaves:             Number(s.total_saves      ?? 0),
    totalShares:            Number(s.total_shares     ?? 0),
    avgRating:              s.avg_rating ? parseFloat(Number(s.avg_rating).toFixed(1)) : 0,
    unreadNotificationsCount: Number(unreadRes.rows[0]?.cnt ?? 0),
    recentActivity:         activityRes.rows.map(a => ({ action: a.action, detail: a.detail, createdAt: a.created_at })),
  };
}

// ── Trip Photos ───────────────────────────────────────────────
async function insertPhoto({ narrativeId, userId, filename, mimeType, data, size }) {
  const res = await turso.execute(
    'INSERT INTO trip_photos (narrative_id, user_id, filename, mime_type, data, size, created_at) VALUES (?,?,?,?,?,?,?)',
    [narrativeId ? Number(narrativeId) : null, userId || null, filename, mimeType, data, size, new Date().toISOString()]
  );
  return String(res.lastInsertRowid);
}

async function getPhotosByNarrativeId(narrativeId) {
  const res = await turso.execute(
    'SELECT id, narrative_id, user_id, filename, mime_type, size, created_at FROM trip_photos WHERE narrative_id = ? ORDER BY created_at ASC',
    [Number(narrativeId)]
  );
  return res.rows;
}

async function getPhotoById(photoId) {
  const res = await turso.execute('SELECT * FROM trip_photos WHERE id = ?', [Number(photoId)]);
  return res.rows[0] ?? null;
}

async function deletePhoto(photoId) {
  await turso.execute('DELETE FROM trip_photos WHERE id = ?', [Number(photoId)]);
}

async function getPhotoCountForNarrative(narrativeId) {
  const res = await turso.execute('SELECT COUNT(*) AS cnt FROM trip_photos WHERE narrative_id = ?', [Number(narrativeId)]);
  return Number(res.rows[0]?.cnt ?? 0);
}

// ── Audit Logging ─────────────────────────────────────────────
async function logAudit({ actorId, actorEmail, action, targetType, targetId, detail }) {
  await turso.execute(
    'INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
    [actorId || null, actorEmail || null, action, targetType || null, targetId ? String(targetId) : null, detail || null, new Date().toISOString()]
  );
}

async function getAuditLogs({ page = 1, limit = 50 } = {}) {
  const offset   = (page - 1) * limit;
  const countRes = await turso.execute('SELECT COUNT(*) AS total FROM audit_logs');
  const res      = await turso.execute(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return { data: res.rows, total: Number(countRes.rows[0]?.total ?? 0) };
}

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  init,
  // Narratives
  insertGeneration, updateFirestoreId, getGenerations, getGeneration,
  updateRating, deleteGeneration, restoreGeneration,
  getAnalytics, getAdminData, getAllForExport,
  // Public / Social
  getPublicGenerations, updateNarrative, addRating, getNarrativeRatings,
  toggleWishlist, getUserWishlist, isWishlisted,
  incrementShares, incrementViews,
  // Reports
  createReport, getReports, updateReportStatus,
  // Users
  upsertUser, getUserByUid, getUserByEmail, getUsers,
  updateUserRoleAndPermissions, updateUserStatus,
  // Settings
  getSetting, setSetting,
  // User Dashboard
  updateUserProfile, createNotification, getUserNotifications,
  markNotificationsRead, logActivity, getUserActivity,
  getUserAnalyticsMetrics, getUserDashboardStats,
  // Photos
  insertPhoto, getPhotosByNarrativeId, getPhotoById, deletePhoto, getPhotoCountForNarrative,
  // Audit
  logAudit, getAuditLogs,
};
