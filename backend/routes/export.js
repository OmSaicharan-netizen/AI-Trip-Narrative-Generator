/**
 * export.js — Project ZIP Export Route
 * ═════════════════════════════════════
 * GET /api/export/project
 * Streams a ZIP archive of the complete project to the client.
 *
 * Includes:
 *  - All source code (frontend/, backend/ except node_modules)
 *  - All configuration files
 *  - README.md
 *  - .env.example (sanitized — no real secrets)
 *
 * Excludes:
 *  - node_modules/
 *  - .git/
 *  - .env (actual secrets)
 *  - *.db (SQLite databases)
 *  - build caches, logs, temp files
 */

'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const archiver = require('archiver');

// Project root: two directories above backend/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Patterns to exclude from ZIP (relative paths matched against file paths)
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '*.db',
  'firebase-service-account.json',
  'package-lock.json',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  'dist',
  'build',
  '.cache',
  '.next',
  'coverage',
];

/**
 * Check if a path should be excluded from the ZIP.
 */
function shouldExclude(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  for (const part of parts) {
    // Exact directory/file name matches
    if (
      part === 'node_modules' ||
      part === '.git' ||
      part === 'dist' ||
      part === 'build' ||
      part === '.cache' ||
      part === '.next' ||
      part === 'coverage' ||
      part === 'firebase-service-account.json' ||
      part === 'package-lock.json' ||
      part === '.DS_Store' ||
      part === 'Thumbs.db'
    ) {
      return true;
    }

    // File extension matches
    if (part.endsWith('.db') || part.endsWith('.log')) {
      return true;
    }

    // Exact .env file (not .env.example)
    if (part === '.env' && !part.endsWith('.example')) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a sanitized .env.example content.
 * Reads the existing .env.example if it exists, otherwise generates a template.
 */
function getEnvExample() {
  // Try to read existing .env.example
  const examplePath = path.join(PROJECT_ROOT, 'backend', '.env.example');
  if (fs.existsSync(examplePath)) {
    return fs.readFileSync(examplePath, 'utf8');
  }

  // Generate from scratch
  return `# ============================================================
# Manivtha AI Trip Narrative Generator — Environment Variables
# ============================================================
# Copy this file to .env and fill in your actual values.
# NEVER commit .env to version control!

# ----- Server -----
PORT=3001
NODE_ENV=development

# ----- Google Gemini AI -----
# Get your API key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# ----- Turso / libSQL -----
# Use file:./db/trips.db for local dev or a Turso cloud URL for production
TURSO_DATABASE_URL=file:./db/trips.db
TURSO_AUTH_TOKEN=local-dev-token

# ----- Auth -----
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
SUPERADMIN_EMAIL=admin@yourdomain.com
SUPERADMIN_PASSWORD=YourSecurePassword123

# ----- Admin Access -----
# Comma-separated list of admin email addresses
ADMIN_EMAILS=admin@yourdomain.com
`;
}

/**
 * Generate README content for the exported project.
 */
function getReadmeContent() {
  const now = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return `# Manivtha AI Trip Narrative Generator

> **Exported on:** ${now}

A full-stack AI-powered travel narrative generation application built for Manivtha Tours & Travels.

## 🚀 Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: Turso (libSQL / SQLite) — local file in dev, Turso cloud in production
- **AI**: Google Gemini 2.5 Flash
- **Authentication**: JWT (JSON Web Tokens)

## 📁 Project Structure

\`\`\`
project-root/
├── backend/              ← Node.js/Express API server
│   ├── db/               ← Database layer (Turso/libSQL)
│   ├── middleware/       ← Auth middleware
│   ├── routes/           ← API route handlers
│   ├── scripts/          ← Seed scripts
│   ├── utils/            ← Utility functions
│   ├── server.js         ← Entry point
│   └── package.json
├── frontend/             ← Static HTML/CSS/JS frontend
│   ├── css/              ← Stylesheets
│   ├── js/               ← JavaScript modules
│   ├── index.html        ← Main app
│   ├── dashboard.html    ← User dashboard
│   ├── admin.html        ← Admin dashboard
│   └── login.html        ← Authentication
└── README.md
\`\`\`

## ⚙️ Installation & Setup

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- Google AI Studio account (for Gemini API key)

### Steps

1. **Clone/extract the project:**
   \`\`\`bash
   cd project-root
   \`\`\`

2. **Install backend dependencies:**
   \`\`\`bash
   cd backend
   npm install
   \`\`\`

3. **Configure environment variables:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env and fill in all required values
   \`\`\`

4. **Seed the SuperAdmin account:**
   \`\`\`bash
   node scripts/seed-superadmin.js
   \`\`\`

5. **Start the development server:**
   \`\`\`bash
   npm run dev
   # or
   node server.js
   \`\`\`

6. **Open the app:**
   Navigate to \`http://localhost:3001\`

## 🔑 Required Environment Variables

| Variable | Description |
|----------|-------------|
| \`PORT\` | Server port (default: 3001) |
| \`GEMINI_API_KEY\` | Google Gemini AI API key |
| \`TURSO_DATABASE_URL\` | Turso/libSQL database URL (file:./db/trips.db for local) |
| \`TURSO_AUTH_TOKEN\` | Turso auth token (use any string for local dev) |
| \`JWT_SECRET\` | Secret key for access token signing |
| \`JWT_REFRESH_SECRET\` | Secret key for refresh token signing |
| \`SUPERADMIN_EMAIL\` | Email for the initial SuperAdmin account |
| \`SUPERADMIN_PASSWORD\` | Password for the initial SuperAdmin account |
| \`ADMIN_EMAILS\` | Comma-separated admin email addresses |

## 🏗️ Build & Deployment

### Development
\`\`\`bash
cd backend && node server.js
\`\`\`

### Production
\`\`\`bash
cd backend
NODE_ENV=production node server.js
\`\`\`

The Express server serves the frontend static files automatically.

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/api/generate\` | Generate AI narrative |
| GET | \`/api/history\` | List narratives (public/user-filtered) |
| GET | \`/api/history/my\` | List current user's narratives (auth required) |
| GET | \`/api/history/:id\` | Get single narrative by ID |
| DELETE | \`/api/history/:id\` | Soft-delete narrative (auth required) |
| GET | \`/api/explore\` | Public explore feed |
| GET | \`/api/analytics\` | Analytics data |
| GET | \`/api/export/project\` | Download project as ZIP |

## 📄 License

Internal use — Manivtha Tours & Travels © 2026
`;
}

/**
 * GET /api/export/project
 * Creates and streams a ZIP archive of the project.
 */
router.get('/project', async (req, res) => {
  console.log('[export] Project ZIP download requested');

  const zipFileName = `manivtha-ai-narrative-${Date.now()}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Cache-Control', 'no-cache');

  const archive = archiver('zip', {
    zlib: { level: 6 }, // Balanced compression
  });

  // Pipe the archive to the response stream
  archive.pipe(res);

  // Handle archive errors
  archive.on('error', (err) => {
    console.error('[export] Archive error:', err);
    // Headers already sent — can't send error status
  });

  archive.on('finish', () => {
    const bytes = archive.pointer();
    console.log(`[export] ZIP completed: ${(bytes / 1024 / 1024).toFixed(2)} MB, filename=${zipFileName}`);
  });

  try {
    // ── 1. Add backend files (excluding node_modules, .env, etc.) ──
    const backendDir = path.join(PROJECT_ROOT, 'backend');
    if (fs.existsSync(backendDir)) {
      archive.glob('**/*', {
        cwd: backendDir,
        dot: true,
        ignore: [
          'node_modules/**',
          '.env',
          'firebase-service-account.json',
          '*.db',
          '*.log',
          'package-lock.json',
          '.cache/**',
        ],
      }, { prefix: 'backend' });
    }

    // ── 2. Add frontend files ──
    const frontendDir = path.join(PROJECT_ROOT, 'frontend');
    if (fs.existsSync(frontendDir)) {
      archive.glob('**/*', {
        cwd: frontendDir,
        dot: true,
        ignore: [
          'node_modules/**',
          '*.log',
          '.cache/**',
        ],
      }, { prefix: 'frontend' });
    }

    // ── 3. Add root-level config files ──
    const rootFiles = [
      'firestore.rules',
      '.gitignore',
    ];

    for (const file of rootFiles) {
      const filePath = path.join(PROJECT_ROOT, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    }

    // ── 4. Generate and add .env.example ──
    const envExampleContent = getEnvExample();
    archive.append(envExampleContent, { name: 'backend/.env.example' });

    // ── 5. Generate and add README.md ──
    const readmeContent = getReadmeContent();
    archive.append(readmeContent, { name: 'README.md' });

    // ── 6. Add "Other Attributes" folder if it exists ──
    const otherDir = path.join(PROJECT_ROOT, 'Other Attributes');
    if (fs.existsSync(otherDir)) {
      archive.glob('**/*', {
        cwd: otherDir,
        dot: false,
      }, { prefix: 'Other Attributes' });
    }

    console.log('[export] All files queued, finalizing archive...');
    await archive.finalize();

  } catch (err) {
    console.error('[export] Failed to create ZIP:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create project ZIP.', detail: err.message });
    }
  }
});

module.exports = router;
