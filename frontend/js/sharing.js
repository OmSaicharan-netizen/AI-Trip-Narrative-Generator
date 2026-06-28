/**
 * sharing.js — Social Media Sharing & Public URLs
 * ──────────────────────────────────────────────────
 * Generates custom share urls for WhatsApp, Facebook, LinkedIn, X/Twitter, Telegram,
 * and handles Link Copying. Tracks share counts on the backend.
 */

window.SharingService = (() => {
  'use strict';

  function getPublicUrl(narrativeId) {
    const cleanId = String(narrativeId).replace('sqlite-', '');
    const loc = window.location;
    return `${loc.protocol}//${loc.host}/?narrative=${cleanId}`;
  }

  async function trackShare(narrativeId) {
    try {
      const cleanId = String(narrativeId).replace('sqlite-', '');
      const fetchFn = window.authFetch || fetch;
      await fetchFn(`/api/explore/${cleanId}/share`, { method: 'POST' });
      // Reload explore feed if visible to refresh count
      if (typeof loadExploreGrid === 'function' && document.getElementById('view-explore').classList.contains('active')) {
        loadExploreGrid();
      }
    } catch (e) {
      console.warn('[SharingService] Failed to track share count:', e);
    }
  }

  function shareToPlatform(platform, narrativeId, title, excerpt) {
    if (!window.currentUser) {
      showToast('Please sign in to share narratives.', 'info');
      window.location.replace('/login.html');
      return;
    }

    const url = encodeURIComponent(getPublicUrl(narrativeId));
    const text = encodeURIComponent(`Check out this travel narrative on Manivtha Tours: "${title}"\n`);
    
    let shareUrl = '';

    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://api.whatsapp.com/send?text=${text}%20${url}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case 'twitter':
      case 'x':
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        break;
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
        break;
      case 'instagram':
        // Instagram doesn't support sharing links directly via URL API.
        // We copy the link to clipboard instead and notify the user.
        copyLink(narrativeId);
        showToast('Link copied! Share it on Instagram.', 'success');
        return;
      default:
        console.warn('Unknown sharing platform:', platform);
        return;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=450,resizable=yes,scrollbars=yes');
      trackShare(narrativeId);
    }
  }

  function copyLink(narrativeId) {
    if (!window.currentUser) {
      showToast('Please sign in to share narratives.', 'info');
      window.location.replace('/login.html');
      return;
    }

    const url = getPublicUrl(narrativeId);
    navigator.clipboard.writeText(url)
      .then(() => {
        showToast('Link copied to clipboard!', 'success');
        trackShare(narrativeId);
      })
      .catch(() => {
        showToast('Failed to copy link.', 'error');
      });
  }

  function renderShareButtons(narrativeId, title, excerpt) {
    const cleanId = String(narrativeId).replace('sqlite-', '');
    return `
      <div class="space-y-3 p-4 bg-surface rounded-2xl border border-outline-variant">
        <h4 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Share Story</h4>
        <div class="flex flex-wrap gap-3">
          <!-- WhatsApp -->
          <button onclick="SharingService.shareToPlatform('whatsapp', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on WhatsApp">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13.601 2.326A7.85 7.85 0 0 0 8 0a7.86 7.86 0 0 0-6.68 10.399l-.82 2.999a.4.4 0 0 0 .486.486l3.05-.831a7.89 7.89 0 0 0 3.965.986h.004c4.329 0 7.855-3.527 7.855-7.856a7.86 7.86 0 0 0-2.29-5.529zM8 14.377a6.55 6.55 0 0 1-3.328-.908l-.24-.143-1.849.504.514-1.879-.158-.25a6.55 6.55 0 0 1-.952-3.43c0-3.61 2.94-6.55 6.552-6.55 1.75 0 3.396.683 4.635 1.923 1.24 1.24 1.923 2.887 1.923 4.634 0 3.61-2.94 6.552-6.55 6.552zM11.515 9.07c-.193-.096-1.144-.564-1.32-.629-.177-.066-.307-.096-.437.096-.13.193-.503.629-.617.758-.114.129-.228.145-.422.048a5.5 5.5 0 0 1-1.572-1.028c-.4-.347-.67-.777-.749-.915-.079-.137-.008-.211.07-.308.072-.087.161-.19.242-.285.08-.096.107-.16.16-.27.054-.108.027-.206-.014-.302-.04-.096-.437-1.05-.6-.1.44-.066.307-.096.437.096.129.19.467.548.577.67.11.12.23.13.41.03.18-.09 1.14-.56 1.32-.63.18-.07.3-.1.43.1.13.19.5.63.62.76.11.13.23.15.42.05.19-.1.97-.4 1.81-1.15.65-.57.88-1.2 1.05-1.39.17-.19.23-.23.23-.23z"/>
            </svg>
          </button>
          
          <!-- Facebook -->
          <button onclick="SharingService.shareToPlatform('facebook', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on Facebook">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951z"/>
            </svg>
          </button>
          
          <!-- Instagram -->
          <button onclick="SharingService.shareToPlatform('instagram', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-pink-50 text-pink-600 hover:bg-gradient-to-tr hover:from-yellow-500 hover:via-pink-500 hover:to-purple-500 hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on Instagram">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.444-.048-3.298c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/>
            </svg>
          </button>
          
          <!-- X / Twitter -->
          <button onclick="SharingService.shareToPlatform('x', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 text-gray-900 hover:bg-black hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on X">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/>
            </svg>
          </button>
          
          <!-- LinkedIn -->
          <button onclick="SharingService.shareToPlatform('linkedin', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-cyan-50 text-cyan-600 hover:bg-cyan-600 hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on LinkedIn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z"/>
            </svg>
          </button>
          
          <!-- Telegram -->
          <button onclick="SharingService.shareToPlatform('telegram', '${cleanId}', '${escHtml(title)}', '')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Share on Telegram">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.56.443c.007.217.29.303.379.332q.271.085 1.023.323l1.837.58c.216.068.432.007.59-.117q.421-.334 2.687-1.85c.107-.072.207-.11.299-.104.088.006.143.076.125.15-.034.145-1.18 1.196-1.785 1.757-.19.176-.305.285-.322.303-.038.038-.08.077-.123.115-.12.107-.205.184-.047.288l2.97 1.956c.49.323.85.158.972-.429l1.986-9.37q.074-.352-.12-.472-.187-.116-.626.059"/>
            </svg>
          </button>
          
          <!-- Copy Link -->
          <button onclick="SharingService.copyLink('${cleanId}')" 
                  class="w-10 h-10 rounded-full flex items-center justify-center bg-primary-fixed text-primary hover:bg-primary hover:text-white transition-all transform hover:scale-110 active:scale-95" 
                  title="Copy Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4 4 0 0 1-.128-1.287z"/>
              <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.586-.586a1 1 0 0 0 .154-.199 2 2 0 0 1-.861-3.337L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792a4 4 0 0 1 .128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  return {
    getPublicUrl,
    shareToPlatform,
    copyLink,
    renderShareButtons,
  };
})();

