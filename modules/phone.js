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

  // ── Open / Close overlay ──────────────────────────────────────────────────

  function openPhoneOverlay() {
    const overlay = el("phoneOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.removeAttribute("hidden");
    loadTodayActivity();
  }

  function closePhoneOverlay() {
    const overlay = el("phoneOverlay");
    if (overlay) overlay.classList.add("hidden");
    resetReadForm();
  }

  function resetReadForm() {
    const input = el("phoneUrlInput");
    const result = el("phoneResult");
    if (input) input.value = "";
    if (result) {
      result.setAttribute("hidden", "");
      result.innerHTML = "";
    }
  }

  // ── Read URL ──────────────────────────────────────────────────────────────

  async function handleReadUrl() {
    const endpoint = getWebEndpoint();
    if (!endpoint) {
      showReadError("WEB_API_ENDPOINT 未配置");
      return;
    }
    const input = el("phoneUrlInput");
    const rawUrl = input ? input.value.trim() : "";
    if (!rawUrl) return;

    const btn = el("phoneReadBtn");
    if (btn) { btn.disabled = true; btn.textContent = "去看看…"; }

    const resultEl = el("phoneResult");
    if (resultEl) {
      resultEl.removeAttribute("hidden");
      resultEl.innerHTML = '<p class="phone-loading">cha 出去看了一眼，马上回来…</p>';
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
        showReadError(msg);
        return;
      }

      renderReadResult(data, rawUrl);
      loadTodayActivity();
    } catch (err) {
      showReadError("网络错误，没能拿到内容。");
      console.error("[phone] fetch error", err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "让cha看看"; }
    }
  }

  function showReadError(msg) {
    const resultEl = el("phoneResult");
    if (resultEl) {
      resultEl.removeAttribute("hidden");
      resultEl.innerHTML = `<p class="phone-error">${escapeHtml(msg)}</p>`;
    }
  }

  function renderReadResult(data, rawUrl) {
    const resultEl = el("phoneResult");
    if (!resultEl) return;

    const title = data.source?.title || rawUrl;
    const url = data.source?.url || rawUrl;
    const summary = data.summary || "";
    const fetchedAt = data.fetched_at ? formatTime(data.fetched_at) : "";
    const reliabilityNote = data.reliability_note || "";

    resultEl.removeAttribute("hidden");
    resultEl.innerHTML = `
      <div class="phone-result-card">
        <div class="phone-result-title">${escapeHtml(title)}</div>
        <div class="phone-result-summary">${escapeHtml(summary)}</div>
        ${reliabilityNote ? `<div class="phone-result-note">${escapeHtml(reliabilityNote)}</div>` : ""}
        <div class="phone-result-meta">
          <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="phone-result-source">${escapeHtml(truncate(url, 60))}</a>
          ${fetchedAt ? `<span class="phone-result-time">${escapeHtml(fetchedAt)}</span>` : ""}
        </div>
        <button type="button" class="phone-inject-btn" data-summary="${escapeAttr(summary)}" data-source="${escapeAttr(url)}" data-title="${escapeAttr(title)}">在聊天里讲给KK</button>
      </div>`;

    const injectBtn = resultEl.querySelector(".phone-inject-btn");
    if (injectBtn) {
      injectBtn.addEventListener("click", function () {
        const s = this.dataset.summary;
        const src = this.dataset.source;
        const t = this.dataset.title;
        injectToChat(s, src, t);
        closePhoneOverlay();
      });
    }
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
      container.innerHTML = '<p class="phone-timeline-empty">今天还没有上网记录。</p>';
      return;
    }

    const items = rows.map((row) => {
      const time = formatTime(row.created_at);
      const title = row.title || row.query || row.url || "—";
      const isOk = row.status === "success";
      const statusLabel = row.status === "timeout" ? "超时" : row.status === "error" ? "失败" : "成功";
      const meta = [
        row.duration_ms ? `${row.duration_ms}ms` : null,
        row.token_estimate ? `~${row.token_estimate} tokens` : null,
      ].filter(Boolean).join(" · ");

      return `<div class="phone-timeline-item phone-timeline-item--${isOk ? "ok" : "err"}">
        <span class="phone-timeline-time">${escapeHtml(time)}</span>
        <span class="phone-timeline-dot"></span>
        <div class="phone-timeline-body">
          <div class="phone-timeline-title">${escapeHtml(truncate(title, 80))}</div>
          ${row.url ? `<a href="${escapeAttr(row.url)}" target="_blank" rel="noopener noreferrer" class="phone-timeline-url">${escapeHtml(truncate(row.url, 60))}</a>` : ""}
          <div class="phone-timeline-meta">${escapeHtml(statusLabel)}${meta ? " · " + escapeHtml(meta) : ""}</div>
        </div>
      </div>`;
    }).join("");

    container.innerHTML = `<div class="phone-timeline">${items}</div>`;
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
    const readBtn = el("phoneReadBtn");
    if (readBtn) readBtn.addEventListener("click", handleReadUrl);

    const urlInput = el("phoneUrlInput");
    if (urlInput) {
      urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleReadUrl();
      });
    }

    const closeBtn = el("phoneOverlayClose");
    if (closeBtn) closeBtn.addEventListener("click", closePhoneOverlay);

    const backdrop = el("phoneOverlayBackdrop");
    if (backdrop) backdrop.addEventListener("click", closePhoneOverlay);
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
})();
