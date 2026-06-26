// ============================================================================
// Quote/Reply Module - Message Quote & Reply System
// ============================================================================
// Extracted from app.js lines 1009-1251
// Handles message quoting, reply drafts, and quote block rendering

(function() {
  "use strict";

// ── Quote / Reply helpers ────────────────────────────────────────────────────

function makeQuoteBlock(replyTo) {
  const block = document.createElement("div");
  block.className = "msg-quote-block";
  if (replyTo.id) block.dataset.replyTargetId = replyTo.id;
  const bar = document.createElement("div");
  bar.className = "msg-quote-bar";
  const inner = document.createElement("div");
  inner.className = "msg-quote-inner";
  const author = document.createElement("span");
  author.className = "msg-quote-author";
  author.textContent = replyTo.role === "assistant" ? "Cha" : "你";
  const text = document.createElement("span");
  text.className = "msg-quote-text";
  text.textContent = replyTo.preview || "";
  inner.appendChild(author);
  inner.appendChild(text);
  block.appendChild(bar);
  block.appendChild(inner);
  block.addEventListener("click", () => scrollToQuotedMessage(replyTo.id));
  return block;
}

function scrollToQuotedMessage(id) {
  if (!id) return;
  const target = messageList.querySelector(`.msg-row[data-msg-id="${id}"]`);
  if (!target) { setChatStatus("原消息不可用"); setTimeout(() => setChatStatus(""), 2000); return; }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("msg-highlight");
  setTimeout(() => target.classList.remove("msg-highlight"), 1800);
}

function getMessageQuotePreview(row) {
  const textEl = row.querySelector(".message-text");
  const imgEl = row.querySelector(".message-image");
  const audioEl = row.querySelector("audio");

  let preview = "";

  // 图片消息
  if (imgEl) {
    preview = "[图片]";
    if (textEl?.textContent) {
      preview += " " + textEl.textContent.trim();
    }
  }
  // 语音消息
  else if (audioEl) {
    const duration = audioEl.duration;
    if (duration && isFinite(duration)) {
      preview = `[语音 ${Math.round(duration)}"]`;
    } else {
      preview = "[语音]";
    }
  }
  // 文本消息
  else if (textEl) {
    preview = textEl.textContent || "";
  }

  return preview.replace(/\s+/g, " ").trim().slice(0, 100);
}

function setReplyDraft(id, preview, role) {
  // Block replies while in edit mode — the two states are mutually exclusive
  if (composerEditMode === "edit") return;
  _replyToId      = id;
  _replyToPreview = preview;
  _replyToRole    = role;
  renderReplyPreview();
}

function clearReplyDraft() {
  _replyToId = _replyToPreview = _replyToRole = null;
  document.getElementById("replyPreviewBar")?.remove();
}

function renderReplyPreview() {
  if (!_replyToId) return;
  let bar = document.getElementById("replyPreviewBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "replyPreviewBar";
    bar.className = "reply-preview-bar";
    const form = document.getElementById("chatForm");
    if (form?.parentNode) form.parentNode.insertBefore(bar, form);
  }
  bar.innerHTML = "";
  const line = document.createElement("div");
  line.className = "reply-preview-line";
  const content = document.createElement("div");
  content.className = "reply-preview-content";
  const authorEl = document.createElement("span");
  authorEl.className = "reply-preview-author";
  authorEl.textContent = _replyToRole === "assistant" ? "Cha" : "你";
  const textEl = document.createElement("span");
  textEl.className = "reply-preview-text";
  textEl.textContent = _replyToPreview || "";
  content.appendChild(authorEl);
  content.appendChild(textEl);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "reply-preview-close";
  closeBtn.setAttribute("aria-label", "取消引用");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", clearReplyDraft);
  bar.appendChild(line);
  bar.appendChild(content);
  bar.appendChild(closeBtn);
}

function insertBubbleSync(text, createdAt, msgId, isSibling, replyTo) {
  const el = document.createElement("div");
  el.className = "message assistant cha-message message-text";
  setMessageContent(el, text, { messageId: msgId != null ? String(msgId) : undefined });
  if (replyTo && !isSibling) {
    el.prepend(makeQuoteBlock(replyTo));
  }

  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(el);

  // Add speaker button for TTS — all text bubbles including siblings
  if (window.SPVoice) {
    const bubbleMsgId = isSibling ? null : msgId;
    const speakerBtn = window.SPVoice.createSpeakerButton(el, bubbleMsgId);
    stack.appendChild(speakerBtn);
    window.SPVoice.attachVoicePlayback(el, speakerBtn, bubbleMsgId);
  }
  // No read-receipt on assistant messages — user-read state drives the unread badge only
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  if (msgId && !isSibling) {
    row.dataset.msgId = msgId;
    row.dataset.unreadCha = "1"; // cleared by markReadByUser() when user sees it
  }
  if (isSibling) row.dataset.bubbleSibling = isSibling; // sibling 存主 msgId
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.title = "Cha";
  row.appendChild(avatar);
  row.appendChild(stack);
  maybeAddTimeSeparator(createdAt);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;
  return row;
}

function addAssistantBubbles(rawContent, createdAt, msgId, isAlreadyRead = false, replyTo = null) {
  const bubbles = splitBubbles(typeof rawContent === "string" ? rawContent : "");
  if (bubbles.length === 0) return;
  const firstRow = insertBubbleSync(bubbles[0], createdAt, msgId, null, replyTo);
  if (isAlreadyRead && firstRow) delete firstRow.dataset.unreadCha;
  for (let i = 1; i < bubbles.length; i++) {
    insertBubbleSync(bubbles[i], createdAt, null, String(msgId));
  }
}

// allSiblings=true 时：bubbles 里每一条都作为兄弟气泡插入（第一条已由调用方处理）
function insertBubblesAnimated(bubbles, createdAt, msgId, allSiblings = false, replyTo = null) {
  return new Promise(resolve => {
    if (!allSiblings) {
      insertBubbleSync(bubbles[0], createdAt, msgId, null, replyTo);
      if (bubbles.length === 1) { resolve(); return; }
    } else {
      if (bubbles.length === 0) { resolve(); return; }
    }
    let i = allSiblings ? 0 : 1;
    function next() {
      if (i >= bubbles.length) { resolve(); return; }
      const delay = 600 + Math.floor(Math.random() * 600);
      setTimeout(() => {
        showTypingIndicator();
        setTimeout(() => {
          removeTypingIndicator();
          insertBubbleSync(bubbles[i], createdAt, null, String(msgId));
          i++;
          next();
        }, 400);
      }, delay);
    }
    next();
  });
}

function renderWelcomeMessage() {
  messageList.innerHTML = "";
  lastMessageTime = null;
  addMessage(welcomeMessage, "assistant", new Date().toISOString(), { skipTimeSeparator: true });
}

function setLoading(isLoading) {
  messageInput.disabled = isLoading;
}

function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .replace(/<visible_thought>[\s\S]*?<\/visible_thought>/g, "")
    .replace(/<visible_thought>[\s\S]*$/, "")
    .replace(/<\/?reply>/g, "")
    .replace(/\b[A-Z][A-Z_]{2,}_END\b/g, "")
    .trim();
}

function parseVisibleThought(raw) {
  const thoughtMatch = raw.match(/<visible_thought>([\s\S]*?)<\/visible_thought>/);
  if (!thoughtMatch) return { thought: null, reply: stripThinking(raw) };
  const thought = thoughtMatch[1].trim().slice(0, 60);
  const replyMatch = raw.match(/<reply>([\s\S]*?)<\/reply>/s);
  const reply = replyMatch
    ? replyMatch[1].trim()
    : stripThinking(raw.replace(/<visible_thought>[\s\S]*?<\/visible_thought>/, "").trim());
  return { thought, reply: reply || stripThinking(raw) };
}

function base64DecodeUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function readDelta(chunk) {
  return chunk.choices?.[0]?.delta?.content || "";
}

function showLegacyDataNotice() {
  const notice = document.createElement("div");
  notice.id = "legacyNotice";
  notice.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg-raise);border:1px solid var(--border);border-radius:10px;padding:10px 16px;font-size:13px;color:var(--text-muted);z-index:500;max-width:90vw;text-align:center";
  notice.textContent = "检测到旧本地会话，当前版本暂不自动迁移。";
  const close = document.createElement("button");
  close.textContent = "✕";
  close.style.cssText = "background:none;border:none;color:var(--text-muted);cursor:pointer;margin-left:10px;font-size:14px;";
  close.addEventListener("click", () => notice.remove());
  notice.appendChild(close);
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 8000);
}


  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessQuote = {
    setReplyDraft,
    clearReplyDraft,
    renderReplyPreview,
    makeQuoteBlock,
    scrollToQuotedMessage,
    getMessageQuotePreview,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.makeQuoteBlock = makeQuoteBlock;
  window.scrollToQuotedMessage = scrollToQuotedMessage;
  window.getMessageQuotePreview = getMessageQuotePreview;
  window.setReplyDraft = setReplyDraft;
  window.clearReplyDraft = clearReplyDraft;
  window.renderReplyPreview = renderReplyPreview;

})();
