// ============================================================================
// G's Eyes - Local Visual Context Module (Route 1: PWA + MediaPipe)
// ============================================================================
// Provides local camera-based visual context for chat without uploading video.
// Uses MediaPipe Face Landmarker for privacy-safe signal extraction.

(function() {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────────
  let isActive = false;
  let videoElement = null;
  let mediaStream = null;
  let faceLandmarker = null;
  let detectionInterval = null;
  let lastDetectionTime = 0;
  let lastSpeakTime = Date.now(); // Track silence duration
  let detectionReady = false; // Track if MediaPipe loaded successfully

  // Visual state signals (low-risk, strategy-focused)
  let currentState = {
    camera_on: false,
    face_present: null, // null = unknown, true = detected, false = not detected
    attention: "unknown", // looking / away / unknown
    smile: "none",        // none / slight / clear
    stillness: "normal",  // normal / long_pause
    fatigue_hint: "unknown", // low / medium / unknown
    last_update: null,
    silence_duration_sec: 0,
    detection_ready: false, // Whether MediaPipe is loaded
    error_reason: "", // Error message if MediaPipe failed to load
  };

  // MediaPipe CDN URLs - try multiple versions
  const MEDIAPIPE_VERSIONS = ["0.10.8", "0.10.3"];
  const MEDIAPIPE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

  // ── Initialization ─────────────────────────────────────────────────────────

  async function start() {
    if (isActive) {
      console.log("[gs-eyes] Already active");
      return { ok: true, message: "Already running" };
    }

    try {
      // Request camera permission
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });

      // Create video element and attach to DOM
      videoElement = document.createElement("video");
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";
      videoElement.style.objectFit = "cover";
      videoElement.srcObject = mediaStream;

      // Mount to .video-preview in phoneVideoScreen
      const previewContainer = document.querySelector("#phoneVideoScreen .video-preview");
      if (previewContainer) {
        previewContainer.innerHTML = "";
        previewContainer.appendChild(videoElement);
      }

      // Load MediaPipe (allow graceful degradation if it fails)
      try {
        await loadMediaPipe();
      } catch (err) {
        console.warn("[gs-eyes] MediaPipe load failed, continuing with basic mode", err);
        detectionReady = false;
        currentState.detection_ready = false;
        currentState.face_present = null;
        currentState.error_reason = err.message || "MediaPipe load failed";
      }

      isActive = true;
      currentState.camera_on = true;
      currentState.last_update = new Date().toISOString();
      lastSpeakTime = Date.now();

      // Start detection loop (~1 fps to minimize CPU)
      detectionInterval = setInterval(runDetection, 1000);

      updateStatusUI("本地识别中");
      console.log("[gs-eyes] Started successfully");

      return { ok: true, message: "G's Eyes started" };
    } catch (err) {
      console.error("[gs-eyes] Start failed", err);
      updateStatusUI("摄像头授权失败");
      return { ok: false, error: err.message };
    }
  }

  async function stop() {
    if (!isActive) {
      return { ok: true, message: "Not running" };
    }

    // Stop detection
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }

    // Stop media stream
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    // Clean up video element
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement.remove();
      videoElement = null;
    }

    // Clean up MediaPipe
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
    }

    isActive = false;
    currentState = {
      camera_on: false,
      face_present: null,
      attention: "unknown",
      smile: "none",
      stillness: "normal",
      fatigue_hint: "unknown",
      last_update: null,
      silence_duration_sec: 0,
      detection_ready: false,
      error_reason: "",
    };

    updateStatusUI("已关闭");
    console.log("[gs-eyes] Stopped");

    return { ok: true, message: "G's Eyes stopped" };
  }

  // ── MediaPipe Loading ──────────────────────────────────────────────────────

  async function createFaceLandmarker(filesetResolver, delegate) {
    return await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_URL,
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
  }

  async function loadMediaPipe() {
    let vision = null;
    let loadError = null;

    // Try multiple versions
    for (const version of MEDIAPIPE_VERSIONS) {
      try {
        console.log(`[gs-eyes] Trying MediaPipe @${version}...`);
        vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}`);
        console.log(`[gs-eyes] MediaPipe @${version} loaded`);
        break;
      } catch (err) {
        console.warn(`[gs-eyes] MediaPipe @${version} failed:`, err);
        loadError = err;
      }
    }

    if (!vision) {
      throw new Error(`Failed to load MediaPipe from any version: ${loadError?.message || "unknown error"}`);
    }

    const { FaceLandmarker, FilesetResolver } = vision;

    if (!FaceLandmarker || !FilesetResolver) {
      throw new Error("FaceLandmarker or FilesetResolver not available in vision module");
    }

    // Use the same version for wasm files
    const workingVersion = MEDIAPIPE_VERSIONS[0]; // Default to first version
    const wasmFileset = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${workingVersion}/wasm`
    );

    // Try GPU first, fallback to CPU if GPU fails
    try {
      faceLandmarker = await createFaceLandmarker(wasmFileset, "GPU");
      console.log("[gs-eyes] MediaPipe Face Landmarker loaded (GPU)");
    } catch (gpuErr) {
      console.warn("[gs-eyes] GPU init failed, retrying CPU", gpuErr);
      faceLandmarker = await createFaceLandmarker(wasmFileset, "CPU");
      console.log("[gs-eyes] MediaPipe Face Landmarker loaded (CPU)");
    }

    detectionReady = true;
    currentState.detection_ready = true;
    currentState.error_reason = "";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ── Detection Loop ───────────────��─────────────────────────────────────────

  async function runDetection() {
    if (!isActive || !videoElement || videoElement.readyState < 2) {
      return;
    }

    const now = Date.now();
    const silenceSec = Math.floor((now - lastSpeakTime) / 1000);
    currentState.silence_duration_sec = silenceSec;
    currentState.stillness = silenceSec > 20 ? "long_pause" : "normal";

    // Check if MediaPipe is loaded
    if (!detectionReady || !faceLandmarker) {
      // Fallback mode: MediaPipe not available
      currentState.face_present = null; // Unknown, not false
      currentState.attention = "unknown";
      currentState.smile = "none";
      currentState.fatigue_hint = "unknown";
      currentState.last_update = new Date().toISOString();
      updateStatusUI("摄像头已开启，本地识别未加载");
      logState();
      return;
    }

    try {
      // Run MediaPipe detection
      const result = await faceLandmarker.detectForVideo(videoElement, now);

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        currentState.face_present = false;
        currentState.attention = "unknown";
        currentState.smile = "none";
        currentState.fatigue_hint = "unknown";
        updateStatusUI("未检测到人脸");
      } else {
        currentState.face_present = true;

        // Extract signals from blendshapes (if available)
        if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
          const blendshapes = result.faceBlendshapes[0].categories;
          extractSignals(blendshapes);
          updateStatusUI("识别中");
        } else {
          currentState.attention = "unknown";
          currentState.smile = "none";
          currentState.fatigue_hint = "unknown";
          updateStatusUI("人脸在画面中");
        }
      }

      currentState.last_update = new Date().toISOString();
      lastDetectionTime = now;
      logState();
    } catch (err) {
      console.error("[gs-eyes] Detection error", err);
      currentState.face_present = null;
      updateStatusUI("识别失败");
    }
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  function extractSignals(blendshapes) {
    // Convert blendshapes array to map for easier lookup
    const bs = {};
    blendshapes.forEach(b => {
      bs[b.categoryName] = b.score;
    });

    // Attention: detect if looking at camera
    const eyeLookOut = (bs.eyeLookOutLeft || 0) + (bs.eyeLookOutRight || 0);
    const eyeLookIn = (bs.eyeLookInLeft || 0) + (bs.eyeLookInRight || 0);
    const eyeLookDown = (bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0);
    const eyeLookUp = (bs.eyeLookUpLeft || 0) + (bs.eyeLookUpRight || 0);

    const lookingAway = eyeLookOut > 0.3 || eyeLookIn > 0.3 || eyeLookDown > 0.3 || eyeLookUp > 0.3;
    currentState.attention = lookingAway ? "away" : "looking";

    // Smile detection
    const mouthSmile = (bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0);
    if (mouthSmile > 0.4) {
      currentState.smile = "clear";
    } else if (mouthSmile > 0.2) {
      currentState.smile = "slight";
    } else {
      currentState.smile = "none";
    }

    // Fatigue hint (very rough estimate from eye openness)
    const eyeOpen = 2 - ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0));
    if (eyeOpen < 1.0) {
      currentState.fatigue_hint = "medium";
    } else {
      currentState.fatigue_hint = "low";
    }
  }

  // ── Visual Context Generation ──────────────────────────────────────────────

  function getVisualContext() {
    if (!isActive || !currentState.camera_on) {
      return null;
    }

    // Generate strategy text (low-risk, communication-focused)
    let strategy = "normal";
    const silenceSec = currentState.silence_duration_sec;

    if (!currentState.detection_ready) {
      strategy = "normal";
    } else if (currentState.face_present === null) {
      strategy = "wait";
    } else if (!currentState.face_present) {
      strategy = "wait";
    } else if (currentState.attention === "away" || currentState.smile === "none" || silenceSec > 20) {
      strategy = currentState.fatigue_hint === "medium"
        ? "reduce_questions"
        : "lighten_tone";
    }

    const lines = [
      "G's Eyes 当前即时状态：",
      "- 用户已开启视频陪伴",
    ];

    if (!currentState.detection_ready) {
      lines.push("- 视觉识别模块加载中或不可用");
    } else if (currentState.face_present === true) {
      lines.push("- 面部在画面中");

      if (currentState.smile !== "none") {
        lines.push(`- 笑容信号：${currentState.smile === "clear" ? "清晰" : "轻微"}`);
      } else {
        lines.push("- 笑容信号较弱");
      }

      if (currentState.attention === "away") {
        lines.push("- 视线未在画面中");
      }
    } else if (currentState.face_present === false) {
      lines.push("- 暂未检测到面部");
    } else {
      lines.push("- 视觉识别模块加载中");
    }

    if (silenceSec > 20) {
      lines.push(`- 过去 ${silenceSec} 秒沉默较长`);
    }

    // Strategy line
    const strategyText = {
      normal: "沟通策略：正常对话",
      reduce_questions: "沟通策略：减少连续追问，回复短一点，语气放轻，不要分析",
      lighten_tone: "沟通策略：语气轻松一点，少追问",
      wait: "沟通策略：等待用户回到画面",
    }[strategy] || "沟通策略：正常对话";

    lines.push(`- ${strategyText}`);
    lines.push("");
    lines.push("注意：这些只是即时视觉信号，不是情绪诊断，不要直接说\"我检测到你很累\"。");

    return lines.join("\n");
  }

  // ── UI Updates ─────────────────────────────────────────────────────────────

  function updateStatusUI(status) {
    const statusEl = document.querySelector("#phoneVideoScreen .gs-eyes-status");
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  function logState() {
    if (Math.random() < 0.1) { // Log 10% of the time to avoid spam
      console.log("[gs-eyes] State:", {
        face: currentState.face_present,
        attention: currentState.attention,
        smile: currentState.smile,
        silence: currentState.silence_duration_sec,
        stillness: currentState.stillness,
      });
    }
  }

  // ── Track User Activity ────────────────────────────────────────────────────

  // Reset silence timer when user sends a message
  function onUserSpeak() {
    lastSpeakTime = Date.now();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const GsEyes = {
    start,
    stop,
    getState: () => ({ ...currentState }),
    getVisualContext,
    onUserSpeak,
    isActive: () => isActive,
    getMediaStream: () => mediaStream,
  };

  window.GsEyes = GsEyes;
  window.getGsEyesVisualContext = getVisualContext;

  console.log("[gs-eyes] Module loaded");
})();
