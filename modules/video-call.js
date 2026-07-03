// ============================================================================
// Video Call Module - In-Chat Video Call Mode with Voice Interaction
// ============================================================================
// Provides video call mode within chat interface with:
// - Local camera preview
// - G's Eyes visual context
// - Voice input via existing SpeechRecognition
// - Automatic TTS playback of responses
// - State machine for call flow

(function() {
  "use strict";

  // ── State Machine ──────────────────────────────────────────────────────────
  let callState = "idle"; // idle | connecting | watching | listening | thinking | speaking | error
  let errorMessage = null;

  // ── UI Elements ────────────────────────────────────────────────────────────
  let videoCallContainer = null;
  let videoElement = null;
  let statusDisplay = null;
  let micButton = null;
  let closeButton = null;
  let subtitleDisplay = null;

  // ── Speech Recognition ─────────────────────────────────────────────────────
  let recognition = null;
  let isListening = false;
  let recognizedText = "";

  // ── Microphone Permission ──────────────────────────────────────────────────

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: "浏览器不支持麦克风权限检查" };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.getTracks().forEach(track => track.stop());
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err?.name || err?.message || "microphone permission denied",
      };
    }
  }

  // ── TTS Playback ───────────────────────────────────────────────────────────
  let currentTTSAudio = null;

  // ── Proactive Companion ────────────────────────────────────────────────────
  let proactiveTimer = null;
  let lastProactiveSpeakAt = 0;
  let proactiveEnabled = true;
  let proactiveCountInCall = 0;

  // ── Visual Context Integration ────────────────────────────────────────────
  let visualContextEnabled = false;

  // ── Initialize ─────────────────────────────────────────────────────────────

  async function startVideoCall() {
    if (callState !== "idle") {
      console.warn("[video-call] Already in call");
      return;
    }

    try {
      // Create video call UI
      createVideoCallUI();

      // Change state to connecting
      setState("connecting");

      // Check if GsEyes module is available
      if (!window.GsEyes || typeof window.GsEyes.start !== "function") {
        throw new Error("GsEyes module not loaded");
      }

      // Start G's Eyes (camera + visual recognition)
      const result = await window.GsEyes.start();
      if (!result.ok) {
        throw new Error(result.error || "Failed to start camera");
      }

      visualContextEnabled = true;

      // Get the media stream from G's Eyes
      const stream = window.GsEyes.getMediaStream ? window.GsEyes.getMediaStream() : null;
      if (stream && videoElement) {
        videoElement.srcObject = stream;
      }

      // Initialize speech recognition
      initSpeechRecognition();

      // Change state to watching
      setState("watching");

      // Start proactive companion loop
      proactiveCountInCall = 0;
      startProactiveLoop();

      console.log("[video-call] Video call started successfully");
    } catch (err) {
      console.error("[video-call] Start failed", err);
      setState("error", err.message);
    }
  }

  async function endVideoCall() {
    // Stop proactive loop
    stopProactiveLoop();

    // Stop TTS if playing
    stopTTS();

    // Stop speech recognition
    if (recognition) {
      recognition.stop();
      recognition = null;
    }

    // Stop G's Eyes
    await window.GsEyes.stop();
    visualContextEnabled = false;

    // Remove video call UI
    if (videoCallContainer) {
      videoCallContainer.remove();
      videoCallContainer = null;
    }

    // Reset state
    setState("idle");

    console.log("[video-call] Video call ended");
  }

  // ── UI Creation ────────────────────────────────────────────────────────────

  function createVideoCallUI() {
    // Create container
    videoCallContainer = document.createElement("div");
    videoCallContainer.className = "video-call-container";
    videoCallContainer.innerHTML = `
      <div class="video-call-preview">
        <video class="video-call-video" autoplay playsinline muted></video>
        <div class="video-call-status"></div>
      </div>
      <div class="video-call-controls">
        <button type="button" class="video-call-mic-btn" aria-label="说话">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2"/>
            <path d="M6 12c0 3.5 2.5 6 6 6s6-2.5 6-6M12 18v4M9 22h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>按住说话</span>
        </button>
        <button type="button" class="video-call-close-btn" aria-label="关闭">×</button>
      </div>
      <div class="video-call-subtitle"></div>
    `;

    // Insert before message list
    const messageList = document.getElementById("messageList");
    if (messageList && messageList.parentNode) {
      messageList.parentNode.insertBefore(videoCallContainer, messageList);
    }

    // Get references
    videoElement = videoCallContainer.querySelector(".video-call-video");
    statusDisplay = videoCallContainer.querySelector(".video-call-status");
    micButton = videoCallContainer.querySelector(".video-call-mic-btn");
    closeButton = videoCallContainer.querySelector(".video-call-close-btn");
    subtitleDisplay = videoCallContainer.querySelector(".video-call-subtitle");

    // Attach event listeners
    micButton.addEventListener("mousedown", startListening);
    micButton.addEventListener("mouseup", stopListening);
    micButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startListening();
    });
    micButton.addEventListener("touchend", (e) => {
      e.preventDefault();
      stopListening();
    });
    closeButton.addEventListener("click", endVideoCall);
  }

  // ── State Management ───────────────────────────────────────────────────────

  function setState(newState, error = null) {
    callState = newState;
    errorMessage = error;
    updateUI();
  }

  function updateUI() {
    if (!statusDisplay) return;

    const statusText = {
      idle: "",
      connecting: "正在连接摄像头...",
      watching: "视频已开启，按住麦克风说话",
      listening: "听你说话中...",
      thinking: "cha 思考中...",
      speaking: "cha 正在说话",
      error: `错误: ${errorMessage || "未知错误"}`,
    }[callState] || "";

    statusDisplay.textContent = statusText;

    // Update mic button state
    if (micButton) {
      micButton.disabled = callState !== "watching";
      if (callState === "listening") {
        micButton.classList.add("video-call-mic-btn--active");
      } else {
        micButton.classList.remove("video-call-mic-btn--active");
      }
    }

    // Show G's Eyes status if available
    if (callState === "watching" && window.GsEyes) {
      const state = window.GsEyes.getState();

      if (state.detection_ready === false) {
        statusDisplay.textContent = "摄像头已开启，本地识别加载中/不可用 · 按住麦克风说话";
      } else if (state.face_present === false) {
        statusDisplay.textContent = "未检测到人脸 · 按住麦克风说话";
      } else if (state.face_present === true) {
        statusDisplay.textContent = "视频已开启，按住麦克风说话";
      } else {
        statusDisplay.textContent = "摄像头已开启，正在准备本地识别 · 按住麦克风说话";
      }
    }
  }

  // ── Speech Recognition ─────────────────────────────────────────────────────

  function initSpeechRecognition() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      console.warn("[video-call] Speech recognition not supported");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        recognizedText = finalTranscript;
        console.log("[video-call] Recognized:", recognizedText);
        sendToChat(recognizedText);
      } else if (interimTranscript && subtitleDisplay) {
        subtitleDisplay.textContent = interimTranscript;
      }
    };

    recognition.onerror = (event) => {
      console.error("[video-call] Speech recognition error", event.error);
      setState("watching");
      isListening = false;
      if (subtitleDisplay) {
        if (event.error === "not-allowed") {
          subtitleDisplay.textContent = "麦克风权限被拒绝，请在浏览器地址栏允许麦克风";
        } else if (event.error === "no-speech") {
          subtitleDisplay.textContent = "没有听到声音，请再试一次";
        } else {
          subtitleDisplay.textContent = `语音识别失败：${event.error}`;
        }
        setTimeout(() => {
          subtitleDisplay.textContent = "";
        }, 3000);
      }
    };

    recognition.onend = () => {
      if (isListening) {
        // User released button but no final result yet
        setState("watching");
        isListening = false;
      }
    };
  }

  async function startListening() {
    if (callState !== "watching" || !recognition) return;

    // Check microphone permission first
    const micPermission = await ensureMicrophonePermission();
    if (!micPermission.ok) {
      console.error("[video-call] Microphone permission denied", micPermission.error);
      if (subtitleDisplay) {
        subtitleDisplay.textContent = "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试";
        setTimeout(() => {
          subtitleDisplay.textContent = "";
        }, 5000);
      }
      return;
    }

    setState("listening");
    isListening = true;
    recognizedText = "";

    if (subtitleDisplay) {
      subtitleDisplay.textContent = "";
    }

    try {
      recognition.start();
    } catch (err) {
      console.error("[video-call] Failed to start recognition", err);
      setState("watching");
      isListening = false;
    }
  }

  function stopListening() {
    if (!isListening || !recognition) return;

    isListening = false;
    recognition.stop();

    // If we have recognized text, it will be sent via onresult
    // Otherwise, return to watching state
    if (!recognizedText) {
      setState("watching");
    }
  }

  // ── Chat API Integration ───────────────────────────────────────────────────

  async function sendToChat(text) {
    if (!text.trim()) {
      setState("watching");
      return;
    }

    // Reset silence timer in G's Eyes
    if (window.GsEyes?.onUserSpeak) {
      window.GsEyes.onUserSpeak();
    }

    setState("thinking");

    if (subtitleDisplay) {
      subtitleDisplay.textContent = `你: ${text}`;
    }

    try {
      // Get visual context
      const visualContext = visualContextEnabled && window.getGsEyesVisualContext
        ? window.getGsEyesVisualContext()
        : null;

      // Prepare messages array (use existing chat history + new message)
      const messages = [];

      // Get recent chat history from global chatMessages if available
      if (window.chatMessages && Array.isArray(window.chatMessages)) {
        // Take last 10 messages for context
        const recentMessages = window.chatMessages.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content,
        }));
        messages.push(...recentMessages);
      }

      // Add current user message
      messages.push({
        role: "user",
        content: text,
      });

      // Call chat API
      const response = await window.SavePrincessChatAPI.callChatAPI(messages, "auto");

      // Stream response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let chaResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              chaResponse += parsed.choices[0].delta.content;
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      }

      if (chaResponse.trim()) {
        await speakResponse(chaResponse);
      } else {
        setState("watching");
        if (subtitleDisplay) {
          subtitleDisplay.textContent = "cha 没有回复";
        }
      }

    } catch (err) {
      console.error("[video-call] Chat API error", err);
      setState("error", "发送失败");
      setTimeout(() => setState("watching"), 2000);
    }
  }

  // ── TTS Playback ───────────────────────────────────────────────────────────

  async function speakResponse(text) {
    setState("speaking");

    if (subtitleDisplay) {
      subtitleDisplay.textContent = `cha: ${text}`;
    }

    try {
      await speakWithSPVoice(text);
    } catch (err) {
      console.error("[video-call] TTS error", err);
    }

    // After TTS completes (or fails), return to watching state
    if (callState === "speaking") {
      setState("watching");
    }

    // Clear subtitle after 3 seconds
    setTimeout(() => {
      if (subtitleDisplay && callState === "watching") {
        subtitleDisplay.textContent = "";
      }
    }, 3000);
  }

  // Wraps SPVoice TTS in a Promise so we can await completion.
  function speakWithSPVoice(text) {
    return new Promise((resolve, reject) => {
      if (!window.SPVoice) {
        console.warn("[video-call] SPVoice not available");
        return resolve();
      }

      const engine = window.SPVoice.getTTSEngine ? window.SPVoice.getTTSEngine() : "system";

      if (engine === "system") {
        // Web Speech API path
        if (!("speechSynthesis" in window)) {
          console.warn("[video-call] speechSynthesis not supported");
          return resolve();
        }
        const cleanText = text.replace(/\|\|\|/g, "").replace(/:[a-zA-Z0-9_+-]+:/g, "").trim();
        if (!cleanText) return resolve();

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = window.SPVoice.getTTSRate ? window.SPVoice.getTTSRate() : 1.0;
        utterance.volume = window.SPVoice.getTTSVolume ? window.SPVoice.getTTSVolume() : 1.0;
        utterance.onend = () => resolve();
        utterance.onerror = (e) => { console.error("[video-call] SpeechSynthesis error", e); resolve(); };
        window.speechSynthesis.speak(utterance);
      } else {
        // ElevenLabs / MiniMax / local_http path via backend TTS endpoint
        const cfg = window.SPVoice.getTTSConfig ? window.SPVoice.getTTSConfig() : {};
        const supabaseUrl = (window.SAVE_PRINCESS_CONFIG || {}).SUPABASE_URL;
        const anonKey = (window.SAVE_PRINCESS_CONFIG || {}).SUPABASE_ANON_KEY;

        if (!supabaseUrl || supabaseUrl === "YOUR_KEY_HERE" || !anonKey || anonKey === "YOUR_KEY_HERE") {
          console.warn("[video-call] TTS endpoint not configured");
          if (subtitleDisplay) {
            subtitleDisplay.textContent = `cha: ${text} (TTS未配置)`;
          }
          return resolve();
        }

        const endpoint = `${supabaseUrl}/functions/v1/tts`;
        const lang = window.SPVoice.detectTtsLanguage ? window.SPVoice.detectTtsLanguage(text, null) : "zh";
        const profiles = cfg.profiles || {};
        const profile = profiles[lang] || profiles.default || {};
        const voice_id = profile.voice_id || "";
        const model_id = cfg.model_id || "eleven_v3";

        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            text,
            language_hint: lang,
            provider: cfg.provider || "elevenlabs",
            voice_profile: { voice_id, model_id },
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (!data.ok || !data.audio_url) {
              console.error("[video-call] TTS API error", data);
              return resolve();
            }
            const audio = new Audio(data.audio_url);
            currentTTSAudio = audio;
            audio.onended = () => { currentTTSAudio = null; resolve(); };
            audio.onerror = (e) => { console.error("[video-call] audio playback error", e); currentTTSAudio = null; resolve(); };
            audio.play().catch(e => { console.error("[video-call] audio.play() failed", e); currentTTSAudio = null; resolve(); });
          })
          .catch(err => { console.error("[video-call] TTS fetch error", err); resolve(); });
      }
    });
  }

  function stopTTS() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (window.SPVoice && typeof window.SPVoice.stopSpeaking === "function") {
      window.SPVoice.stopSpeaking();
    }
    if (currentTTSAudio) {
      currentTTSAudio.pause();
      currentTTSAudio = null;
    }
  }

  // ── Proactive Companion Loop ───────────────────────────────────────────────

  function startProactiveLoop() {
    stopProactiveLoop();
    proactiveTimer = setInterval(checkProactiveVisualEvent, 2000);
  }

  function stopProactiveLoop() {
    if (proactiveTimer) {
      clearInterval(proactiveTimer);
      proactiveTimer = null;
    }
  }

  async function checkProactiveVisualEvent() {
    if (!proactiveEnabled) return;
    if (callState !== "watching") return;
    if (!window.GsEyes?.getPendingVisualEvent) return;

    const now = Date.now();

    // Global cooldown to avoid being annoying
    if (now - lastProactiveSpeakAt < 60000) return;

    // Max 3 proactive speaks per call session
    if (proactiveCountInCall >= 3) return;

    const event = window.GsEyes.getPendingVisualEvent();
    if (!event) return;

    // Don't call user back when they leave frame
    if (event.type === "user_left_frame_long") return;

    await sendProactiveVisualEvent(event);
  }

  async function sendProactiveVisualEvent(event) {
    lastProactiveSpeakAt = Date.now();
    proactiveCountInCall += 1;

    setState("thinking");

    const visualContext = window.getGsEyesVisualContext
      ? window.getGsEyesVisualContext()
      : null;

    const eventPrompt = [
      "[G's Eyes 主动陪伴事件]",
      `type=${event.type}`,
      `description=${event.description}`,
      `confidence=${event.confidence}`,
      "",
      "请根据这个即时状态，自然决定要不要轻轻说一句。",
      "如果不适合说话，回复 <NO_REPLY>。",
      "不要说\"我检测到/系统显示/视觉状态\"。",
      "不要分析用户情绪，不要下诊断。",
      "只说一句很短的话，���视频通话里顺口开口。"
    ].join("\n");

    const messages = [];

    if (window.chatMessages && Array.isArray(window.chatMessages)) {
      messages.push(...window.chatMessages.slice(-8).map(msg => ({
        role: msg.role,
        content: msg.content,
      })));
    }

    messages.push({
      role: "user",
      content: eventPrompt,
    });

    try {
      const response = await window.SavePrincessChatAPI.callChatAPI(messages, "auto");
      const text = await readResponseText(response);

      const cleaned = text.replace(/\|\|\|/g, "").trim();

      if (!cleaned || cleaned === "<NO_REPLY>" || cleaned.includes("<NO_REPLY>")) {
        setState("watching");
        return;
      }

      await speakResponse(cleaned);

      // Reset proactive cooldown after speaking
      lastProactiveSpeakAt = Date.now();
    } catch (err) {
      console.error("[video-call] proactive event failed", err);
      setState("watching");
    }
  }

  async function readResponseText(response) {
    if (!response || !response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.substring(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    return fullText;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.VideoCall = {
    start: startVideoCall,
    end: endVideoCall,
    getState: () => ({ state: callState, error: errorMessage }),
    isActive: () => callState !== "idle",
    setProactiveEnabled: (enabled) => {
      proactiveEnabled = !!enabled;
      console.log(`[video-call] Proactive companion ${enabled ? "enabled" : "disabled"}`);
    },
  };

  console.log("[video-call] Module loaded");
})();
