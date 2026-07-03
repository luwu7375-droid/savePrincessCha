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

  // ── TTS Playback ───────────────────────────────────────────────────────────
  let currentTTSAudio = null;

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

      console.log("[video-call] Video call started successfully");
    } catch (err) {
      console.error("[video-call] Start failed", err);
      setState("error", err.message);
    }
  }

  async function endVideoCall() {
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
      if (!state.face_present) {
        statusDisplay.textContent = "未检测到人脸 · 按住麦克风说话";
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
        subtitleDisplay.textContent = "语音识别失败";
        setTimeout(() => {
          subtitleDisplay.textContent = "";
        }, 2000);
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

  function startListening() {
    if (callState !== "watching" || !recognition) return;

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
      // Use existing TTS system if available
      if (window.SPVoice && typeof window.SPVoice.speak === "function") {
        // SPVoice.speak returns a promise
        await window.SPVoice.speak(text);

        // After TTS completes, return to watching state
        if (callState === "speaking") {
          setState("watching");
        }

        // Clear subtitle after 3 seconds
        setTimeout(() => {
          if (subtitleDisplay && callState === "watching") {
            subtitleDisplay.textContent = "";
          }
        }, 3000);
      } else {
        // Fallback: show text subtitle
        console.warn("[video-call] TTS not available, showing text only");
        setState("watching");
        if (subtitleDisplay) {
          subtitleDisplay.textContent = `cha: ${text} (语音生成失败)`;
        }
        setTimeout(() => {
          if (subtitleDisplay && callState === "watching") {
            subtitleDisplay.textContent = "";
          }
        }, 5000);
      }
    } catch (err) {
      console.error("[video-call] TTS error", err);
      setState("watching");
      if (subtitleDisplay) {
        subtitleDisplay.textContent = `cha: ${text} (语音播放失败)`;
        setTimeout(() => {
          if (subtitleDisplay && callState === "watching") {
            subtitleDisplay.textContent = "";
          }
        }, 5000);
      }
    }
  }

  function stopTTS() {
    if (window.SPVoice && typeof window.SPVoice.stopSpeaking === "function") {
      window.SPVoice.stopSpeaking();
    }
    if (currentTTSAudio) {
      currentTTSAudio.pause();
      currentTTSAudio = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.VideoCall = {
    start: startVideoCall,
    end: endVideoCall,
    getState: () => ({ state: callState, error: errorMessage }),
    isActive: () => callState !== "idle",
  };

  console.log("[video-call] Module loaded");
})();
