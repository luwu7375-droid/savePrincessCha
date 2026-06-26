// ============================================================================
// Message Renderer Module - Message Rendering & Display
// ============================================================================
// Extracted from app.js lines 600-786
// Handles message bubble rendering, multi-bubble splitting, and DOM creation

(function() {
  "use strict";

function addMessage(text, role, createdAt = new Date().toISOString(), options = {}, msgId = null) {
  if (!options.skipTimeSeparator) maybeAddTimeSeparator(createdAt);

  const speakerClass = role === "assistant" ? "cha-message" : role === "user" ? "user-message" : "system-message";
  const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // ── Detect parts ─────────────────────────────────────────────────────────
  const isArray = Array.isArray(text);
  const imageParts = isArray ? text.filter(p => p.type === "image_url" && p.image_url?.url) : [];
  const textParts  = isArray ? text.filter(p => p.type === "text" && p.text) : [];
  const hasImages  = imageParts.length > 0;
  const hasText    = textParts.length > 0 || (!isArray && text);

  // For user messages: read_by_cha_at comes from options (history load) or null (new send).
  // New sends start as "未读"; history loads use stored value.
  const readByChaAt = options.readByChaAt ?? null;

  // Helper: build a single msg-row and append to messageList
  function makeRow(id) {
    const row = document.createElement("div");
    row.className = `msg-row ${role}`;
    if (id) row.dataset.msgId = id;
    row.dataset.groupId = groupId;
    if (role === "assistant") {
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.title = "Cha";
      row.appendChild(avatar);
    }
    return row;
  }

  // Helper: build read-receipt element for user messages only
  function makeReceipt(isChaRead) {
    const el = document.createElement("div");
    el.className = "read-receipt";
    el.textContent = isChaRead ? "已读" : "未读";
    el.dataset.receiptState = isChaRead ? "read" : "unread";
    return el;
  }

  // ── Case 1: pure text (or system) ─────────────────────────────────────────
  if (!hasImages) {
    const el = document.createElement("div");
    el.className = `message ${role} ${speakerClass} message-text`;
    const cacheIdStr = msgId != null ? String(msgId) : (options.tempId || undefined);
    setMessageContent(el, isArray ? textParts.map(p => p.text).join("") : (text || ""), { messageId: cacheIdStr });
    if (options.replyTo) {
      el.prepend(makeQuoteBlock(options.replyTo));
    }
    const stack = document.createElement("div");
    stack.className = "msg-stack";
    stack.appendChild(el);
    if (role === "user") stack.appendChild(makeReceipt(!!readByChaAt));
    if (role === "assistant" && window.SPVoice) {
      const speakerBtn = window.SPVoice.createSpeakerButton(el, msgId);
      stack.appendChild(speakerBtn);
      window.SPVoice.attachVoicePlayback(el, speakerBtn, msgId);
    }
    const row = makeRow(msgId);
    row.appendChild(stack);
    messageList.appendChild(row);
    messageList.scrollTop = messageList.scrollHeight;
    return el;
  }

  // ── Case 2: has images (with or without text) ──────────────────────────��──
  let firstEl = null;

  // 2a. Text bubble (no receipt — receipt goes on last image row)
  if (hasText) {
    const el = document.createElement("div");
    el.className = `message ${role} ${speakerClass} message-text`;
    const cacheIdStr = msgId != null ? String(msgId) : (options.tempId || undefined);
    setMessageContent(el, isArray ? textParts.map(p => p.text).join("") : (text || ""), { messageId: cacheIdStr });
    if (options.replyTo) {
      el.prepend(makeQuoteBlock(options.replyTo));
    }
    const stack = document.createElement("div");
    stack.className = "msg-stack";
    stack.appendChild(el);
    if (role === "assistant" && window.SPVoice) {
      const speakerBtn = window.SPVoice.createSpeakerButton(el, msgId);
      stack.appendChild(speakerBtn);
      window.SPVoice.attachVoicePlayback(el, speakerBtn, msgId);
    }
    const row = makeRow(null);
    row.appendChild(stack);
    messageList.appendChild(row);
    if (!firstEl) firstEl = el;
  }

  // 2b. Image rows
  imageParts.forEach((part, idx) => {
    const isLast = idx === imageParts.length - 1;

    const img = document.createElement("img");
    img.className = "msg-image";
    img.src = part.image_url.url;
    img.alt = "";
    img.draggable = false;
    img.setAttribute("draggable", "false");
    img.setAttribute("loading", "lazy");
    img.style.webkitTouchCallout = "none";
    img.style.webkitUserSelect = "none";
    img.style.userSelect = "none";

    // 禁用图片的原生右键菜单和拖拽
    img.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    img.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    const el = document.createElement("div");
    el.className = `message ${role} ${speakerClass} message-image`;
    el.appendChild(img);

    // If pure images (no text) and first image, add quote block
    if (options.replyTo && !hasText && idx === 0) {
      el.prepend(makeQuoteBlock(options.replyTo));
    }

    const stack = document.createElement("div");
    stack.className = "msg-stack";
    stack.appendChild(el);

    if (role === "user" && isLast) stack.appendChild(makeReceipt(!!readByChaAt));

    const row = makeRow(isLast ? msgId : null);
    if (hasText || idx > 0) row.classList.add("msg-group-row");
    row.appendChild(stack);
    messageList.appendChild(row);
    if (!firstEl) firstEl = el;
  });

  messageList.scrollTop = messageList.scrollHeight;
  return firstEl;
}

// ── Multi-bubble helpers ───────────────────────────────────────────────────────

/** 按 ||| 切分原始回复，最多 3 条，超出的并到最后一条 */
function splitBubbles(rawText) {
  // ── Primary split: explicit ||| separator ────────────────────────────────
  if (rawText.includes("|||")) {
    const parts = rawText.split("|||").map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length <= 1) return [rawText.trim()];
    if (parts.length <= 3) return parts;
    // more than 3: merge tail into third
    return [parts[0], parts[1], parts.slice(2).join(" ")];
  }

  // ── Fallback split: Chinese sentence-ending punctuation ──────────────────
  const text = rawText.trim();
  // Short replies stay as one bubble
  if (text.length < 45) return [text];

  // Split on Chinese/common sentence-ending punctuation or newlines.
  // Keep the delimiter attached to the preceding segment.
  const segments = text.split(/(?<=[。！？；\n])/).map(s => s.trim()).filter(s => s.length > 0);
  if (segments.length <= 1) return [text];

  // Merge short tails (< 8 chars) into the preceding segment
  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && seg.length < 8) {
      merged[merged.length - 1] += seg;
    } else {
      merged.push(seg);
    }
  }

  // Cap at 3 bubbles: merge anything beyond index 1 into a second bubble
  if (merged.length === 1) return merged;
  if (merged.length === 2) return merged;
  // 3+: first bubble is merged[0], second is everything else joined
  return [merged[0], merged.slice(1).join("")];
}

/**
 * 渲染 assistant 消息，自动处理 ||| 切分。
 * 同步插入（历史渲染用）：insertBubbleSync
 * 逐条延迟插入（新回复用）：insertBubblesAnimated（返回 Promise）
 */


  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessMessageRenderer = {
    addMessage,
    splitBubbles,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.addMessage = addMessage;
  window.splitBubbles = splitBubbles;

})();
