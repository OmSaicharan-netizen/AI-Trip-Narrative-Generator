/**
 * admin_dashboard.js — Controller logic for the Admin Dashboard
 * ─────────────────────────────────────────────────────────────
 * Requires config.js, auth-gate.js, and Chart.js to be loaded.
 */

(function AdminDashboard() {
  'use strict';

  // Constants
  const API_BASE = '/api';
  let _activeTab = 'overview';
  
  // Narratives state
  let _narrativesPage = 1;
  const NARRATIVES_LIMIT = 15;
  let _narrativesSearch = '';
  let _narrativesTone = '';
  let _narrativesRating = '';

  // Reports state
  let _reportsPage = 1;
  const REPORTS_LIMIT = 15;
  
  // Charts references
  let _trendChart = null;
  let _toneChart = null;
  let _routesChart = null;
  let _ratingsChart = null;

  // Diagnostics / Event Logging
  function logEvent(level, message) {
    const consoleEl = document.getElementById('logConsole');
    if (!consoleEl) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = level === 'error' ? 'text-red-400 font-bold' : level === 'warn' ? 'text-amber-400' : 'text-gray-300';
    line.textContent = `[${time}] [${level}] ${message}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  // ── Tab switcher ──────────────────────────────────────────────
  window.switchTab = function (tabName) {
    _activeTab = tabName;
    logEvent('info', `Switched to tab: ${tabName}`);

    // Update Sidebar tabs active styling
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update View Containers visibility
    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.toggle('hidden', section.id !== `tab-${tabName}`);
    });

    // Update Header title
    const titles = {
      overview: 'Dashboard Overview',
      narratives: 'Manage Narratives',
      users: 'User & Role Manager',
      metrics: 'System Health',
      reports: 'Content Reports'
    };
    const titleEl = document.getElementById('currentTabTitle');
    if (titleEl) titleEl.textContent = titles[tabName] || 'Dashboard';

    // Route-specific loading
    if (tabName === 'overview') {
      loadOverviewData();
    } else if (tabName === 'narratives') {
      loadNarrativesTable();
    } else if (tabName === 'users') {
      loadUsersTable();
    } else if (tabName === 'metrics') {
      loadMetricsData();
    } else if (tabName === 'reports') {
      loadReportsTable();
    }
  };

  // ── Load Overview (Analytics & Metrics Overview) ──────────────
  async function loadOverviewData() {
    logEvent('info', 'Loading overview statistics and charts…');
    try {
      // Fetch analytics data (protected API)
      const res = await window.authFetch(`${API_BASE}/analytics`);
      if (!res.ok) throw new Error(`Analytics failed: ${res.status}`);
      const data = await res.json();

      // Fetch metrics data (protected API)
      const metricRes = await window.authFetch(`${API_BASE}/admin/metrics`);
      let metrics = {};
      if (metricRes.ok) {
        metrics = await metricRes.json();
      }

      // Update counters
      document.getElementById('statTotalStories').textContent = data.kpis?.total ?? 0;
      document.getElementById('statAvgRating').textContent = data.kpis?.avgRating ? `${data.kpis.avgRating} ★` : '—';
      document.getElementById('statTotalUsers').textContent = metrics.database?.usersCount ?? '—';
      
      // Update charts
      renderOverviewCharts(data);
      logEvent('info', 'Overview analytics and charts loaded successfully.');
    } catch (err) {
      logEvent('error', `Overview load failed: ${err.message}`);
      console.error(err);
    }
  }

  // Render Chart.js charts
  function renderOverviewCharts(data) {
    // Destroy previous charts if they exist
    if (_trendChart) _trendChart.destroy();
    if (_toneChart) _toneChart.destroy();
    if (_routesChart) _routesChart.destroy();
    if (_ratingsChart) _ratingsChart.destroy();

    // 1. Trend Chart (Generations per day)
    const trendCtx = document.getElementById('trendChart')?.getContext('2d');
    if (trendCtx) {
      const days = (data.perDay || []).map(d => d.day);
      const counts = (data.perDay || []).map(d => d.count);
      _trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: days.length ? days : ['No Data'],
          datasets: [{
            label: 'Stories Generated',
            data: counts.length ? counts : [0],
            borderColor: '#003c90',
            backgroundColor: 'rgba(0, 60, 144, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    // 2. Tone Distribution Chart
    const toneCtx = document.getElementById('toneChart')?.getContext('2d');
    if (toneCtx) {
      const tones = (data.toneDistribution || []).map(d => d.tone);
      const counts = (data.toneDistribution || []).map(d => d.count);
      _toneChart = new Chart(toneCtx, {
        type: 'doughnut',
        data: {
          labels: tones.length ? tones : ['No Data'],
          datasets: [{
            data: counts.length ? counts : [1],
            backgroundColor: ['#003c90', '#fe6f42', '#006358', '#434653', '#ba1a1a']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right' } }
        }
      });
    }

    // 3. Top Routes Chart
    const routesCtx = document.getElementById('routesChart')?.getContext('2d');
    if (routesCtx) {
      const routes = (data.topRoutes || []).map(d => d.route);
      const counts = (data.topRoutes || []).map(d => d.count);
      _routesChart = new Chart(routesCtx, {
        type: 'bar',
        data: {
          labels: routes.length ? routes : ['No Data'],
          datasets: [{
            data: counts.length ? counts : [0],
            backgroundColor: '#0f52ba',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
        }
      });
    }

    // 4. Ratings Chart
    const ratingsCtx = document.getElementById('ratingsChart')?.getContext('2d');
    if (ratingsCtx) {
      const ratings = ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'];
      const counts = [0, 0, 0, 0, 0];
      (data.ratingDist || []).forEach(d => {
        if (d.rating >= 1 && d.rating <= 5) {
          counts[d.rating - 1] = d.count;
        }
      });
      _ratingsChart = new Chart(ratingsCtx, {
        type: 'bar',
        data: {
          labels: ratings,
          datasets: [{
            data: counts,
            backgroundColor: '#fe6f42',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { y: { grid: { display: false } }, x: { beginAtZero: true } }
        }
      });
    }
  }

  // ── Load Narratives List Table ────────────────────────────────
  async function loadNarrativesTable() {
    logEvent('info', `Loading narratives table (page ${_narrativesPage})…`);
    const tableBody = document.getElementById('narrativesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-on-surface-variant">Fetching narratives from database…</td></tr>`;

    try {
      const params = new URLSearchParams({
        page: _narrativesPage,
        limit: NARRATIVES_LIMIT,
        search: _narrativesSearch,
        tone: _narrativesTone,
        rating: _narrativesRating
      });

      const res = await window.authFetch(`${API_BASE}/admin/data?${params}`);
      if (!res.ok) throw new Error(`Narratives fetch failed: ${res.status}`);
      
      const result = await res.json();
      const rows = result.data || [];
      const total = result.pagination?.total ?? 0;
      const totalPages = result.pagination?.totalPages ?? 1;

      // Render table rows
      if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-gray-500">No narratives found matching filters.</td></tr>`;
      } else {
        tableBody.innerHTML = rows.map(r => {
          const stars = r.rating ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : 'Unrated';
          const tripDate = r.trip_date ? new Date(r.trip_date).toLocaleDateString() : '—';
          const createdAt = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
          return `
            <tr class="hover:bg-gray-50/50 transition-colors">
              <td class="p-4 font-bold text-gray-900">#${r.id}</td>
              <td class="p-4 font-semibold text-gray-900">${escHtml(r.driver_name || '—')}</td>
              <td class="p-4 text-gray-600 font-medium">${escHtml(r.route || '—')}</td>
              <td class="p-4"><span class="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700">${r.tone || 'Adventurous'}</span></td>
              <td class="p-4 text-gray-500">${escHtml(r.vehicle_type || 'Sedan')}</td>
              <td class="p-4 text-gray-500 font-medium">${tripDate}</td>
              <td class="p-4 font-semibold text-amber-500">${stars}</td>
              <td class="p-4 text-gray-500 text-xs">${createdAt}</td>
              <td class="p-4 text-right space-x-1 whitespace-nowrap">
                <button onclick="viewNarrativeDetails(${r.id})" class="p-1.5 hover:bg-gray-100 rounded-lg text-primary transition-colors" title="View Detail">
                  <span class="material-symbols-outlined text-lg">visibility</span>
                </button>
                <button onclick="deleteNarrative(${r.id})" class="p-1.5 hover:bg-red-50 rounded-lg text-error transition-colors" title="Delete">
                  <span class="material-symbols-outlined text-lg">delete</span>
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }

      // Update Pagination UI
      document.getElementById('narrativesPageIndicator').textContent = `Page ${_narrativesPage} of ${totalPages}`;
      renderTablePagination(totalPages);
      logEvent('info', `Narratives table loaded successfully: displaying ${rows.length} of ${total} records.`);
    } catch (err) {
      logEvent('error', `Narratives table load failed: ${err.message}`);
      tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-error font-bold">Failed to load records. Check server connectivity.</td></tr>`;
    }
  }

  function renderTablePagination(totalPages) {
    const pag = document.getElementById('narrativesPagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="p-2 border border-outline-variant rounded-lg bg-white hover:bg-gray-50 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed" 
      onclick="narrativesPageChange(${_narrativesPage - 1})" ${_narrativesPage <= 1 ? 'disabled' : ''}>Prev</button>`;

    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === _narrativesPage;
      html += `<button class="w-9 h-9 border border-outline-variant rounded-lg text-xs font-bold ${isActive ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-gray-50'}"
        onclick="narrativesPageChange(${p})">${p}</button>`;
    }

    html += `<button class="p-2 border border-outline-variant rounded-lg bg-white hover:bg-gray-50 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed" 
      onclick="narrativesPageChange(${_narrativesPage + 1})" ${_narrativesPage >= totalPages ? 'disabled' : ''}>Next</button>`;

    pag.innerHTML = html;
  }

  window.narrativesPageChange = function (p) {
    _narrativesPage = p;
    loadNarrativesTable();
  };

  // ── Detail narrative viewer ────────────────────────────────────
  window.viewNarrativeDetails = async function (id) {
    logEvent('info', `Fetching full narrative detail for id=${id}…`);
    try {
      const res = await window.authFetch(`${API_BASE}/admin/data/${id}`);
      if (!res.ok) throw new Error(`Detail fetch failed: ${res.status}`);
      const row = await res.json();

      const modal = document.getElementById('detailModal');
      const body = document.getElementById('modalBody');
      if (!modal || !body) return;

      const dateStr = row.trip_date ? new Date(row.trip_date).toLocaleDateString() : '—';
      const createdStr = row.created_at ? new Date(row.created_at).toLocaleString() : '—';

      body.innerHTML = `
        <div class="space-y-6">
          <div class="border-b border-outline-variant pb-4">
            <h2 class="display-font text-2xl font-bold text-primary mb-2">${escHtml(row.title || row.route || 'Trip Narrative')}</h2>
            <div class="flex flex-wrap gap-2 text-xs font-semibold text-gray-500">
              <span class="bg-gray-100 px-2 py-1 rounded">Driver: ${escHtml(row.driver_name)}</span>
              <span class="bg-gray-100 px-2 py-1 rounded">Vehicle: ${escHtml(row.vehicle_type)}</span>
              <span class="bg-gray-100 px-2 py-1 rounded">Tone: ${escHtml(row.tone)}</span>
              <span class="bg-gray-100 px-2 py-1 rounded">Trip Date: ${dateStr}</span>
              <span class="bg-gray-100 px-2 py-1 rounded">Created: ${createdStr}</span>
            </div>
          </div>
          
          <div class="space-y-4">
            <div>
              <h4 class="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">Generated Story</h4>
              <p class="text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">${escHtml(row.ai_response || '')}</p>
            </div>
            ${row.summary ? `
              <div>
                <h4 class="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">Summary Summary</h4>
                <p class="text-gray-700 text-sm italic">${escHtml(row.summary)}</p>
              </div>
            ` : ''}
            ${row.social_caption ? `
              <div class="bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                <h4 class="text-xs font-bold text-secondary uppercase tracking-wide mb-1">Social Media Caption</h4>
                <p class="text-gray-700 text-sm font-medium">${escHtml(row.social_caption)}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="flex justify-end gap-2 border-t border-outline-variant pt-4">
            <button onclick="playTTS('${escHtml(row.ai_response || '')}')" class="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-lg transition-shadow">
              <span class="material-symbols-outlined text-sm">volume_up</span> Play Speech
            </button>
          </div>
        </div>
      `;

      modal.classList.add('open');
      logEvent('info', `Opened details modal for narrative #${id}.`);
    } catch (err) {
      logEvent('error', `Failed to load details: ${err.message}`);
    }
  };

  window.playTTS = function (text) {
    if (window.TTS) {
      window.TTS.speak(text);
      logEvent('info', 'TTS speech playback started.');
    } else {
      logEvent('warn', 'TTS plugin is not loaded/available.');
    }
  };

  // ── Soft-delete Narrative ──────────────────────────────────────
  window.deleteNarrative = async function (id) {
    const confirmed = confirm(`Are you sure you want to soft-delete narrative #${id}?\n\nThis will hide the story from user lists but preserve it in the database.`);
    if (!confirmed) return;

    logEvent('info', `Soft-deleting narrative #${id}…`);
    try {
      const res = await window.authFetch(`${API_BASE}/admin/data/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      logEvent('info', `Narrative #${id} soft-deleted successfully.`);
      loadNarrativesTable();
    } catch (err) {
      logEvent('error', `Failed to delete narrative: ${err.message}`);
    }
  };

  // ── CSV Export ────────────────────────────────────────────────
  window.exportData = async function () {
    logEvent('info', 'Requesting narrative database CSV export…');
    try {
      const token = await window.getIdToken();
      const res = await fetch(`${API_BASE}/admin/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manivtha_narratives_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      logEvent('info', 'Database narratives CSV exported successfully.');
    } catch (err) {
      logEvent('error', `CSV Export failed: ${err.message}`);
    }
  };

  // ── Load Users & Roles Manager Table ──────────────────────────
  async function loadUsersTable() {
    logEvent('info', 'Loading system users list…');
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-on-surface-variant">Fetching user list…</td></tr>`;

    try {
      const res = await window.authFetch(`${API_BASE}/admin/users`);
      if (!res.ok) throw new Error(`Users fetch failed: ${res.status}`);
      
      const users = await res.json();
      if (users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-500">No users found in database.</td></tr>`;
      } else {
        tableBody.innerHTML = users.map(u => {
          const verifiedBadge = u.emailVerified 
            ? `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Verified</span>`
            : `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">Unverified</span>`;
          
          const lastLoginStr = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never logged in';
          const providerStr = u.provider || 'email';
          const status = u.accountStatus || 'active';
          
          return `
            <tr class="hover:bg-gray-50/50 transition-colors">
              <td class="p-4 flex items-center gap-3 font-semibold text-gray-900">
                <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  ${(u.displayName || u.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p class="font-bold text-gray-900">${escHtml(u.displayName || 'Unnamed User')}</p>
                  <span class="text-[10px] text-gray-500">Last Active: ${lastLoginStr}</span>
                </div>
              </td>
              <td class="p-4 text-gray-600 font-medium">${escHtml(u.email || '—')}</td>
              <td class="p-4 text-gray-500 font-semibold capitalize">${providerStr}</td>
              <td class="p-4">${verifiedBadge}</td>
              <td class="p-4">
                <select onchange="updateUserRole('${u.uid}', this.value)" class="py-1 px-3 border border-outline-variant rounded-lg bg-white text-xs font-bold text-gray-700">
                  <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                  <option value="User" ${u.role === 'User' ? 'selected' : ''}>User</option>
                </select>
              </td>
              <td class="p-4">
                <select onchange="updateUserStatus('${u.uid}', this.value)" class="py-1 px-3 border border-outline-variant rounded-lg bg-white text-xs font-bold text-gray-700">
                  <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                  <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>Suspended</option>
                  <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                </select>
              </td>
              <td class="p-4 text-right">
                <span class="text-xs text-gray-400 font-bold">UID: ${u.uid.slice(0, 8)}...</span>
              </td>
            </tr>
          `;
        }).join('');
      }
      logEvent('info', `Users list loaded successfully: displayed ${users.length} registered accounts.`);
    } catch (err) {
      logEvent('error', `Failed to load users list: ${err.message}`);
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-error font-bold">Failed to load user catalog. Check server connectivity.</td></tr>`;
    }
  }

  // Edit user role
  window.updateUserRole = async function (uid, role) {
    logEvent('info', `Assigning user role role=${role} for UID=${uid}…`);
    try {
      const res = await window.authFetch(`${API_BASE}/admin/users/${uid}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      logEvent('info', `Successfully updated UID=${uid} role to ${role}.`);
    } catch (err) {
      logEvent('error', `Failed to update user role: ${err.message}`);
      alert(err.message);
      loadUsersTable(); // Revert visual state
    }
  };

  // Edit user accountStatus
  window.updateUserStatus = async function (uid, accountStatus) {
    logEvent('info', `Setting user status status=${accountStatus} for UID=${uid}…`);
    try {
      const res = await window.authFetch(`${API_BASE}/admin/users/${uid}/status`, {
        method: 'PUT',
        body: JSON.stringify({ accountStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      logEvent('info', `Successfully updated UID=${uid} accountStatus to ${accountStatus}.`);
    } catch (err) {
      logEvent('error', `Failed to update user status: ${err.message}`);
      alert(err.message);
      loadUsersTable(); // Revert visual state
    }
  };

  // ── Load System Operational Metrics ───────────────────────────
  async function loadMetricsData() {
    logEvent('info', 'Querying hardware resources and server operational telemetry…');
    try {
      const res = await window.authFetch(`${API_BASE}/admin/metrics`);
      if (!res.ok) throw new Error(`Metrics failed: ${res.status}`);
      
      const metrics = await res.json();
      
      // Node.js Metrics
      const formatUptime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
      };
      
      document.getElementById('metricUptime').textContent = formatUptime(metrics.system.uptime);
      document.getElementById('metricNodeVer').textContent = metrics.system.nodeVersion;
      document.getElementById('metricPlatform').textContent = metrics.system.platform;
      document.getElementById('metricMemory').textContent = `${metrics.system.memory.heapUsed} (Used) / ${metrics.system.memory.rss} (RSS)`;
      
      // Database Metrics
      document.getElementById('metricDbConnected').textContent = metrics.database.connected ? 'Connected ✅' : 'Disconnected ⚠️';
      document.getElementById('metricDbConnected').className = metrics.database.connected ? 'text-sm font-bold text-emerald-600' : 'text-sm font-bold text-error';
      document.getElementById('metricDbNarratives').textContent = `${metrics.database.narrativesCount} narrative records`;
      document.getElementById('metricDbUsers').textContent = `${metrics.database.usersCount} user profiles`;
      
      logEvent('info', 'Hardware and engine telemetry successfully fetched.');
    } catch (err) {
      logEvent('error', `Hardware metrics load failed: ${err.message}`);
    }
  }

  // ── Helper functions ──────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Initialize event listeners ───────────────────────────────
  function initListeners() {
    // Mobile menu toggle drawer
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('aside');
        sidebar.classList.toggle('hidden');
      });
    }

    // Narratives Filters
    const searchInput = document.getElementById('adminSearch');
    if (searchInput) {
      let t;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          _narrativesSearch = searchInput.value.trim();
          _narrativesPage = 1;
          loadNarrativesTable();
        }, 300);
      });
    }

    document.getElementById('filterTone')?.addEventListener('change', (e) => {
      _narrativesTone = e.target.value;
      _narrativesPage = 1;
      loadNarrativesTable();
    });

    document.getElementById('filterRating')?.addEventListener('change', (e) => {
      _narrativesRating = e.target.value;
      _narrativesPage = 1;
      loadNarrativesTable();
    });

    // Detail Modal close
    const modal = document.getElementById('detailModal');
    const closeBtn = document.getElementById('modalClose');
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('open');
      });
      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('remove');
      });
    }
  }

  // ── Load Flagged Content Reports ──────────────────────────────
  async function loadReportsTable() {
    logEvent('info', `Loading flagged reports table (page ${_reportsPage})…`);
    const tableBody = document.getElementById('reportsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-on-surface-variant">Fetching reports from database…</td></tr>`;

    try {
      const params = new URLSearchParams({
        page: _reportsPage,
        limit: REPORTS_LIMIT
      });

      const res = await window.authFetch(`${API_BASE}/admin/reports?${params}`);
      if (!res.ok) throw new Error(`Reports fetch failed: ${res.status}`);

      const result = await res.json();
      const rows = result.data || [];
      const total = result.total ?? 0;
      const totalPages = Math.ceil(total / REPORTS_LIMIT) || 1;

      if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-500">No content reports found.</td></tr>`;
      } else {
        tableBody.innerHTML = rows.map(r => {
          let badgeColor = 'bg-yellow-50 text-yellow-800 border-yellow-200';
          if (r.status === 'Resolved') badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          if (r.status === 'Ignored') badgeColor = 'bg-gray-50 text-gray-600 border-gray-200';

          const reportedAt = r.createdAt ? new Date(r.createdAt).toLocaleString() : '—';
          return `
            <tr class="hover:bg-gray-50/50 transition-colors">
              <td class="p-4 font-semibold text-gray-900">
                #${r.narrativeId} ${escHtml(r.narrativeTitle)}
              </td>
              <td class="p-4 text-gray-600 font-medium">${escHtml(r.reporterEmail || 'Unknown')}</td>
              <td class="p-4 text-gray-500 italic max-w-xs truncate" title="${escHtml(r.reason)}">${escHtml(r.reason)}</td>
              <td class="p-4">
                <span class="px-2.5 py-1 text-xs font-bold rounded-full border ${badgeColor}">${r.status}</span>
              </td>
              <td class="p-4 text-gray-500 text-xs">${reportedAt}</td>
              <td class="p-4 text-right space-x-1 whitespace-nowrap">
                <button onclick="viewNarrativeDetails(${r.narrativeId})" class="p-1.5 hover:bg-gray-100 rounded-lg text-primary transition-colors" title="View Flagged Story">
                  <span class="material-symbols-outlined text-lg">visibility</span>
                </button>
                ${r.status === 'Pending' ? `
                  <button onclick="resolveReport('${r.id}', 'Ignored')" class="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors" title="Ignore/Dismiss Report">
                    <span class="material-symbols-outlined text-lg">block</span>
                  </button>
                  <button onclick="resolveReport('${r.id}', 'Resolved')" class="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors" title="Mark as Resolved">
                    <span class="material-symbols-outlined text-lg">done</span>
                  </button>
                  <button onclick="deleteNarrativeFromReport('${r.id}', ${r.narrativeId})" class="p-1.5 hover:bg-red-50 rounded-lg text-error transition-colors" title="Delete Narrative & Resolve Report">
                    <span class="material-symbols-outlined text-lg">delete</span>
                  </button>
                ` : ''}
              </td>
            </tr>
          `;
        }).join('');
      }

      // Update Pagination UI
      document.getElementById('reportsPageIndicator').textContent = `Page ${_reportsPage} of ${totalPages}`;
      renderReportsPagination(totalPages);
      logEvent('info', `Reports table loaded successfully: displaying ${rows.length} of ${total} records.`);
    } catch (err) {
      logEvent('error', `Reports table load failed: ${err.message}`);
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-error font-bold">Failed to load reports. Check server connectivity.</td></tr>`;
    }
  }

  function renderReportsPagination(totalPages) {
    const pag = document.getElementById('reportsPagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="p-2 border border-outline-variant rounded-lg bg-white hover:bg-gray-50 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed" 
      onclick="reportsPageChange(${_reportsPage - 1})" ${_reportsPage <= 1 ? 'disabled' : ''}>Prev</button>`;

    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === _reportsPage;
      html += `<button class="w-9 h-9 border border-outline-variant rounded-lg text-xs font-bold ${isActive ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-gray-50'}"
        onclick="reportsPageChange(${p})">${p}</button>`;
    }

    html += `<button class="p-2 border border-outline-variant rounded-lg bg-white hover:bg-gray-50 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed" 
      onclick="reportsPageChange(${_reportsPage + 1})" ${_reportsPage >= totalPages ? 'disabled' : ''}>Next</button>`;

    pag.innerHTML = html;
  }

  window.reportsPageChange = function (p) {
    _reportsPage = p;
    loadReportsTable();
  };

  window.resolveReport = async function (reportId, status) {
    const confirmed = confirm(`Are you sure you want to mark this report as ${status}?`);
    if (!confirmed) return;

    logEvent('info', `Updating report status to ${status} for reportId=${reportId}…`);
    try {
      const res = await window.authFetch(`${API_BASE}/admin/reports/${reportId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(`Status update failed: ${res.status}`);
      logEvent('info', `Report #${reportId} status successfully set to ${status}.`);
      loadReportsTable();
    } catch (err) {
      logEvent('error', `Failed to resolve report: ${err.message}`);
    }
  };

  window.deleteNarrativeFromReport = async function (reportId, narrativeId) {
    const confirmed = confirm(`Are you sure you want to soft-delete narrative #${narrativeId}?\n\nThis will hide the story from user lists and automatically mark the report as Resolved.`);
    if (!confirmed) return;

    logEvent('info', `Soft-deleting narrative #${narrativeId} and resolving report #${reportId}…`);
    try {
      // 1. Delete the narrative
      const deleteRes = await window.authFetch(`${API_BASE}/admin/data/${narrativeId}`, { method: 'DELETE' });
      if (!deleteRes.ok) throw new Error(`Narrative delete failed: ${deleteRes.status}`);
      logEvent('info', `Narrative #${narrativeId} soft-deleted.`);

      // 2. Resolve the report
      const reportRes = await window.authFetch(`${API_BASE}/admin/reports/${reportId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Resolved' })
      });
      if (!reportRes.ok) throw new Error(`Report status update failed: ${reportRes.status}`);

      logEvent('info', `Report #${reportId} marked as Resolved.`);
      loadReportsTable();
    } catch (err) {
      logEvent('error', `Failed to delete narrative and resolve report: ${err.message}`);
    }
  };

  // ── Boot sequence ────────────────────────────────────────────
  function start() {
    logEvent('info', 'Dashboard boot sequence started. Validating session credentials…');
    onUserReady((user) => {
      if (!user) {
        logEvent('error', 'Auth expired. Relocating session to login.');
        window.location.replace('/login.html');
        return;
      }

      // Populate sidebar user details
      const userProfile = window.userProfile || {};
      const sidebarName = document.getElementById('sidebarName');
      const sidebarRole = document.getElementById('sidebarRole');
      const sidebarAvatar = document.getElementById('sidebarAvatar');

      if (sidebarName) sidebarName.textContent = user.displayName || user.email.split('@')[0];
      if (sidebarRole) sidebarRole.textContent = userProfile.role || 'Admin';
      
      if (sidebarAvatar) {
        if (user.photoURL) {
          sidebarAvatar.innerHTML = `<img src="${user.photoURL}" alt="User Avatar" class="w-full h-full object-cover rounded-full">`;
        } else {
          sidebarAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
        }
      }

      initListeners();
      // Load initial view
      switchTab('overview');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
