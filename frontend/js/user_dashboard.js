/**
 * user_dashboard.js — User Dashboard Controller
 * ────────────────────────────────────────────────
 * Orchestrates sidebar collapsing, page titles, stats loading,
 * notifications, user reviews, settings submission, and Chart.js graphs.
 */

'use strict';

// Global Chart instances to prevent canvas reuse errors
const charts = {
  creations: null,
  topViewed: null,
  topShared: null,
  ratingTrend: null
};

// ── Sidebar Collapsing & Mobile Sidebar ──────────────────────────
window.toggleSidebar = function () {
  const sidebar = document.getElementById('dashboardSidebar');
  const mainWrapper = document.getElementById('mainContentWrapper');
  const icon = document.getElementById('sidebarCollapseIcon');
  if (!sidebar || !mainWrapper) return;

  const isCollapsed = sidebar.classList.toggle('collapsed');
  mainWrapper.classList.toggle('sidebar-collapsed', isCollapsed);
  localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
};

// Auto-expand/collapse sidebar on init from localStorage preference
function initSidebarState() {
  const sidebar = document.getElementById('dashboardSidebar');
  const mainWrapper = document.getElementById('mainContentWrapper');
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  
  if (sidebar && mainWrapper) {
    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      mainWrapper.classList.add('sidebar-collapsed');
    } else {
      sidebar.classList.remove('collapsed');
      mainWrapper.classList.remove('sidebar-collapsed');
    }
  }

  // Mobile drawer trigger
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
  }

  // Close mobile sidebar on outside click
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 640 && sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== mobileMenuBtn) {
        sidebar.classList.remove('open');
      }
    }
  });
}

// ── Update Page Title on Nav ─────────────────────────────────────
function updatePageTitle(viewName) {
  const titleEl = document.getElementById('currentPageTitle');
  if (!titleEl) return;
  const titles = {
    'dashboard-home': 'Dashboard',
    'generate': 'Create New Narrative',
    'explore': 'Explore Feed',
    'history': 'My Narratives',
    'wishlist': 'My Wishlist',
    'ratings-reviews': 'Ratings & Reviews',
    'user-analytics': 'Analytics',
    'notifications': 'Notifications',
    'profile-settings': 'Profile Settings',
    'about': 'About Us',
    'contact': 'Contact Us'
  };
  titleEl.textContent = titles[viewName] || 'Dashboard';
}

// Intercept navigateTo to automatically update titles
const originalNavigateTo = window.navigateTo;
window.navigateTo = function (viewName) {
  updatePageTitle(viewName);
  if (originalNavigateTo) {
    originalNavigateTo(viewName);
  }
};

// ── 1. Dashboard Home Data Loader ─────────────────────────────────
window.loadDashboardHome = async function () {
  window.onUserReady(async (user) => {
    if (!user) return;
    try {
      const res = await window.authFetch('/api/user/dashboard-stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const stats = await res.json();

      // Update Banner name
      const bannerName = document.getElementById('welcomeUserBanner');
      if (bannerName) {
        bannerName.textContent = `Welcome Back, ${user.displayName || user.email.split('@')[0]}!`;
      }

      // Update KPIs
      document.getElementById('statTotalNarratives').textContent = stats.totalNarratives || 0;
      document.getElementById('statTotalViews').textContent = stats.totalViews || 0;
      document.getElementById('statTotalSaves').textContent = stats.totalSaves || 0;
      document.getElementById('statAvgRating').textContent = stats.avgRating ? stats.avgRating.toFixed(1) : '0.0';

      // Update Notification Badges
      updateUnreadBadges(stats.unreadNotificationsCount);

      // Update Activity Timeline
      const timeline = document.getElementById('recentActivityTimeline');
      if (timeline) {
        if (!stats.recentActivity || stats.recentActivity.length === 0) {
          timeline.innerHTML = `<div class="text-center py-6 text-on-surface-variant font-body-md">No recent activity found.</div>`;
          return;
        }
        timeline.innerHTML = stats.recentActivity.map(act => {
          const timeStr = new Date(act.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
          let icon = 'info';
          let color = 'bg-primary/20 text-primary';
          if (act.action.includes('Narrative') || act.action.includes('Create')) {
            icon = 'add_circle';
            color = 'bg-tertiary/20 text-tertiary';
          } else if (act.action.includes('Delete')) {
            icon = 'delete';
            color = 'bg-error/20 text-error';
          } else if (act.action.includes('Profile')) {
            icon = 'manage_accounts';
            color = 'bg-secondary/20 text-secondary';
          }
          return `
            <div class="relative mb-6">
              <span class="absolute -left-[37px] top-0.5 flex items-center justify-center w-7 h-7 rounded-full ${color} border border-white dark:border-surface shadow-sm">
                <span class="material-symbols-outlined text-[16px]">${icon}</span>
              </span>
              <div>
                <p class="font-body-md font-bold text-on-surface">${escHtml(act.action)}</p>
                <p class="text-xs text-on-surface-variant mt-0.5">${escHtml(act.detail)}</p>
                <span class="text-[10px] text-outline block mt-1">${timeStr}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('loadDashboardHome error:', err);
      showToast('Failed to load dashboard metrics.', 'error');
    }
  });
};

function updateUnreadBadges(count) {
  const sidebarBadge = document.getElementById('sidebarNotifBadge');
  const navBadge = document.getElementById('navNotifBadge');

  if (count > 0) {
    if (sidebarBadge) {
      sidebarBadge.textContent = count;
      sidebarBadge.classList.remove('hidden');
    }
    if (navBadge) {
      navBadge.classList.remove('hidden');
    }
  } else {
    if (sidebarBadge) sidebarBadge.classList.add('hidden');
    if (navBadge) navBadge.classList.add('hidden');
  }
}

// ── 2. Ratings & Reviews Data Loader ─────────────────────────────
window.loadRatingsReviewsView = async function () {
  window.onUserReady(async (user) => {
    if (!user) return;
    try {
      const res = await window.authFetch('/api/user/reviews');
      if (!res.ok) throw new Error('Failed to load reviews');
      const data = await res.json();

      // Update Average Rating
      const avgScoreEl = document.getElementById('reviewsAvgScore');
      const avgStarsEl = document.getElementById('reviewsAvgStars');
      if (avgScoreEl) avgScoreEl.textContent = data.avgScore.toFixed(1);
      if (avgStarsEl) {
        avgStarsEl.textContent = '★'.repeat(Math.round(data.avgScore)) + '☆'.repeat(5 - Math.round(data.avgScore));
      }

      // Populate bars
      const barsContainer = document.getElementById('ratingSummaryBars');
      if (barsContainer) {
        const distribution = data.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        const total = data.totalReviews || 1; // avoid divide by zero
        barsContainer.innerHTML = [5, 4, 3, 2, 1].map(stars => {
          const count = distribution[stars] || 0;
          const percentage = Math.round((count / total) * 100);
          return `
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold w-12 text-on-surface-variant flex items-center gap-1">${stars}★</span>
              <div class="flex-grow h-3 bg-surface-container-high rounded-full overflow-hidden">
                <div class="h-full bg-secondary rounded-full" style="width: ${percentage}%"></div>
              </div>
              <span class="text-xs font-bold w-8 text-on-surface-variant text-right">${count}</span>
            </div>
          `;
        }).join('');
      }

      // Populate reviews feed
      const feed = document.getElementById('ratingsReviewsFeed');
      if (feed) {
        if (!data.reviews || data.reviews.length === 0) {
          feed.innerHTML = `
            <div class="bg-white rounded-3xl p-8 text-center text-on-surface-variant border border-outline-variant shadow-ambient">
              No reviews received yet on your travel narratives.
            </div>
          `;
          return;
        }
        feed.innerHTML = data.reviews.map(rev => {
          const stars = '★'.repeat(rev.rating) + '☆'.repeat(5 - rev.rating);
          const dateStr = new Date(rev.createdAt).toLocaleDateString([], { dateStyle: 'medium' });
          return `
            <div class="bg-white border border-outline-variant rounded-3xl p-6 shadow-ambient space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-headline-md font-bold text-on-surface">${escHtml(rev.userName)}</h4>
                  <p class="text-xs text-outline">Reviewed narrative: <span class="font-bold text-primary">${escHtml(rev.narrativeTitle)}</span></p>
                </div>
                <span class="text-xs text-outline">${dateStr}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-secondary text-sm">${stars}</span>
                <span class="text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">${rev.rating} / 5</span>
              </div>
              ${rev.review ? `<p class="text-sm text-on-surface-variant italic">"${escHtml(rev.review)}"</p>` : ''}
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('loadRatingsReviewsView error:', err);
      showToast('Failed to load review feeds.', 'error');
    }
  });
};

// ── 3. User Analytics Charts (Chart.js) ─────────────────────────
window.loadUserAnalytics = async function () {
  window.onUserReady(async (user) => {
    if (!user) return;
    try {
      const res = await window.authFetch('/api/user/analytics');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data = await res.json();

      const isDark = document.documentElement.classList.contains('dark');
      const textColor = isDark ? '#94a3b8' : '#434653';
      const gridColor = isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(195, 198, 213, 0.3)';

      // Chart 1: Creations Over Time
      if (charts.creations) charts.creations.destroy();
      const ctxCreations = document.getElementById('chartCreations')?.getContext('2d');
      if (ctxCreations) {
        charts.creations = new Chart(ctxCreations, {
          type: 'bar',
          data: {
            labels: data.perMonth.map(m => m.month),
            datasets: [{
              label: 'Narratives Created',
              data: data.perMonth.map(m => m.count),
              backgroundColor: '#0f52ba',
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { display: false } },
              y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } }
            }
          }
        });
      }

      // Chart 2: Top Viewed
      if (charts.topViewed) charts.topViewed.destroy();
      const ctxTopViewed = document.getElementById('chartTopViewed')?.getContext('2d');
      if (ctxTopViewed) {
        charts.topViewed = new Chart(ctxTopViewed, {
          type: 'bar',
          data: {
            labels: data.topViewed.map(v => v.title),
            datasets: [{
              label: 'Views',
              data: data.topViewed.map(v => v.views),
              backgroundColor: '#fe6f42',
              borderRadius: 8
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { display: false } }
            }
          }
        });
      }

      // Chart 3: Top Shared
      if (charts.topShared) charts.topShared.destroy();
      const ctxTopShared = document.getElementById('chartTopShared')?.getContext('2d');
      if (ctxTopShared) {
        charts.topShared = new Chart(ctxTopShared, {
          type: 'bar',
          data: {
            labels: data.topShared.map(s => s.title),
            datasets: [{
              label: 'Shares',
              data: data.topShared.map(s => s.shares),
              backgroundColor: '#006358',
              borderRadius: 8
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { display: false } }
            }
          }
        });
      }

      // Chart 4: Rating trends
      if (charts.ratingTrend) charts.ratingTrend.destroy();
      const ctxRatingTrend = document.getElementById('chartRatingTrend')?.getContext('2d');
      if (ctxRatingTrend) {
        charts.ratingTrend = new Chart(ctxRatingTrend, {
          type: 'line',
          data: {
            labels: data.ratingTrend.map(r => r.month),
            datasets: [{
              label: 'Avg Rating',
              data: data.ratingTrend.map(r => r.avgRating),
              borderColor: '#fe6f42',
              backgroundColor: 'rgba(254, 111, 66, 0.1)',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: textColor }, grid: { display: false } },
              y: { ticks: { color: textColor }, grid: { color: gridColor }, min: 1, max: 5 }
            }
          }
        });
      }

    } catch (err) {
      console.error('loadUserAnalytics error:', err);
      showToast('Failed to load user analytics.', 'error');
    }
  });
};

// ── 4. Notifications Loader & Mark Read ──────────────────────────
window.loadNotifications = async function () {
  window.onUserReady(async (user) => {
    if (!user) return;
    try {
      const res = await window.authFetch('/api/user/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');
      const notifs = await res.json();

      const inbox = document.getElementById('notificationsInboxList');
      if (inbox) {
        if (!notifs || notifs.length === 0) {
          inbox.innerHTML = `
            <div class="bg-white rounded-3xl p-8 text-center text-on-surface-variant border border-outline-variant shadow-ambient">
              No notifications yet. You're all caught up!
            </div>
          `;
          return;
        }
        inbox.innerHTML = notifs.map(n => {
          const timeStr = new Date(n.createdAt).toLocaleDateString([], { dateStyle: 'medium', timeStyle: 'short' });
          const unreadClass = n.read ? '' : 'border-l-4 border-l-primary bg-primary/5';
          let icon = 'notifications';
          let iconColor = 'text-primary bg-primary/10';
          if (n.type === 'Rating' || n.type === 'Review') {
            icon = 'star';
            iconColor = 'text-yellow-500 bg-yellow-500/10';
          } else if (n.type === 'Share') {
            icon = 'share';
            iconColor = 'text-tertiary bg-tertiary/10';
          } else if (n.type === 'Save') {
            icon = 'favorite';
            iconColor = 'text-secondary bg-secondary/10';
          }
          return `
            <div class="bg-white border border-outline-variant rounded-3xl p-5 shadow-sm flex gap-4 items-start ${unreadClass}">
              <span class="material-symbols-outlined p-2.5 rounded-2xl ${iconColor} shrink-0">${icon}</span>
              <div class="flex-grow space-y-1">
                <p class="text-sm text-on-surface font-body-md">${escHtml(n.message)}</p>
                <div class="flex justify-between items-center">
                  <span class="text-[10px] text-outline font-label-md">${timeStr}</span>
                  ${n.read ? '' : '<span class="text-[10px] font-bold text-primary">Unread</span>'}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('loadNotifications error:', err);
      showToast('Failed to load notifications inbox.', 'error');
    }
  });
};

window.markAllNotificationsRead = async function () {
  try {
    const res = await window.authFetch('/api/user/notifications/read', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to mark read');
    showToast('All notifications marked as read', 'success');
    updateUnreadBadges(0);
    loadNotifications();
  } catch (err) {
    console.error('markAllNotificationsRead error:', err);
    showToast('Failed to clear notifications.', 'error');
  }
};

// ── 5. Profile Settings Loader & Save Forms ──────────────────────
window.loadProfileSettings = async function () {
  window.onUserReady(async (user) => {
    if (!user) return;
    
    const formName = document.getElementById('profileName');
    const formEmail = document.getElementById('profileEmail');
    const formAvatar = document.getElementById('profileAvatar');
    const formBio = document.getElementById('profileBio');

    if (formEmail) formEmail.value = user.email || '';
    if (formName) formName.value = user.displayName || '';
    if (formAvatar) formAvatar.value = user.photoURL || '';

    try {
      // Fetch bio from user database profile
      const token = await user.getIdToken();
      const res = await fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const profile = await res.json();
        if (formBio) formBio.value = profile.bio || '';
      }
    } catch (e) {
      console.warn('Could not load bio setting', e);
    }
  });
};

function setupSettingsForms() {
  const detailsForm = document.getElementById('profileDetailsForm');
  if (detailsForm) {
    detailsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const displayName = document.getElementById('profileName').value.trim();
      const photoURL = document.getElementById('profileAvatar').value.trim();
      const bio = document.getElementById('profileBio').value.trim();

      try {
        // 1. Update Firebase Auth Profile
        await window.currentUser.updateProfile({ displayName, photoURL });

        // 2. Sync to Backend
        const res = await window.authFetch('/api/user/profile', {
          method: 'PUT',
          body: JSON.stringify({ displayName, photoURL, bio })
        });
        if (!res.ok) throw new Error('Database profile update failed');

        showToast('Profile updated successfully!', 'success');
        
        // Refresh page profiles
        if (typeof updateNavUser === 'function') updateNavUser(window.currentUser);
        syncSidebarUserProfile(window.currentUser);
      } catch (err) {
        console.error('Profile update error:', err);
        showToast(err.message || 'Failed to update profile.', 'error');
      }
    });
  }

  const securityForm = document.getElementById('profileSecurityForm');
  if (securityForm) {
    securityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('profileNewPassword').value;

      try {
        await window.currentUser.updatePassword(newPassword);
        showToast('Password changed successfully!', 'success');
        securityForm.reset();
      } catch (err) {
        console.error('Password change error:', err);
        showToast(err.message || 'Password update failed. Re-authentication may be required.', 'error');
      }
    });
  }
}

// ── Sync Profile display in Sidebar ──────────────────────────────
function syncSidebarUserProfile(user) {
  const avatar = document.getElementById('sidebarUserAvatar');
  const name = document.getElementById('sidebarUserName');
  const email = document.getElementById('sidebarUserEmail');

  if (name) name.textContent = user.displayName || user.email.split('@')[0] || 'User';
  if (email) email.textContent = user.email || '';

  if (avatar) {
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" class="w-full h-full object-cover">`;
    } else {
      const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
      avatar.textContent = initial;
      avatar.style.cssText =
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:16px;font-weight:700;background:var(--primary-fixed,#d9e2ff);' +
        'color:var(--primary,#003c90);border-radius:50%;';
    }
  }
}

// ── Dashboard Setup Entry Point ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebarState();
  setupSettingsForms();

  // Wire Collapse Button for Desktop Sidebar
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener('click', () => {
      toggleSidebar();
    });
  }

  // Wire Sign Out sidebar link
  const sidebarLogout = document.getElementById('sidebarLogoutBtn');
  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', async () => {
      try {
        await firebaseAuth.signOut();
        window.currentUser = null;
        window.location.replace('/login.html');
      } catch (e) {
        console.error('Sign out error:', e);
      }
    });
  }

  // Hook Firebase Auth events
  if (window.onUserReady) {
    window.onUserReady(async (user) => {
      if (user) {
        syncSidebarUserProfile(user);
        
        // Show Admin button if Admin role resolved
        if (window.userProfile && window.userProfile.role === 'Admin') {
          const sidebarAdmin = document.getElementById('sidebarAdminBtn');
          if (sidebarAdmin) sidebarAdmin.style.display = 'flex';
        }
      }
    });
  }
});
