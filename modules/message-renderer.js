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

  // ── PhotoStack Integration: Use stacked photo card for multiple images ──
  if (imageParts.length >= 2 && window.PhotoStackIntegration) {
    return window.PhotoStackIntegration.addMessageWithPhotoStack(
      text, role, createdAt, options, msgId
    );
  }

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
 * 含 markdown 链接时自动拆出独立气泡；每条气泡控制在 ~3 行以内。
 */
function splitBubbles(rawText) {
  const MAX_EXPLICIT = 3;   // 远程保守设置：||| 最多 3 条
  const MAX_WITH_LINKS = 5; // 提取链接后允许稍多
  const MIN_BUBBLE_CHARS = 10; // 远程保守设置
  const MAX_CHARS_PER_BUBBLE = 65; // ~3 行 CJK 内容

  // ── Primary split: explicit ||| separator ────────────────────────────────
  if (rawText.includes("|||")) {
    const parts = rawText.split("|||").map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length <= 1) return extractLinkBubbles([rawText.trim()], MAX_WITH_LINKS);
    // Merge short fragments to keep human rhythm, then extract links
    const merged = mergeFallbackSegments(parts, MAX_EXPLICIT, MIN_BUBBLE_CHARS);
    return extractLinkBubbles(merged, MAX_WITH_LINKS);
  }

  // No explicit separator: one bubble, but still extract any inline links
  const text = rawText.trim();
  const longSplit = splitLongSegment(text, MAX_CHARS_PER_BUBBLE).slice(0, 2);
  return extractLinkBubbles(longSplit, MAX_WITH_LINKS);
}

/**
 * 把含 markdown 链接的气泡拆分：文字部分 + 独立链接气泡。
 * [text](url) 会单独成一条气泡。
 */
function extractLinkBubbles(parts, maxTotal) {
  const LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const result = [];
  for (const part of parts) {
    if (!LINK_RE.test(part)) {
      result.push(part);
      LINK_RE.lastIndex = 0;
      continue;
    }
    LINK_RE.lastIndex = 0;
    let lastEnd = 0;
    let match;
    while ((match = LINK_RE.exec(part)) !== null) {
      const before = part.slice(lastEnd, match.index).trim();
      if (before) result.push(before);
      result.push(match[0]); // link as its own bubble
      lastEnd = match.index + match[0].length;
    }
    const after = part.slice(lastEnd).trim();
    if (after) result.push(after);
  }
  const filtered = result.filter(s => s.length > 0);
  if (filtered.length <= maxTotal) return filtered;
  // Cap: keep first (maxTotal-1), merge the rest into the last
  const capped = filtered.slice(0, maxTotal - 1);
  capped.push(filtered.slice(maxTotal - 1).join(""));
  return capped;
}

/**
 * 当单段内容超过 maxChars 时，在末尾句号/问号/换行处自然截断，递归拆分。
 */
function splitLongSegment(text, maxChars) {
  if (text.length <= maxChars) return [text];
  // Search backward from maxChars for a natural break
  const breakRe = /[。！？；\n]/;
  let splitAt = -1;
  const searchFrom = Math.min(maxChars, text.length - 1);
  for (let i = searchFrom; i >= Math.floor(maxChars * 0.4); i--) {
    if (breakRe.test(text[i])) {
      splitAt = i + 1;
      break;
    }
  }
  if (splitAt === -1) return [text]; // no good break — keep as is
  const first = text.slice(0, splitAt).trim();
  const rest  = text.slice(splitAt).trim();
  if (!first || !rest) return [text];
  return [first, ...splitLongSegment(rest, maxChars)];
>>>>>>> 5679339 (fix(renderer): 支持 markdown 链接渲染，链接独立气泡，改进3行自然截断)
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
