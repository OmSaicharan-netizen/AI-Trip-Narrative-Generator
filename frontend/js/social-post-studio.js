/**
 * social-post-studio.js — AI Social Media Post Creator
 * ──────────────────────────────────────────────────────
 * Combines trip photo + narrative into beautiful, platform-ready
 * social media posts designed on HTML5 Canvas.
 *
 * Platforms: Instagram Square, Instagram Story, Twitter/X, WhatsApp
 * Features:  AI captions, hashtags, post ideas, canvas download
 */

'use strict';

// ── Studio State ─────────────────────────────────────────────────
const studioState = {
  platform:    'instagram',  // 'instagram' | 'story' | 'twitter' | 'whatsapp'
  photoUrl:    '',
  title:       '',
  caption:     '',
  hashtags:    [],
  postIdeas:   [],
  viralHook:   '',
  bestTime:    '',
  allCaptions: {},           // { instagram, twitter, linkedin, whatsapp }
  loading:     false,
};

// Platform canvas configs
const PLATFORMS = {
  instagram: { w: 1080, h: 1080, label: '📸 Instagram',  shape: 'square',   ratio: '1/1'   },
  story:     { w: 1080, h: 1920, label: '📱 Story',       shape: 'portrait', ratio: '9/16'  },
  twitter:   { w: 1200, h: 675,  label: '🐦 Twitter/X',   shape: 'landscape',ratio: '16/9'  },
  whatsapp:  { w: 1080, h: 1080, label: '💬 WhatsApp',    shape: 'square',   ratio: '1/1'   },
};

// Color schemes per platform
const THEMES = {
  instagram: { grad1: '#833ab4', grad2: '#fd1d1d', grad3: '#fcb045', text: '#fff' },
  story:     { grad1: '#0f0c29', grad2: '#302b63', grad3: '#24243e', text: '#fff' },
  twitter:   { grad1: '#1DA1F2', grad2: '#0d7bbf', grad3: '#1a1a2e', text: '#fff' },
  whatsapp:  { grad1: '#128C7E', grad2: '#075E54', grad3: '#25D366', text: '#fff' },
};

// ── Open studio ──────────────────────────────────────────────────
window.openSocialPostStudio = function(photoUrl, opts = {}) {
  const modal = document.getElementById('socialPostStudio');
  if (!modal) return;

  // Grab photo from editor or passed arg
  const url     = photoUrl || window.getEditorState?.()?.srcUrl || '';
  const narrative = window._lastNarrativeData;

  Object.assign(studioState, {
    platform:    'instagram',
    photoUrl:    url,
    title:       opts.title || narrative?.title || narrative?.route || 'Trip Story',
    caption:     opts.caption || '',
    hashtags:    [],
    postIdeas:   [],
    viralHook:   '',
    bestTime:    '',
    allCaptions: {},
    loading:     false,
  });

  // Set photo preview
  const studioImg = document.getElementById('studioPhotoPreview');
  if (studioImg && url) { studioImg.src = url; }

  // Render platform tabs
  renderPlatformTabs();
  updateCanvasPreview();

  // If no captions yet, auto-generate
  if (!studioState.caption && narrative) {
    generateAICaptions();
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeSocialPostStudio = function() {
  const modal = document.getElementById('socialPostStudio');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// ── Generate AI captions ─────────────────────────────────────────
window.generateAICaptions = async function() {
  const btn      = document.getElementById('studioGenerateBtn');
  const loadArea = document.getElementById('studioCaptionLoading');
  const content  = document.getElementById('studioCaptionContent');
  const narrative = window._lastNarrativeData;

  if (!narrative && !studioState.title) {
    showToast('No narrative data. Generate a narrative first.', 'info');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  if (loadArea) loadArea.classList.remove('hidden');
  if (content)  content.classList.add('hidden');

  try {
    const res = await fetch(`${window.API_BASE || ''}/api/ai-photo/social-captions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        narrativeText: narrative?.narrative || '',
        destination:   narrative?.destination || narrative?.route || studioState.title,
        mood:          narrative?.tone || 'Adventurous',
        title:         narrative?.title || studioState.title,
        driverName:    narrative?.driverName || '',
        landmarks:     narrative?.landmarks || '',
        highlights:    narrative?.highlights || '',
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    studioState.allCaptions = data.captions || {};
    studioState.hashtags    = data.hashtags  || [];
    studioState.postIdeas   = data.postIdeas || [];
    studioState.viralHook   = data.viralHook || '';
    studioState.bestTime    = data.bestTime  || '';

    // Set platform caption
    _setPlatformCaption();
    renderCaptionPanel(data);
    updateCanvasPreview();

    showToast('✨ AI captions generated!', 'success');

  } catch (err) {
    showToast(`Caption generation failed: ${err.message}`, 'error');
    console.error('[social-studio] Caption error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Regenerate AI Captions'; }
    if (loadArea) loadArea.classList.add('hidden');
    if (content)  content.classList.remove('hidden');
  }
};

function _setPlatformCaption() {
  const map = { twitter: 'twitter', story: 'instagram', whatsapp: 'whatsapp', linkedin: 'linkedin' };
  const key = map[studioState.platform] || studioState.platform;
  studioState.caption = studioState.allCaptions[key] || studioState.allCaptions.instagram || '';
  const captionEl = document.getElementById('studioCaptionText');
  if (captionEl) captionEl.value = studioState.caption;
}

// ── Render caption panel ─────────────────────────────────────────
function renderCaptionPanel(data) {
  const content = document.getElementById('studioCaptionContent');
  if (!content) return;
  content.classList.remove('hidden');

  // Viral hook
  const hookEl = document.getElementById('studioViralHook');
  if (hookEl) hookEl.textContent = data.viralHook || '';

  // Best time
  const timeEl = document.getElementById('studioBestTime');
  if (timeEl) timeEl.textContent = data.bestTime || '';

  // Hashtags
  const tagsEl = document.getElementById('studioHashtags');
  if (tagsEl) {
    tagsEl.innerHTML = (data.hashtags || []).map(h =>
      `<span class="studio-tag cursor-pointer" onclick="navigator.clipboard.writeText('#${h}').then(()=>showToast('#${h} copied','success'))">#${h}</span>`
    ).join('');
  }

  // Post ideas
  const ideasEl = document.getElementById('studioPostIdeas');
  if (ideasEl && data.postIdeas?.length) {
    ideasEl.innerHTML = data.postIdeas.map((idea, i) =>
      `<li class="text-sm text-on-surface-variant flex items-start gap-2">
        <span class="text-primary font-bold flex-shrink-0">${i+1}.</span> ${idea}
      </li>`
    ).join('');
  }
}

// ── Platform tab switching ────────────────────────────────────────
function renderPlatformTabs() {
  const tabs = document.getElementById('studioPlatformTabs');
  if (!tabs) return;
  tabs.innerHTML = Object.entries(PLATFORMS).map(([key, cfg]) => `
    <button onclick="switchStudioPlatform('${key}')"
            id="studioTab-${key}"
            class="studio-platform-tab ${key === studioState.platform ? 'active' : ''} px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap">
      ${cfg.label}
    </button>`).join('');
}

window.switchStudioPlatform = function(platform) {
  studioState.platform = platform;
  renderPlatformTabs();
  _setPlatformCaption();
  updateCanvasPreview();
};

// ── Canvas Preview ───────────────────────────────────────────────
function updateCanvasPreview() {
  const canvas = document.getElementById('studioCanvas');
  if (!canvas) return;

  const plat  = PLATFORMS[studioState.platform];
  const theme = THEMES[studioState.platform];

  // Scale canvas display (keep native at platform resolution for download)
  const maxW = Math.min(window.innerWidth - 64, 480);
  const scale = maxW / plat.w;
  canvas.width  = plat.w;
  canvas.height = plat.h;
  canvas.style.width  = `${plat.w * scale}px`;
  canvas.style.height = `${plat.h * scale}px`;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, plat.w, plat.h);

  // Draw photo or gradient background
  if (studioState.photoUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Cover fill
      const imgRatio = img.width / img.height;
      const canvRatio = plat.w / plat.h;
      let sx, sy, sw, sh;
      if (imgRatio > canvRatio) {
        sh = img.height; sw = sh * canvRatio; sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = sw / canvRatio; sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, plat.w, plat.h);
      _drawOverlay(ctx, plat, theme);
    };
    img.onerror = () => _drawGradientBg(ctx, plat, theme);
    img.src = studioState.photoUrl;
  } else {
    _drawGradientBg(ctx, plat, theme);
  }
}

function _drawGradientBg(ctx, plat, theme) {
  const grad = ctx.createLinearGradient(0, 0, plat.w, plat.h);
  grad.addColorStop(0, theme.grad1);
  grad.addColorStop(0.5, theme.grad2);
  grad.addColorStop(1, theme.grad3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, plat.w, plat.h);
  _drawOverlay(ctx, plat, theme);
}

function _drawOverlay(ctx, plat, theme) {
  const { w, h } = plat;

  // Bottom gradient overlay
  const bottomGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
  bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGrad.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 0, w, h);

  // Platform badge (top-right)
  const plName = PLATFORMS[studioState.platform].label;
  ctx.font = `bold ${Math.round(w * 0.028)}px "Work Sans", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(plName, w - 36, 60);

  // Title
  const titleText = studioState.title || 'My Trip Story';
  ctx.font = `bold ${Math.round(w * 0.065)}px "Work Sans", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur  = 12;
  _wrapText(ctx, titleText, 60, h * 0.60, w - 120, Math.round(w * 0.075));

  // Caption
  if (studioState.caption) {
    ctx.font = `${Math.round(w * 0.036)}px "Work Sans", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowBlur = 6;
    _wrapText(ctx, studioState.caption, 60, h * 0.74, w - 120, Math.round(w * 0.044));
  }

  // Top hashtags row
  if (studioState.hashtags.length) {
    const tagText = studioState.hashtags.slice(0, 5).map(h => `#${h}`).join('  ');
    ctx.font = `600 ${Math.round(w * 0.026)}px "Work Sans", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
    ctx.fillText(tagText, 60, h - 60);
  }

  // Branding watermark (bottom-right)
  ctx.font = `600 ${Math.round(w * 0.024)}px "Work Sans", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.shadowBlur = 0;
  ctx.fillText('✈ Manivtha Tours', w - 36, h - 36);

  ctx.shadowBlur = 0;
}

function _wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line  = '';
  let lineY = y;
  for (const word of words) {
    const testLine  = line ? `${line} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxW && line) {
      ctx.fillText(line, x, lineY);
      line  = word;
      lineY += lineH;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

// ── Caption textarea sync ─────────────────────────────────────────
window.onStudioCaptionChange = function(val) {
  studioState.caption = val;
  updateCanvasPreview();
};

window.onStudioTitleChange = function(val) {
  studioState.title = val;
  updateCanvasPreview();
};

// ── Download post ─────────────────────────────────────────────────
window.downloadSocialPost = function() {
  const canvas = document.getElementById('studioCanvas');
  if (!canvas) return;

  const link     = document.createElement('a');
  const platName = studioState.platform;
  link.download  = `manivtha-${platName}-post-${Date.now()}.png`;
  link.href      = canvas.toDataURL('image/png');
  link.click();
  showToast('📱 Social post downloaded!', 'success');
};

// ── Share post ────────────────────────────────────────────────────
window.shareSocialPost = async function() {
  const canvas = document.getElementById('studioCanvas');
  const caption = studioState.caption;
  const tags    = studioState.hashtags.slice(0, 8).map(h => `#${h}`).join(' ');
  const shareText = `${caption}\n\n${tags}`;

  if (navigator.share && navigator.canShare) {
    try {
      // Convert canvas to blob for native share
      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'manivtha-post.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: studioState.title, text: shareText, files: [file] });
        } else {
          await navigator.share({ title: studioState.title, text: shareText, url: location.href });
        }
      }, 'image/png');
      return;
    } catch (_) {}
  }

  // Fallback — copy caption + hashtags
  await navigator.clipboard.writeText(shareText).catch(() => {});
  showToast('Caption & hashtags copied! Paste in your social app.', 'info', 4000);
};

// ── Copy caption ──────────────────────────────────────────────────
window.copyStudioCaption = function() {
  const text = studioState.caption;
  const tags = studioState.hashtags.slice(0, 10).map(h => `#${h}`).join(' ');
  navigator.clipboard.writeText(`${text}\n\n${tags}`)
    .then(() => showToast('Caption + hashtags copied!', 'success'));
};

// ── Export as Story frames ─────────────────────────────────────────
window.exportStoryFrames = function() {
  // Quick 3-frame export: title frame, photo frame, CTA frame
  ['story'].forEach(plat => {
    const tmp = studioState.platform;
    studioState.platform = plat;
    updateCanvasPreview();
    setTimeout(() => {
      downloadSocialPost();
      studioState.platform = tmp;
      updateCanvasPreview();
    }, 300);
  });
};

// ── Wire caption input auto-refresh ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const captionInput = document.getElementById('studioCaptionText');
  if (captionInput) captionInput.addEventListener('input', () => onStudioCaptionChange(captionInput.value));
  const titleInput = document.getElementById('studioTitleInput');
  if (titleInput) titleInput.addEventListener('input', () => onStudioTitleChange(titleInput.value));
});
