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

/**
 * 按 ||| 切分原始回复（模型显式分段），最多 5 条。
 * fallback 自动切分最多 3 条，保守兜底。
 */
function splitBubbles(rawText) {
  const MAX_EXPLICIT = 5;
  const MAX_FALLBACK = 3;
  const MIN_BUBBLE_CHARS = 6;

  // ── Primary split: explicit ||| separator ────────────────────────────────
  if (rawText.includes("|||")) {
    const parts = rawText.split("|||").map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length <= 1) return [rawText.trim()];
    if (parts.length <= MAX_EXPLICIT) return parts;
    // more than 5: merge tail into the 5th bubble
    const result = parts.slice(0, MAX_EXPLICIT - 1);
    result.push(parts.slice(MAX_EXPLICIT - 1).join(""));
    return result;
  }

  // ── Fallback split: conservative auto-split ──────────────────────────────
  const text = rawText.trim();
  // Short replies stay as one bubble
  if (text.length < 45) return [text];

  // Split on newlines first, then on sentence-ending punctuation with a
  // following clause start (转折词、语气转换). Keep delimiter attached.
  const segments = text
    .split(/(?<=[\n])|(?<=[。！？；])(?=\s*(?:但|不过|然后|而且|可是|所以|就是|其实|话说|对了|哦对|嗯|啊|哈|诶))/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (segments.length <= 1) {
    // Try plain sentence-ending split for longer texts
    const plainSegs = text.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(s => s.length > 0);
    if (plainSegs.length <= 1) return [text];
    return mergeFallbackSegments(plainSegs, MAX_FALLBACK, MIN_BUBBLE_CHARS);
  }

  return mergeFallbackSegments(segments, MAX_FALLBACK, MIN_BUBBLE_CHARS);
}

/** Merge short segments and cap total count for fallback splitting */
function mergeFallbackSegments(segments, maxBubbles, minChars) {
  // Merge short segments (< minChars) into the preceding one
  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && seg.length < minChars) {
      merged[merged.length - 1] += seg;
    } else {
      merged.push(seg);
    }
  }

  if (merged.length <= 1) return merged;
  if (merged.length <= maxBubbles) return merged;

  // Cap: keep first (maxBubbles - 1) and merge the rest into the last
  const result = merged.slice(0, maxBubbles - 1);
  result.push(merged.slice(maxBubbles - 1).join(""));
  return result;
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
