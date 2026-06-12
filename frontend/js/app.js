/**
 * app.js — SPA Router & Global Orchestration
 * ────────────────────────────────────────────
 * Manages view switching, nav link state, global search,
 * trending stories on landing page, and wires all cross-module events.
 *
 * Views: explore | generate | history | analytics | admin
 */

// ── Constants ────────────────────────────────────────────────
const VIEWS      = ['explore', 'generate', 'history', 'analytics', 'admin', 'about', 'contact'];
const TOUR_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1501761095374-cf0a72b89ae1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=800&q=80',
];

// ── View Navigation ──────────────────────────────────────────
window.navigateTo = function (viewName) {
  if (!VIEWS.includes(viewName)) return;

  // Hide all views
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) { el.classList.remove('active'); }
  });

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update nav links
  document.querySelectorAll('.nav-link').forEach(a => {
    const linkView = a.getAttribute('data-nav');
    if (linkView === viewName) {
      a.classList.add('text-primary', 'border-b-2', 'border-primary', 'pb-1');
      a.classList.remove('text-on-surface-variant');
    } else {
      a.classList.remove('text-primary', 'border-b-2', 'border-primary', 'pb-1');
      a.classList.add('text-on-surface-variant');
    }
  });

  // Update URL hash (no page reload)
  history.pushState({ view: viewName }, '', `#${viewName}`);

  // Close mobile menu
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) mobileMenu.classList.add('hidden');

  // Lazy-load data for each view — wait for auth
  switch (viewName) {
    case 'explore':   loadTrendingStories(); break;
    case 'history':
      if (typeof loadHistory === 'function')   loadHistory();
      break;
    case 'analytics': if (typeof loadAnalytics === 'function') loadAnalytics(); break;
    case 'admin':     if (typeof initAdmin === 'function')     initAdmin();     break;
    case 'generate':
      if (document.getElementById('step-3') && !document.getElementById('step-3').classList.contains('hidden')) {
        if (typeof resetWizard === 'function') resetWizard();
      }
      break;
  }

  // Detach Firestore history listener when leaving history view
  if (viewName !== 'history' && typeof unloadHistory === 'function') {
    unloadHistory();
  }
};

// ── Wire all nav links & anchor hrefs ────────────────────────
function wireNavLinks() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      const view = el.getAttribute('data-nav');
      if (view) {
        e.preventDefault();
        navigateTo(view);
      }
    });
  });
}

// ── Hash-based routing on load ────────────────────────────────
function routeFromHash() {
  const hash = window.location.hash.replace('#', '').split('?')[0];
  if (VIEWS.includes(hash)) {
    navigateTo(hash);
  } else {
    navigateTo('explore');
  }
}

// ── Global Toast ─────────────────────────────────────────────
window.showToast = function (msg, type = 'info', duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, duration);
};

// ── Mobile Menu ───────────────────────────────────────────────
function initMobileMenu() {
  const btn  = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    menu.classList.toggle('hidden');
    btn.querySelector('.material-symbols-outlined').textContent =
      menu.classList.contains('hidden') ? 'menu' : 'close';
  });
}

// ── Trending Stories on Landing Page ─────────────────────────
window.loadTrendingStories = async function () {
  const grid = document.getElementById('trendingGrid');
  if (!grid) return;

  grid.innerHTML = [0, 1, 2].map(() =>
    `<div class="bg-white rounded-3xl overflow-hidden shadow-ambient border border-outline-variant h-80 skeleton"></div>`
  ).join('');

  try {
    const res  = await fetch(`${API_BASE}/history?limit=6`);
    const json = await res.json();
    const list = (json.records || []).slice(0, 3);

    if (!list.length) {
      grid.innerHTML = `<div class="col-span-3 text-center py-16 text-on-surface-variant font-body-md">
        No narratives yet. <a href="#generate" data-nav="generate" class="text-primary underline">Create your first story!</a>
      </div>`;
      wireNavLinks();
      return;
    }

    const tones = { Adventurous: '⚡', Poetic: '🌸', Informative: '📖', Humorous: '😄' };

    grid.innerHTML = list.map((rec, i) => {
      const img = TOUR_IMAGES[i % TOUR_IMAGES.length];
      const tone = rec.tone || 'Adventurous';
      const excerpt = (rec.narrative || rec.title || '').replace(/#+\s*/g, '').slice(0, 120) + '…';
      const stars = rec.rating ? '★'.repeat(rec.rating) : '';
      return `
        <div class="bg-white rounded-3xl overflow-hidden shadow-ambient group hover:shadow-ambient-lg transition-all cursor-pointer"
             onclick="openModal(${rec.id})">
          <div class="relative h-52 overflow-hidden">
            <img src="${img}" alt="${rec.route || 'Trip'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            <div class="absolute top-4 left-4 glass-card px-3 py-1 rounded-full text-xs font-bold text-primary">
              ${tones[tone] || '🗺️'} ${tone}
            </div>
            ${stars ? `<div class="absolute top-4 right-4 glass-card px-3 py-1 rounded-full text-xs font-bold text-secondary">${stars}</div>` : ''}
          </div>
          <div class="p-6">
            <h4 class="font-headline-md text-headline-md mb-2 text-on-surface">${escHtml(rec.title || rec.route || 'Untitled')}</h4>
            <p class="text-on-surface-variant text-sm line-clamp-2 mb-4">${escHtml(excerpt)}</p>
            <div class="flex items-center justify-between">
              <span class="text-xs text-outline font-label-md">
                ${rec.driver_name ? '👤 ' + escHtml(rec.driver_name) : ''}
              </span>
              <span class="text-primary font-label-md text-sm flex items-center gap-1">
                Read <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
              </span>
            </div>
          </div>
        </div>`;
    }).join('');

    // Update hero counter
    const heroTotal = document.getElementById('heroTotal');
    if (heroTotal && json.pagination) {
      heroTotal.textContent = `${json.pagination.total}+`;
    }

    wireNavLinks();
  } catch (e) {
    console.error('loadTrendingStories error:', e);
    grid.innerHTML = `<div class="col-span-3 text-center py-10 text-on-surface-variant">
      <span class="material-symbols-outlined text-4xl mb-2 block text-outline">wifi_off</span>
      Could not load stories. Is the server running?
    </div>`;
  }
};

// ── Detail Modal (shared: history + explore) ──────────────────
window.openModal = async function (id) {
  const modal = document.getElementById('detailModal');
  const body  = document.getElementById('modalBody');
  if (!modal || !body) return;

  body.innerHTML = '<div class="flex justify-center py-16"><div class="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>';
  modal.classList.add('open');

  try {
    const res  = await fetch(`${API_BASE}/history/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Not found');

    const r = json.record || json;
    const narrativeHtml = (r.narrative || r.body || '').split('\n').map(line =>
      line.startsWith('#') ? `<h2 class="font-headline-md text-headline-md text-primary mt-6 mb-3">${escHtml(line.replace(/#+\s*/, ''))}</h2>`
      : line.trim() ? `<p class="font-body-md text-body-md text-on-surface-variant mb-3 leading-relaxed">${escHtml(line)}</p>` : ''
    ).join('');

    body.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="font-headline-lg text-headline-lg text-primary mb-1">${escHtml(r.title || r.route || 'Untitled')}</h2>
            <p class="text-sm text-on-surface-variant font-label-md">
              ${r.driver_name ? '👤 ' + escHtml(r.driver_name) + ' · ' : ''}
              ${r.route ? '🗺️ ' + escHtml(r.route) + ' · ' : ''}
              ${r.tone ? escHtml(r.tone) : ''}
            </p>
          </div>
          <div class="flex gap-2">
            <button onclick="window.TTS.load(${JSON.stringify(r.narrative || r.body || '')}); window.TTS.speak(${JSON.stringify(r.narrative || r.body || '')}); showToast('Playing narration…', 'info')"
                    class="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-full text-sm font-label-md hover:bg-primary-container transition-all">
              <span class="material-symbols-outlined" style="font-size:18px;">play_circle</span> Listen
            </button>
            <button onclick="navigator.clipboard?.writeText(${JSON.stringify(r.narrative || r.body || '')}); showToast('Copied!', 'success')"
                    class="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant transition-all" title="Copy">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </div>
        </div>

        ${r.rating ? `<div class="flex items-center gap-2">
          <span class="text-secondary-container text-xl">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          ${r.comment ? `<span class="text-sm text-on-surface-variant italic">"${escHtml(r.comment)}"</span>` : ''}
        </div>` : ''}

        <div class="narrative-prose p-6 bg-surface rounded-xl border border-outline-variant max-h-96 overflow-y-auto">
          ${narrativeHtml || '<p class="text-on-surface-variant">No narrative content.</p>'}
        </div>

        <div class="flex flex-wrap gap-3 pt-2">
          ${r.landmarks ? `<div class="text-xs text-outline font-label-md">📍 ${escHtml(r.landmarks)}</div>` : ''}
          ${r.vehicle_type ? `<div class="text-xs text-outline font-label-md">🚗 ${escHtml(r.vehicle_type)}</div>` : ''}
          ${r.trip_date ? `<div class="text-xs text-outline font-label-md">📅 ${new Date(r.trip_date).toLocaleDateString()}</div>` : ''}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<p class="text-error font-body-md">Error loading narrative: ${escHtml(e.message)}</p>`;
  }
};

// ── Global Search ─────────────────────────────────────────────
function initGlobalSearch() {
  const input = document.getElementById('globalSearch');
  if (!input) return;

  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = input.value.trim();
      if (!q) return;
      // Navigate to history and trigger search
      navigateTo('history');
      const histSearch = document.getElementById('historySearch');
      if (histSearch) {
        histSearch.value = q;
        histSearch.dispatchEvent(new Event('input'));
      }
    }, 400);
  });
}

// ── HTML Escape ───────────────────────────────────────────────
window.escHtml = function (str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireNavLinks();
  initMobileMenu();
  initGlobalSearch();

  // Modal close
  document.getElementById('modalClose')?.addEventListener('click', () => {
    document.getElementById('detailModal')?.classList.remove('open');
    window.TTS?.stop();
  });
  document.getElementById('detailModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('open');
      window.TTS?.stop();
    }
  });

  // Back/forward navigation
  window.addEventListener('popstate', (e) => {
    const view = e.state?.view || 'explore';
    navigateTo(view);
  });

  // Route from current hash or default
  routeFromHash();
});
