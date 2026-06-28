/**
 * frontend/js/auth-service.js — JWT Authentication Service
 * ──────────────────────────────────────────────────────────
 * Replaces all Firebase Auth + FirestoreService frontend modules.
 *
 * Exposes: window.AuthService
 *
 * Storage strategy:
 *   - Access token  → sessionStorage (clears on tab close)
 *   - Refresh token → httpOnly cookie (set by server, never readable by JS)
 *   - User profile  → sessionStorage cache
 */

window.AuthService = (() => {
  'use strict';

  const API = '/api/auth';
  const TOKEN_KEY = 'auth_token';
  const USER_KEY  = 'auth_user';

  let _token       = sessionStorage.getItem(TOKEN_KEY) || null;
  let _user        = (() => { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; } })();
  let _listeners   = [];
  let _initialized = false;

  // ── Token helpers ───────────────────────────────────────────
  function _saveToken(token, user) {
    _token = token;
    _user  = user;
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY,  JSON.stringify(user));
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    _notifyListeners(user);
  }

  function _notifyListeners(user) {
    _listeners.forEach(cb => { try { cb(user); } catch (e) { console.error('[AuthService] listener error:', e); } });
  }

  // ── Public: getToken ─────────────────────────────────────────
  function getToken() {
    return _token;
  }

  // ── Public: getIdToken (backward compat alias) ───────────────
  async function getIdToken() {
    if (_token) return _token;
    return await refreshToken();
  }

  // ── Public: onAuthChange ─────────────────────────────────────
  function onAuthChange(callback) {
    if (typeof callback !== 'function') return () => {};
    _listeners.push(callback);
    if (_initialized) callback(_user);
    return () => { _listeners = _listeners.filter(c => c !== callback); };
  }

  // ── Public: register ─────────────────────────────────────────
  async function register(email, password, displayName = '') {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed.');
    _saveToken(data.accessToken, data.user);
    return data.user;
  }

  // ── Public: login ────────────────────────────────────────────
  async function login(email, password) {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    _saveToken(data.accessToken, data.user);
    return data.user;
  }

  // ── Public: logout ───────────────────────────────────────────
  async function logout() {
    try {
      await fetch(`${API}/logout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* ignore network errors on logout */ }
    _saveToken(null, null);
  }

  // ── Public: refreshToken ─────────────────────────────────────
  async function refreshToken() {
    try {
      const res  = await fetch(`${API}/refresh`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.accessToken) { _saveToken(null, null); return null; }
      _token = data.accessToken;
      sessionStorage.setItem(TOKEN_KEY, _token);
      return _token;
    } catch {
      return null;
    }
  }

  // ── Public: me ───────────────────────────────────────────────
  async function me() {
    if (!_token) return null;
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${_token}` },
      credentials: 'include',
    });
    if (res.status === 401) {
      // Try refresh
      const newToken = await refreshToken();
      if (!newToken) { _saveToken(null, null); return null; }
      return me();
    }
    if (!res.ok) return null;
    const user = await res.json();
    _user = user;
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  // ── Public: forgotPassword ───────────────────────────────────
  async function forgotPassword(email) {
    const res = await fetch(`${API}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data.message;
  }

  // ── Public: resetPassword ────────────────────────────────────
  async function resetPassword(token, password) {
    const res = await fetch(`${API}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reset failed.');
    return data.message;
  }

  // ── Initialize: check existing session on page load ──────────
  async function _init() {
    if (_token) {
      // Verify token is still valid via /me
      const user = await me();
      if (!user) {
        // Token expired — try refresh cookie
        const newToken = await refreshToken();
        if (newToken) {
          const refreshedUser = await me();
          _saveToken(newToken, refreshedUser);
        } else {
          _saveToken(null, null);
        }
      } else {
        _saveToken(_token, user);
      }
    }
    _initialized = true;
    _notifyListeners(_user);
  }

  _init();

  // ── window.authFetch — authenticated fetch ───────────────────
  window.authFetch = async function(url, options = {}) {
    let token = getToken();
    if (!token) token = await refreshToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(url, { ...options, headers, credentials: 'include' });

    // Auto-retry once on 401 with refreshed token
    if (res.status === 401) {
      const newToken = await refreshToken();
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
      }
    }
    return res;
  };

  // ── window.getIdToken — backward compat ──────────────────────
  window.getIdToken = getIdToken;

  // ── Public API ────────────────────────────────────────────────
  return {
    get currentUser()   { return _user; },
    get isSignedIn()    { return !!_user; },
    get isInitialized() { return _initialized; },
    getToken,
    getIdToken,
    onAuthChange,
    register,
    login,
    logout,
    refreshToken,
    me,
    forgotPassword,
    resetPassword,
  };
})();
