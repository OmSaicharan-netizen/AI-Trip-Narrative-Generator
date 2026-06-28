/**
 * backend/routes/photos.js — Trip Photo Storage API
 * ──────────────────────────────────────────────────
 * POST   /api/photos/upload          Upload up to 20 photos (multipart/form-data)
 * GET    /api/photos/:narrativeId    List photos for a narrative (metadata only)
 * GET    /api/photos/single/:id      Serve a photo as binary image
 * DELETE /api/photos/:photoId        Delete a photo by Turso id
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const db      = require('../db/database');

// ── Multer: memory storage, 5 MB limit ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024, files: 20 }, // 5 MB, max 20 files
  fileFilter(_req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Auth: verifyToken applied at server.js level — req.user is available.

// ── POST /api/photos/upload ─────────────────────────────────────
/**
 * Body: multipart/form-data
 *   files[]     — image files (field name "photos")
 *   narrativeId — integer (optional, can be attached after generation)
 */
router.post('/upload', upload.array('photos', 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photo files received.' });
    }

    const narrativeId = req.body.narrativeId ? Number(req.body.narrativeId) : null;
    const userId      = req.user?.uid || null;

    const savedPhotos = [];

    for (const file of files) {
      // Convert buffer to Base64
      const base64Data = file.buffer.toString('base64');

      const photoId = await db.insertPhoto({
        narrativeId,
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        data:     base64Data,
        size:     file.size,
      });

      savedPhotos.push({
        photoId,
        filename:  file.originalname,
        mimeType:  file.mimetype,
        size:      file.size,
        url:       `/api/photos/single/${photoId}`,
      });
    }

    console.log(`[photos] Uploaded ${savedPhotos.length} photos for narrativeId=${narrativeId}, userId=${userId || 'anon'}`);

    return res.json({
      uploaded: savedPhotos.length,
      photos:   savedPhotos,
    });

  } catch (err) {
    console.error('[photos] Upload error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Max 5 MB per photo.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Max 20 photos.' });
    }
    return res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// ── GET /api/photos/single/:photoId ────────────────────────────
router.get('/single/:photoId', async (req, res) => {
  try {
    const photo = await db.getPhotoById(req.params.photoId);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });

    const imgBuffer = Buffer.from(photo.data, 'base64');
    res.set('Content-Type', photo.mimeType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // cache 1 day
    return res.send(imgBuffer);

  } catch (err) {
    console.error('[photos] Serve error:', err);
    return res.status(500).json({ error: 'Could not retrieve photo.' });
  }
});

// ── GET /api/photos/:narrativeId ────────────────────────────────
router.get('/:narrativeId', async (req, res) => {
  try {
    const narrativeId = Number(req.params.narrativeId);
    if (isNaN(narrativeId)) return res.status(400).json({ error: 'Invalid narrativeId.' });

    const photos = await db.getPhotosByNarrativeId(narrativeId);

    const list = photos.map(p => ({
      photoId:   String(p.id),
      filename:  p.filename,
      mimeType:  p.mime_type,
      size:      p.size,
      createdAt: p.created_at,
      url:       `/api/photos/single/${p.id}`,
    }));

    return res.json({ narrativeId, total: list.length, photos: list });

  } catch (err) {
    console.error('[photos] List error:', err);
    return res.status(500).json({ error: 'Could not retrieve photos.' });
  }
});

// ── DELETE /api/photos/:photoId ─────────────────────────────────
router.delete('/:photoId', async (req, res) => {
  try {
    await db.deletePhoto(req.params.photoId);
    return res.json({ deleted: true, photoId: req.params.photoId });
  } catch (err) {
    console.error('[photos] Delete error:', err);
    return res.status(500).json({ error: 'Could not delete photo.' });
  }
});

module.exports = router;
