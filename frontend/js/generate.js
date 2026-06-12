/**
 * generate.js — Narrative Generation Wizard Logic
 * ────────────────────────────────────────────────
 * Controls the 3-step narrative creation wizard (Stitch: create_new_narrative).
 * Wires the form → backend Gemini API → step-3 narrative display → TTS.
 * Also handles tone chip selection, star rating, copy, download, share.
 */

// ── Module State ─────────────────────────────────────────────
let currentStep       = 1;
let currentNarrativeId = null;   // SQLite row ID after generation
let selectedRating    = 0;
let lastFormData      = null;

// ── Step Navigation ───────────────────────────────────────────
window.goToStep = function (step) {
  // Validate step 1 before proceeding to step 2
  if (step === 2) {
    const driver = document.getElementById('driverName')?.value.trim();
    const destination  = document.getElementById('destination')?.value.trim();
    if (!driver || !destination) {
      showToast('Please fill in Driver Name and Destination to continue.', 'error');
      return;
    }
  }

  // Animate out current step
  const current = document.getElementById(`step-${currentStep}`);
  if (current) {
    current.style.opacity = '0';
    setTimeout(() => {
      current.classList.add('hidden');
      showStep(step);
    }, 200);
  } else {
    showStep(step);
  }
};

function showStep(step) {
  currentStep = step;

  const el = document.getElementById(`step-${step}`);
  if (!el) return;
  el.classList.remove('hidden');
  requestAnimationFrame(() => { el.style.opacity = '1'; });

  // Update progress bar
  const pct = ((step - 1) / 2) * 100;
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = `${pct}%`;

  // Update dots
  for (let i = 1; i <= 3; i++) {
    const dot   = document.getElementById(`step-dot-${i}`);
    const label = document.getElementById(`step-label-${i}`);
    if (!dot || !label) continue;

    dot.className = 'w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all';

    if (i < step) {
      dot.className += ' bg-primary text-white';
      dot.innerHTML  = '<span class="material-symbols-outlined" style="font-size:18px;">check</span>';
      label.className = 'font-label-md text-label-md text-primary';
    } else if (i === step) {
      dot.className += ' bg-primary text-white';
      dot.textContent = i;
      label.className = 'font-label-md text-label-md text-primary';
    } else {
      dot.className += ' bg-surface-container-high text-on-surface-variant';
      dot.textContent = i;
      label.className = 'font-label-md text-label-md text-on-surface-variant';
    }
  }
}

// ── Tone Chips ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tone-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.tone-chip').forEach(c => {
        c.className = 'tone-chip px-6 py-2 rounded-full border font-body-md transition-all bg-surface-container text-on-surface border-transparent hover:border-primary';
      });
      chip.className = 'tone-chip px-6 py-2 rounded-full border font-body-md transition-all bg-primary-fixed text-on-primary-fixed border-primary';
      document.getElementById('tone').value = chip.dataset.tone;
    });
  });

  // Pre-fill today's date
  const dateInput = document.getElementById('tripDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
});

// ── Title Suggestion ──────────────────────────────────────────
window.suggestTitle = async function() {
  const dest = document.getElementById('destination')?.value.trim();
  if (!dest) {
    showToast('Please enter a Destination first.', 'info');
    return;
  }
  
  const start = document.getElementById('startingLocation')?.value.trim();
  const btnText = document.getElementById('suggestTitleText');
  const loader = document.getElementById('suggestTitleLoader');
  
  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');

  try {
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`${API_BASE}/suggest-title/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: dest, startingLocation: start }),
    });
    
    if (!res.ok) throw new Error('Failed to suggest title');
    const data = await res.json();
    if (data.title) {
      document.getElementById('tripTitle').value = data.title;
      showToast('Title suggested!', 'success');
    }
  } catch(e) {
    console.error(e);
    showToast('Could not suggest title at this time.', 'error');
  } finally {
    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
};

// ── Generate Narrative ────────────────────────────────────────
window.handleGenerate = async function (overrideTone = null) {
  const driverName  = document.getElementById('driverName')?.value.trim();
  const startingLocation = document.getElementById('startingLocation')?.value.trim();
  const destination = document.getElementById('destination')?.value.trim();
  const titleField  = document.getElementById('tripTitle')?.value.trim();
  const mood        = overrideTone || document.getElementById('mood')?.value || 'adventurous';
  const style       = document.getElementById('style')?.value || 'Adventure';
  const vehicleType = document.getElementById('vehicleType')?.value || 'Sedan';
  const tripDate    = document.getElementById('tripDate')?.value || '';
  const landmarks   = document.getElementById('landmarks')?.value.trim() || '';
  const highlights  = document.getElementById('highlights')?.value.trim() || '';

  if (!driverName || !destination) {
    showToast('Please fill in Driver Name and Destination.', 'error');
    goToStep(1);
    return;
  }

  const route = startingLocation ? `${startingLocation} to ${destination}` : destination;
  lastFormData = { driverName, route, startingLocation, destination, title: titleField, mood, style, vehicleType, tripDate, landmarks, highlights };

  // Show loading overlay
  const loading = document.getElementById('loading-state');
  const btn     = document.getElementById('generateBtn');
  const btnText = document.getElementById('generateBtnText');
  const btnIcon = document.getElementById('generateBtnIcon');
  const loader  = document.getElementById('generateLoader');

  if (loading) { loading.classList.remove('hidden'); loading.classList.add('flex'); }
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Generating…';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (loader)  loader.classList.remove('hidden');

  // ── Immediate progress animation (starts within ~100ms) ────────────
  // Cycles through status messages so user sees activity immediately
  const progressSteps = [
    'Contacting AI…',
    'Crafting your story…',
    'Weaving the narrative…',
    'Finalizing your journey…',
  ];
  let progressIdx = 0;
  const progressEl = document.getElementById('generateBtnText') || btnText;
  const progressInterval = setInterval(() => {
    progressIdx = (progressIdx + 1) % progressSteps.length;
    if (progressEl) progressEl.textContent = progressSteps[progressIdx];
  }, 1800);

  console.log('🚀 Generating narrative:', { driverName, destination, mood, style });

  try {
    // Use authFetch — sends Firebase ID token so backend can associate userId
    const fetchFn = window.authFetch || fetch;
    const res = await fetchFn(`${API_BASE}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ driverName, startingLocation, destination, title: titleField, mood, style, vehicleType, tripDate, landmarks, highlights }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || `Server error ${res.status}`);
    }

    console.log('✅ Narrative generated:', json.id, json.title);

    currentNarrativeId = json.id;   // SQLite ID

    // Save to Firestore (primary store — triggers real-time history update)
    if (window.FirestoreService && window.currentUser) {
      const firestorePayload = {
        // Trip details from form
        ...lastFormData,
        // Override/add generated content
        title:          json.title,
        narrative:      json.narrative,
        summary:        json.summary        || null,
        socialCaption:  json.socialCaption  || null,
        // User + linking
        userId:         window.currentUser.uid,
        sqliteId:       json.id,
        // Quality metrics
        wordCount:      json.wordCount,
        charCount:      json.charCount,
      };
      FirestoreService.saveNarrative(firestorePayload).then(({ id: fsId, error: fsErr }) => {
        if (fsErr) {
          console.warn('[generate] Firestore save failed (non-fatal):', fsErr);
        } else {
          console.log('[generate] Firestore saved, id:', fsId);
          // Link firestoreId back in SQLite (non-blocking)
          fetch(`${API_BASE}/feedback/link-firestore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sqliteId: json.id, firestoreId: fsId }),
          }).catch(() => {});
        }
      });
    }

    // Render to step 3
    renderNarrative(json);

    // Go to step 3
    goToStep(3);

    // Load into TTS engine (does NOT auto-play) — uses BODY text only (no title duplication)
    const narrativeText = json.narrative || json.body || '';
    // Strip title from TTS text too, so it isn't read twice
    const ttsText = narrativeText
      .replace(/^#+\s*.+\n?/m, '')  // remove first # heading if present
      .trim();
    if (window.TTS) {
      window.TTS.load(ttsText);
      const words = ttsText.trim().split(/\s+/).length;
      const chars = ttsText.length;
      console.log(`[TTS] Loaded narrative — ${words} words, ${chars} chars`);
      showToast(`✨ Narrative ready (${words} words)! Press ▶ to listen.`, 'success', 4000);
    }

    // NOTE: Firestore save is handled above via FirestoreService.saveNarrative().
    // AppService.generateNarrative removed to prevent duplicate save.

  } catch (e) {
    console.error('Generate error:', e);
    showToast(`Generation failed: ${e.message}`, 'error', 5000);
  } finally {
    clearInterval(progressInterval);
    if (loading) { loading.classList.add('hidden'); loading.classList.remove('flex'); }
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Generate Narrative';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (loader)  loader.classList.add('hidden');
  }
};

// ── Render Narrative to Step 3 ────────────────────────────────
function renderNarrative(json) {
  const output = document.getElementById('narrativeOutput');
  const summaryEl = document.getElementById('narrativeSummary');
  const captionEl = document.getElementById('socialCaption');
  
  if (!output) return;

  const title = json.title || json.route || 'Trip Narrative';
  let   text  = json.narrative || json.body || json.content || '';
  
  if (summaryEl) summaryEl.textContent = json.summary || 'Summary unavailable.';
  if (captionEl) captionEl.textContent = json.socialCaption || 'Caption unavailable.';

  if (!text) {
    output.innerHTML = '<p class="text-error">No narrative content was returned.</p>';
    return;
  }

  // ── Safety: strip any accidental title repetition from body ──
  // Remove markdown heading if it matches the title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text
    .replace(new RegExp(`^#+\\s*${escapedTitle}\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^\\*\\*${escapedTitle}\\*\\*\\s*$`, 'gmi'), '')
    .replace(new RegExp(`^${escapedTitle}\\s*$`, 'gmi'), '')
    .replace(/^#+\s*/gm, '')   // strip ALL remaining # heading markers
    .trim();

  // ── Log quality metrics ────────────────────────────────────
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  console.log(`[renderNarrative] title="${title}" | ${words} words | ${chars} chars`);

  // ── Render: title is shown as a styled heading ABOVE the prose ──
  // The prose box itself only contains the body paragraphs.
  const html = text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    return `<p class="mb-4 leading-relaxed text-on-surface font-body-md">${escHtml(trimmed)}</p>`;
  }).join('');

  // Inject heading separately above prose, inside the narrative section
  output.innerHTML =
    `<h2 class="font-headline-md text-headline-md text-primary mb-5 pb-4 border-b border-outline-variant">${escHtml(title)}</h2>` +
    (html || '<p class="text-on-surface-variant">No content generated.</p>');

  // ── Show quality badge ─────────────────────────────────
  const qualityBadge = document.getElementById('narrativeQuality');
  if (qualityBadge) {
    const ok = words >= 200 && chars >= 3000;  // must match backend MIN_WORDS / MIN_CHARS
    qualityBadge.textContent = `${words} words · ${chars.toLocaleString()} chars`;
    qualityBadge.className   = ok
      ? 'text-xs font-label-md px-3 py-1 rounded-full bg-tertiary-fixed/40 text-tertiary'
      : 'text-xs font-label-md px-3 py-1 rounded-full bg-error-container text-error';
    qualityBadge.style.display = 'inline-flex';
  }

  // ── Story elements sidebar ─────────────────────────────────
  const fd = lastFormData || {};
  const elemRoute  = document.getElementById('elemRoute');
  const elemTone   = document.getElementById('elemTone');
  const elemDriver = document.getElementById('elemDriver');
  if (elemRoute)  elemRoute.textContent  = fd.route      || json.route      || '—';
  if (elemTone)   elemTone.textContent   = fd.mood       || json.tone       || '—';
  if (elemDriver) elemDriver.textContent = fd.driverName || json.driverName || '—';

  // ── Show rating section ────────────────────────────────────
  const ratingSection = document.getElementById('ratingSection');
  if (ratingSection) ratingSection.style.display = 'block';
}

// ── Regenerate with Different Tone ────────────────────────────
window.handleRegenerate = async function (tone) {
  if (!lastFormData) { showToast('Please generate a narrative first.', 'info'); return; }
  await handleGenerate(tone);
};

// ── Reset Wizard ──────────────────────────────────────────────
window.resetWizard = function () {
  currentNarrativeId = null;
  selectedRating     = 0;
  lastFormData       = null;

  // Clear form
  ['driverName','startingLocation','destination','tripTitle','landmarks','highlights','ratingComment'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('tripDate')?.setAttribute('value', new Date().toISOString().split('T')[0]);
  if (document.getElementById('mood')) document.getElementById('mood').value = 'adventurous';
  if (document.getElementById('style')) document.getElementById('style').value = 'Adventure';

  // Reset tone chips
  document.querySelectorAll('.tone-chip').forEach((c, i) => {
    c.className = i === 0
      ? 'tone-chip px-6 py-2 rounded-full border font-body-md transition-all bg-primary-fixed text-on-primary-fixed border-primary'
      : 'tone-chip px-6 py-2 rounded-full border font-body-md transition-all bg-surface-container text-on-surface border-transparent hover:border-primary';
  });

  // Reset rating stars
  document.querySelectorAll('.star').forEach(s => s.classList.remove('active','hovered'));

  // Stop TTS
  if (window.TTS) window.TTS.stop();

  // Go to step 1
  // Force-show step 1, hide others
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    if (i === 1) {
      el.classList.remove('hidden');
      el.style.opacity = '1';
    } else {
      el.classList.add('hidden');
      el.style.opacity = '0';
    }
  }
  currentStep = 1;
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = '0%';

  // Reset dots
  for (let i = 1; i <= 3; i++) {
    const dot   = document.getElementById(`step-dot-${i}`);
    const label = document.getElementById(`step-label-${i}`);
    if (!dot || !label) continue;
    dot.className = i === 1
      ? 'w-10 h-10 rounded-full flex items-center justify-center font-bold bg-primary text-white'
      : 'w-10 h-10 rounded-full flex items-center justify-center font-bold bg-surface-container-high text-on-surface-variant';
    dot.textContent = i;
    label.className = i === 1
      ? 'font-label-md text-label-md text-primary'
      : 'font-label-md text-label-md text-on-surface-variant';
  }
};

// ── Narrative Actions: Copy / Download / Share ────────────────
window.copyNarrative = async function () {
  const text = document.getElementById('narrativeOutput')?.textContent || '';
  if (!text.trim()) { showToast('Nothing to copy.', 'info'); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Narrative copied to clipboard!', 'success');
  } catch {
    showToast('Copy not supported. Please select and copy manually.', 'error');
  }
};

window.downloadNarrative = function () {
  const text  = document.getElementById('narrativeOutput')?.textContent || '';
  const title = (lastFormData?.route || 'narrative').replace(/[^a-z0-9]/gi, '_');
  if (!text.trim()) { showToast('Nothing to download.', 'info'); return; }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${title}.txt` });
  a.click();
  URL.revokeObjectURL(url);
  showToast('Narrative downloaded!', 'success');
};

window.shareNarrative = async function () {
  const text  = document.getElementById('narrativeOutput')?.textContent || '';
  const title = lastFormData?.route || 'Trip Narrative';
  if (navigator.share) {
    try {
      await navigator.share({ title, text: text.slice(0, 300) + '…' });
    } catch {}
  } else {
    await copyNarrative();
    showToast('Link copied — paste to share!', 'success');
  }
};

window.copySocialCaption = async function() {
  const text = document.getElementById('socialCaption')?.textContent || '';
  if (!text.trim() || text.includes('unavailable')) { showToast('Nothing to copy.', 'info'); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Caption copied!', 'success');
  } catch {
    showToast('Copy not supported.', 'error');
  }
};

// ── Star Rating ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const stars = document.querySelectorAll('.star');

  stars.forEach(star => {
    const val = parseInt(star.dataset.value);

    star.addEventListener('mouseover', () => {
      stars.forEach(s => {
        s.classList.toggle('hovered', parseInt(s.dataset.value) <= val);
      });
    });
    star.addEventListener('mouseout', () => {
      stars.forEach(s => s.classList.remove('hovered'));
    });
    star.addEventListener('click', () => {
      selectedRating = val;
      stars.forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.value) <= val);
      });
      const submitBtn = document.getElementById('submitRatingBtn');
      if (submitBtn) submitBtn.style.display = 'inline-block';
    });
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { star.click(); }
    });
  });
});

window.submitRating = async function () {
  if (!selectedRating) { showToast('Please select a rating.', 'info'); return; }
  if (!currentNarrativeId) { showToast('No narrative to rate.', 'info'); return; }

  const comment = document.getElementById('ratingComment')?.value.trim() || '';
  const btn = document.getElementById('submitRatingBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  try {
    const res = await fetch(`${API_BASE}/feedback/${currentNarrativeId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rating: selectedRating, comment }),
    });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error || 'Rating failed');
    }
    showToast(`Thank you! Rated ${selectedRating} ★`, 'success');
    if (btn) { btn.textContent = '✓ Rated'; btn.disabled = true; }

    // Sync to Firestore
    if (window.AppService && window.AppService.submitRating) {
      AppService.submitRating(currentNarrativeId, selectedRating, comment);
    }
  } catch (e) {
    showToast(`Rating error: ${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Rating'; }
  }
};
