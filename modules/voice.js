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
  const VOICE_ELEVENLABS_VOICE_ID = "voice_elevenlabs_voice_id";

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
    localStorage.setItem(VOICE_TTS_ENGINE, engine);
  }

  function setTTSRate(rate) {
    localStorage.setItem(VOICE_TTS_RATE, rate);
  }

  function setTTSVolume(volume) {
    localStorage.setItem(VOICE_TTS_VOLUME, volume);
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

  // ── TTS Playback ─────────────────────────────────────────────────────────────
  function speakText(text, button, msgId) {
    const engine = getTTSEngine();
    if (engine === "elevenlabs") {
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

  async function speakElevenLabs(text, button, msgId) {
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
      if (!endpoint) { console.warn("TTS endpoint not configured"); return; }

      button.classList.add("tts-loading");
      button.disabled = true;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(anonKey ? { "Authorization": `Bearer ${anonKey}`, "apikey": anonKey } : {}),
          },
          body: JSON.stringify({ message_id: msgId ? Number(msgId) : null, text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        audioUrl = data.audio_url;
        if (msgId && audioUrl) button.dataset.audioUrl = audioUrl;
      } catch (err) {
        console.error("TTS fetch error:", err);
        button.classList.remove("tts-loading");
        button.disabled = false;
        button.classList.add("tts-error");
        button.title = "生成失败，点按重试";
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
    audio.play().catch(onDone);
  }

  // ── Speaker Button Creation ──────────────────────────────────────────────────
  function createSpeakerButton(messageElement, msgId) {
    const button = document.createElement("button");
    button.className = "speaker-btn";
    button.type = "button";
    button.title = "朗读";
    if (msgId) button.dataset.msgId = String(msgId);

    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3L5 6H2v4h3l3 3V3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 5.5c.5.5 1 1.5 1 2.5s-.5 2-1 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = messageElement.textContent || messageElement.innerText;
      speakText(text, button, button.dataset.msgId || null);
    });

    return button;
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
    createSpeakerButton,
    speakText,
    stopSpeaking,
    isTTSSupported: () => ttsSupported,

    // Constants
    VOICE_TTS_ENGINE,
    VOICE_TTS_RATE,
    VOICE_TTS_VOLUME,
    VOICE_ELEVENLABS_VOICE_ID,
  };

})(window);
