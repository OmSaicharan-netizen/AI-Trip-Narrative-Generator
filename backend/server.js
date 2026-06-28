require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const db = require('./db/database');
const { isReady } = require('./db/turso');

// ── Routes ──────────────────────────────────────────────────
const authRoute     = require('./routes/auth');
const generateRoute = require('./routes/generate');
const historyRoute  = require('./routes/history');
const feedbackRoute = require('./routes/feedback');
const analyticsRoute = require('./routes/analytics');
const adminRoute    = require('./routes/admin');
const suggestRoute  = require('./routes/suggest');
const exploreRoute  = require('./routes/explore');
const ratingsRoute  = require('./routes/ratings');
const reportsRoute  = require('./routes/reports');
const wishlistRoute = require('./routes/wishlist');
const userRoute     = require('./routes/user');
const photosRoute   = require('./routes/photos');
const aiPhotoRoute  = require('./routes/ai-photo');
const exportRoute   = require('./routes/export');

const { verifyToken }  = require('./middleware/verifyToken');
const { requireAdmin } = require('./middleware/requireRole');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Global Rate Limiter ──────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(globalLimiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth',         authRoute);
app.use('/api/generate',     verifyToken, generateRoute);
app.use('/api/history',      verifyToken, historyRoute);
app.use('/api/feedback',     feedbackRoute);
app.use('/api/analytics',    analyticsRoute);
app.use('/api/admin',        verifyToken, requireAdmin, adminRoute);
app.use('/api/suggest-title', suggestRoute);
app.use('/api/explore',      exploreRoute);
app.use('/api/ratings',      ratingsRoute);
app.use('/api/reports',      reportsRoute);
app.use('/api/wishlist',     wishlistRoute);
app.use('/api/user',         verifyToken, userRoute);
app.use('/api/photos',       photosRoute);
app.use('/api/ai-photo',     aiPhotoRoute);
app.use('/api/export',       exportRoute);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    app:       'Manivtha AI Narrative Generator',
    version:   '3.0.0',
    database:  isReady() ? 'Turso (libSQL) ✅' : 'Turso ⚠️ not connected',
    timestamp: new Date().toISOString(),
  });
});

// ── HTML routes ─────────────────────────────────────────────
app.get('/login.html',       (_req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/admin-login.html', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/admin-login.html')));
app.get('/admin.html',       (_req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.get('/dashboard.html',   (_req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));
app.get('/access-denied.html', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/access-denied.html')));

// ── SPA Fallback ─────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start Server ─────────────────────────────────────────────
db.init().then(() => {
  app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   Manivtha AI Trip Narrative Generator       ║');
    console.log('║   Manivtha Tours & Travels — 2026            ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   🚀 Server : http://localhost:${PORT}          ║`);
    console.log('║   🗄️  DB     : Turso (libSQL) ✅              ║');
    console.log('║   🔐 Auth   : JWT (no Firebase)              ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    console.log('💡 First time? Run: node scripts/seed-superadmin.js');
  });
}).catch((err) => {
  console.error('❌ Failed to initialize Turso:', err.message);
  console.error('   → Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in backend/.env');
  process.exit(1);
});
