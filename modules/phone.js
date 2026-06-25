// modules/phone.js — "查手机" overlay: URL reading + activity timeline
// Phase 1: read_url / summarize_url, no auto-browsing, no auto-fetch

(function () {
  "use strict";

  function getWebEndpoint() {
    const cfg = window.SAVE_PRINCESS_CONFIG || {};
    const v = cfg["WEB_API_ENDPOINT"];
    return v && v !== "YOUR_WEB_API_ENDPOINT" ? v : "";
  }

  async function getSupabaseAuthHeaders() {
    try {
      const sc = window.supabaseClient || null;
      if (!sc) return {};
      const { data: { session } } = await sc.auth.getSession();
      return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch {
      return {};
    }
  }

  function getCurrentUserId() {
    return typeof window.currentUserId === "string" ? window.currentUserId : "";
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function setHidden(element, hidden) {
    if (hidden) element.setAttribute("hidden", "");
    else element.removeAttribute("hidden");
  }

  // ── Phone System Simulator State ──────────────────────────────────────────

  let currentScreen = "lock";
  let screenHistory = [];

  // ── Open / Close overlay ──────────────────────────────────────────────────

  function openPhoneOverlay() {
    const overlay = el("phoneOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.removeAttribute("hidden");

    // Reset to lock screen
    currentScreen = "lock";
    screenHistory = [];
    showScreen("lock");

    // Load activity data for browser history
    loadTodayActivity();
  }

  function closePhoneOverlay() {
    const overlay = el("phoneOverlay");
    if (overlay) overlay.classList.add("hidden");
    resetReadForm();
  }

  function resetReadForm() {
    const input = el("phoneUrlInput");
    if (input) input.value = "";
  }

  // ── Screen Navigation ─────────────────────────────────────────────────────

  function showScreen(screenName) {
    const screens = document.querySelectorAll(".phone-screen");
    screens.forEach(screen => {
      if (screen.dataset.screen === screenName) {
        screen.classList.remove("hidden");
      } else {
        screen.classList.add("hidden");
      }
    });
    currentScreen = screenName;
  }

  function navigateToScreen(screenName) {
    if (currentScreen !== screenName) {
      screenHistory.push(currentScreen);
      showScreen(screenName);
    }
  }

  function navigateBack() {
    if (screenHistory.length > 0) {
      const previousScreen = screenHistory.pop();
      showScreen(previousScreen);
    } else {
      showScreen("home");
    }
  }

  // ── Gesture Handlers ──────────────────────────────────────────────────────

  function initGestures() {
    const lockScreen = el("phoneLockScreen");
    if (lockScreen) {
      let startY = 0;
      lockScreen.addEventListener("touchstart", (e) => {
        startY = e.touches[0].clientY;
      });
      lockScreen.addEventListener("touchend", (e) => {
        const endY = e.changedTouches[0].clientY;
        const deltaY = startY - endY;
        if (deltaY > 50) { // Swipe up
          navigateToScreen("home");
        }
      });

      // Mouse support for desktop
      lockScreen.addEventListener("click", () => {
        navigateToScreen("home");
      });
    }
  }

  // ── App Launchers ─────────────────────────────────────────────────────────

  function initAppLaunchers() {
    const appIcons = document.querySelectorAll(".phone-app-icon");
    appIcons.forEach(icon => {
      icon.addEventListener("click", () => {
        const appName = icon.dataset.app;
        if (appName) {
          navigateToScreen(appName);
        }
      });
    });
  }

  // ── Back Buttons ──────────────────────────────────────────────────────────

  function initBackButtons() {
    const backButtons = document.querySelectorAll(".phone-back-btn");
    backButtons.forEach(btn => {
      btn.addEventListener("click", navigateBack);
    });
  }

  // ── Browser Integration ───────────────────────────────────────────────────

  function initBrowser() {
    const urlInput = document.querySelector(".phone-url-input");
    const goBtn = document.querySelector(".phone-browser-go");

    if (goBtn && urlInput) {
      const handleBrowserGo = () => {
        const url = urlInput.value.trim();
        if (url) {
          handleReadUrl(url);
        }
      };

      goBtn.addEventListener("click", handleBrowserGo);
      urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          handleBrowserGo();
        }
      });
    }
  }

  // ── Read URL ──────────────────────────────────────────────────────────────

  async function handleReadUrl(urlOverride) {
    const endpoint = getWebEndpoint();
    if (!endpoint) {
      alert("WEB_API_ENDPOINT 未配置");
      return;
    }

    const urlInput = document.querySelector(".phone-url-input");
    const rawUrl = urlOverride || (urlInput ? urlInput.value.trim() : "");
    if (!rawUrl) return;

    const historyContainer = el("phoneBrowserHistory");
    if (historyContainer) {
      historyContainer.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6); padding: 20px;">加载中…</p>';
    }

    try {
      const authHeaders = await getSupabaseAuthHeaders();
      const res = await fetch(endpoint + "?action=summarize_url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ url: rawUrl, saveLog: true }),
      });
      const data = await res.json();

      if (!data.ok) {
        const msg = data.error === "ssrf_blocked" ? "这个地址不能访问。"
          : data.error === "protocol_not_allowed" ? "只支持 http/https 链接。"
          : data.error === "timeout" ? "网页加载超时了。"
          : data.error === "content_type_rejected" ? "这个链接的内容格式没办法读。"
          : `读取失败（${data.error || "unknown"}）`;

        if (historyContainer) {
          historyContainer.innerHTML = `<p style="color: #ff3b30; padding: 20px;">${escapeHtml(msg)}</p>`;
        }
        return;
      }

      // Reload activity timeline to show new entry
      loadTodayActivity();
    } catch (err) {
      if (historyContainer) {
        historyContainer.innerHTML = '<p style="color: #ff3b30; padding: 20px;">网络错误，没能拿到内容。</p>';
      }
      console.error("[phone] fetch error", err);
    }
  }

  function showReadError(msg) {
    // Legacy function - kept for compatibility
    console.warn("[phone]", msg);
  }

  function renderReadResult(data, rawUrl) {
    // Legacy function - kept for compatibility
  }

  // ── Inject web result into chat ───────────────────────────────────────────

  function injectToChat(summary, sourceUrl, title) {
    if (typeof window.injectWebContextToChat === "function") {
      window.injectWebContextToChat({ summary, sourceUrl, title });
    }
  }

  // ── Activity timeline ─────────────────────────────────────────────────────

  async function loadTodayActivity() {
    const sc = window.supabaseClient;
    const userId = getCurrentUserId();
    if (!sc || !userId) return;

    const timelineEl = el("phoneTimeline");
    if (!timelineEl) return;

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await sc
        .from("cha_activity_log")
        .select("id, action_type, action_subtype, query, url, final_url, title, summary, status, error_code, duration_ms, token_estimate, created_at")
        .eq("user_id", userId)
        .eq("action_type", "web_browse")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      renderTimeline(timelineEl, data || []);
    } catch (err) {
      console.error("[phone] activity load error", err);
    }
  }

  function renderTimeline(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<p style="color: rgba(255, 255, 255, 0.4); padding: 20px; text-align: center;">今天还没有上网记录。</p>';
      return;
    }

    const items = rows.map((row) => {
      const time = formatTime(row.created_at);
      const title = row.title || row.query || row.url || "—";
      const isOk = row.status === "success";
      const url = row.final_url || row.url || "";
      const summary = row.summary || "";

      return `<div style="padding: 12px; background: #1c1c1e; border-radius: 8px; margin-bottom: 8px; cursor: pointer;"
        onclick="window.openBrowserResult('${escapeAttr(url)}', '${escapeAttr(title)}', '${escapeAttr(summary)}')">
        <div style="font-size: 14px; color: #ffffff; margin-bottom: 4px;">${escapeHtml(truncate(title, 60))}</div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">${escapeHtml(time)}</div>
        ${url ? `<div style="font-size: 11px; color: rgba(255, 255, 255, 0.4); margin-top: 4px;">${escapeHtml(truncate(url, 50))}</div>` : ""}
      </div>`;
    }).join("");

    container.innerHTML = items;
  }

  // ── Search and Notification Overlays ──────────────────────────────────────

  function initOverlays() {
    const searchBtn = document.querySelector('[data-action="search"]');
    const searchOverlay = el("phoneSearchOverlay");
    const searchClose = document.querySelector(".phone-search-close");

    if (searchBtn && searchOverlay) {
      searchBtn.addEventListener("click", () => {
        searchOverlay.classList.remove("hidden");
      });
    }

    if (searchClose && searchOverlay) {
      searchClose.addEventListener("click", () => {
        searchOverlay.classList.add("hidden");
      });
    }

    // Status bar notification pull-down (simplified - just close overlay for now)
    const notificationPanel = el("phoneNotificationPanel");
    const notificationClose = document.querySelector(".phone-notification-close");

    if (notificationClose && notificationPanel) {
      notificationClose.addEventListener("click", () => {
        notificationPanel.classList.add("hidden");
      });
    }
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return String(s ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function truncate(s, n) {
    s = String(s ?? "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  // ── Wire DOM after load ───────────────────────────────────────────────────

  function init() {
    const closeBtn = el("phoneOverlayClose");
    if (closeBtn) closeBtn.addEventListener("click", closePhoneOverlay);

    const backdrop = el("phoneOverlayBackdrop");
    if (backdrop) backdrop.addEventListener("click", closePhoneOverlay);

    // Initialize phone simulator features
    initGestures();
    initAppLaunchers();
    initBackButtons();
    initBrowser();
    initOverlays();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.openPhoneOverlay = openPhoneOverlay;
  window.closePhoneOverlay = closePhoneOverlay;

  // Allow external code to pre-fill URL (e.g. from chat URL detection)
  window.openPhoneOverlayWithUrl = function (url) {
    const input = el("phoneUrlInput");
    if (input) input.value = url;
    openPhoneOverlay();
  };

  // Open browser result from timeline history
  window.openBrowserResult = function (url, title, summary) {
    if (summary && typeof window.injectWebContextToChat === "function") {
      window.injectWebContextToChat({ summary, sourceUrl: url, title });
      closePhoneOverlay();
    }
  };
})();
