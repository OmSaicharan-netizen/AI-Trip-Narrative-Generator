/**
 * photo-dropzone.js — Drag-and-drop photo upload for Step 2 of narrative wizard
 * ───────────────────────────────────────────────────────────────────────────────
 * Features:
 *   - Drag & drop or click-to-browse (up to 20 photos)
 *   - Client-side compression via canvas (max 1200px wide, ~200 KB)
 *   - Thumbnail grid with remove & preview
 *   - uploadPhotos(narrativeId) — called after narrative generation
 *   - loadNarrativePhotos(narrativeId) — loads photos into gallery in Step 3
 */

'use strict';

// ── Module State ─────────────────────────────────────────────────
window.photoFiles   = [];   // Array of { file: File, previewUrl: string }
window.photoResults = [];   // Array of { photoId, url, filename } from server
const MAX_PHOTOS    = 20;
const MAX_PX        = 1200; // max dimension after compression
const JPEG_QUALITY  = 0.80;

// ── Compress image via canvas ─────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          const ratio = Math.min(MAX_PX / width, MAX_PX / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          JPEG_QUALITY
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Add files (validate + dedupe) ────────────────────────────────
async function addFiles(files) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  let rejected = 0;
  let added    = 0;

  for (const file of Array.from(files)) {
    if (window.photoFiles.length >= MAX_PHOTOS) { break; }
    if (!allowed.includes(file.type) && !file.name.toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/)) {
      rejected++;
      continue;
    }
    // Compress
    const compressed = await compressImage(file);
    const previewUrl = URL.createObjectURL(compressed);
    window.photoFiles.push({
      file:       compressed,
      previewUrl,
      name:       file.name,
      originalType: file.type || 'image/jpeg',
    });
    added++;
  }

  if (rejected > 0) {
    showToast(`${rejected} file(s) skipped — only JPG, PNG, WebP, HEIC allowed.`, 'info');
  }

  renderThumbnails();
  updateDropZoneState();
}

// ── Remove a file ────────────────────────────────────────────────
window.removePhoto = function(index) {
  if (window.photoFiles[index]) {
    URL.revokeObjectURL(window.photoFiles[index].previewUrl);
    window.photoFiles.splice(index, 1);
  }
  renderThumbnails();
  updateDropZoneState();
};

// ── Render thumbnail grid ─────────────────────────────────────────
function renderThumbnails() {
  const grid = document.getElementById('photoThumbGrid');
  if (!grid) return;

  if (window.photoFiles.length === 0) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    return;
  }

  grid.classList.remove('hidden');
  grid.innerHTML = window.photoFiles.map((p, i) => `
    <div class="photo-thumb-item relative group" style="animation: thumbIn 0.25s ease forwards;">
      <img src="${p.previewUrl}" alt="${escHtml ? escHtml(p.name) : p.name}"
           class="w-full h-full object-cover rounded-xl cursor-pointer"
           onclick="openPhotoPreview(${i})" />
      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-xl"></div>
      <button onclick="removePhoto(${i})"
              class="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error"
              title="Remove photo">&times;</button>
      <div class="absolute bottom-1.5 left-1.5 right-8 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full truncate opacity-0 group-hover:opacity-100 transition-opacity">
        ${escHtml ? escHtml(p.name) : p.name}
      </div>
    </div>
  `).join('');
}

// ── Update the drop zone appearance based on file count ──────────
function updateDropZoneState() {
  const zone    = document.getElementById('photoDropZone');
  const counter = document.getElementById('photoCounter');
  const count   = window.photoFiles.length;

  if (!zone) return;
  if (counter) {
    counter.textContent = `${count} / ${MAX_PHOTOS} photos`;
    counter.className   = count >= MAX_PHOTOS
      ? 'text-xs font-semibold text-secondary px-2 py-0.5 bg-secondary-fixed/30 rounded-full'
      : 'text-xs font-semibold text-primary px-2 py-0.5 bg-primary-fixed/40 rounded-full';
  }

  if (count >= MAX_PHOTOS) {
    zone.classList.add('pointer-events-none', 'opacity-60');
  } else {
    zone.classList.remove('pointer-events-none', 'opacity-60');
  }
}

// ── Full-screen preview ───────────────────────────────────────────
window.openPhotoPreview = function(index) {
  const p = window.photoFiles[index];
  if (!p) return;
  const modal = document.getElementById('photoPreviewModal');
  const img   = document.getElementById('photoPreviewImg');
  if (modal && img) {
    img.src = p.previewUrl;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closePhotoPreview = function() {
  const modal = document.getElementById('photoPreviewModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// ── Upload photos to backend ──────────────────────────────────────
window.uploadPhotos = async function(narrativeId) {
  if (!window.photoFiles || window.photoFiles.length === 0) return [];

  const formData = new FormData();
  if (narrativeId) formData.append('narrativeId', narrativeId);

  for (const p of window.photoFiles) {
    const ext      = p.name.split('.').pop() || 'jpg';
    const blobFile = new File([p.file], p.name || `photo.${ext}`, { type: p.originalType || 'image/jpeg' });
    formData.append('photos', blobFile);
  }

  try {
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`${window.API_BASE || ''}/api/photos/upload`, {
      method: 'POST',
      body:   formData,
      // Do NOT set Content-Type — browser will set it with boundary automatically
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    window.photoResults = data.photos || [];
    console.log(`[photos] Uploaded ${window.photoResults.length} photos for narrative ${narrativeId}`);

    // Show uploaded photos in the narrative gallery
    renderNarrativePhotoGallery(window.photoResults);

    return window.photoResults;

  } catch (err) {
    console.error('[photos] Upload error:', err);
    showToast(`Photo upload failed: ${err.message}`, 'error');
    return [];
  }
};

// ── Load photos from backend for an existing narrative ────────────
window.loadNarrativePhotos = async function(narrativeId) {
  if (!narrativeId) return;
  try {
    const res  = await fetch(`${window.API_BASE || ''}/api/photos/${narrativeId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      renderNarrativePhotoGallery(data.photos, true /* fromServer */);
    }
  } catch (err) {
    console.warn('[photos] Could not load photos:', err.message);
  }
};

// ── Render photo gallery in Step 3 narrative view ─────────────────
function renderNarrativePhotoGallery(photos, fromServer = false) {
  const gallery = document.getElementById('narrativePhotoGallery');
  const section = document.getElementById('narrativePhotoSection');
  if (!gallery || !section || !photos || photos.length === 0) return;

  section.classList.remove('hidden');

  gallery.innerHTML = photos.map((p, i) => {
    const src      = fromServer ? p.url : p.url;
    const filename = p.filename || `Photo ${i + 1}`;
    const photoId  = p.photoId;

    return `
      <div class="photo-gallery-item group relative overflow-hidden rounded-2xl shadow-lg cursor-pointer bg-surface-container-low"
           style="animation: thumbIn 0.3s ease ${i * 0.05}s forwards; opacity:0;">
        <img src="${src}" alt="${filename}"
             class="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110"
             onerror="this.src='https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=60'" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <p class="text-white text-xs font-medium truncate">${filename}</p>
          <div class="flex gap-2 mt-2">
            <button onclick="openPhotoEditor('${src}', '${filename}', '${photoId || ''}')"
                    class="flex-1 bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white text-xs py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1">
              <span class="material-symbols-outlined" style="font-size:14px;">tune</span> Edit
            </button>
            <button onclick="downloadEditedPhoto('${src}', '${filename}')"
                    class="flex-1 bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white text-xs py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1">
              <span class="material-symbols-outlined" style="font-size:14px;">download</span> Save
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Download helper ───────────────────────────────────────────────
window.downloadEditedPhoto = function(src, filename) {
  const a = document.createElement('a');
  a.href     = src;
  a.download = filename || 'trip-photo.jpg';
  a.click();
};

// ── Init drop zone (called from DOMContentLoaded) ─────────────────
function initPhotoDropZone() {
  const zone      = document.getElementById('photoDropZone');
  const fileInput = document.getElementById('photoFileInput');
  if (!zone || !fileInput) return;

  // Click to browse
  zone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return; // don't trigger on remove buttons
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files && fileInput.files.length > 0) {
      await addFiles(fileInput.files);
      fileInput.value = ''; // reset so same files can be re-added
    }
  });

  // Drag events
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('photo-drop-active');
  });

  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('photo-drop-active');
    }
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('photo-drop-active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  });

  // Paste from clipboard
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) await addFiles(imageFiles);
  });
}

// ── Hook into existing DOMContentLoaded ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPhotoDropZone();
});
