/**
 * history.js — My Narratives View (Stitch: my_narratives)
 * ─────────────────────────────────────────────────────────
 * PRIMARY DATA SOURCE: Firestore real-time listener (onSnapshot)
 * FALLBACK:           SQLite REST API /api/history (when Firestore unavailable)
 *
 * Each user sees ONLY their own narratives (userId filter).
 * New narratives appear INSTANTLY without any page refresh.
 * Supports: view, search, delete, replay narration.
 */

// ── Module state ─────────────────────────────────────────────
let _narratives         = [];      // full list from Firestore
let _filteredNarratives = [];      // after search filter
let _unsubscribeFn      = null;    // Firestore listener cleanup
let _historyPage        = 1;
const HIST_PAGE_SIZE    = 9;
let _historySearch      = '';
let _firestoreAvail     = false;

const CARD_IMAGES = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1501761095374-cf0a72b89ae1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1433838552652-f9a46b332c40?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=80',
];

const TONE_META = {
  Adventurous: { icon: '⚡', color: 'bg-primary-fixed/40 text-primary' },
  Poetic:      { icon: '🌸', color: 'bg-secondary-fixed/40 text-secondary' },
  Informative: { icon: '📖', color: 'bg-tertiary-fixed/40 text-tertiary' },
  Humorous:    { icon: '😄', color: 'bg-surface-container text-on-surface-variant' },
};

// ── Public: called by app.js when History view is activated ──
window.loadHistory = function () {
  _historyPage   = 1;
  _historySearch = '';

  const searchInput = document.getElementById('historySearch');
  if (searchInput) searchInput.value = '';

  // Detach old listener before creating a new one
  detachListener();
  console.log('[history] Loading My Narratives view');

  // Wait for user to be available
  onUserReady((user) => {
    if (!user) { showHistoryEmpty('Sign in to view your narratives.'); return; }
    console.log(`[history] User ready: ${user.uid} — loading narratives`);

    _firestoreAvail = !!(window.FirestoreService && firebaseDb);

    if (_firestoreAvail) {
      attachFirestoreListener(user.uid);
    } else {
      console.warn('[history] Firestore unavailable — falling back to REST API');
      fetchHistoryFallback(user);
    }
  });
};

// ── Stop the Firestore listener when leaving the view ────────
window.unloadHistory = function () { detachListener(); };

function detachListener() {
  if (_unsubscribeFn) {
    _unsubscribeFn();
    _unsubscribeFn = null;
    console.log('[history] Firestore listener detached');
  }
}

// ── Firestore real-time listener ──────────────────────────────
function attachFirestoreListener(userId) {
  showHistoryLoading();

  console.log(`[history] Attaching Firestore listener for userId=${userId}`);

  // Try with orderBy first (needs composite index).
  // If index is missing, Firestore returns an error with a link to create it.
  // We fall back to fetching without orderBy and sort client-side.
  let tried = false;

  function tryListen(withOrder) {
    let query = FirestoreService.listenUserNarratives
      ? undefined
      : null;

    // Use the raw Firestore query if we need to try without orderBy
    if (!withOrder && firebaseDb) {
      const unsubscribe = firebaseDb
        .collection('narratives')
        .where('userId', '==', userId)
        .onSnapshot(
          (s) => {
            const data = s.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const ta = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
                const tb = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
                return tb - ta;
              });
            _narratives = data.map(normalizeNarrative);
            console.log(`[history] Listener (no-order fallback): ${data.length} narratives`);
            applySearchAndRender();
          },
          (e) => {
            console.error('[history] Fallback listener error:', e.message);
            fetchHistoryFallback();
          }
        );
      // unsubscribe IS the return value of onSnapshot—assign directly, not wrapped
      _unsubscribeFn = unsubscribe;
      return;
    }

    // Primary path: listenUserNarratives (uses where + orderBy)
    _unsubscribeFn = FirestoreService.listenUserNarratives(userId, ({ data, error }) => {
      if (error) {
        console.error('[history] Firestore listener error:', error);
        // Log the index creation URL if it's embedded in the error message
        const indexMatch = error.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
        if (indexMatch) {
          console.warn('[history] 🔗 Create missing Firestore index at:', indexMatch[0]);
        }
        if (!tried && (error.includes('index') || error.includes('Index'))) {
          tried = true;
          console.warn('[history] Composite index missing — retrying without orderBy');
          // Detach current listener
          if (_unsubscribeFn) { _unsubscribeFn(); _unsubscribeFn = null; }
          tryListen(false);   // Fall back to no-order query
        } else {
          fetchHistoryFallback();
        }
        return;
      }

      _narratives = data.map(normalizeNarrative);
      console.log(`[history] Real-time update: ${data.length} narratives`);
      applySearchAndRender();
    });
  }

  tryListen(true);
}

// ── Apply search filter and render ───────────────────────────
function applySearchAndRender() {
  const q = _historySearch.toLowerCase().trim();

  // Always exclude soft-deleted records from display
  const active = _narratives.filter(r => !r.isDeleted);
  active.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  _filteredNarratives = q
    ? active.filter(r =>
        (r.route             || '').toLowerCase().includes(q) ||
        (r.driverName        || '').toLowerCase().includes(q) ||
        (r.title             || '').toLowerCase().includes(q) ||
        (r.destination       || '').toLowerCase().includes(q) ||
        (r.startingLocation  || '').toLowerCase().includes(q) ||
        (r.narrative         || '').toLowerCase().slice(0, 300).includes(q)
      )
    : [...active];

  renderHistoryGrid();
  updateHistoryStats();
  renderHistoryPagination();

  const count = document.getElementById('historyCount');
  if (count) {
    count.textContent = `${_filteredNarratives.length} narrative${_filteredNarratives.length !== 1 ? 's' : ''}`;
  }
}

// ── Render card grid ──────────────────────────────────────────
function renderHistoryGrid() {
  const grid = document.getElementById('historyGrid');
  if (!grid) return;

  const start = (_historyPage - 1) * HIST_PAGE_SIZE;
  const page  = _filteredNarratives.slice(start, start + HIST_PAGE_SIZE);

  if (!_filteredNarratives.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1" class="text-center py-24">
        <span class="material-symbols-outlined" style="font-size:64px;color:#c3c6d5;display:block;margin-bottom:12px;">auto_stories</span>
        <h3 class="font-headline-md text-headline-md text-on-surface mb-3">
          ${_historySearch ? 'No matching narratives' : 'No narratives yet'}
        </h3>
        <p class="font-body-md text-on-surface-variant mb-6">
          ${_historySearch ? 'Try a different search term.' : 'Create your first AI travel story!'}
        </p>
        <a href="#generate" data-nav="generate"
           class="inline-flex items-center gap-2 bg-secondary-container text-white px-6 py-3 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-95">
          <span class="material-symbols-outlined" style="font-size:18px;">add</span> Create Narrative
        </a>
      </div>`;
    wireNavLinks?.();
    return;
  }

  grid.innerHTML = page.map((rec, i) => renderCard(rec, start + i)).join('');

  // ── Event delegation: single listener, replaced cleanly each render ─────
  // We use AbortController so the old listener is removed before adding the new one.
  // Without this, every renderHistoryGrid() call stacks another listener and
  // multiple confirm() dialogs fire/dismiss instantly.
  if (grid._delegateAbort) grid._delegateAbort.abort();
  const abortCtrl = new AbortController();
  grid._delegateAbort = abortCtrl;

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-narrative-id]');
    if (!card) return;

    const narrativeId = card.dataset.narrativeId;

    // ── Delete (highest priority — check first) ──────────────────
    if (e.target.closest('.nc-delete-btn')) {
      e.stopPropagation();
      e.preventDefault();
      deleteNarrativeCard(narrativeId);
      return;
    }

    // ── Listen ───────────────────────────────────────────────────
    if (e.target.closest('.nc-listen-btn')) {
      e.stopPropagation();
      const rec = _narratives.find(r => String(r.id) === narrativeId);
      if (rec) historyListenCard(rec.narrative || '');
      return;
    }

    // ── Open modal — only on explicit open targets ────────────────
    if (e.target.closest('.nc-open-btn')) {
      openNarrativeModal(narrativeId);
      return;
    }
  }, { signal: abortCtrl.signal });

  // Scroll-reveal animation
  grid.querySelectorAll('.narrative-card').forEach((card, idx) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = `all 0.4s ease-out ${idx * 0.06}s`;
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });

  wireNavLinks?.();
}



// ── Render single card ────────────────────────────────────────
function renderCard(rec, i) {
  const img     = CARD_IMAGES[i % CARD_IMAGES.length];
  const tone    = rec.tone || 'Adventurous';
  const meta    = TONE_META[tone] || TONE_META.Adventurous;
  const excerpt = (rec.narrative || rec.title || '')
    .replace(/#+\s*/g, '').replace(/\*\*/g, '').slice(0, 110) + '…';

  const stars = rec.rating
    ? `<span style="color:#fe6f42;font-size:11px;font-weight:700;">${'★'.repeat(rec.rating)}${'☆'.repeat(5 - rec.rating)}</span>`
    : '';

  let dateStr = '';
  if (rec.tripDate) {
    dateStr = new Date(rec.tripDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } else if (rec.createdAt) {
    const d = rec.createdAt?.toDate ? rec.createdAt.toDate() : new Date(rec.createdAt);
    dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const safeId = String(rec.id).replace(/"/g, '&quot;');

  return `
    <div class="narrative-card group bg-surface-container-lowest rounded-3xl overflow-hidden border border-outline-variant hover:shadow-ambient-lg transition-all duration-300 hover:-translate-y-1"
         data-narrative-id="${safeId}">
      <!-- Image -->
      <div class="relative h-52 overflow-hidden cursor-pointer nc-open-btn">
        <img src="${img}" alt="${escHtml(rec.route || 'Trip')}"
             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
             loading="lazy">
        <!-- Tone badge -->
        <div class="absolute top-4 left-4 glass-card px-3 py-1 rounded-full text-xs font-bold ${meta.color}">
          ${meta.icon} ${tone}
        </div>
        <!-- Rating badge -->
        ${stars ? `<div class="absolute top-4 right-4 glass-card px-3 py-1 rounded-full text-xs">${stars}</div>` : ''}
        <!-- Listen overlay -->
        <button class="nc-listen-btn absolute bottom-4 right-4 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary-container"
                title="Listen" aria-label="Listen to narration">
          <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1;">headphones</span>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        ${dateStr ? `<div class="flex items-center gap-2 text-on-surface-variant mb-2">
          <span class="material-symbols-outlined" style="font-size:16px;">calendar_today</span>
          <span class="font-label-md text-label-md">${dateStr}</span>
        </div>` : ''}

        <h3 class="nc-open-btn font-headline-md text-headline-md text-on-surface mb-2 cursor-pointer hover:text-primary transition-colors">
          ${escHtml(rec.title || rec.route || 'Untitled Journey')}
        </h3>

        <p class="text-on-surface-variant font-body-md text-sm line-clamp-2 mb-5">${escHtml(excerpt)}</p>

        <div class="flex items-center justify-between">
          <!-- Driver -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-xs font-bold text-primary">
              ${rec.driverName ? rec.driverName[0].toUpperCase() : '?'}
            </div>
            <span class="text-xs font-semibold text-on-surface">${escHtml(rec.driverName || 'Manivtha')}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <!-- Delete -->
            <button class="nc-delete-btn p-1.5 rounded-lg text-error hover:bg-error-container transition-all"
                    title="Delete narrative" aria-label="Delete">
              <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
            </button>
            <!-- View -->
            <button class="nc-open-btn text-primary font-label-md text-sm flex items-center gap-1 hover:gap-3 transition-all">
              View <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Open narrative in modal — shows ALL generated content ──────────────
window.openNarrativeModal = function (narrativeId) {
  const idStr = String(narrativeId);

  // Search by all possible ID fields (Firestore string id, legacyId int, sqliteId)
  const rec = _narratives.find(r =>
    String(r.id) === idStr ||
    String(r.firestoreId || '') === idStr ||
    String(r.sqliteId || '') === idStr ||
    String(r.legacyId || '') === idStr
  );

  console.log(`[history] openNarrativeModal: id=${idStr}, found=${!!rec}`);

  // If not found in cache, fall back to REST API
  if (!rec) {
    console.warn('[history] openNarrativeModal: id not in cache, falling back to REST openModal():', idStr);
    // Strip any prefix and try as integer
    const numId = idStr.replace('sqlite-', '').replace('fs-', '');
    openModal(numId);
    return;
  }

  const modal = document.getElementById('detailModal');
  const body  = document.getElementById('modalBody');
  if (!modal || !body) { console.error('[history] detailModal or modalBody not found in DOM'); return; }

  console.log('[history] Opening modal for:', rec.title || rec.route, '| id:', narrativeId);

  // ── Format narrative text ──────────────────────────────────────────
  const narrativeText = rec.narrative || '';
  const narrativeHtml = narrativeText
    .split('\n')
    .map(line => {
      const t = line.trim();
      return t ? `<p class="font-body-md text-body-md text-on-surface-variant mb-3 leading-relaxed">${escHtml(t)}</p>` : '';
    })
    .join('');

  // ── Format dates ────────────────────────────────────────────────
  const fmtDate = (val) => {
    if (!val) return null;
    try {
      const d = val?.toDate ? val.toDate() : new Date(val);
      return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return String(val); }
  };
  const fmtDateTime = (val) => {
    if (!val) return null;
    try {
      const d = val?.toDate ? val.toDate() : new Date(val);
      return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return String(val); }
  };

  const tripDateFmt    = fmtDate(rec.tripDate);
  const createdAtFmt   = fmtDateTime(rec.createdAt);

  // ── Quality metrics ──────────────────────────────────────────
  const words = rec.wordCount ?? (narrativeText ? narrativeText.trim().split(/\s+/).filter(Boolean).length : 0);
  const chars = rec.charCount ?? narrativeText.length;
  const qualityOk = words >= 200 && chars >= 3000;

  // ── Status badge ──────────────────────────────────────────────
  const status = rec.status || 'active';
  const statusColors = {
    active:   'bg-tertiary-fixed/40 text-tertiary',
    archived: 'bg-error-container text-error',
    draft:    'bg-surface-container text-on-surface-variant',
  };
  const statusBadge = `<span class="badge ${statusColors[status] || statusColors.active}">${escHtml(status)}</span>`;

  // ── Social caption + hashtags ───────────────────────────────
  const socialCaption = rec.socialCaption ||
    rec.social_caption ||
    rec.socialMediaContent?.caption || '';
  // Extract hashtags from the caption or stored hashtags array
  const hashtags = rec.hashtags ||
    rec.socialMediaContent?.hashtags ||
    (socialCaption.match(/#[\w\u0900-\u097F]+/g) || []);
  const captionText = socialCaption.replace(/#[\w\u0900-\u097F]+/g, '').trim();

  // ── Rating stars ───────────────────────────────────────────────
  const starsHtml = rec.rating
    ? `<span style="color:#fe6f42;font-size:20px;">${'\u2605'.repeat(rec.rating)}${'\u2606'.repeat(5 - rec.rating)}</span>`
    : '';

  // ── Build modal HTML ────────────────────────────────────────────
  body.innerHTML = `
    <div class="space-y-6">

      <!-- ── Header: Title + Actions ───────────────────────────────── -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 flex-wrap mb-2">
            ${statusBadge}
            ${starsHtml ? `<div>${starsHtml}</div>` : ''}
            ${createdAtFmt ? `<span class="text-xs text-outline font-label-md">📅 Created ${escHtml(createdAtFmt)}</span>` : ''}
          </div>
          <h2 class="font-headline-lg text-headline-lg text-primary leading-tight">${escHtml(rec.title || rec.route || 'Untitled Journey')}</h2>
          ${rec.comment ? `<p class="text-sm text-on-surface-variant italic mt-1">"${escHtml(rec.comment)}"</p>` : ''}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button id="modalListenBtn"
                  class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-full text-sm font-label-md hover:bg-primary-container transition-all">
            <span class="material-symbols-outlined" style="font-size:18px;">play_circle</span> Listen
          </button>
          <button id="modalCopyBtn"
                  class="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant transition-all border border-outline-variant" title="Copy narrative">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
        </div>
      </div>

      <!-- ── Detail grid ─────────────────────────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-outline-variant/60">
        <!-- Route / Vehicle / Dates info -->
        <div class="space-y-4 md:col-span-1 bg-surface-container-low p-5 rounded-2xl border border-outline-variant/40">
          <h4 class="font-label-md text-primary uppercase tracking-wider text-xs">Trip Summary</h4>
          
          <div class="space-y-3 font-body-md text-sm text-on-surface-variant">
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-lg">trip_origin</span>
              <div>
                <p class="font-bold text-xs text-outline">Route</p>
                <p>${escHtml(rec.routeInfo?.route || rec.route || '—')}</p>
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-lg">directions_car</span>
              <div>
                <p class="font-bold text-xs text-outline">Vehicle Info</p>
                <p>${escHtml(rec.vehicleInfo?.type || rec.vehicleType || '—')} (${escHtml(rec.vehicleInfo?.driver || rec.driverName || '—')})</p>
              </div>
            </div>

            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-lg">calendar_today</span>
              <div>
                <p class="font-bold text-xs text-outline">Start & Reaching Dates</p>
                <p>${tripDateFmt ? escHtml(tripDateFmt) : '—'}${rec.reachingDate && rec.reachingDate !== rec.tripDate ? ` to ${escHtml(fmtDate(rec.reachingDate))}` : ''}</p>
              </div>
            </div>
            
            ${rec.landmarks ? `
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-lg">place</span>
              <div>
                <p class="font-bold text-xs text-outline">Landmarks</p>
                <p class="text-xs">${escHtml(rec.landmarks)}</p>
              </div>
            </div>` : ''}

            ${rec.highlights ? `
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-lg">star</span>
              <div>
                <p class="font-bold text-xs text-outline">Highlights</p>
                <p class="text-xs">${escHtml(rec.highlights)}</p>
              </div>
            </div>` : ''}
          </div>
        </div>

        <!-- Narrative body and social content -->
        <div class="md:col-span-2 space-y-5">
          <div>
            <h4 class="font-label-md text-primary uppercase tracking-wider text-xs mb-2">Narrative Story</h4>
            <div class="narrative-prose p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/60 max-h-72 overflow-y-auto shadow-inner text-sm font-body-md">
              ${narrativeHtml || '<p class="text-on-surface-variant">No content generated.</p>'}
            </div>
          </div>

          ${captionText ? `
          <div>
            <h4 class="font-label-md text-primary uppercase tracking-wider text-xs mb-2">Social Media Caption</h4>
            <div class="p-4 bg-secondary-container/10 border border-secondary-container/20 rounded-2xl text-xs font-body-md text-on-surface-variant">
              <p class="mb-2 whitespace-pre-wrap">${escHtml(captionText)}</p>
              ${hashtags.length ? `
              <div class="flex flex-wrap gap-1.5 mt-2">
                ${hashtags.map(h => `<span class="text-primary font-semibold hover:underline cursor-pointer">${escHtml(h)}</span>`).join(' ')}
              </div>` : ''}
            </div>
          </div>` : ''}

          ${rec.imagePrompt ? `
          <div>
            <h4 class="font-label-md text-primary uppercase tracking-wider text-xs mb-1">AI Image Generation Prompt</h4>
            <p class="text-xs text-on-surface-variant bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/40 italic font-body-md">
              "${escHtml(rec.imagePrompt)}"
            </p>
          </div>` : ''}
        </div>
      </div>

      <!-- ── Trip Photo Gallery (loaded async) ──────────────── -->
      <div id="modalPhotoSection" class="hidden pt-4 border-t border-outline-variant/60">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-label-md text-primary uppercase tracking-wider text-xs flex items-center gap-2">
            <span class="material-symbols-outlined ms-filled" style="font-size:16px;color:#fe6f42;">photo_library</span>
            Trip Photos
          </h4>
          <span class="text-xs text-on-surface-variant">Click to edit &amp; share on social</span>
        </div>
        <div id="modalPhotoGallery"
             style="display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px;"></div>
      </div>
      
    </div>`;

  // Wire modal buttons safely via addEventListener (no onclick attributes)
  document.getElementById('modalListenBtn')?.addEventListener('click', () => {
    historyListenCard(narrativeText);
  });
  document.getElementById('modalCopyBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(narrativeText)
      .then(() => showToast('Copied!', 'success'))
      .catch(() => showToast('Copy failed.', 'error'));
  });

  // Load photos for this narrative (uses sqliteId which is the legacyId integer)
  const sqliteId = rec?.sqliteId || rec?.legacyId || (typeof rec?.id === 'number' ? rec.id : null);
  if (sqliteId && window.loadNarrativePhotos) {
    loadModalPhotos(sqliteId);
  }

  console.log('[history] Narrative loaded successfully — rendering details for:', rec.title || rec.route);
  modal.classList.add('open');
};

// ── Load photos into the history detail modal ─────────────────
async function loadModalPhotos(narrativeId) {
  if (!narrativeId) return;
  try {
    const res  = await fetch(`${window.API_BASE || ''}/api/photos/${narrativeId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.photos || data.photos.length === 0) return;

    const section = document.getElementById('modalPhotoSection');
    const gallery = document.getElementById('modalPhotoGallery');
    if (!section || !gallery) return;

    section.classList.remove('hidden');
    gallery.innerHTML = data.photos.map((p, i) => `
      <div class="relative group rounded-xl overflow-hidden shadow cursor-pointer"
           style="aspect-ratio:1; animation: thumbIn 0.3s ease ${i * 0.05}s forwards; opacity:0;">
        <img src="${p.url}" alt="${p.filename}"
             class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110">
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button onclick="openPhotoEditor('${p.url}', '${p.filename}', '${p.photoId}')"
                  class="bg-white/90 text-primary p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-white transition-all">
            <span class="material-symbols-outlined" style="font-size:14px;">tune</span> Edit
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.warn('[history] Could not load photos for modal:', err.message);
  }
}


// ── Delete a narrative (soft-delete — record is preserved) ────────────────
window.deleteNarrativeCard = async function (narrativeId) {
  const idStr = String(narrativeId);
  const rec = _narratives.find(r =>
    String(r.id) === idStr ||
    String(r.firestoreId || '') === idStr ||
    String(r.sqliteId || '') === idStr
  );
  const title = rec ? (rec.title || rec.route || 'this narrative') : 'this narrative';

  const confirmed = confirm(
    `Archive "${title}"?\n\nThis will remove the narrative from your list. The record will be preserved and can be recovered if needed.`
  );
  if (!confirmed) return;

  // ✔ Immediately hide from UI (optimistic update)
  _narratives = _narratives.filter(r =>
    String(r.id) !== idStr &&
    String(r.firestoreId || '') !== idStr &&
    String(r.sqliteId || '') !== idStr
  );
  applySearchAndRender();
  showToast('Archiving narrative…', 'info');

  let firestoreOk = false;
  let mongoOk     = false;
  const errors    = [];

  // 1️⃣  Soft-delete in Firestore
  const fsId = rec?.firestoreId || (typeof rec?.id === 'string' && !rec?.id.match(/^\d+$/) ? rec.id : null);
  if (fsId && window.FirestoreService) {
    try {
      const { error } = await FirestoreService.deleteNarrative(fsId);
      if (error) throw new Error(error);
      firestoreOk = true;
      console.log(`[history] Firestore soft-delete OK: ${fsId}`);
    } catch (e) {
      console.error('[history] Firestore soft-delete failed:', e.message);
      errors.push(`Firestore: ${e.message}`);
    }
  } else {
    firestoreOk = true; // no Firestore record to delete
  }

  // 2️⃣  Soft-delete from MongoDB via authenticated backend DELETE
  const legacyId = rec?.sqliteId || rec?.legacyId || (typeof rec?.id === 'number' ? rec.id : null);
  if (legacyId) {
    try {
      const token = await window.getIdToken?.();
      const res = await fetch(`${API_BASE}/history/${legacyId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      mongoOk = true;
      console.log(`[history] MongoDB soft-delete OK: legacyId=${legacyId}`);
    } catch (e) {
      console.error('[history] MongoDB soft-delete failed:', e.message);
      errors.push(`Database: ${e.message}`);
    }
  } else {
    mongoOk = true; // no MongoDB record to delete
  }

  // 3️⃣  Final toast
  if (firestoreOk || mongoOk) {
    if (errors.length) {
      showToast(`Narrative archived (partial — ${errors.join('; ')})`, 'info');
    } else {
      showToast('Narrative archived successfully.', 'success');
    }
  } else {
    if (rec) _narratives.unshift(rec);
    applySearchAndRender();
    showToast(`Archive failed: ${errors.join('; ')}`, 'error');
  }
};

// ── Listen to a card's narrative ─────────────────────────────
window.historyListenCard = function (narrativeText) {
  if (!narrativeText) { showToast('No narrative text to play.', 'info'); return; }
  if (window.TTS) {
    window.TTS.load(narrativeText);
    window.TTS.speak(narrativeText);
    showToast('▶ Playing narration…', 'info');
  }
};

// ── Stats row ─────────────────────────────────────────────────
function updateHistoryStats() {
  const total  = document.getElementById('statTotal');
  const routes = document.getElementById('statRoutes');
  const rating = document.getElementById('statRating');

  const all = _narratives;
  if (total) total.textContent = `${all.length} ${all.length === 1 ? 'Story' : 'Stories'}`;

  const uniqueRoutes = new Set(all.map(r => r.route).filter(Boolean));
  if (routes) routes.textContent = `${uniqueRoutes.size} ${uniqueRoutes.size === 1 ? 'Location' : 'Locations'}`;

  const rated = all.filter(r => r.rating > 0);
  const avg   = rated.length
    ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) + ' ★'
    : '—';
  if (rating) rating.textContent = avg;
}

// ── Pagination ────────────────────────────────────────────────
function renderHistoryPagination() {
  const pag = document.getElementById('historyPagination');
  if (!pag) return;

  const total = _filteredNarratives.length;
  const pages = Math.ceil(total / HIST_PAGE_SIZE);

  if (pages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn ${_historyPage <= 1 ? 'opacity-40 cursor-not-allowed' : ''}"
    onclick="histPageChange(${_historyPage - 1})" ${_historyPage <= 1 ? 'disabled' : ''}>‹</button>`;

  for (let p = 1; p <= pages; p++) {
    const show = p === _historyPage || p === 1 || p === pages || Math.abs(p - _historyPage) <= 1;
    if (show) {
      html += `<button class="page-btn ${p === _historyPage ? 'active' : ''}" onclick="histPageChange(${p})">${p}</button>`;
    } else if (p === _historyPage - 2 || p === _historyPage + 2) {
      html += `<span class="text-outline px-1 self-center">…</span>`;
    }
  }

  html += `<button class="page-btn ${_historyPage >= pages ? 'opacity-40 cursor-not-allowed' : ''}"
    onclick="histPageChange(${_historyPage + 1})" ${_historyPage >= pages ? 'disabled' : ''}>›</button>`;

  pag.innerHTML = html;
}

window.histPageChange = function (p) {
  _historyPage = p;
  renderHistoryGrid();
  renderHistoryPagination();
  document.getElementById('view-history')?.scrollIntoView({ behavior: 'smooth' });
};

// ── REST API fallback ─────────────────────────────────────────
// Called with optional user object for authenticated requests
async function fetchHistoryFallback(user) {
  showHistoryLoading();
  console.log('[history] Fetching via REST fallback (MongoDB)…');

  try {
    // Try to get the auth token for user-scoped request
    let token = null;
    try {
      if (user && user.getIdToken) {
        token = await user.getIdToken();
      } else if (window.currentUser && window.currentUser.getIdToken) {
        token = await window.currentUser.getIdToken();
      } else if (window.getIdToken) {
        token = await window.getIdToken();
      }
    } catch (tokenErr) {
      console.warn('[history] Could not get ID token for REST fallback:', tokenErr.message);
    }

    const params = new URLSearchParams({ page: 1, limit: 100 });

    // Use /my endpoint if we have a token (filters by userId), else use generic
    const endpoint = token
      ? `${API_BASE}/history/my?${params}`
      : `${API_BASE}/history?${params}`;

    console.log(`[history] Fetching from ${token ? '/my (authenticated)' : '/ (public)'}`);

    const res = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

    const rows = json.records || json.data || [];
    console.log(`[history] Fetching user narratives: received ${rows.length} records (total=${json.pagination?.total ?? '?'})`);

    _narratives = rows.map(normalizeNarrative);
    applySearchAndRender();
  } catch (e) {
    console.error('[history] REST fallback error:', e.message);
    showHistoryError(e.message);
  }
}


// ── UI helpers ────────────────────────────────────────────────
function showHistoryLoading() {
  const grid = document.getElementById('historyGrid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="bg-white rounded-3xl overflow-hidden border border-outline-variant shadow-ambient">
      <div class="h-52 skeleton w-full"></div>
      <div class="p-6 space-y-3">
        <div class="h-4 skeleton rounded w-1/3"></div>
        <div class="h-6 skeleton rounded w-4/5"></div>
        <div class="h-4 skeleton rounded w-full"></div>
      </div>
    </div>`).join('');
}

function showHistoryEmpty(msg) {
  const grid = document.getElementById('historyGrid');
  if (grid) grid.innerHTML = `<div style="grid-column:1/-1" class="text-center py-16 text-on-surface-variant font-body-md">${escHtml(msg)}</div>`;
}

function showHistoryError(msg) {
  const grid = document.getElementById('historyGrid');
  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1" class="text-center py-16">
      <span class="material-symbols-outlined text-5xl text-error mb-3 block">wifi_off</span>
      <p class="text-error font-body-md mb-4">${escHtml(msg)}</p>
      <button onclick="loadHistory()" class="px-4 py-2 bg-primary text-white rounded-lg font-label-md text-label-md">Retry</button>
    </div>`;
}

// ── Search wire-up ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('historySearch');
  if (!searchInput) return;

  let t;
  searchInput.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      _historySearch = searchInput.value.trim();
      _historyPage   = 1;
      applySearchAndRender();
    }, 300);
  });
});
