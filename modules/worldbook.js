// ============================================================================
// Worldbook Module - World Book Management
// ============================================================================
// Extracted from app.js lines 8373-8760
// Handles world book CRUD operations, drag-and-drop reordering, and file uploads

(function() {
  "use strict";

  // ── Constants ───────────────────────────────────────────────────────────────
  const WB_MAX_FILE_BYTES  = 1 * 1024 * 1024;   // 1 MB frontend guard
  const WB_MAX_CONTENT_LEN = 200_000;            // chars, mirrors DB constraint
  const WB_PREVIEW_LINES   = 100;
  const WB_PREVIEW_CHARS   = 200;

  // ── State ───────────────────────────────────────────────────────────────────
  let wbBooks        = [];   // WorldBook[]  in-memory cache (sorted by priority)
  let wbDraggedId    = null; // id of card being dragged
  let wbPendingFile  = null; // { name, content, lineCount } pending upload

  // ── DOM refs ────────────────────────────────────────────────────────────────
  // Note: these elements live in #wbContentStore (a hidden DOM store) and are
  // moved into the settings subpage body when the worldbook subpage is opened.
  const wbUploadBtn        = document.getElementById("wbUploadBtn");
  const wbFileInput        = document.getElementById("wbFileInput");
  const wbUploadForm       = document.getElementById("wbUploadForm");
  const wbNameInput        = document.getElementById("wbNameInput");
  const wbAuthorInput      = document.getElementById("wbAuthorInput");
  const wbUploadPreview    = document.getElementById("wbUploadPreview");
  const wbUploadError      = document.getElementById("wbUploadError");
  const wbCancelUpload     = document.getElementById("wbCancelUpload");
  const wbConfirmUpload    = document.getElementById("wbConfirmUpload");
  const wbList             = document.getElementById("wbList");
  const wbTokenHint        = document.getElementById("wbTokenHint");

  // ── Utility: escapeHtml ─────────────────────────────────────────────────────
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
  }

  // ── Utility: showToast ──────────────────────────────────────────────────────
  function showToast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    } else if (typeof window.showDialog === "function") {
      window.showDialog({ title: message, body: "", confirmLabel: "知道了" });
    } else {
      alert(message);
    }
  }

  // ── Open / Close (legacy stubs — worldbook is now a settings subpage) ──────
  function openWorldBooks() {
    if (typeof window.openSettingsSubpage === "function") {
      window.openSettingsSubpage("worldbook");
    }
  }

  function closeWorldBooks() {
    // Navigate back to prompt-worldbook subpage (the parent)
    if (typeof window.openSettingsSubpage === "function") {
      window.openSettingsSubpage("prompt-worldbook");
    }
  }

  // ── Load & Render ───────────────────────────────────────────────────────────
  async function loadWorldBooks() {
    if (!window.supabaseClient || !window.currentUserId) {
      wbList.innerHTML = '<div class="wb-empty">请先登录。</div>';
      return;
    }

    wbList.innerHTML = '<div class="wb-loading" aria-live="polite">加载中…</div>';

    const { data, error } = await window.supabaseClient
      .from("world_books")
      .select("id, name, author, content, line_count, enabled, priority, created_at")
      .eq("user_id", window.currentUserId)
      .order("priority", { ascending: true });

    if (error) {
      wbList.innerHTML = `<div class="wb-empty">加载失败：${error.message}</div>`;
      return;
    }

    wbBooks = data || [];
    wbRender();
    wbUpdateTokenHint();
  }

  function wbRender() {
    if (wbBooks.length === 0) {
      wbList.innerHTML = '<div class="wb-empty">还没有上传世界书。开始上传你的第一个吧。</div>';
      return;
    }

    wbList.innerHTML = "";

    wbBooks.forEach((book, index) => {
      const card = document.createElement("div");
      card.className = "wb-card";
      card.setAttribute("role", "listitem");
      card.dataset.id = book.id;
      card.draggable = true;

      const previewText = wbBuildPreview(book.content);
      const authorBadge = book.author
        ? `<span class="wb-author">${escapeHtml(book.author)}</span>`
        : "";

      card.innerHTML = `
        <div class="wb-card-main">
          <span class="wb-drag-handle" aria-hidden="true">⠿</span>
          <span class="wb-index">${index + 1}</span>
          <div class="wb-card-info">
            <div class="wb-name" title="${escapeHtml(book.name)}">${escapeHtml(book.name)}</div>
            <div class="wb-meta">
              ${authorBadge}
              <span class="wb-lines">${book.line_count} 行</span>
            </div>
          </div>
          <div class="wb-card-actions">
            <button
              class="wb-toggle"
              data-enabled="${book.enabled}"
              aria-label="${book.enabled ? "已启用，点击禁用" : "已禁用，点击启用"}"
              aria-pressed="${book.enabled}"
              title="${book.enabled ? "已启用" : "已禁用"}"
            >${book.enabled ? "●" : "○"}</button>
            <button class="wb-delete" aria-label="删除 ${escapeHtml(book.name)}" title="删除">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 5.5l.5 5M9 5.5l-.5 5M3.5 3.5l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="wb-preview">${escapeHtml(previewText)}</div>
      `;

      // Toggle preview on card body click (not on action buttons)
      card.querySelector(".wb-card-main").addEventListener("click", (e) => {
        if (e.target.closest(".wb-card-actions")) return;
        card.classList.toggle("wb-expanded");
      });

      // Toggle enabled
      card.querySelector(".wb-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        wbToggleEnabled(book.id, !book.enabled);
      });

      // Delete
      card.querySelector(".wb-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        wbDelete(book.id, book.name);
      });

      // Drag events
      card.addEventListener("dragstart", wbOnDragStart);
      card.addEventListener("dragover",  wbOnDragOver);
      card.addEventListener("dragleave", wbOnDragLeave);
      card.addEventListener("drop",      wbOnDrop);
      card.addEventListener("dragend",   wbOnDragEnd);

      wbList.appendChild(card);
    });
  }

  function wbBuildPreview(content) {
    return content.split("\n").slice(0, WB_PREVIEW_LINES).join("\n").substring(0, WB_PREVIEW_CHARS);
  }

  function wbUpdateTokenHint() {
    const enabled = wbBooks.filter(b => b.enabled);
    if (enabled.length === 0) {
      wbTokenHint.textContent = "";
      wbTokenHint.classList.remove("wb-token-hint--warn");
      return;
    }
    const totalChars = enabled.reduce((sum, b) => sum + b.content.length, 0);
    // Rough estimate: 1 token ≈ 4 chars
    const estTokens = Math.round(totalChars / 4);
    const warn = totalChars > 20_000;
    wbTokenHint.textContent = `${enabled.length} 个已启用 · 约 ${estTokens.toLocaleString()} tokens${warn ? "（已接近上限）" : ""}`;
    wbTokenHint.classList.toggle("wb-token-hint--warn", warn);
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────
  async function wbToggleEnabled(id, newEnabled) {
    // Optimistic update
    const book = wbBooks.find(b => b.id === id);
    if (!book) return;
    book.enabled = newEnabled;
    wbRender();
    wbUpdateTokenHint();

    const { error } = await window.supabaseClient
      .from("world_books")
      .update({ enabled: newEnabled })
      .eq("id", id)
      .eq("user_id", window.currentUserId);

    if (error) {
      // Rollback
      book.enabled = !newEnabled;
      wbRender();
      wbUpdateTokenHint();
      showToast("更新失败：" + error.message);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function wbDelete(id, name) {
    if (!confirm(`确认删除「${name}」？`)) return;

    const { error } = await window.supabaseClient
      .from("world_books")
      .delete()
      .eq("id", id)
      .eq("user_id", window.currentUserId);

    if (error) {
      showToast("删除失败：" + error.message);
      return;
    }

    wbBooks = wbBooks.filter(b => b.id !== id);
    wbRender();
    wbUpdateTokenHint();
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function wbOnDragStart(e) {
    wbDraggedId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add("wb-dragging");
    e.dataTransfer.effectAllowed = "move";
  }

  function wbOnDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = e.currentTarget;
    if (target.dataset.id !== wbDraggedId) {
      target.classList.add("wb-drag-over");
    }
  }

  function wbOnDragLeave(e) {
    e.currentTarget.classList.remove("wb-drag-over");
  }

  function wbOnDrop(e) {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.id;
    e.currentTarget.classList.remove("wb-drag-over");

    if (!wbDraggedId || wbDraggedId === targetId) return;

    // Reorder in-memory array: move dragged item to position of target
    const fromIdx = wbBooks.findIndex(b => b.id === wbDraggedId);
    const toIdx   = wbBooks.findIndex(b => b.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = wbBooks.splice(fromIdx, 1);
    wbBooks.splice(toIdx, 0, moved);

    wbRender();
    wbUpdateTokenHint();

    // Persist atomically via RPC
    wbPersistOrder();
  }

  function wbOnDragEnd(e) {
    e.currentTarget.classList.remove("wb-dragging");
    // Clear any stale drag-over indicators
    document.querySelectorAll(".wb-drag-over").forEach(el => el.classList.remove("wb-drag-over"));
    wbDraggedId = null;
  }

  async function wbPersistOrder() {
    const orderedIds = wbBooks.map(b => b.id);

    const { error } = await window.supabaseClient.rpc("reorder_world_books", {
      ordered_ids:     orderedIds,
      calling_user_id: window.currentUserId,
    });

    if (error) {
      showToast("排序保存失败：" + error.message);
      // Reload from DB to restore consistent state
      await loadWorldBooks();
    }
  }

  // ── Upload flow ─────────────────────────────────────────────────────────────
  wbUploadBtn.addEventListener("click", () => wbFileInput.click());

  wbFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";  // reset so same file can be re-selected
    if (!file) return;

    // Size guard
    if (file.size > WB_MAX_FILE_BYTES) {
      showToast("文件过大（上限 1 MB）");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;

      // Content length guard
      if (content.length > WB_MAX_CONTENT_LEN) {
        showToast("文件内容过长（上限 200,000 字符）");
        return;
      }

      const lineCount = content.split("\n").length;
      // Derive name from filename, strip extension
      const baseName = file.name.replace(/\.(md|txt)$/i, "").trim() || file.name;

      wbPendingFile = { content, lineCount };
      wbNameInput.value   = baseName;
      wbAuthorInput.value = "";
      wbUploadPreview.textContent = wbBuildPreview(content);
      wbUploadError.textContent = "";
      wbUploadForm.classList.remove("hidden");
      wbNameInput.focus();
    };
    reader.readAsText(file, "utf-8");
  });

  wbCancelUpload.addEventListener("click", wbResetUploadForm);
  wbConfirmUpload.addEventListener("click", wbSubmitUpload);

  function wbResetUploadForm() {
    wbPendingFile = null;
    wbNameInput.value   = "";
    wbAuthorInput.value = "";
    wbUploadPreview.textContent = "";
    wbUploadError.textContent = "";
    wbUploadForm.classList.add("hidden");
  }

  async function wbSubmitUpload() {
    if (!wbPendingFile) return;
    if (!window.supabaseClient || !window.currentUserId) {
      wbUploadError.textContent = "请先登录。";
      return;
    }

    const name = wbNameInput.value.trim();
    if (!name) {
      wbUploadError.textContent = "请填写名称。";
      wbNameInput.focus();
      return;
    }

    const author    = wbAuthorInput.value.trim() || null;
    const { content, lineCount } = wbPendingFile;

    // Calculate new priority = max(existing priorities) + 10, or 0 if empty
    const maxPriority = wbBooks.length > 0
      ? Math.max(...wbBooks.map(b => b.priority))
      : -10;
    const priority = maxPriority + 10;

    wbConfirmUpload.disabled = true;
    wbUploadError.textContent = "";

    const { data, error } = await window.supabaseClient
      .from("world_books")
      .insert({
        user_id:    window.currentUserId,
        name,
        author,
        content,
        line_count: lineCount,
        enabled:    false,
        priority,
      })
      .select("id, name, author, content, line_count, enabled, priority, created_at")
      .single();

    wbConfirmUpload.disabled = false;

    if (error) {
      // Detect unique constraint violation (Postgres code 23505)
      if (error.code === "23505" || (error.message || "").includes("unique")) {
        wbUploadError.textContent = "同名世界书已存在，请修改名称后重试。";
        wbNameInput.focus();
      } else {
        wbUploadError.textContent = "上传失败：" + error.message;
      }
      return;
    }

    wbBooks.push(data);
    wbResetUploadForm();
    wbRender();
    wbUpdateTokenHint();
    showToast("已上传「" + name + "」");
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  window.SavePrincessWorldbook = {
    openWorldBooks,
    closeWorldBooks,
    loadWorldBooks,
    wbResetUploadForm,  // exposed for settings integration
  };

  // ── Legacy global aliases (for backward compatibility) ──────────────────────
  window.openWorldBooks = openWorldBooks;
  window.closeWorldBooks = closeWorldBooks;
  window.loadWorldBooks = loadWorldBooks;
  window.wbResetUploadForm = wbResetUploadForm;

})();
