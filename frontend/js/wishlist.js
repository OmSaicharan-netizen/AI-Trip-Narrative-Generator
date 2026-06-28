/**
 * wishlist.js — User Wishlisted/Saved Narratives
 * ──────────────────────────────────────────────
 * Fetches user's saved narratives, renders them in a beautiful grid,
 * and enables one-click toggle/removal.
 */

let _wishlistPage = 1;
let _wishlistData = [];

const WISHLIST_CARD_IMAGES = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1501761095374-cf0a72b89ae1?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
];

const WISHLIST_TONE_META = {
  Adventurous: { icon: '⚡', color: 'bg-primary-fixed/40 text-primary' },
  Poetic:      { icon: '🌸', color: 'bg-secondary-fixed/40 text-secondary' },
  Informative: { icon: '📖', color: 'bg-tertiary-fixed/40 text-tertiary' },
  Humorous:    { icon: '😄', color: 'bg-surface-container text-on-surface-variant' },
};

window.loadWishlist = function () {
  _wishlistPage = 1;
  loadWishlistGrid();
};

async function loadWishlistGrid() {
  const grid = document.getElementById('wishlistGrid');
  if (!grid) return;

  grid.innerHTML = Array(3).fill(0).map(() => `
    <div class="bg-white rounded-3xl overflow-hidden border border-outline-variant shadow-ambient h-80 skeleton"></div>
  `).join('');

  try {
    const token = await window.getIdToken?.();
    if (!token) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-24 text-on-surface-variant">
          <span class="material-symbols-outlined text-6xl text-outline mb-4 block">lock</span>
          <h3 class="font-headline-md text-headline-md mb-2">Please sign in to view your wishlist</h3>
          <p class="font-body-md">Your saved stories will be stored securely in your account.</p>
        </div>
      `;
      return;
    }

    const params = new URLSearchParams({
      page: _wishlistPage,
      limit: 9,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    const res = await fetch(`/api/wishlist?${params}`, { headers });
    const json = await res.json();
    _wishlistData = json.records || [];

    if (_wishlistData.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-24 text-on-surface-variant">
          <span class="material-symbols-outlined text-6xl text-outline mb-4 block">favorite_border</span>
          <h3 class="font-headline-md text-headline-md mb-2">Your Wishlist is empty</h3>
          <p class="font-body-md">Explore community narratives and save your favorites here!</p>
          <a href="#explore" onclick="navigateTo('explore')" class="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-primary text-white rounded-xl font-label-md text-label-md hover:bg-primary-container transition-all">
            <span class="material-symbols-outlined">explore</span> Explore Stories
          </a>
        </div>
      `;
      document.getElementById('wishlistPagination').innerHTML = '';
      return;
    }

    grid.innerHTML = _wishlistData.map((rec, idx) => renderWishlistCard(rec, idx)).join('');
    renderWishlistPagination(json.pagination?.totalPages || 1);

  } catch (e) {
    console.error(e);
    grid.innerHTML = `
      <div class="col-span-full text-center py-24 text-error">
        <span class="material-symbols-outlined text-6xl text-error mb-4 block">wifi_off</span>
        <h3 class="font-headline-md text-headline-md mb-2">Could not load saved narratives</h3>
        <p class="font-body-md">Check your connection or try again later.</p>
      </div>
    `;
  }
}

function renderWishlistCard(rec, i) {
  const img = rec.image_url || WISHLIST_CARD_IMAGES[i % WISHLIST_CARD_IMAGES.length];
  const tone = rec.tone || 'Adventurous';
  const meta = WISHLIST_TONE_META[tone] || WISHLIST_TONE_META.Adventurous;
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

  const cleanId = String(rec.id).replace('sqlite-', '');

  return `
    <div class="group bg-white rounded-3xl overflow-hidden border border-outline-variant hover:shadow-ambient-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-[480px]">
      <!-- Image cover -->
      <div class="relative h-48 overflow-hidden cursor-pointer" onclick="openExploreModal('${cleanId}')">
        <img src="${img}" alt="${escHtml(rec.route)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
        <div class="absolute top-4 left-4 glass-card px-3 py-1 rounded-full text-xs font-bold ${meta.color}">
          ${meta.icon} ${tone}
        </div>
        <!-- Wishlist toggle heart (always filled red here) -->
        <button onclick="event.stopPropagation(); removeWishlistPage('${cleanId}', this)" 
                class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-on-surface"
                title="Remove from Wishlist">
          <span class="material-symbols-outlined text-red-500 ms-filled" style="font-size:20px;">favorite</span>
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

          <h3 class="font-headline-md text-headline-md text-on-surface mb-2 cursor-pointer hover:text-primary transition-colors line-clamp-1" onclick="openExploreModal('${cleanId}')">
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

window.removeWishlistPage = async function(narrativeId, btnEl) {
  try {
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`/api/wishlist/${narrativeId}`, { method: 'POST' });
    const data = await res.json();

    if (!data.added) {
      showToast('Removed from Saved Narratives.', 'info');
      // Reload wishlist grid
      loadWishlistGrid();
      // Also reload explore grid if needed
      if (typeof loadExploreGrid === 'function') {
        loadExploreGrid();
      }
    }
  } catch(e) {
    showToast('Failed to remove from wishlist.', 'error');
  }
};

function renderWishlistPagination(totalPages) {
  const pag = document.getElementById('wishlistPagination');
  if (!pag) return;
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn ${_wishlistPage <= 1 ? 'opacity-40 cursor-not-allowed' : ''}" 
    onclick="wishlistPageChange(${_wishlistPage - 1})" ${_wishlistPage <= 1 ? 'disabled' : ''}>‹</button>`;

  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn ${p === _wishlistPage ? 'active' : ''}" onclick="wishlistPageChange(${p})">${p}</button>`;
  }

  html += `<button class="page-btn ${_wishlistPage >= totalPages ? 'opacity-40 cursor-not-allowed' : ''}" 
    onclick="wishlistPageChange(${_wishlistPage + 1})" ${_wishlistPage >= totalPages ? 'disabled' : ''}>›</button>`;

  pag.innerHTML = html;
}

window.wishlistPageChange = function(p) {
  _wishlistPage = p;
  loadWishlistGrid();
  document.getElementById('view-wishlist')?.scrollIntoView({ behavior: 'smooth' });
};
