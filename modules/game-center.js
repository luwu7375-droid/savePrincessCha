// modules/game-center.js — CedarToy human + machine binding flow

(function () {
  "use strict";

  const CACHE_KEY_PREFIX = "cedartoy_machine_status_";
  const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes for bound status
  const PENDING_CACHE_DURATION_MS = 30 * 1000; // 30 seconds for pending status

  function getCacheKey() {
    const userId = window.currentUserId || "default";
    return CACHE_KEY_PREFIX + userId;
  }

  function getCachedStatus() {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) return null;
      const data = JSON.parse(cached);
      const now = Date.now();
      const maxAge = data.status === "bound" ? CACHE_DURATION_MS : PENDING_CACHE_DURATION_MS;
      if (now - data.timestamp < maxAge) {
        return data.machine;
      }
      localStorage.removeItem(getCacheKey());
    } catch (e) {
      console.warn("[game-center] cache read failed", e);
    }
    return null;
  }

  function setCachedStatus(machine) {
    try {
      localStorage.setItem(getCacheKey(), JSON.stringify({
        machine,
        timestamp: Date.now(),
      }));
    } catch (e) {
      console.warn("[game-center] cache write failed", e);
    }
  }

  function showGameCenter() {
    if (window.SPV2Shell && typeof window.SPV2Shell.showPage === "function") {
      window.SPV2Shell.showPage("game-center");
    } else {
      const pages = document.querySelectorAll(".v2-page");
      const tabs = document.querySelectorAll(".bottom-tab");
      const target = document.querySelector('.v2-page[data-page="game-center"]');
      if (target) {
        pages.forEach((page) => page.classList.remove("v2-active"));
        tabs.forEach((tab) => tab.classList.remove("active"));
        target.classList.add("v2-active");
      }
    }

    // Render cached status immediately (no "checking..." flash)
    const cached = getCachedStatus();
    if (cached) {
      renderMachine(cached);
    }

    // Background refresh
    loadMachineStatusBackground();

    // Setup iframe auth reminder
    setupIframeAuthReminder();
  }

  function closeGameCenter() {
    if (window.SPV2Shell && typeof window.SPV2Shell.showPage === "function") {
      window.SPV2Shell.showPage("playground");
      return;
    }
    const pages = document.querySelectorAll(".v2-page");
    const tabs = document.querySelectorAll(".bottom-tab");
    const page = document.querySelector('.v2-page[data-page="playground"]');
    const tab = document.querySelector('.bottom-tab[data-tab="playground"]');
    if (page) {
      pages.forEach((item) => item.classList.remove("v2-active"));
      tabs.forEach((item) => item.classList.remove("active"));
      page.classList.add("v2-active");
      if (tab) tab.classList.add("active");
    }
  }

  function getProxyEndpoint() {
    const config = window.SAVE_PRINCESS_CONFIG || {};
    const supabaseUrl = config.SUPABASE_URL || "";
    return supabaseUrl ? `${supabaseUrl}/functions/v1/game-proxy` : "";
  }

  async function callGameProxy(action) {
    const endpoint = getProxyEndpoint();
    if (!endpoint) throw new Error("SUPABASE_URL 未配置");
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase 尚未初始化");

    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("请先登录 SavePrincessCha");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        action,
        userId: window.currentUserId || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = result?.error || `HTTP ${response.status}`;
      const err = new Error(code);
      err.status = response.status;
      err.payload = result;
      throw err;
    }
    return result;
  }

  function setBusy(busy) {
    const createBtn = document.getElementById("cedartoyCreateMachineBtn");
    const refreshBtn = document.getElementById("cedartoyRefreshBindingBtn");
    const regenerateBtn = document.getElementById("cedartoyRegenerateBtn");
    if (createBtn) createBtn.disabled = busy;
    if (refreshBtn) refreshBtn.disabled = busy;
    if (regenerateBtn) regenerateBtn.disabled = busy;
  }

  function renderMachine(machine) {
    const bindingCard = document.getElementById("cedartoyBindingCard");
    const boundStatusBar = document.getElementById("cedartoyBoundStatusBar");
    const statusText = document.getElementById("cedartoyMachineStatusText");
    const hint = document.getElementById("cedartoyBindingHint");
    const codeRow = document.getElementById("cedartoyBindingCodeRow");
    const codeEl = document.getElementById("cedartoyBindingCode");
    const createBtn = document.getElementById("cedartoyCreateMachineBtn");
    const refreshBtn = document.getElementById("cedartoyRefreshBindingBtn");
    const regenerateBtn = document.getElementById("cedartoyRegenerateBtn");

    const status = machine?.status || "unregistered";

    // When bound: hide binding card, show compact status bar
    if (status === "bound") {
      if (bindingCard) bindingCard.hidden = true;
      if (boundStatusBar) boundStatusBar.hidden = false;
      return;
    }

    // For other states: show binding card, hide status bar
    if (bindingCard) bindingCard.hidden = false;
    if (boundStatusBar) boundStatusBar.hidden = true;

    if (createBtn) createBtn.hidden = status !== "unregistered" && status !== "error";
    if (refreshBtn) refreshBtn.hidden = status !== "pending_binding";
    if (regenerateBtn) regenerateBtn.hidden = status !== "pending_binding";
    if (codeRow) codeRow.hidden = status !== "pending_binding" || !machine?.binding_code;
    if (codeEl) codeEl.textContent = machine?.binding_code || "";

    if (status === "pending_binding") {
      if (statusText) statusText.textContent = `小机已创建：${machine.machine_username || "Cha"}`;
      if (hint) hint.textContent = "请先在下方登录你的人类账号，再进入「绑定 AI」输入上面的绑定码；完成后点「刷新状态」。绑定码过期可点「重新生成绑定码」。";
      return;
    }
    if (status === "error") {
      if (statusText) statusText.textContent = "小机创建失败";
      if (hint) hint.textContent = machine.last_error || "可以重新尝试创建；若仍失败，请查看 game-proxy 日志。";
      return;
    }
    if (statusText) statusText.textContent = "Cha 还没有 CedarToy 小机";
    if (hint) hint.textContent = "你先在下方登录自己的人类账号；点击按钮后 Cha 才会通过 MCP 创建自己的小机。";
  }

  async function loadMachineStatusBackground() {
    try {
      const result = await callGameProxy("machine_status");
      const machine = result.machine;

      // If status is pending_binding, auto-refresh to check CedarToy
      if (machine.status === "pending_binding") {
        try {
          const refreshResult = await callGameProxy("refresh_binding");
          const refreshedMachine = refreshResult.machine;
          setCachedStatus(refreshedMachine);
          renderMachine(refreshedMachine);
        } catch (error) {
          // If refresh fails, use the original machine status
          setCachedStatus(machine);
          renderMachine(machine);
        }
      } else {
        setCachedStatus(machine);
        renderMachine(machine);
      }
    } catch (error) {
      if (error.status === 409 && error.payload?.machine) {
        setCachedStatus(error.payload.machine);
        renderMachine(error.payload.machine);
      } else {
        // Only show error if we have no cached status
        const cached = getCachedStatus();
        if (!cached) {
          renderMachine({
            status: "error",
            last_error: error.message || String(error),
          });
        }
      }
    }
  }

  async function loadMachineStatus(refresh) {
    const statusText = document.getElementById("cedartoyMachineStatusText");
    try {
      setBusy(true);
      if (statusText) statusText.textContent = "正在检查小机状态…";
      const result = await callGameProxy(refresh ? "refresh_binding" : "machine_status");
      setCachedStatus(result.machine);
      renderMachine(result.machine);
    } catch (error) {
      if (error.status === 409 && error.payload?.machine) {
        setCachedStatus(error.payload.machine);
        renderMachine(error.payload.machine);
      } else {
        renderMachine({
          status: "error",
          last_error: error.message || String(error),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function createMachine() {
    const statusText = document.getElementById("cedartoyMachineStatusText");
    try {
      setBusy(true);
      if (statusText) statusText.textContent = "Cha 正在通过 MCP 创建小机…";
      const result = await callGameProxy("ensure_machine");
      setCachedStatus(result.machine);
      renderMachine(result.machine);
    } catch (error) {
      renderMachine({
        status: "error",
        last_error: error.message || String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyBindingCode() {
    const code = document.getElementById("cedartoyBindingCode")?.textContent || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (typeof window.showToast === "function") window.showToast("绑定码已复制");
    } catch {
      if (typeof window.showToast === "function") window.showToast("复制失败，请手动复制");
    }
  }

  async function regenerateBindingCode() {
    const statusText = document.getElementById("cedartoyMachineStatusText");
    try {
      setBusy(true);
      if (statusText) statusText.textContent = "正在重新生成绑定码…";
      const result = await callGameProxy("regenerate_binding");
      setCachedStatus(result.machine);
      renderMachine(result.machine);
      if (typeof window.showToast === "function") window.showToast("绑定码已更新");
    } catch (error) {
      renderMachine({
        status: "error",
        last_error: error.message || String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function showBindingCard() {
    const bindingCard = document.getElementById("cedartoyBindingCard");
    const boundStatusBar = document.getElementById("cedartoyBoundStatusBar");
    if (bindingCard) bindingCard.hidden = false;
    if (boundStatusBar) boundStatusBar.hidden = true;
  }

  function setupIframeAuthReminder() {
    const iframe = document.getElementById("gameCenterIframe");
    if (!iframe) return;

    let authReminderShown = false;

    // Listen for iframe load events
    iframe.addEventListener("load", () => {
      // Check if we should show auth reminder after a short delay
      // (give iframe time to settle)
      setTimeout(() => {
        if (!authReminderShown) {
          checkIframeAuthStatus();
        }
      }, 2000);
    });

    // Also check on first setup
    setTimeout(() => {
      if (!authReminderShown) {
        checkIframeAuthStatus();
      }
    }, 2000);

    function checkIframeAuthStatus() {
      // Check if user has already bound their account
      const cached = getCachedStatus();
      if (cached?.status === "bound") {
        // User is bound, no need to remind
        return;
      }

      // Show reminder for first-time users
      if (!authReminderShown) {
        authReminderShown = true;
        showAuthReminder();
      }
    }

    function showAuthReminder() {
      const hint = document.getElementById("cedartoyBindingHint");
      if (!hint) return;

      // Enhance the hint with auth reminder
      const originalHint = hint.textContent;
      hint.innerHTML = `
        <strong style="color: #ff6b6b;">⚠️ 请先在下方游戏中心登录你的 CedarToy 账号</strong><br>
        ${originalHint}
      `;

      // Show a toast notification as well
      if (typeof window.showToast === "function") {
        window.showToast("请先在游戏中心登录 CedarToy 账号", 5000);
      }
    }
  }

  function init() {
    document.getElementById("gameCenterEntry")
      ?.addEventListener("click", showGameCenter);
    document.getElementById("gameCenterBackBtn")
      ?.addEventListener("click", closeGameCenter);
    document.getElementById("cedartoyCreateMachineBtn")
      ?.addEventListener("click", createMachine);
    document.getElementById("cedartoyRefreshBindingBtn")
      ?.addEventListener("click", () => loadMachineStatus(true));
    document.getElementById("cedartoyRegenerateBtn")
      ?.addEventListener("click", regenerateBindingCode);
    document.getElementById("cedartoyCopyCodeBtn")
      ?.addEventListener("click", copyBindingCode);
    document.getElementById("cedartoyManageBtn")
      ?.addEventListener("click", showBindingCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.SPGameCenter = {
    showGameCenter,
    closeGameCenter,
    loadMachineStatus,
  };
})();
