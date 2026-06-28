/**
 * frontend/js/auth.js — App-level Auth Bridge
 * ─────────────────────────────────────────────
 * Delegates to window.AuthService (auth-service.js).
 * Keeps window.Auth interface intact for backward compatibility.
 */

window.Auth = (() => {
  const _svc = () => window.AuthService;

  // ── Sidebar user display ──────────────────────────────────────
  function updateSidebarUser(user) {
    const userInfo   = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName   = document.getElementById('userName');
    if (!userInfo) return;

    if (user) {
      userInfo.style.display = 'flex';
      if (userName) userName.textContent = user.displayName || user.email || 'User';
      if (userAvatar) {
        if (user.photoUrl) {
          userAvatar.innerHTML = `<img src="${user.photoUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
          userAvatar.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
        }
      }
    } else {
      userInfo.style.display = 'none';
      if (userAvatar) userAvatar.textContent = '👤';
      if (userName)  userName.textContent    = '';
    }
  }

  // ── Register state listener ────────────────────────────────────
  if (window.AuthService) {
    window.AuthService.onAuthChange((user) => {
      updateSidebarUser(user);
      if (window.Admin && typeof window.Admin.onAuthChange === 'function') {
        window.Admin.onAuthChange(user);
      }
    });
  }

  // ── Public API (backward compat) ──────────────────────────────
  return {
    get currentUser() { return _svc()?.currentUser ?? null; },
    get isSignedIn()  { return !!_svc()?.currentUser; },

    async getIdToken() {
      return (await _svc()?.getIdToken()) ?? null;
    },

    async signInWithEmail(email, password) {
      const user = await _svc().login(email, password);
      return user;
    },

    async signUp(email, password, displayName) {
      const user = await _svc().register(email, password, displayName);
      return user;
    },

    async sendPasswordReset(email) {
      await _svc().forgotPassword(email);
    },

    async signOut() {
      await _svc().logout();
      if (typeof showToast === 'function') showToast('Signed out successfully', 'info');
    },

    // Google Sign-In removed — Firebase dependency gone
    async signInWithGoogle() {
      if (typeof showToast === 'function') showToast('Google Sign-In has been removed. Please use email/password.', 'info');
    },
  };
})();

// ── Wire Logout Button ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.signOut());
});
