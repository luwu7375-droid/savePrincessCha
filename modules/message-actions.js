// ============================================================================
// Message Actions Module - Message Operations & Interactions
// ============================================================================
// Extracted from app.js lines 1811-1924
// Handles message actions: copy, edit, delete, regenerate, read receipts

(function() {
  "use strict";

// ── Message Actions ───────────────────────────────────────────────────────────

function getMessageRows() {
  return Array.from(messageList.querySelectorAll(".msg-row:not(#typingIndicatorRow)"));
}

function getLastMessageRow(role) {
  return [...getMessageRows()].reverse().find(r => r.classList.contains(role));
}

function isMobileMessageActions() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function canRegenerateRow(row) {
  return !!row?.dataset.msgId && row === getLastMessageRow("assistant") &&
    chatMessages.some(m => m.id === row.dataset.msgId);
}

function refreshGroupClasses() {
  const rows = Array.from(messageList.querySelectorAll(
    ".msg-row.user, .msg-row.assistant"
  ));
  let runStart = 0;
  for (let i = 0; i <= rows.length; i++) {
    const currentRole = i < rows.length
      ? (rows[i].classList.contains("user") ? "user" : "assistant")
      : null;
    if (i === rows.length || (i > 0 && currentRole !== (rows[i-1].classList.contains("user") ? "user" : "assistant"))) {
      const runLen = i - runStart;
      for (let j = runStart; j < i; j++) {
        const row = rows[j];
        row.classList.remove("msg-group-row", "msg-group-last");
        if (runLen > 1 && j > runStart) {
          row.classList.add("msg-group-row");
        }
        if (runLen > 1 && j === i - 1) {
          row.classList.add("msg-group-last");
        }
      }
      runStart = i;
    }
  }
}

function refreshMessageActions() {
  refreshGroupClasses();
  document.querySelectorAll(".msg-actions").forEach(el => el.remove());
  const rows = getMessageRows();
  const lastAssistantRow = [...rows].reverse().find(r => r.classList.contains("assistant"));
  const lastUserRow = [...rows].reverse().find(r => r.classList.contains("user"));

  for (const row of rows) {
    const stack = row.querySelector(".msg-stack");
    if (!stack) continue;
    const isAssistant = row.classList.contains("assistant");
    const isUser = row.classList.contains("user");
    if (!isAssistant && !isUser) continue;

    // Get msgId from either msgId or bubbleSibling (for split messages)
    const effectiveMsgId = row.dataset.msgId || row.dataset.bubbleSibling;
    if (isAssistant && !effectiveMsgId) continue;

    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await copyMessage(row, copyBtn);
    });
    actions.appendChild(copyBtn);

    if ((isAssistant || isUser) && effectiveMsgId) {
      const replyBtn = document.createElement("button");
      replyBtn.textContent = "引用";
      replyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const role = isAssistant ? "assistant" : "user";
        const preview = getMessageQuotePreview ? getMessageQuotePreview(row) : "";
        setReplyDraft(effectiveMsgId, preview, role);
      });
      actions.appendChild(replyBtn);
    }

    if (isAssistant) {
      if (row === lastAssistantRow && canRegenerateRow(row)) {
        const regenBtn = document.createElement("button");
        regenBtn.textContent = "重新生成";
        regenBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          regenerateMessage(row);
        });
        actions.appendChild(regenBtn);
      }
    } else if (row === lastUserRow && row.dataset.msgId) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        editUserMessage(row);
      });
      actions.appendChild(editBtn);
    }
    stack.appendChild(actions);
  }
}


  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessMessageActions = {
    getMessageRows,
    getLastMessageRow,
    canRegenerateRow,
    refreshGroupClasses,
    refreshMessageActions,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.getMessageRows = getMessageRows;
  window.getLastMessageRow = getLastMessageRow;
  window.canRegenerateRow = canRegenerateRow;
  window.refreshGroupClasses = refreshGroupClasses;
  window.refreshMessageActions = refreshMessageActions;
  window.isMobileMessageActions = isMobileMessageActions;

})();
