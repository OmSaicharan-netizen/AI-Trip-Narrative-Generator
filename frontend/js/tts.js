/**
 * tts.js — Narration Engine (Text-to-Speech)
 * ─────────────────────────────────────────────
 * Uses the Web Speech API (SpeechSynthesis) for instant browser-native TTS.
 * No API key or server required. Works across Chrome, Edge, Safari, Firefox.
 *
 * Features:
 *  - Play / pause / stop narration
 *  - Voice selection (all available browser voices)
 *  - Speed control (0.8x – 1.5x)
 *  - Live progress bar + elapsed timer
 *  - Waveform animation while speaking
 *  - Chunked utterances for long texts (SpeechSynthesis Chrome bug workaround)
 *  - Graceful fallback messaging when API unavailable
 *
 * API (window.TTS):
 *   TTS.speak(text)    — play the given text
 *   TTS.pause()        — pause playback
 *   TTS.resume()       — resume paused playback
 *   TTS.stop()         — stop and reset
 *   TTS.isAvailable    — boolean
 *   TTS.isPlaying      — boolean
 */

window.TTS = (() => {
  // ── State ─────────────────────────────────────────────────
  const synth    = window.speechSynthesis || null;
  let utterances = [];     // array of SpeechSynthesisUtterance chunks
  let chunkIndex = 0;
  let _text      = '';
  let _isPaused  = false;
  let _isPlaying = false;

  // Timer tracking
  let timerInterval = null;
  let elapsed = 0;
  let estimatedDuration = 0;   // seconds estimate

  // DOM refs
  const getEl   = (id) => document.getElementById(id);
  const playBtn = () => getEl('ttsPlayBtn');
  const player  = () => getEl('ttsPlayer');
  const fill    = () => getEl('ttsProgressFill');
  const timer   = () => getEl('ttsTimer');
  const wave    = () => getEl('waveform');

  // ── Availability Check ────────────────────────────────────
  const isAvailable = !!(synth);

  if (!isAvailable) {
    console.warn('⚠️ TTS: Web Speech API not available in this browser.');
  }

  // ── Voice Loading ──────────────────────────────────────────
  function loadVoices() {
    if (!isAvailable) return [];
    return synth.getVoices().filter(v => v.lang.startsWith('en'));
  }

  function populateVoiceSelect() {
    const sel = getEl('ttsVoiceSelect');
    if (!sel) return;
    const voices = loadVoices();
    sel.innerHTML = '<option value="">Default</option>';
    voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(opt);
    });
  }

  // Voices may load asynchronously
  if (isAvailable) {
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = populateVoiceSelect;
    }
    setTimeout(populateVoiceSelect, 300);   // fallback
  }

  // ── Chunk Text ────────────────────────────────────────────
  // Chrome stops after ~220 chars; we chunk at sentence boundaries.
  function chunkText(text, maxLen = 200) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > maxLen && current.length > 0) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // ── Get Selected Voice ────────────────────────────────────
  function getSelectedVoice() {
    const sel = getEl('ttsVoiceSelect');
    if (!sel || sel.value === '') return null;
    const voices = loadVoices();
    return voices[parseInt(sel.value)] || null;
  }

  function getSpeed() {
    const sel = getEl('ttsSpeedSelect');
    return sel ? parseFloat(sel.value) : 1;
  }

  // ── UI Helpers ─────────────────────────────────────────────
  function setPlayIcon(icon) {
    const btn = playBtn();
    if (!btn) return;
    btn.querySelector('.material-symbols-outlined').textContent = icon;
  }

  function updateProgress() {
    const pct = estimatedDuration > 0
      ? Math.min((elapsed / estimatedDuration) * 100, 99)
      : 0;
    if (fill()) fill().style.width = `${pct}%`;
    if (timer()) timer().textContent = formatTime(elapsed);
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      elapsed++;
      updateProgress();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function showWave(show) {
    if (wave()) wave().style.display = show ? 'flex' : 'none';
  }

  function showPlayer(show) {
    if (player()) player().style.display = show ? 'flex' : 'none';
  }

  // ── Core: speak ───────────────────────────────────────────
  function speak(text) {
    if (!isAvailable) {
      showToast('⚠️ Narration not supported in this browser. Try Chrome or Edge.', 'error');
      console.error('TTS: Web Speech API unavailable');
      return;
    }

    // Stop any current playback
    stopInternal();

    _text = text.replace(/#+\s*/g, '').replace(/\*\*/g, '').trim();
    if (!_text) { showToast('No text to narrate.', 'info'); return; }

    const chunks = chunkText(_text);
    chunkIndex = 0;

    // Estimate duration: ~140 words/min average reading speed
    const wordCount = _text.split(/\s+/).length;
    const speed = getSpeed();
    estimatedDuration = Math.ceil((wordCount / 140) * 60 / speed);
    elapsed = 0;

    console.log(`🔊 TTS: speaking ${chunks.length} chunk(s) | ~${estimatedDuration}s | speed=${speed}`);

    utterances = chunks.map((chunk) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang  = 'en-US';
      u.rate  = speed;
      u.pitch = 1.0;
      u.volume = 1.0;
      const voice = getSelectedVoice();
      if (voice) u.voice = voice;
      return u;
    });

    // Wire chain: each utterance plays the next on end
    utterances.forEach((u, idx) => {
      u.onstart = () => {
        if (idx === 0) {
          _isPlaying = true;
          _isPaused  = false;
          setPlayIcon('pause');
          showWave(true);
          showPlayer(true);
          startTimer();
        }
      };
      u.onend = () => {
        chunkIndex++;
        if (chunkIndex < utterances.length) {
          synth.speak(utterances[chunkIndex]);
        } else {
          // All done
          _isPlaying = false;
          _isPaused  = false;
          setPlayIcon('play_arrow');
          showWave(false);
          stopTimer();
          if (fill()) fill().style.width = '100%';
          console.log('✅ TTS: narration complete');
        }
      };
      u.onerror = (e) => {
        // 'interrupted' happens on manual stop — not a real error
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.error('TTS utterance error:', e.error, chunk.slice(0, 50));
          showToast(`Narration error: ${e.error}`, 'error');
        }
        _isPlaying = false;
        setPlayIcon('play_arrow');
        showWave(false);
        stopTimer();
      };
    });

    // Chrome bug: cancel before queuing
    synth.cancel();
    setTimeout(() => synth.speak(utterances[0]), 50);
  }

  // ── Toggle (play / pause) ─────────────────────────────────
  function toggle() {
    if (!isAvailable) {
      showToast('Narration not available in this browser.', 'error');
      return;
    }
    if (!_text) {
      showToast('Generate a narrative first to enable narration.', 'info');
      return;
    }
    if (_isPlaying && !_isPaused) {
      pause();
    } else if (_isPaused) {
      resume();
    } else {
      speak(_text);
    }
  }

  function pause() {
    if (!synth || !_isPlaying) return;
    synth.pause();
    _isPaused = true;
    setPlayIcon('play_arrow');
    showWave(false);
    stopTimer();
    console.log('⏸ TTS paused');
  }

  function resume() {
    if (!synth) return;
    synth.resume();
    _isPaused = false;
    setPlayIcon('pause');
    showWave(true);
    startTimer();
    console.log('▶ TTS resumed');
  }

  function stopInternal() {
    if (synth) synth.cancel();
    utterances = [];
    chunkIndex = 0;
    _isPlaying = false;
    _isPaused  = false;
    elapsed = 0;
    stopTimer();
  }

  function stop() {
    stopInternal();
    setPlayIcon('play_arrow');
    showWave(false);
    if (fill()) fill().style.width = '0%';
    if (timer()) timer().textContent = '0:00';
    console.log('⏹ TTS stopped');
  }

  // ── Load new text (called after narrative generation) ──────
  function load(text) {
    stop();
    _text = text;
    showPlayer(!!text);
    if (fill()) fill().style.width = '0%';
    if (timer()) timer().textContent = '0:00';
    console.log('📄 TTS loaded new text, length:', text?.length ?? 0);
  }

  // ── Public API ────────────────────────────────────────────
  return {
    get isAvailable()  { return isAvailable; },
    get isPlaying()    { return _isPlaying; },
    get isPaused()     { return _isPaused; },
    speak,
    toggle,
    pause,
    resume,
    stop,
    load,
    populateVoiceSelect,
  };
})();

// ── Wire global button handlers used from inline HTML ───────
window.toggleTTS  = () => window.TTS.toggle();
window.stopTTS    = () => window.TTS.stop();
