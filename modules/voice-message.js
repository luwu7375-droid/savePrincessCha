// ══════════════════════════════════════════════════════════════════════════════
// Voice Message Module: Voice Message Bubbles and Playback
// ══════════════════════════════════════════════════════════════════════════════

(function(window) {
  "use strict";

  // ── Voice Message Playback State ─────────────────────────────────────────────
  let currentVoiceAudio = null;
  let currentVoiceRow = null;
  let currentVoiceProgress = null;

  /**
   * Create a voice message bubble component
   * @param {Object} options - Voice message options
   * @param {string} options.audioUrl - URL to audio file
   * @param {number} options.duration - Duration in seconds
   * @param {string} options.audioType - "real" or "fake"
   * @param {string} options.transcribedText - Transcribed text content
   * @param {string} options.role - "user" or "assistant"
   * @param {string} options.msgId - Message ID
   * @returns {HTMLElement} Voice message element
   */
  function createVoiceMessageBubble(options) {
    const {
      audioUrl,
      duration = 0,
      audioType = "real",
      transcribedText = "",
      role = "assistant",
      msgId = null
    } = options;

    const container = document.createElement("div");
    container.className = `message voice-message ${role === "user" ? "user-voice" : "cha-voice"}`;
    container.dataset.audioUrl = audioUrl;
    container.dataset.duration = duration;
    container.dataset.audioType = audioType;
    if (transcribedText) container.dataset.transcribedText = transcribedText;
    if (msgId) container.dataset.msgId = msgId;

    // Voice bubble container
    const bubble = document.createElement("div");
    bubble.className = "voice-bubble";
    bubble.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--message-bg);
      border-radius: 16px;
      min-width: 180px;
      max-width: 280px;
      cursor: pointer;
    `;

    // Play/Pause button
    const playBtn = document.createElement("button");
    playBtn.className = "voice-play-btn";
    playBtn.type = "button";
    playBtn.innerHTML = getPlayIcon();
    playBtn.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: var(--accent-primary, #5B9FF5);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.2s;
    `;

    // Waveform and duration display
    const infoContainer = document.createElement("div");
    infoContainer.className = "voice-info";
    infoContainer.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    // Waveform visualization (simple bars)
    const waveform = document.createElement("div");
    waveform.className = "voice-waveform";
    waveform.style.cssText = `
      display: flex;
      align-items: center;
      gap: 2px;
      height: 20px;
    `;

    // Generate 20 random bars for waveform
    for (let i = 0; i < 20; i++) {
      const bar = document.createElement("div");
      const height = Math.random() * 0.6 + 0.4; // 40-100%
      bar.style.cssText = `
        width: 2px;
        height: ${height * 100}%;
        background: var(--text-secondary, #999);
        border-radius: 1px;
        transition: all 0.2s;
      `;
      waveform.appendChild(bar);
    }

    // Progress bar (hidden, overlays waveform during playback)
    const progressBar = document.createElement("div");
    progressBar.className = "voice-progress";
    progressBar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0%;
      height: 100%;
      background: var(--accent-primary, #5B9FF5);
      opacity: 0.3;
      pointer-events: none;
      display: none;
    `;
    waveform.style.position = "relative";
    waveform.appendChild(progressBar);

    // Duration display
    const durationEl = document.createElement("div");
    durationEl.className = "voice-duration";
    durationEl.textContent = formatDuration(duration);
    durationEl.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary, #999);
    `;

    // Assemble bubble
    infoContainer.appendChild(waveform);
    infoContainer.appendChild(durationEl);
    bubble.appendChild(playBtn);
    bubble.appendChild(infoContainer);
    container.appendChild(bubble);

    // Add unread indicator for Cha voice messages
    if (role === "assistant") {
      const unreadDot = document.createElement("div");
      unreadDot.className = "voice-unread-dot";
      unreadDot.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-red, #ff4444);
        position: absolute;
        top: -2px;
        right: -2px;
      `;
      bubble.style.position = "relative";
      bubble.appendChild(unreadDot);
    }

    // Wire up playback
    const playHandler = (e) => {
      e.stopPropagation();
      toggleVoicePlayback(container, playBtn, progressBar, durationEl);
    };
    playBtn.addEventListener("click", playHandler);
    bubble.addEventListener("click", playHandler);

    return container;
  }

  /**
   * Toggle voice message playback
   */
  function toggleVoicePlayback(container, playBtn, progressBar, durationEl) {
    const audioUrl = container.dataset.audioUrl;
    const duration = parseFloat(container.dataset.duration) || 0;
    const row = container.closest(".msg-row");

    // If this is currently playing, pause
    if (currentVoiceAudio && currentVoiceRow === row) {
      currentVoiceAudio.pause();
      playBtn.innerHTML = getPlayIcon();
      if (currentVoiceProgress) {
        currentVoiceProgress.style.display = "none";
      }
      currentVoiceAudio = null;
      currentVoiceRow = null;
      currentVoiceProgress = null;
      return;
    }

    // Stop any other playing audio
    stopVoicePlayback();

    // Start playing
    const audio = new Audio(audioUrl);
    currentVoiceAudio = audio;
    currentVoiceRow = row;
    currentVoiceProgress = progressBar;

    // Apply playback speed if set
    const playbackSpeed = parseFloat(container.dataset.playbackSpeed || '1.0');
    audio.playbackRate = playbackSpeed;

    playBtn.innerHTML = getPauseIcon();
    progressBar.style.display = "block";
    row?.classList.add("voice-playing");

    // Update progress
    audio.addEventListener("timeupdate", () => {
      if (audio !== currentVoiceAudio) return;
      const progress = (audio.currentTime / audio.duration) * 100;
      progressBar.style.width = `${progress}%`;
      durationEl.textContent = formatDuration(audio.currentTime);
    });

    // On ended
    const onEnded = () => {
      if (audio !== currentVoiceAudio) return;
      playBtn.innerHTML = getPlayIcon();
      progressBar.style.display = "none";
      progressBar.style.width = "0%";
      durationEl.textContent = formatDuration(duration);
      row?.classList.remove("voice-playing");
      currentVoiceAudio = null;
      currentVoiceRow = null;
      currentVoiceProgress = null;

      // Remove unread dot on Cha messages
      const unreadDot = container.querySelector(".voice-unread-dot");
      if (unreadDot) unreadDot.remove();
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", () => {
      onEnded();
      if (typeof showToast === "function") {
        showToast("音频播放失败");
      }
    });

    audio.play().catch(err => {
      console.error("Voice playback error:", err);
      onEnded();
      if (typeof showToast === "function") {
        showToast("音频播放失败");
      }
    });
  }

  /**
   * Stop current voice playback
   */
  function stopVoicePlayback() {
    if (currentVoiceAudio) {
      currentVoiceAudio.pause();
      currentVoiceAudio = null;
    }
    if (currentVoiceRow) {
      currentVoiceRow.classList.remove("voice-playing");
      currentVoiceRow = null;
    }
    if (currentVoiceProgress) {
      currentVoiceProgress.style.display = "none";
      currentVoiceProgress = null;
    }
  }

  /**
   * Format duration in seconds to MM:SS
   */
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Get play icon SVG
   */
  function getPlayIcon() {
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L12 8L5 13V3Z" fill="currentColor"/>
    </svg>`;
  }

  /**
   * Get pause icon SVG
   */
  function getPauseIcon() {
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="2" height="10" fill="currentColor"/>
      <rect x="9" y="3" width="2" height="10" fill="currentColor"/>
    </svg>`;
  }

  /**
   * Show voice input dialog for user to record/edit voice message
   * Returns a promise that resolves with {text, audioType: "fake"}
   */
  function showVoiceInputDialog() {
    return new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.className = "voice-input-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement("div");
      dialog.className = "voice-input-dialog";
      dialog.style.cssText = `
        background: var(--bg);
        border-radius: 16px;
        padding: 24px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;

      const title = document.createElement("h3");
      title.textContent = "语音输入";
      title.style.cssText = `
        margin: 0 0 16px 0;
        font-size: 18px;
        color: var(--text);
      `;

      const textarea = document.createElement("textarea");
      textarea.className = "voice-input-text";
      textarea.placeholder = "识别结果将显示在这里，您可以编辑...";
      textarea.style.cssText = `
        width: 100%;
        min-height: 100px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 14px;
        resize: vertical;
        font-family: inherit;
      `;

      const statusText = document.createElement("div");
      statusText.className = "voice-input-status";
      statusText.textContent = "点击\"开始录音\"按钮";
      statusText.style.cssText = `
        margin: 12px 0;
        font-size: 13px;
        color: var(--text-secondary);
        text-align: center;
      `;

      const buttonRow = document.createElement("div");
      buttonRow.style.cssText = `
        display: flex;
        gap: 12px;
        margin-top: 16px;
      `;

      const recordBtn = document.createElement("button");
      recordBtn.textContent = "开始录音";
      recordBtn.style.cssText = `
        flex: 1;
        padding: 10px;
        border: 1px solid var(--accent-primary);
        border-radius: 8px;
        background: transparent;
        color: var(--accent-primary);
        cursor: pointer;
        font-size: 14px;
      `;

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "取消";
      cancelBtn.style.cssText = `
        flex: 1;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        font-size: 14px;
      `;

      const sendBtn = document.createElement("button");
      sendBtn.textContent = "发送";
      sendBtn.disabled = true;
      sendBtn.style.cssText = `
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: var(--accent-primary);
        color: white;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.5;
      `;

      // Wire up speech recognition
      let recognition = null;
      let isRecording = false;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = "zh-CN";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          textarea.value = transcript;
          statusText.textContent = "识别完成，可以编辑后发送";
          sendBtn.disabled = false;
          sendBtn.style.opacity = "1";
        };

        recognition.onend = () => {
          isRecording = false;
          recordBtn.textContent = "开始录音";
          recordBtn.style.background = "transparent";
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          isRecording = false;
          recordBtn.textContent = "开始录音";
          recordBtn.style.background = "transparent";
          statusText.textContent = `识别失败: ${event.error}`;
        };
      } else {
        recordBtn.disabled = true;
        statusText.textContent = "浏览器不支持语音识别";
      }

      recordBtn.addEventListener("click", () => {
        if (!recognition) return;

        if (isRecording) {
          recognition.stop();
        } else {
          try {
            recognition.start();
            isRecording = true;
            recordBtn.textContent = "停止录音";
            recordBtn.style.background = "var(--accent-red, #ff4444)";
            recordBtn.style.color = "white";
            statusText.textContent = "正在录音...";
          } catch (err) {
            console.error("Failed to start recognition:", err);
            statusText.textContent = "启动录音失败";
          }
        }
      });

      cancelBtn.addEventListener("click", () => {
        if (recognition && isRecording) {
          recognition.stop();
        }
        document.body.removeChild(overlay);
        reject(new Error("User cancelled"));
      });

      sendBtn.addEventListener("click", () => {
        const text = textarea.value.trim();
        if (!text) {
          if (typeof showToast === "function") {
            showToast("请输入或录制语音内容");
          }
          return;
        }
        if (recognition && isRecording) {
          recognition.stop();
        }
        document.body.removeChild(overlay);
        resolve({ text, audioType: "fake" });
      });

      // Enable send button when user types
      textarea.addEventListener("input", () => {
        const hasText = textarea.value.trim().length > 0;
        sendBtn.disabled = !hasText;
        sendBtn.style.opacity = hasText ? "1" : "0.5";
      });

      // Assemble dialog
      buttonRow.appendChild(recordBtn);
      buttonRow.appendChild(cancelBtn);
      buttonRow.appendChild(sendBtn);
      dialog.appendChild(title);
      dialog.appendChild(textarea);
      dialog.appendChild(statusText);
      dialog.appendChild(buttonRow);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Click overlay to close
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          if (recognition && isRecording) {
            recognition.stop();
          }
          document.body.removeChild(overlay);
          reject(new Error("User cancelled"));
        }
      });
    });
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  window.SPVoiceMessage = {
    createVoiceMessageBubble,
    stopVoicePlayback,
    showVoiceInputDialog,
    formatDuration,
    // Expose currentVoiceAudio for playback speed control
    get currentAudio() {
      return currentVoiceAudio;
    }
  };

})(window);
