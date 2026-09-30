// ============================================================================
// Auth Module - Public Access & Anonymous Session Flow
// ============================================================================
// Extracted from app.js lines 5040-5091
// Existing sessions are preserved. New visitors receive an isolated anonymous
// Supabase session when available, with a local-only guest fallback.

(function() {
  "use strict";

  // Initialize currentUserId globally before any other code runs
  if (!window.currentUserId) {
    window.currentUserId = "";
  }

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const loginOverlay      = document.getElementById("loginOverlay");
  const logoutBtn         = document.getElementById("logoutBtn");

  let initializedSessionKey = "";

  // ── Hide Login and Initialize App ──────────────────────────────────────────
  async function hideLoginAndInit(session) {
    const userId = session?.user?.id || "anon";
    const sessionKey = `${userId}:${session ? "cloud" : "local"}`;
    if (initializedSessionKey === sessionKey) return;
    initializedSessionKey = sessionKey;

    window.currentUserId = userId;
    window.isGuestMode = !session?.user;
    loginOverlay?.classList.add("hidden");

    const loginStatus = document.getElementById("settingsLoginStatus");
    if (loginStatus) {
      loginStatus.textContent = session?.user?.is_anonymous ? "匿名访客" :
        session?.user ? "云端会话" : "本地访客";
    }

    // Sync user preferences from server (API keys, model mappings, voice config)
    if (session?.user && window.SPUserPreferences) {
      window.SPUserPreferences.pullPreferences();
    }

    if (logoutBtn) {
      logoutBtn.classList.add("hidden");
    }

    // Initialize app components (these functions must be available globally)
    if (typeof window.initPrincessStatusBar === "function") {
      window.initPrincessStatusBar();
    }

    if (typeof window.setLoading === "function") {
      window.setLoading(true);
    }

    if (typeof window.initConversations === "function") {
      await window.initConversations();
    }

    if (typeof window.reloadHistory === "function") {
      await window.reloadHistory();
    }

    if (typeof window.setLoading === "function") {
      window.setLoading(false);
    }

    if (typeof window.splashReady === "function") {
      window.splashReady();
    }

    // Update diary card if available
    if (window.SPDiary) {
      window.SPDiary.updateHomeDiaryCard(
        window.supabaseClient,
        window.currentUserId || 'default'
      ).catch(err => console.error('Failed to update diary card:', err));
    }

    if (window.SPCompanionWorld) {
      window.SPCompanionWorld.refresh();
    }

    // Initialize Web Push subscription manager
    if (session?.user && window.PushSubscription && window.PushSubscription.isSupported()) {
      window.PushSubscription.init(window.supabaseClient, window.currentUserId);
    }

    // Desktop only: auto-focus on init. Mobile must not trigger soft keyboard.
    if (typeof window.isMobileLayout === "function" && !window.isMobileLayout()) {
      const messageInput = document.getElementById("messageInput");
      if (messageInput) {
        messageInput.focus();
      }
    }
  }

  async function startPublicSession() {
    try {
      const { data: { session }, error: sessionError } =
        await window.supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (session) {
        await hideLoginAndInit(session);
        return;
      }

      const { data, error } = await window.supabaseClient.auth.signInAnonymously();
      if (error) throw error;
      await hideLoginAndInit(data?.session || null);
    } catch (error) {
      console.warn("[auth] Anonymous session unavailable; using local guest mode:", error);
      await hideLoginAndInit(null);
    }
  }

  // ── Auth State Change Listener ──────────────────────────────────────────────
  function initAuthListener(retryCount = 0) {
    const MAX_RETRIES = 50; // 5 seconds total (50 * 100ms)

    if (!window.supabaseClient) {
      if (retryCount >= MAX_RETRIES) {
        console.warn("[auth] Supabase client unavailable; using local guest mode");
        hideLoginAndInit(null);
        return;
      }
      setTimeout(() => initAuthListener(retryCount + 1), 100);
      return;
    }

    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        hideLoginAndInit(session);
      }
    });

    startPublicSession();
  }

  // Start auth listener (will retry if supabaseClient not ready)
  initAuthListener();

  // ── Public API ──────────────────────────────────────────────────────────────
  window.SavePrincessAuth = {
    hideLoginAndInit,
    startPublicSession,
  };

})();
