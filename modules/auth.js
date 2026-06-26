// ============================================================================
// Auth Module - Authentication & Login Flow
// ============================================================================
// Extracted from app.js lines 5040-5091
// Handles password-based authentication and logout flow

(function() {
  "use strict";

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const loginOverlay      = document.getElementById("loginOverlay");
  const loginEmail        = document.getElementById("loginEmail");
  const loginMsg          = document.getElementById("loginMsg");
  const loginPassword     = document.getElementById("loginPassword");
  const loginBtn          = document.getElementById("loginBtn");
  const logoutBtn         = document.getElementById("logoutBtn");

  // ── Sign In ─────────────────────────────────────────────────────────────────
  async function signIn() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email) {
      loginMsg.textContent = "请输入邮箱地址。";
      return;
    }
    if (!password) {
      loginMsg.textContent = "请输入密码。";
      return;
    }

    loginBtn.disabled = true;
    loginMsg.textContent = "";

    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      loginMsg.textContent = error.message === "Invalid login credentials"
        ? "邮箱或密码错误。"
        : error.message;
      loginBtn.disabled = false;
    }
  }

  // ── Event Listeners ─────────────────────────────────────────────────────────
  loginBtn.addEventListener("click", signIn);
  loginEmail.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginPassword.focus();
  });
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") signIn();
  });

  logoutBtn.addEventListener("click", async () => {
    await window.supabaseClient.auth.signOut();

    // Clear session state
    if (window.conversationsCache) {
      window.conversationsCache = [];
    }
    if (window.chatMessages) {
      window.chatMessages.length = 0;
    }

    const messageList = document.getElementById("messageList");
    if (messageList) {
      messageList.innerHTML = "";
    }

    window.currentUserId = "";
    logoutBtn.classList.add("hidden");
    loginOverlay.classList.remove("hidden");
  });

  // ── Hide Login and Initialize App ──────────────────────────────────────────
  async function hideLoginAndInit(session) {
    window.currentUserId = session?.user?.id || "";
    loginOverlay.classList.add("hidden");

    if (logoutBtn) {
      logoutBtn.classList.remove("hidden");
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

    // Desktop only: auto-focus on init. Mobile must not trigger soft keyboard.
    if (typeof window.isMobileLayout === "function" && !window.isMobileLayout()) {
      const messageInput = document.getElementById("messageInput");
      if (messageInput) {
        messageInput.focus();
      }
    }
  }

  // ── Auth State Change Listener ──────────────────────────────────────────────
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !loginOverlay.classList.contains("hidden")) {
        hideLoginAndInit(session);
      }
    });

    // Check initial session
    window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        hideLoginAndInit(session);
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.SavePrincessAuth = {
    signIn,
    hideLoginAndInit,
  };

})();
