/**
 * photo-editor.js — AI-Powered Photo Editor & Social Media Studio
 * ─────────────────────────────────────────────────────────────────
 * Tab 1: Edit        — CSS filters, brightness/contrast/saturation, text overlay, crop
 * Tab 2: AI Enhance  — Gemini Vision analyzes photo → smart filter, captions, mood
 * Tab 3: AI Generate — Generate AI travel image from trip narrative/destination
 */

'use strict';

// ── Editor State ────────────────────────────────────────────────
const editorState = {
  srcUrl:        '',
  filename:      '',
  photoId:       '',
  filter:        'none',
  brightness:    100,
  contrast:      100,
  saturation:    100,
  text:          '',
  textColor:     '#ffffff',
  fontSize:      28,
  aspect:        'original',
  activeTab:     'edit',
  aiCaption:     '',       // AI-suggested caption
  aiAnalysis:    null,     // full AI response
  generatedImgUrl: null,   // AI-generated image data URL
};

const FILTERS = [
  { id: 'none',     label: 'Original', css: '' },
  { id: 'vivid',    label: 'Vivid',    css: 'saturate(1.8) contrast(1.1)' },
  { id: 'warm',     label: 'Warm',     css: 'sepia(0.3) saturate(1.4) brightness(1.05)' },
  { id: 'cool',     label: 'Cool',     css: 'hue-rotate(30deg) saturate(1.2) brightness(1.05)' },
  { id: 'bw',       label: 'B&W',      css: 'grayscale(1) contrast(1.2)' },
  { id: 'vintage',  label: 'Vintage',  css: 'sepia(0.6) contrast(0.9) brightness(0.9)' },
  { id: 'dramatic', label: 'Dramatic', css: 'contrast(1.5) saturate(1.2) brightness(0.9)' },
  { id: 'fade',     label: 'Fade',     css: 'saturate(0.7) brightness(1.1) contrast(0.85)' },
  { id: 'golden',   label: 'Golden',   css: 'sepia(0.4) saturate(1.6) brightness(1.1) hue-rotate(-10deg)' },
  { id: 'matte',    label: 'Matte',    css: 'contrast(0.9) saturate(0.8) brightness(1.1)' },
];

// ── Open editor ──────────────────────────────────────────────────
window.openPhotoEditor = function(srcUrl, filename, photoId) {
  Object.assign(editorState, {
    srcUrl, filename: filename || 'trip-photo.jpg', photoId: photoId || '',
    filter: 'none', brightness: 100, contrast: 100, saturation: 100,
    text: '', aspect: 'original', activeTab: 'edit',
    aiCaption: '', aiAnalysis: null, generatedImgUrl: null,
  });

  const modal = document.getElementById('photoEditorModal');
  if (!modal) return;

  // Reset controls
  ['editorBrightness','editorContrast','editorSaturation'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 100;
    const lbl = document.getElementById(id + 'Val');
    if (lbl) lbl.textContent = '100%';
  });
  const textInput = document.getElementById('editorTextInput');
  if (textInput) textInput.value = '';

  document.querySelectorAll('.aspect-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.aspect-chip[data-aspect="original"]')?.classList.add('active');

  // Reset AI state
  _clearAIPanel();
  _clearGeneratePanel();

  // Switch to Edit tab
  switchEditorTab('edit');
  renderFilterChips();

  const preview = document.getElementById('editorPreviewImg');
  if (preview) { preview.src = srcUrl; preview.style.filter = ''; }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  applyEditorPreview();
};

window.closePhotoEditor = function() {
  const modal = document.getElementById('photoEditorModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// ── Tab switching ────────────────────────────────────────────────
window.switchEditorTab = function(tab) {
  editorState.activeTab = tab;
  ['edit','ai-enhance','ai-generate'].forEach(t => {
    const btn  = document.getElementById(`editorTab-${t}`);
    const pane = document.getElementById(`editorPane-${t}`);
    const active = t === tab;
    btn?.classList.toggle('active-tab', active);
    btn?.classList.toggle('inactive-tab', !active);
    if (pane) pane.style.display = active ? '' : 'none';
  });
};

// ── Filter strip ─────────────────────────────────────────────────
function renderFilterChips() {
  const strip = document.getElementById('filterStrip');
  if (!strip) return;
  strip.innerHTML = FILTERS.map(f => `
    <button class="filter-chip ${f.id === editorState.filter ? 'active' : ''} flex flex-col items-center gap-1 p-1 rounded-xl flex-shrink-0"
            onclick="setEditorFilter('${f.id}')">
      <div class="w-14 h-14 rounded-lg overflow-hidden border-2 ${f.id === editorState.filter ? 'border-primary' : 'border-transparent'} transition-all">
        <img src="${editorState.srcUrl}" class="w-full h-full object-cover" style="filter:${f.css};" alt="${f.label}">
      </div>
      <span class="text-[10px] font-medium text-center ${f.id === editorState.filter ? 'text-primary' : 'text-on-surface-variant'}">${f.label}</span>
    </button>`).join('');
}

window.setEditorFilter = function(id) {
  editorState.filter = id;
  renderFilterChips();
  applyEditorPreview();
};

window.setAspect = function(aspect) {
  editorState.aspect = aspect;
  document.querySelectorAll('.aspect-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.aspect === aspect));
  applyEditorPreview();
};

// ── Sliders ──────────────────────────────────────────────────────
window.onEditorBrightness = v => { editorState.brightness = +v; _updateLabel('editorBrightnessVal', v + '%'); applyEditorPreview(); };
window.onEditorContrast   = v => { editorState.contrast   = +v; _updateLabel('editorContrastVal',   v + '%'); applyEditorPreview(); };
window.onEditorSaturation = v => { editorState.saturation = +v; _updateLabel('editorSaturationVal', v + '%'); applyEditorPreview(); };
function _updateLabel(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

// ── Live preview ─────────────────────────────────────────────────
function applyEditorPreview() {
  const preview = document.getElementById('editorPreviewImg');
  const wrapper = document.getElementById('editorPreviewWrapper');
  if (!preview) return;

  const f = FILTERS.find(x => x.id === editorState.filter) || FILTERS[0];
  const manual = `brightness(${editorState.brightness/100}) contrast(${editorState.contrast/100}) saturate(${editorState.saturation/100})`;
  preview.style.filter = `${f.css} ${manual}`.trim();

  if (wrapper) {
    wrapper.className = wrapper.className.replace(/aspect-\S+/g, '').trim();
    const map = { '1:1': 'aspect-square', '4:5': 'aspect-[4/5]', '16:9': 'aspect-video' };
    if (map[editorState.aspect]) wrapper.classList.add(map[editorState.aspect], 'overflow-hidden');
  }

  const overlay = document.getElementById('editorTextOverlay');
  if (overlay) {
    const txt = document.getElementById('editorTextInput')?.value || editorState.text;
    overlay.textContent = txt;
    overlay.style.display = txt ? 'block' : 'none';
  }
}

window.onEditorTextChange = v => { editorState.text = v; applyEditorPreview(); };

// ─────────────────────────────────────────────────────────────────
// TAB 2: AI ENHANCE
// ─────────────────────────────────────────────────────────────────
window.runAIAnalyze = async function() {
  const btn     = document.getElementById('aiAnalyzeBtn');
  const spinner = document.getElementById('aiAnalyzeSpinner');
  const results = document.getElementById('aiAnalyzeResults');
  if (!results) return;

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'flex';
  results.innerHTML = '';

  try {
    // Try to fetch the image as a blob for the backend
    let response;
    const isApiUrl = editorState.srcUrl.startsWith('/api/');

    if (isApiUrl) {
      // GET the image from our backend and POST it for analysis
      const imgResp = await fetch(editorState.srcUrl);
      if (!imgResp.ok) throw new Error('Could not load photo.');
      const blob = await imgResp.blob();
      const form = new FormData();
      form.append('photo', blob, editorState.filename || 'photo.jpg');
      _appendAnalysisContext(form);
      response = await fetch(`${window.API_BASE || ''}/api/ai-photo/analyze`, { method: 'POST', body: form });
    } else {
      // Object URL — convert to blob
      const imgResp = await fetch(editorState.srcUrl);
      const blob    = await imgResp.blob();
      const form    = new FormData();
      form.append('photo', blob, editorState.filename || 'photo.jpg');
      _appendAnalysisContext(form);
      response = await fetch(`${window.API_BASE || ''}/api/ai-photo/analyze`, { method: 'POST', body: form });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    editorState.aiAnalysis = data;
    _renderAIResults(data);

  } catch (err) {
    results.innerHTML = `<p class="text-error text-sm p-3 bg-error-container/30 rounded-lg">⚠ ${err.message}</p>`;
    console.error('[photo-editor] AI analyze error:', err);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
};

function _appendAnalysisContext(form) {
  const narrative = window._lastNarrativeData;
  if (narrative) {
    if (narrative.destination) form.append('destination', narrative.destination);
    if (narrative.tone) form.append('mood', narrative.tone);
    if (narrative.narrative) form.append('narrative', narrative.narrative.slice(0, 300));
  }
}

function _renderAIResults(data) {
  const results = document.getElementById('aiAnalyzeResults');
  if (!results) return;

  const moodColors = {
    Serene: 'bg-blue-100 text-blue-700', Adventurous: 'bg-orange-100 text-orange-700',
    Dramatic: 'bg-purple-100 text-purple-700', Golden: 'bg-yellow-100 text-yellow-700',
    Misty: 'bg-gray-100 text-gray-600', Vibrant: 'bg-pink-100 text-pink-700',
  };
  const moodClass = moodColors[data.mood] || 'bg-primary-fixed text-primary';

  results.innerHTML = `
    <div class="space-y-4">
      <!-- Mood + Scene -->
      <div class="flex items-center gap-3 flex-wrap">
        <span class="px-3 py-1 rounded-full text-xs font-bold ${moodClass}">${data.mood || 'Unknown'} mood</span>
        ${data.scene ? `<span class="text-xs text-on-surface-variant flex-1">${data.scene}</span>` : ''}
      </div>

      <!-- Auto-apply suggestion -->
      <div class="p-3 bg-primary-fixed/30 rounded-xl border border-primary/20 flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-primary">AI recommends: <b>${FILTERS.find(f=>f.id===data.suggestedFilter)?.label || data.suggestedFilter}</b> filter</p>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${data.enhancement || ''}</p>
        </div>
        <button onclick="applyAISuggestions()" class="flex-shrink-0 bg-primary text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-primary-container transition-all active:scale-95">
          Apply ✨
        </button>
      </div>

      <!-- Platform captions -->
      <div class="space-y-2">
        <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">AI-Generated Captions</p>
        ${_platformCaption('📸 Instagram', data.captions?.instagram, 'instagram')}
        ${_platformCaption('🐦 Twitter/X', data.captions?.twitter, 'twitter')}
        ${_platformCaption('💼 LinkedIn', data.captions?.linkedin, 'linkedin')}
        ${_platformCaption('💬 WhatsApp', data.captions?.whatsapp, 'whatsapp')}
      </div>

      <!-- Hashtags -->
      ${data.hashtags?.length ? `
      <div>
        <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Hashtags</p>
        <div class="flex flex-wrap gap-1.5">
          ${data.hashtags.map(h => `<span class="bg-primary-fixed/40 text-primary text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:bg-primary-fixed transition-all" onclick="navigator.clipboard.writeText('#${h}').then(()=>showToast('#${h} copied','success'))">#${h}</span>`).join('')}
        </div>
        <button onclick="copyAllHashtags()" class="mt-2 text-primary text-xs font-semibold hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy all hashtags
        </button>
      </div>` : ''}

      <!-- Create Social Post CTA -->
      <button onclick="closePhotoEditor(); openSocialPostStudio();"
              class="w-full bg-gradient-to-r from-primary to-secondary-container text-white py-3 px-4 rounded-xl font-label-md text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-md">
        <span class="material-symbols-outlined" style="font-size:18px;">auto_awesome</span>
        Open Social Post Studio
      </button>
    </div>`;
}

function _platformCaption(platform, text, id) {
  if (!text) return '';
  return `
    <div class="p-3 bg-surface-container-low rounded-xl border border-outline-variant/50 group">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1">
          <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">${platform}</p>
          <p class="text-xs text-on-surface leading-relaxed">${text}</p>
        </div>
        <button onclick="copyCaption('${id}')" class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-container" title="Copy">
          <span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>
        </button>
      </div>
    </div>`;
}

window.copyCaption = function(platform) {
  const data = editorState.aiAnalysis;
  if (!data) return;
  const text = data.captions?.[platform] || '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast(`${platform} caption copied!`, 'success'));
};

window.copyAllHashtags = function() {
  const tags = (editorState.aiAnalysis?.hashtags || []).map(h => `#${h}`).join(' ');
  if (!tags) return;
  navigator.clipboard.writeText(tags).then(() => showToast('All hashtags copied!', 'success'));
};

window.applyAISuggestions = function() {
  const data = editorState.aiAnalysis;
  if (!data) return;
  if (data.suggestedFilter) { editorState.filter = data.suggestedFilter; }
  if (data.brightness)  { editorState.brightness  = data.brightness; document.getElementById('editorBrightness').value = data.brightness; _updateLabel('editorBrightnessVal', data.brightness + '%'); }
  if (data.contrast)    { editorState.contrast    = data.contrast;   document.getElementById('editorContrast').value   = data.contrast;   _updateLabel('editorContrastVal',   data.contrast   + '%'); }
  if (data.saturation)  { editorState.saturation  = data.saturation; document.getElementById('editorSaturation').value = data.saturation; _updateLabel('editorSaturationVal', data.saturation + '%'); }
  if (data.captions?.instagram) {
    const input = document.getElementById('editorTextInput');
    if (input) { input.value = data.captions.instagram; editorState.text = data.captions.instagram; }
  }
  renderFilterChips();
  applyEditorPreview();
  switchEditorTab('edit');
  showToast('✨ AI suggestions applied!', 'success');
};

function _clearAIPanel() {
  const r = document.getElementById('aiAnalyzeResults');
  if (r) r.innerHTML = '';
}

// ─────────────────────────────────────────────────────────────────
// TAB 3: AI GENERATE
// ─────────────────────────────────────────────────────────────────
window.runAIGenerate = async function() {
  const promptInput = document.getElementById('aiGeneratePrompt');
  const btn         = document.getElementById('aiGenerateBtn');
  const spinner     = document.getElementById('aiGenerateSpinner');
  const preview     = document.getElementById('aiGeneratedPreview');
  const actions     = document.getElementById('aiGeneratedActions');

  const narrative   = window._lastNarrativeData;
  const destination = document.getElementById('aiGenerateDest')?.value || narrative?.destination || '';
  const mood        = document.getElementById('aiGenerateMood')?.value || narrative?.tone || 'Adventurous';
  const promptText  = promptInput?.value?.trim() || '';

  if (!destination && !promptText) {
    showToast('Enter a destination or description to generate.', 'info');
    return;
  }

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'flex';
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (actions) actions.classList.add('hidden');

  try {
    const narrativeId = narrative?.id || null;
    const res  = await fetch(`${window.API_BASE || ''}/api/ai-photo/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destination, mood, prompt: promptText, narrativeId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    editorState.generatedImgUrl = data.dataUrl || `/api/photos/single/${data.photoId}`;

    // Show preview
    if (preview) {
      preview.src = editorState.generatedImgUrl;
      preview.style.display = 'block';
    }
    if (actions) actions.classList.remove('hidden');

    showToast('✨ AI image generated!', 'success');

  } catch (err) {
    showToast(`AI generation failed: ${err.message}`, 'error');
    console.error('[photo-editor] AI generate error:', err);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
};

window.useGeneratedImage = function() {
  if (!editorState.generatedImgUrl) return;
  editorState.srcUrl   = editorState.generatedImgUrl;
  editorState.filename = `ai-generated-${Date.now()}.png`;
  editorState.photoId  = '';
  const preview = document.getElementById('editorPreviewImg');
  if (preview) preview.src = editorState.generatedImgUrl;
  renderFilterChips();
  applyEditorPreview();
  switchEditorTab('edit');
  showToast('Generated image loaded into editor!', 'success');

  // Also reload in gallery
  if (window.photoResults) {
    window.photoResults.push({ url: editorState.srcUrl, filename: editorState.filename });
    if (window.renderNarrativePhotoGallery) window.renderNarrativePhotoGallery(window.photoResults);
  }
};

window.downloadGeneratedImage = function() {
  if (!editorState.generatedImgUrl) return;
  const a = document.createElement('a');
  a.href     = editorState.generatedImgUrl;
  a.download = `ai-travel-${Date.now()}.png`;
  a.click();
  showToast('📷 AI image downloaded!', 'success');
};

function _clearGeneratePanel() {
  const p = document.getElementById('aiGeneratedPreview');
  const a = document.getElementById('aiGeneratedActions');
  if (p) { p.src = ''; p.style.display = 'none'; }
  if (a) a.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────
// DOWNLOAD & SHARE
// ─────────────────────────────────────────────────────────────────
window.downloadEditorPhoto = function() {
  const preview = document.getElementById('editorPreviewImg');
  if (!preview?.src) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let { naturalWidth: w, naturalHeight: h } = img;
    let sx = 0, sy = 0, sw = w, sh = h;

    if (editorState.aspect === '1:1') {
      const s = Math.min(w, h); sx = (w-s)/2; sy = (h-s)/2; sw = sh = s;
    } else if (editorState.aspect === '4:5') {
      sh = Math.min(h, w*5/4); sy = (h-sh)/2; sw = sh*4/5; sx = (w-sw)/2;
    } else if (editorState.aspect === '16:9') {
      sh = Math.min(h, w*9/16); sy = (h-sh)/2;
    }

    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext('2d');

    const f = FILTERS.find(x => x.id === editorState.filter) || FILTERS[0];
    const manual = `brightness(${editorState.brightness/100}) contrast(${editorState.contrast/100}) saturate(${editorState.saturation/100})`;
    ctx.filter = `${f.css} ${manual}`.trim();
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    if (editorState.text) {
      ctx.filter = 'none';
      ctx.font   = `bold ${editorState.fontSize}px "Work Sans", sans-serif`;
      ctx.fillStyle = editorState.textColor || '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8;
      const lines = editorState.text.match(/.{1,40}/g) || [];
      const lineH = editorState.fontSize * 1.4;
      const startY = sh - lines.length * lineH - 30;
      lines.forEach((line, i) => ctx.fillText(line, sw/2, startY + i*lineH));
    }

    const link = document.createElement('a');
    link.download = editorState.filename.replace(/\.[^.]+$/, '') + '_edited.jpg';
    link.href     = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
    showToast('📸 Photo saved for sharing!', 'success');
  };
  img.onerror = () => {
    const a = document.createElement('a'); a.href = editorState.srcUrl; a.download = editorState.filename; a.click();
  };
  img.src = editorState.srcUrl;
};

window.shareEditorPhoto = async function() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'My Trip Photo — Manivtha Tours', text: editorState.text || 'Check out my trip!', url: window.location.href });
    } catch (_) {}
  } else {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    showToast('Link copied! Open on mobile to share.', 'info');
  }
};

// Expose state for social post studio
window.getEditorState = () => editorState;
