/**
 * frontend/js/auth-gate.js — Route Protection & Session Management
 * ──────────────────────────────────────────────────────────────────
 * Replaces the Firebase onAuthStateChanged guard.
 * Uses AuthService (JWT) to validate session on every protected page.
 *
 * Exposes:
 *   window.currentUser     — user object (or null)
 *   window.getIdToken()    — returns Promise<string|null>
 *   window.authFetch()     — fetch wrapper with Authorization header (defined in auth-service.js)
 *   window.onUserReady(cb) — registers callback when auth resolves
 */

(function AuthGate() {
  'use strict';

  const LOGIN_URL = '/login.html';

  // ── Auth-ready callbacks ───────────────────────────────────────
  const _readyCallbacks = [];
  let   _resolved       = false;
  window.currentUser    = null;

  window.onUserReady = function(cb) {
    if (typeof cb !== 'function') return;
    if (_resolved) { cb(window.currentUser); return; }
    _readyCallbacks.push(cb);
  };

  function _fireReady(user) {
    _resolved          = true;
    window.currentUser = user;
    _readyCallbacks.forEach(cb => {
      try { cb(user); } catch (e) { console.error('[auth-gate] onUserReady error:', e); }
    });
    _readyCallbacks.length = 0;
  }

  // ── Update nav UI ─────────────────────────────────────────────
  function _updateNav(user) {
    const userInfo   = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName   = document.getElementById('userName');
    if (!userInfo) return;

    userInfo.style.display = 'flex';
    if (userName) userName.textContent = user.displayName || user.email?.split('@')[0] || 'User';
    if (userAvatar) {
      if (user.photoUrl) {
        userAvatar.innerHTML = `<img src="${user.photoUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer">`;
      } else {
        const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
        userAvatar.textContent = initial;
        userAvatar.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;background:var(--primary-fixed,#d9e2ff);color:var(--primary,#003c90);border-radius:50%;';
      }
    }
  }

  // ── Wire logout button ────────────────────────────────────────
  function _wireLogout() {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      await window.AuthService?.logout();
      window.location.replace(LOGIN_URL);
    });
  }

  // ── Core: validate session ────────────────────────────────────
  async function _start() {
    _wireLogout();

    const svc = window.AuthService;
    if (!svc) {
      console.error('[auth-gate] AuthService not loaded.');
      window.location.replace(LOGIN_URL);
      return;
    }

    // Wait for AuthService initialization
    const waitReady = () => new Promise(resolve => {
      if (svc.isInitialized) { resolve(); return; }
      const unsub = svc.onAuthChange(() => { unsub(); resolve(); });
    });
    await waitReady();

    const user = svc.currentUser;

    if (!user) {
      // Not signed in → redirect to login
      if (!window.location.pathname.includes('login')) {
        window.location.replace(LOGIN_URL);
      }
      return;
    }

    _updateNav(user);
    _fireReady(user);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _start);
  } else {
    _start();
  }

})();
