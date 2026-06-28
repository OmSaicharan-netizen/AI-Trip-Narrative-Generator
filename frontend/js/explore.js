/**
 * explore.js — Explore Community Narratives
 * ──────────────────────────────────────────────
 * Manages fetching public narratives, debouncing filters, sorting,
 * rendering cards with counts, wishlisting, sharing, and detail modals.
 */

let _explorePage = 1;
let _exploreSearch = '';
let _exploreSortBy = 'recent';
let _exploreDest = '';
let _exploreAuthor = '';
let _exploreRating = '';
let _exploreDate = '';
let _exploreData = [];

window.initExplore = function () {
  _explorePage = 1;
  loadExploreGrid();
};

window.toggleAdvancedFilters = function() {
  const panel = document.getElementById('advancedExploreFilters');
  const toggleText = document.getElementById('advFilterToggleText');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    if (toggleText) toggleText.textContent = 'Hide Filters';
  } else {
    panel.classList.add('hidden');
    if (toggleText) toggleText.textContent = 'Show Filters';
  }
};

window.clearExploreFilters = function() {
  ['exploreSearch', 'filterDest', 'filterAuthor', 'filterRatingScore', 'filterDateRange'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sortBy = document.getElementById('exploreSortBy');
  if (sortBy) sortBy.value = 'recent';

  _exploreSearch = '';
  _exploreDest = '';
  _exploreAuthor = '';
  _exploreRating = '';
  _exploreDate = '';
  _exploreSortBy = 'recent';
  _explorePage = 1;

  loadExploreGrid();
};

async function loadExploreGrid() {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;

  grid.innerHTML = Array(3).fill(0).map(() => `
    <div class="bg-white rounded-3xl overflow-hidden border border-outline-variant shadow-ambient h-80 skeleton"></div>
  `).join('');

  try {
    const params = new URLSearchParams({
      page: _explorePage,
      limit: 9,
      search: _exploreSearch,
      sortBy: _exploreSortBy,
      destination: _exploreDest,
      author: _exploreAuthor,
      rating: _exploreRating,
      date: _exploreDate,
    });

    const token = await window.getIdToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/explore?${params}`, { headers });
    const json = await res.json();
    _exploreData = json.records || [];

    if (_exploreData.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-24 text-on-surface-variant">
          <span class="material-symbols-outlined text-6xl text-outline mb-4 block">travel_explore</span>
          <h3 class="font-headline-md text-headline-md mb-2">No travel narratives found</h3>
          <p class="font-body-md">Try adjusting your filters or search keywords.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = _exploreData.map((rec, idx) => renderExploreCard(rec, idx)).join('');
    renderExplorePagination(json.pagination?.totalPages || 1);

  } catch (e) {
    console.error(e);
    grid.innerHTML = `
      <div class="col-span-full text-center py-24 text-error">
        <span class="material-symbols-outlined text-6xl text-error mb-4 block">wifi_off</span>
        <h3 class="font-headline-md text-headline-md mb-2">Could not load narratives</h3>
        <p class="font-body-md">Check your internet connection or try again later.</p>
      </div>
    `;
  }
}

function renderExploreCard(rec, i) {
  const img = rec.image_url || CARD_IMAGES[i % CARD_IMAGES.length];
  const tone = rec.tone || 'Adventurous';
  const meta = TONE_META[tone] || TONE_META.Adventurous;
  const excerpt = (rec.summary || rec.title || '').replace(/#+\s*/g, '').slice(0, 110) + '…';

  const avgStars = rec.avg_rating 
    ? `<span style="color:#fe6f42;font-size:12px;font-weight:700;">★ ${rec.avg_rating} (${rec.ratings_count})</span>`
    : '<span class="text-xs text-outline font-semibold">Unrated</span>';

  let dateStr = '';
  if (rec.trip_date) {
    dateStr = new Date(rec.trip_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } else if (rec.created_at) {
    dateStr = new Date(rec.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const isWish = rec.is_wishlisted;
  const heartIcon = isWish ? 'favorite' : 'favorite';
  const heartClass = isWish ? 'text-red-500 ms-filled' : 'text-outline-variant hover:text-red-500';

  return `
    <div class="group bg-white rounded-3xl overflow-hidden border border-outline-variant hover:shadow-ambient-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-[480px]">
      <!-- Image cover -->
      <div class="relative h-48 overflow-hidden cursor-pointer" onclick="openExploreModal('${rec.id}')">
        <img src="${img}" alt="${escHtml(rec.route)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
        <div class="absolute top-4 left-4 glass-card px-3 py-1 rounded-full text-xs font-bold ${meta.color}">
          ${meta.icon} ${tone}
        </div>
        <!-- Wishlist toggle heart -->
        <button onclick="event.stopPropagation(); toggleWishlistExplore('${rec.id}', this)" 
                class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-on-surface"
                title="${isWish ? 'Remove from Wishlist' : 'Save to Wishlist'}">
          <span class="material-symbols-outlined ${heartClass}" style="font-size:20px;">${heartIcon}</span>
        </button>
      </div>

      <!-- Content body -->
      <div class="p-6 flex-1 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between text-outline text-xs mb-2 font-label-md">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined" style="font-size:14px;">calendar_today</span>
              ${dateStr}
            </span>
            <span>📍 ${escHtml(rec.destination || rec.route.split(' to ')[1] || 'India')}</span>
          </div>

          <h3 class="font-headline-md text-headline-md text-on-surface mb-2 cursor-pointer hover:text-primary transition-colors line-clamp-1" onclick="openExploreModal('${rec.id}')">
            ${escHtml(rec.title || rec.route || 'Journey')}
          </h3>

          <p class="text-on-surface-variant font-body-md text-sm line-clamp-3 mb-4">${escHtml(excerpt)}</p>
        </div>

        <div class="border-t border-outline-variant/50 pt-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-[10px]">
              ${(rec.author_name || 'U')[0].toUpperCase()}
            </div>
            <div class="flex flex-col">
              <span class="text-xs font-bold text-on-surface leading-tight">${escHtml(rec.author_name || 'Manivtha Creator')}</span>
              <span class="text-[10px] text-outline">Driver: ${escHtml(rec.driver_name)}</span>
            </div>
          </div>

          <div class="flex flex-col items-end">
            ${avgStars}
            <span class="text-[10px] text-outline mt-0.5">❤️ ${rec.wishlist_count} Saves · 🔗 ${rec.shares_count} Shares</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.toggleWishlistExplore = async function(narrativeId, btnEl) {
  if (!window.currentUser) {
    showToast('Please sign in to save stories to your Wishlist.', 'info');
    window.location.replace('/login.html');
    return;
  }

  const icon = btnEl.querySelector('.material-symbols-outlined');
  const cleanId = String(narrativeId).replace('sqlite-', '');

  try {
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`/api/wishlist/${cleanId}`, { method: 'POST' });
    const data = await res.json();

    if (data.added) {
      icon.className = 'material-symbols-outlined text-red-500 ms-filled';
      btnEl.title = 'Remove from Wishlist';
      showToast('Saved to My Wishlist!', 'success');
    } else {
      icon.className = 'material-symbols-outlined text-outline-variant hover:text-red-500';
      btnEl.title = 'Save to Wishlist';
      showToast('Removed from Wishlist.', 'info');
    }

    // Reload explore grid to update count label
    loadExploreGrid();

  } catch(e) {
    showToast('Failed to update wishlist.', 'error');
  }
};

window.openExploreModal = async function(narrativeId) {
  const cleanId = String(narrativeId).replace('sqlite-', '');
  const modal = document.getElementById('detailModal');
  const body = document.getElementById('modalBody');

  if (!modal || !body) return;

  body.innerHTML = `
    <div class="flex justify-center py-16">
      <div class="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  `;
  modal.classList.add('open');

  try {
    // Fetch full narrative from backend (includes content body)
    const res = await fetch(`/api/history/${cleanId}`);
    const r = await res.json();

    if (!res.ok) throw new Error(r.error || 'Narrative details not found.');

    const dateStr = r.trip_date 
      ? new Date(r.trip_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    // Load wishlist status if authenticated
    let isWish = false;
    if (window.currentUser) {
      const wishRes = await (window.authFetch || fetch)(`/api/wishlist/${cleanId}/status`);
      const wishData = await wishRes.json();
      isWish = wishData.wishlisted;
    }

    const heartIcon = isWish ? 'favorite' : 'favorite';
    const heartClass = isWish ? 'text-red-500 ms-filled' : 'text-outline-variant hover:text-red-500';

    const narrativeHtml = (r.ai_response || r.narrative || '').split('\n').map(line => {
      const trimmed = line.trim();
      return trimmed ? `<p class="font-body-md text-body-md text-on-surface-variant mb-4 leading-relaxed">${escHtml(trimmed)}</p>` : '';
    }).join('');

    body.innerHTML = `
      <div class="space-y-6">
        
        <!-- Header row -->
        <div class="flex items-start justify-between gap-4 flex-wrap border-b border-outline-variant/60 pb-5">
          <div class="flex-1 min-w-0">
            <h2 class="font-headline-lg text-headline-lg text-primary mb-1">${escHtml(r.title || r.route || 'Untitled Journey')}</h2>
            <div class="flex flex-wrap gap-2 text-xs font-semibold text-outline items-center">
              <span>👤 Chauffeur: ${escHtml(r.driver_name)}</span>
              <span>·</span>
              <span>🚗 Vehicle: ${escHtml(r.vehicle_type)}</span>
              <span>·</span>
              <span>📅 Date: ${dateStr || 'Recent'}</span>
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <!-- Listen -->
            <button id="modalListenBtn"
                    class="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-full text-sm font-label-md hover:bg-primary-container transition-all">
              <span class="material-symbols-outlined" style="font-size:18px;">play_circle</span> Listen
            </button>
            <!-- Wishlist Heart -->
            <button onclick="toggleWishlistExplore('${cleanId}', this)" 
                    class="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-surface transition-all"
                    title="${isWish ? 'Remove from Wishlist' : 'Save to Wishlist'}">
              <span class="material-symbols-outlined ${heartClass}" style="font-size:20px;">${heartIcon}</span>
            </button>
            <!-- Copy -->
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(r.ai_response || '')}); showToast('Narrative copied!', 'success')"
                    class="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant transition-all border border-outline-variant" title="Copy">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
            <!-- Report flag -->
            <button onclick="openReportForm('${cleanId}')" 
                    class="p-2 text-error hover:bg-error-container/30 border border-outline-variant hover:border-error-container rounded-lg transition-all" title="Report Inappropriate Content">
              <span class="material-symbols-outlined">flag</span>
            </button>
          </div>
        </div>

        <!-- Narrative body -->
        <div class="narrative-prose p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/60 max-h-[350px] overflow-y-auto font-body-md text-on-surface-variant shadow-inner">
          ${narrativeHtml || '<p class="text-outline italic">No narrative text generated.</p>'}
        </div>

        <!-- Social Share buttons -->
        ${SharingService.renderShareButtons(cleanId, r.title || r.route, '')}

        <!-- Ratings & Reviews Section -->
        <div id="modalReviewsSection"></div>
      </div>
    `;

    // Bind tts buttons safely
    document.getElementById('modalListenBtn')?.addEventListener('click', () => {
      if (window.TTS) {
        window.TTS.speak(r.ai_response || '');
        showToast('▶ Narration started…', 'info');
      }
    });

    // Load reviews
    RatingsReviewsService.loadRatingsAndReviews(cleanId, r.user_id);

  } catch(e) {
    console.error(e);
    body.innerHTML = `<p class="text-error py-10 text-center font-bold">${e.message}</p>`;
  }
};

window.openReportForm = function(narrativeId) {
  if (!window.currentUser) {
    showToast('Please sign in to report content.', 'info');
    window.location.replace('/login.html');
    return;
  }
  const reason = prompt('Please state the reason for reporting this narrative as inappropriate:');
  if (reason === null) return;
  if (!reason.trim()) {
    showToast('Reason is required to submit a report.', 'error');
    return;
  }

  submitReport(narrativeId, reason.trim());
};

async function submitReport(narrativeId, reason) {
  try {
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`/api/reports/${narrativeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit report');
    showToast('Report submitted. Thank you for keeping our community safe.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderExplorePagination(totalPages) {
  const pag = document.getElementById('explorePagination');
  if (!pag) return;
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn ${_explorePage <= 1 ? 'opacity-40 cursor-not-allowed' : ''}" 
    onclick="explorePageChange(${_explorePage - 1})" ${_explorePage <= 1 ? 'disabled' : ''}>‹</button>`;

  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn ${p === _explorePage ? 'active' : ''}" onclick="explorePageChange(${p})">${p}</button>`;
  }

  html += `<button class="page-btn ${_explorePage >= totalPages ? 'opacity-40 cursor-not-allowed' : ''}" 
    onclick="explorePageChange(${_explorePage + 1})" ${_explorePage >= totalPages ? 'disabled' : ''}>›</button>`;

  pag.innerHTML = html;
}

window.explorePageChange = function(p) {
  _explorePage = p;
  loadExploreGrid();
  document.getElementById('exploreSection')?.scrollIntoView({ behavior: 'smooth' });
};

// Wire event listeners on load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('advFilterToggle')?.addEventListener('click', toggleAdvancedFilters);
  document.getElementById('clearExploreFilters')?.addEventListener('click', clearExploreFilters);

  // Debounced search input
  const searchInput = document.getElementById('exploreSearch');
  if (searchInput) {
    let t;
    searchInput.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        _exploreSearch = searchInput.value.trim();
        _explorePage = 1;
        loadExploreGrid();
      }, 400);
    });
  }

  // Bind dropdown filters
  document.getElementById('exploreSortBy')?.addEventListener('change', (e) => {
    _exploreSortBy = e.target.value;
    _explorePage = 1;
    loadExploreGrid();
  });

  const bindFilterInput = (id, paramKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', (e) => {
        window['_' + paramKey] = e.target.value;
        _explorePage = 1;
        loadExploreGrid();
      });
    } else {
      let t;
      el.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          window['_' + paramKey] = e.target.value.trim();
          _explorePage = 1;
          loadExploreGrid();
        }, 400);
      });
    }
  };

  bindFilterInput('filterDest', 'exploreDest');
  bindFilterInput('filterAuthor', 'exploreAuthor');
  bindFilterInput('filterRatingScore', 'exploreRating');
  bindFilterInput('filterDateRange', 'exploreDate');
});
