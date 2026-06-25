// ══════════════════════════════════════════════════════════════════════════════
// Voice Module: TTS, Recording, and Voice Message Handling
// ══════════════════════════════════════════════════════════════════════════════

(function(window) {
  "use strict";

  // ── TTS State ────────────────────────────────────────────────────────────────
  let currentUtterance = null;
  let currentAudio = null;
  let currentPlayingButton = null;
  let currentSelectedRow = null;
  let ttsSupported = false;

  // ── Voice Input State ────────────────────────────────────────────────────────
  let recognition = null;
  let isRecording = false;
  let recognitionSupported = false;

  // ── localStorage Keys ────────────────────────────────────────────────────────
  const VOICE_TTS_ENGINE = "voice_tts_engine";
  const VOICE_TTS_RATE = "voice_tts_rate";
  const VOICE_TTS_VOLUME = "voice_tts_volume";
  const VOICE_ELEVENLABS_VOICE_ID = "voice_elevenlabs_voice_id"; // legacy
  const VOICE_TTS_CONFIG = "voice_tts_config";

  // ── TTS Config (provider + voice profiles) ───────────────────────────────────
  const DEFAULT_TTS_CONFIG = {
    provider: "elevenlabs",
    model_id: "eleven_v3",
    profiles: {
      default: { voice_id: "" },
      zh:      { voice_id: "" },
      en:      { voice_id: "" },
      ja:      { voice_id: "" },
    },
  };

  function getTTSConfig() {
    try {
      const raw = localStorage.getItem(VOICE_TTS_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        const cfg = { ...DEFAULT_TTS_CONFIG, ...parsed };
        cfg.profiles = { ...DEFAULT_TTS_CONFIG.profiles, ...parsed.profiles };
        for (const lang of Object.keys(cfg.profiles)) {
          cfg.profiles[lang] = { ...DEFAULT_TTS_CONFIG.profiles.default, ...cfg.profiles[lang] };
        }
        return cfg;
      }
    } catch (_) { /* fall through */ }
    return JSON.parse(JSON.stringify(DEFAULT_TTS_CONFIG));
  }

  function setTTSConfig(updates) {
    const current = getTTSConfig();
    const next = { ...current, ...updates };
    if (updates.profiles) {
      next.profiles = { ...current.profiles };
      for (const [lang, profile] of Object.entries(updates.profiles)) {
        next.profiles[lang] = { ...current.profiles[lang], ...profile };
      }
    }
    localStorage.setItem(VOICE_TTS_CONFIG, JSON.stringify(next));
  }

  // ── Language Detection ────────────────────────────────────────────────────────
  function detectTtsLanguage(text, language_hint) {
    if (language_hint && language_hint !== "default") return language_hint;
    if (!text) return "default";
    // Japanese kana detection (hiragana/katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
    // CJK unified ideographs → Chinese
    if (/[\u4e00-\u9fff]/.test(text)) return "zh";
    // Korean
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return "ko";
    return "en";
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function initVoice() {
    ttsSupported = 'speechSynthesis' in window;
    if (!ttsSupported) {
      console.warn("SpeechSynthesis not supported in this browser");
    }

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionSupported = !!SpeechRecognition;

    if (recognitionSupported) {
      recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
          messageInput.value = (messageInput.value + ' ' + transcript).trim();
          messageInput.focus();
        }
      };

      recognition.onend = () => {
        isRecording = false;
        updateVoiceInputButton(false);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isRecording = false;
        updateVoiceInputButton(false);
      };
    }

    // Wire up voice input button
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    if (voiceInputBtn) {
      voiceInputBtn.disabled = !recognitionSupported;
      voiceInputBtn.addEventListener('click', toggleVoiceInput);
    }
  }

  // ── Voice Input Helpers ──────────────────────────────────────────────────────
  function toggleVoiceInput() {
    if (!recognitionSupported || !recognition) return;

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
        isRecording = true;
        updateVoiceInputButton(true);
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  }

  function updateVoiceInputButton(active) {
    const btn = document.getElementById('voiceInputBtn');
    if (!btn) return;

    if (active) {
      btn.classList.add('active');
      btn.title = '停止录音';
    } else {
      btn.classList.remove('active');
      btn.title = '语音输入';
    }
  }

  // ── TTS Helpers ──────────────────────────────────────────────────────────────
  function getTTSEngine() {
    const cfg = getTTSConfig();
    if (cfg.provider) return cfg.provider;
    // Legacy fallback for users who never saved voice_tts_config
    return localStorage.getItem(VOICE_TTS_ENGINE) || "system";
  }

  function getTTSRate() {
    const stored = localStorage.getItem(VOICE_TTS_RATE);
    return stored ? parseFloat(stored) : 1.0;
  }

  function getTTSVolume() {
    const stored = localStorage.getItem(VOICE_TTS_VOLUME);
    return stored ? parseFloat(stored) : 1.0;
  }

  function setTTSEngine(engine) {
    localStorage.setItem(VOICE_TTS_ENGINE, engine); // keep legacy key in sync
    setTTSConfig({ provider: engine });
  }

  function setTTSRate(rate) {
    localStorage.setItem(VOICE_TTS_RATE, rate);
  }

  function setTTSVolume(volume) {
    localStorage.setItem(VOICE_TTS_VOLUME, volume);
  }

  // ── Button Error State ───────────────────────────────────────────────────────
  function _setButtonError(button, msg) {
    button.classList.remove("tts-loading");
    button.disabled = false;
    button.classList.add("tts-error");
    button.title = msg;
  }

  // ── Text Cleaning for TTS ────────────────────────────────────────────────────
  function cleanTextForTTS(html) {
    // Remove ||| separators
    let text = html.replace(/\|\|\|/g, "");

    // Remove emoji shortcodes like :smile:
    text = text.replace(/:[a-zA-Z0-9_+-]+:/g, "");

    // Remove image markers
    text = text.replace(/\[图片\]/g, "");
    text = text.replace(/\[image\]/gi, "");

    // Remove HTML tags
    const div = document.createElement("div");
    div.innerHTML = text;
    text = div.textContent || div.innerText || "";

    // Trim whitespace
    return text.trim();
  }

  function isSpeakableText(text) {
    const cleaned = cleanTextForTTS(text);
    // Check if there's any letter, number, or CJK character
    return /[\p{L}\p{N}]/u.test(cleaned);
  }

  // ── TTS Playback ─────────────────────────────────────────────────────────────
  function speakText(text, button, msgId) {
    const engine = getTTSEngine();
    // All non-system providers go through the backend TTS function
    if (engine !== "system") {
      speakElevenLabs(cleanTextForTTS(text), button, msgId);
      return;
    }

    if (!ttsSupported) return;
    const row = button?.closest(".msg-row");

    if (currentUtterance && currentPlayingButton === button) { stopSpeaking(); return; }
    stopSpeaking();

    const cleanText = cleanTextForTTS(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = getTTSRate();
    utterance.volume = getTTSVolume();
    utterance.onstart = () => {
      currentUtterance = utterance;
      currentPlayingButton = button;
      currentSelectedRow = row;
      button?.classList.add("speaking");
      row?.classList.add("msg-row-selected");
    };
    const onDone = () => {
      currentUtterance = null;
      currentPlayingButton = null;
      button?.classList.remove("speaking");
      row?.classList.remove("msg-row-selected");
      currentSelectedRow = null;
    };
    utterance.onend = onDone;
    utterance.onerror = onDone;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (currentUtterance) {
      window.speechSynthesis?.cancel();
      currentUtterance = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentPlayingButton) {
      currentPlayingButton.classList.remove("speaking");
      currentPlayingButton = null;
    }
    if (currentSelectedRow) {
      currentSelectedRow.classList.remove("msg-row-selected");
      currentSelectedRow = null;
    }
  }

  // ── ElevenLabs TTS ───────────────────────────────────────────────────────────
  function getTTSApiEndpoint() {
    const cfg = window.SAVE_PRINCESS_CONFIG || {};
    const url = cfg.SUPABASE_URL;
    return (url && url !== "YOUR_KEY_HERE") ? `${url}/functions/v1/tts` : null;
  }

  function getTTSAnonKey() {
    const cfg = window.SAVE_PRINCESS_CONFIG || {};
    const key = cfg.SUPABASE_ANON_KEY;
    return (key && key !== "YOUR_KEY_HERE") ? key : null;
  }

  async function speakElevenLabs(text, button, msgId, language_hint) {
    const row = button?.closest(".msg-row");

    if (currentPlayingButton === button && currentAudio) {
      stopSpeaking();
      return;
    }
    stopSpeaking();

    let audioUrl = button.dataset.audioUrl;

    if (!audioUrl) {
      const endpoint = getTTSApiEndpoint();
      const anonKey = getTTSAnonKey();
      if (!endpoint || !anonKey) { _setButtonError(button, "TTS 未配置"); return; }

      button.classList.add("tts-loading");
      button.disabled = true;

      try {
        // Build voice profile from config
        const cfg = getTTSConfig();
        const lang = detectTtsLanguage(text, language_hint || null);
        const profile = cfg.profiles[lang] || cfg.profiles.default || {};
        const voice_id = profile.voice_id || "";
        const model_id = cfg.model_id || "eleven_v3";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            message_id: msgId ? Number(msgId) : null,
            text,
            language_hint: lang,
            provider: cfg.provider || "elevenlabs",
            voice_profile: { voice_id, model_id },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(`[${data.code || res.status}] ${data.message || data.error || "TTS failed"}`);
        }
        audioUrl = data.audio_url;

        // Handle storage cache failure gracefully
        if (data.cache_write_failed) {
          console.warn("TTS generated but cache upload failed; using data URL fallback");
        }

        // Cache audio URL only if it's a public URL (not a one-time data URL)
        if (msgId && audioUrl && !data.cache_write_failed) {
          button.dataset.audioUrl = audioUrl;
        }
      } catch (err) {
        console.error("TTS error:", err.message, err);
        const msg = err?.message || "生成失败";
        _setButtonError(button, msg.includes("EMPTY_VOICE_TEXT") ? "没有可朗读文本" : `生成失败：${msg}`);
        return;
      }
      button.classList.remove("tts-loading");
      button.disabled = false;
    }

    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    currentPlayingButton = button;
    currentSelectedRow = row;
    button.classList.add("speaking");
    button.classList.remove("tts-error");
    button.title = "停止";
    row?.classList.add("msg-row-selected");

    const onDone = () => {
      if (currentAudio !== audio) return;
      currentAudio = null;
      currentPlayingButton = null;
      currentSelectedRow = null;
      button.classList.remove("speaking");
      button.title = "朗读";
      row?.classList.remove("msg-row-selected");
    };

    audio.onended = onDone;
    audio.onerror = () => {
      onDone();
      button.classList.add("tts-error");
      button.title = "播放失败，点按重试";
      delete button.dataset.audioUrl;
    };
    audio.play().catch((err) => {
      console.error("TTS audio playback error", err);
      onDone();
      button.classList.add("tts-error");
      button.title = "播放失败，点按重试";
      delete button.dataset.audioUrl;
    });
  }

  // ── Unified playback entry ────────────────────────────────────────────────────
  // Use this from app.js instead of calling speakElevenLabs directly.
  function playMessageText(text, button, msgId) {
    speakText(text, button, msgId);
  }

  // ── Speaker Button + Bubble Playback ─────────────────────────────────────────
  // Creates a speaker button and optionally wires the bubble element itself
  // to the same playback action. Both share the same button state.
  function createSpeakerButton(messageElement, msgId) {
    const text = messageElement.textContent || messageElement.innerText || "";
    const button = document.createElement("button");
    button.className = "speaker-btn";
    button.type = "button";
    if (msgId) button.dataset.msgId = String(msgId);

    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3L5 6H2v4h3l3 3V3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 5.5c.5.5 1 1.5 1 2.5s-.5 2-1 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

    if (!isSpeakableText(text)) {
      button.disabled = true;
      button.title = "没有可朗读文本";
      return button;
    }

    button.title = "朗读";
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = messageElement.textContent || messageElement.innerText;
      playMessageText(t, button, button.dataset.msgId || null);
    });

    return button;
  }

  // Attaches playback to both a speaker button and the bubble element.
  // Clicking either triggers play/pause via the shared button state.
  function attachVoicePlayback(el, speakerBtn, msgId) {
    el.addEventListener("click", (e) => {
      // Ignore clicks on interactive/structural child elements
      if (e.target.closest("a, button, img, blockquote, .quote-block, .msg-actions, .more-menu, .edit-area")) return;
      e.stopPropagation();
      const text = el.textContent || el.innerText;
      playMessageText(text, speakerBtn, msgId);
    });
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  window.SPVoice = {
    initVoice,
    getTTSEngine,
    getTTSRate,
    getTTSVolume,
    setTTSEngine,
    setTTSRate,
    setTTSVolume,
    getTTSConfig,
    setTTSConfig,
    detectTtsLanguage,
    isSpeakableText,
    createSpeakerButton,
    attachVoicePlayback,
    playMessageText,
    speakText,
    speakElevenLabs,
    stopSpeaking,
    isTTSSupported: () => ttsSupported,

    // Constants
    VOICE_TTS_ENGINE,
    VOICE_TTS_RATE,
    VOICE_TTS_VOLUME,
    VOICE_ELEVENLABS_VOICE_ID,
    VOICE_TTS_CONFIG,
  };

})(window);
