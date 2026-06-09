/**
 * history.js — My Narratives View  (Stitch: my_narratives)
 * ──────────────────────────────────────────────────────────
 * Loads narrative cards from backend SQLite API.
 * Renders Stitch-faithful narrative grid with:
 *  - Hover/zoom image effect
 *  - Glass badge with tone
 *  - Star rating indicator
 *  - TTS listen button per card
 *  - Search + pagination
 *  - Stats (total, routes, avg rating)
 */

let historyPage   = 1;
let historySearch = '';
let historyTotal  = 0;
const HIST_LIMIT  = 9;

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

// ── Load History ──────────────────────────────────────────────
window.loadHistory = async function () {
  historyPage = 1;
  await fetchHistory();
};

async function fetchHistory() {
  const grid = document.getElementById('historyGrid');
  if (!grid) return;

  // Skeleton loading state
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="bg-white rounded-3xl overflow-hidden border border-outline-variant shadow-ambient">
      <div class="h-52 skeleton w-full"></div>
      <div class="p-6 space-y-3">
        <div class="h-4 skeleton rounded w-1/3"></div>
        <div class="h-6 skeleton rounded w-4/5"></div>
        <div class="h-4 skeleton rounded w-full"></div>
        <div class="h-4 skeleton rounded w-2/3"></div>
      </div>
    </div>`).join('');

  try {
    const params = new URLSearchParams({
      page: historyPage, limit: HIST_LIMIT,
      search: historySearch,
    });
    const res  = await fetch(`${API_BASE}/history?${params}`);
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Request failed');

    const records = json.records || [];
    historyTotal  = json.pagination?.total || records.length;

    // Update stats
    updateHistoryStats(json);

    if (!records.length) {
      grid.innerHTML = `
        <div class="col-span-3 text-center py-24" style="grid-column:1/-1">
          <span class="material-symbols-outlined text-6xl text-outline mb-4 block">auto_stories</span>
          <h3 class="font-headline-md text-headline-md text-on-surface mb-3">
            ${historySearch ? 'No matching narratives' : 'No narratives yet'}
          </h3>
          <p class="text-on-surface-variant font-body-md mb-6">
            ${historySearch ? 'Try a different search term.' : 'Create your first AI-powered travel story.'}
          </p>
          <a href="#generate" data-nav="generate"
             class="inline-flex items-center gap-2 bg-secondary-container text-white px-6 py-3 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-95">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span> Create Narrative
          </a>
        </div>`;
      wireNavLinks?.();
      updateHistoryPagination(json.pagination);
      const count = document.getElementById('historyCount');
      if (count) count.textContent = '';
      return;
    }

    // Render cards
    grid.innerHTML = records.map((rec, i) => renderCard(rec, i)).join('');

    // Wire card actions
    grid.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(el.getAttribute('data-nav'));
      });
    });

    // Scroll-reveal
    grid.querySelectorAll('.narrative-card').forEach((card, idx) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(16px)';
      card.style.transition = `all 0.4s ease-out ${idx * 0.06}s`;
      requestAnimationFrame(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      });
    });

    // Record count
    const count = document.getElementById('historyCount');
    if (count) count.textContent = `${historyTotal} narrative${historyTotal !== 1 ? 's' : ''}`;

    updateHistoryPagination(json.pagination);
  } catch (e) {
    console.error('loadHistory error:', e);
    grid.innerHTML = `
      <div class="col-span-3 text-center py-16" style="grid-column:1/-1">
        <span class="material-symbols-outlined text-5xl text-error mb-3 block">wifi_off</span>
        <p class="text-error font-body-md">Error loading narratives: ${escHtml(e.message)}</p>
        <button onclick="fetchHistory()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all">
          Retry
        </button>
      </div>`;
  }
}

// ── Render Single Card (Stitch: my_narratives card) ───────────
function renderCard(rec, i) {
  const img     = CARD_IMAGES[i % CARD_IMAGES.length];
  const tone    = rec.tone || 'Adventurous';
  const meta    = TONE_META[tone] || TONE_META.Adventurous;
  const excerpt = (rec.narrative || rec.title || '')
    .replace(/#+\s*/g, '').replace(/\*\*/g, '').slice(0, 100) + '…';
  const stars   = rec.rating
    ? `<span class="text-secondary-container text-sm">${'★'.repeat(rec.rating)}${'☆'.repeat(5 - rec.rating)}</span>`
    : '';
  const date    = rec.trip_date
    ? new Date(rec.trip_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : rec.created_at
      ? new Date(rec.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

  return `
    <div class="narrative-card group bg-surface-container-lowest rounded-3xl overflow-hidden border border-outline-variant hover:shadow-ambient-lg transition-all duration-300 hover:-translate-y-1">
      <!-- Image -->
      <div class="relative h-52 overflow-hidden cursor-pointer" onclick="openModal(${rec.id})">
        <img src="${img}" alt="${escHtml(rec.route || 'Trip')}"
             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
             loading="lazy">
        <!-- Tone badge -->
        <div class="absolute top-4 left-4 glass-card px-3 py-1 rounded-full text-xs font-bold ${meta.color}">
          ${meta.icon} ${tone}
        </div>
        <!-- Rating badge -->
        ${stars ? `<div class="absolute top-4 right-4 glass-card px-3 py-1 rounded-full text-xs font-bold">${stars}</div>` : ''}
        <!-- Listen button overlay -->
        <button class="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary-container"
                onclick="event.stopPropagation(); listenCard(${rec.id})" title="Listen to narration"
                aria-label="Listen to narration">
          <span class="material-symbols-outlined ms-filled" style="font-size:18px;">headphones</span>
        </button>
      </div>

      <!-- Card body -->
      <div class="p-6">
        ${date ? `<div class="flex items-center gap-2 text-on-surface-variant mb-2">
          <span class="material-symbols-outlined" style="font-size:16px;">calendar_today</span>
          <span class="font-label-md text-label-md">${date}</span>
        </div>` : ''}

        <h3 class="font-headline-md text-headline-md text-on-surface mb-2 cursor-pointer hover:text-primary transition-colors"
            onclick="openModal(${rec.id})">
          ${escHtml(rec.title || rec.route || 'Untitled Journey')}
        </h3>

        <p class="text-on-surface-variant font-body-md text-sm line-clamp-2 mb-5">${escHtml(excerpt)}</p>

        <div class="flex items-center justify-between">
          <!-- Driver info -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-xs font-bold text-primary">
              ${rec.driver_name ? rec.driver_name[0].toUpperCase() : '?'}
            </div>
            <span class="text-xs font-semibold text-on-surface">${escHtml(rec.driver_name || 'Manivtha')}</span>
          </div>

          <!-- View Story -->
          <button onclick="openModal(${rec.id})"
                  class="text-primary font-label-md text-sm flex items-center gap-1 hover:gap-3 transition-all group/btn">
            View Story
            <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>`;
}

// ── Listen directly from card ─────────────────────────────────
window.listenCard = async function (id) {
  try {
    const res  = await fetch(`${API_BASE}/history/${id}`);
    const json = await res.json();
    const text = (json.record || json).narrative || '';
    if (!text) { showToast('No narrative text to play.', 'info'); return; }
    window.TTS.load(text);
    window.TTS.speak(text);
    showToast('▶ Playing narration…', 'info');
  } catch (e) {
    showToast('Could not load narrative for playback.', 'error');
  }
};

// ── Update Stats ──────────────────────────────────────────────
function updateHistoryStats(json) {
  const total  = document.getElementById('statTotal');
  const routes = document.getElementById('statRoutes');
  const rating = document.getElementById('statRating');

  if (total)  total.textContent  = `${json.pagination?.total || 0} Stories`;

  const records = json.records || [];
  const uniqueRoutes = new Set(records.map(r => r.route).filter(Boolean));
  if (routes) routes.textContent = `${uniqueRoutes.size} Locations`;

  const rated = records.filter(r => r.rating > 0);
  const avg   = rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : '—';
  if (rating) rating.textContent = avg !== '—' ? `${avg} ★` : '—';
}

// ── Pagination ────────────────────────────────────────────────
function updateHistoryPagination(pagination) {
  const pag = document.getElementById('historyPagination');
  if (!pag || !pagination) { if(pag) pag.innerHTML = ''; return; }

  const { page, totalPages } = pagination;
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn ${page <= 1 ? 'opacity-40 cursor-not-allowed' : ''}"
    onclick="if(${page} > 1){ historyPage = ${page - 1}; fetchHistory(); }"
    ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`;

  for (let p = 1; p <= totalPages; p++) {
    if (p === page || p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      html += `<button class="page-btn ${p === page ? 'active' : ''}"
        onclick="historyPage = ${p}; fetchHistory();">${p}</button>`;
    } else if (p === page - 2 || p === page + 2) {
      html += `<span class="text-outline px-1 self-center">…</span>`;
    }
  }

  html += `<button class="page-btn ${page >= totalPages ? 'opacity-40 cursor-not-allowed' : ''}"
    onclick="if(${page} < ${totalPages}){ historyPage = ${page + 1}; fetchHistory(); }"
    ${page >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>`;

  pag.innerHTML = html;
}

// ── Search ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('historySearch');
  if (!searchInput) return;

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      historySearch = searchInput.value.trim();
      historyPage   = 1;
      fetchHistory();
    }, 350);
  });
});
