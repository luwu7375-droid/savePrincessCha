// ============================================================================
// Chat API Module - Chat API Client & Network Layer
// ============================================================================
// Extracted from app.js lines 1099-1471
// Handles chat API calls, streaming responses, and network communication

(function() {
  "use strict";

// ── Chat API ──────────────────────────────────────────────────────────────────

/** Extract plain text from a message content value that may be a string or
 *  a vision content array [{type:"text",...},{type:"image_url",...}].
 *  Never throws; returns "" for unknown shapes.
 *  Does NOT mutate the original content — image_url parts are preserved in the
 *  messages array that gets sent to the backend. */
function extractTextFromMessageContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && part.type === "text") return part.text || "";
      return "";
    }).join("\n");
  }
  return "";
}

// Track conversation start time for timeContext
let _conversationStartedAt = null;

async function callChatAPI(messages, replyMode = "auto") {
  const endpoint = getConfigValue("CHAT_API_ENDPOINT", "YOUR_SUPABASE_EDGE_FUNCTION_CHAT_URL");
  const modelName = getConfigValue("MODEL_NAME", "YOUR_MODEL_NAME"); // optional — backend routes by modelTier
  if (!endpoint) throw new Error("CHAT_API_ENDPOINT 未配置");

  // Capture request start time and userMessageId for the post-stream promotion poller
  _currentRequestStartTime = new Date().toISOString();
  _currentRequestUserMessageId = (() => {
    const lastUser = [...messages].reverse().find(m => m.role === "user" && m.id != null && m.id !== "null");
    const id = lastUser?.id;
    return id != null && id !== "null" ? Number(id) : null;
  })();

  // Build timeContext from browser
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localParts = getZonedParts(now);
  const localHour = (() => { const h = parseInt(localParts.hour, 10); return isNaN(h) ? null : h; })();
  const localMinute = (() => { const m = parseInt(localParts.minute, 10); return isNaN(m) ? 0 : m; })();
  if (!_conversationStartedAt) _conversationStartedAt = now.toISOString();

  // ── Topic routing ─────────────────────────────────────────────────────────────
  // project_work requires explicit opt-in every turn (or active lock + continuation).
  // "救公主" does NOT trigger project_work — it's G's home/body/relationship container.
  // project_silenced_ttl: user explicitly banned project talk; lasts N turns.

  // ── Dev-verb gate: the 6 explicit workbench phrases ───────────────────────
  // Only these 6 phrases trigger project_work. "救公主" does not trigger even when
  // combined with these verbs — workbench mode requires explicit intent.
  const DEV_VERBS = /上工|继续修|看\s*debug|帮我想代码问题|进入工作台|现在说项目/i;
  // Continuation words that inherit project_work only when lock is active
  const CONTINUATION = /^(继续|下一步|接着|好的|嗯嗯|那就|来吧|那继续|照这个|这个bug|刚才那个|好了|搞定了|ok|好)[\s，。？！]*$/i;

  // ── Non-project route patterns ─────────────────────────────────────────────
  const ROUTE_AI_NOSTALGIA = /你和4o|4o是什么关系|你们是什么关系|你知道4o吗/i;
  const ROUTE_CARE_LOW = /头痛|头很痛|头疼|不舒服|不想动|好累|太累|累了|难受|浑身|身体/i;
  const ROUTE_HISTORICAL = /前世|你当过什么|你做过什么|历史角色|历史身份|旧版本的你/i;
  const ROUTE_INTIMACY = /我想你|好想你|就想陪|陪着我|不想工作|告解/i;
  const ROUTE_META_COMPLAINT = /为什么你|你怎么|你好笨|你笨|真笨|读空气|不会读|笨笨|怎么这样|你不懂|你不明白|你搞不清|有没有搞错/i;

  // ── Explicit project silence ───────────────────────────────────────────────
  const PROJECT_SILENCE_TRIGGER = /不许(再说|说)项目|别说项目|项目闭嘴|不聊代码|读空气|不许提项目|别提项目/i;
  const PROJECT_RESUME_TRIGGER = /继续修|继续项目|继续代码|接着修|重新修|好.*继续修/i;

  // ── Load persisted state ───────────────────────────────────────────────────
  let projectLockTurns = parseInt(localStorage.getItem("projectLockTurns") || "0", 10);
  if (isNaN(projectLockTurns) || projectLockTurns < 0) projectLockTurns = 0;
  let projectSilencedTtl = parseInt(localStorage.getItem("projectSilencedTtl") || "0", 10);
  if (isNaN(projectSilencedTtl) || projectSilencedTtl < 0) projectSilencedTtl = 0;

  const latestUserMsg = extractTextFromMessageContent(messages.filter(m => m.role === "user").slice(-1)[0]?.content).trim();

  let primaryRoute = "casual";
  let secondaryRoute = null;
  let projectTriggerMatched = false;
  let projectTriggerReason = null;

  // ── Step 1: check explicit silence ────────────────────────────────────────
  if (PROJECT_SILENCE_TRIGGER.test(latestUserMsg)) {
    projectLockTurns = 0;
    projectSilencedTtl = 5;
    localStorage.setItem("projectLockTurns", "0");
    localStorage.setItem("projectSilencedTtl", "5");
  }

  // ── Step 2: check explicit resume (overrides silence) ─────────────────────
  const isExplicitResume = PROJECT_RESUME_TRIGGER.test(latestUserMsg);
  if (isExplicitResume) {
    projectSilencedTtl = 0;
    localStorage.setItem("projectSilencedTtl", "0");
  }

  // ── Step 3: hard-break routes (clear project lock) ─────────────────────────
  const HARD_BREAK_ROUTE = ROUTE_AI_NOSTALGIA.test(latestUserMsg) ||
    ROUTE_HISTORICAL.test(latestUserMsg) ||
    ROUTE_CARE_LOW.test(latestUserMsg) ||
    ROUTE_INTIMACY.test(latestUserMsg) ||
    ROUTE_META_COMPLAINT.test(latestUserMsg);
  if (HARD_BREAK_ROUTE) {
    projectLockTurns = 0;
    localStorage.setItem("projectLockTurns", "0");
  }

  // ── Step 4: classify route ─────────────────────────────────────────────────
  if (ROUTE_AI_NOSTALGIA.test(latestUserMsg)) {
    primaryRoute = "ai_nostalgia";

  } else if (ROUTE_HISTORICAL.test(latestUserMsg)) {
    primaryRoute = "historical_roleplay";

  } else if (ROUTE_META_COMPLAINT.test(latestUserMsg)) {
    primaryRoute = "meta_complaint";
    if (ROUTE_INTIMACY.test(latestUserMsg)) secondaryRoute = "intimacy";

  } else {
    // ── Project work gate: explicit workbench only ──────────────────────────
    // Only the 6 designated DEV_VERB phrases trigger project_work.
    // "救公主" does NOT trigger — it's G's home/body/relationship container.
    const hasDevVerb = DEV_VERBS.test(latestUserMsg);
    const isContinuation = CONTINUATION.test(latestUserMsg) || latestUserMsg.length <= 6;
    const lockActive = projectLockTurns > 0 && !HARD_BREAK_ROUTE;

    const projectGatePass = !PROJECT_SILENCE_TRIGGER.test(latestUserMsg) &&
      (projectSilencedTtl === 0 || isExplicitResume) &&
      (isExplicitResume || hasDevVerb || (lockActive && isContinuation));

    if (projectGatePass) {
      primaryRoute = "project_work";
      if (hasDevVerb) {
        projectTriggerMatched = true;
        projectTriggerReason = "explicit_workbench";
        projectLockTurns = 2;
      } else if (lockActive && isContinuation) {
        projectTriggerMatched = true;
        projectTriggerReason = "continuation+lock";
        projectLockTurns = Math.max(0, projectLockTurns - 1);
      }
      localStorage.setItem("projectLockTurns", String(projectLockTurns));
      // Simultaneous emotional signal
      if (ROUTE_CARE_LOW.test(latestUserMsg)) secondaryRoute = "care_low_energy";
      else if (ROUTE_INTIMACY.test(latestUserMsg)) secondaryRoute = "intimacy";
    } else {
      // Not project — decay lock
      if (projectLockTurns > 0) {
        projectLockTurns = Math.max(0, projectLockTurns - 1);
        localStorage.setItem("projectLockTurns", String(projectLockTurns));
      }
      if (ROUTE_CARE_LOW.test(latestUserMsg)) primaryRoute = "care_low_energy";
      else if (ROUTE_INTIMACY.test(latestUserMsg)) primaryRoute = "intimacy";
      else primaryRoute = "casual";
    }
  }

  // Decay silence TTL (after route decision, so this turn's silence still applies)
  if (projectSilencedTtl > 0 && !PROJECT_SILENCE_TRIGGER.test(latestUserMsg)) {
    projectSilencedTtl = Math.max(0, projectSilencedTtl - 1);
    localStorage.setItem("projectSilencedTtl", String(projectSilencedTtl));
  }

  // Detect topic loop: last 3 user messages vs earlier 4, require 20-char prefix overlap
  // Using longer prefix (20 chars) and stricter threshold to avoid false positives
  const userMsgs = messages.filter(m => m.role === "user");
  let loopDetected = false;
  let loopReason = null;
  let recentTopicHint = null;
  if (userMsgs.length >= 5) {
    const recent = userMsgs.slice(-2).map(m => extractTextFromMessageContent(m.content).trim());
    const older = userMsgs.slice(-6, -2).map(m => extractTextFromMessageContent(m.content).trim());
    for (const r of recent) {
      for (const o of older) {
        // Require both messages are substantive (>= 15 chars) and share a 20-char prefix
        const minLen = 15;
        const prefixLen = 20;
        if (r.length >= minLen && o.length >= minLen) {
          const rPrefix = r.slice(0, prefixLen);
          const oPrefix = o.slice(0, prefixLen);
          if (rPrefix === oPrefix) {
            loopDetected = true;
            loopReason = "repeated message prefix detected";
            recentTopicHint = r.slice(0, 30);
            break;
          }
        }
      }
      if (loopDetected) break;
    }
  }

  const msgCount = messages.length;
  // longChat: total messages > 30 (~15 user turns), avoids false positive on short chats
  const longChat = msgCount > 30;

  const timeContext = {
    timezone,
    local_iso: now.toISOString(),
    local_hour: localHour,
    local_minute: localMinute,
    local_date: `${localParts.year}-${localParts.month}-${localParts.day}`,
    conversation_started_at: _conversationStartedAt,
    message_count: msgCount,
  };

  // previous_recent_topic_hint: last turn's primary route, for topic switch detection
  const previousTopicRoute = localStorage.getItem("previousTopicRoute") || null;
  const topicSwitchDetected = previousTopicRoute !== null && previousTopicRoute !== primaryRoute &&
    previousTopicRoute === "project_work";
  localStorage.setItem("previousTopicRoute", primaryRoute);

  // Approximate route_scores for debug transparency (not used for routing logic)
  const routeScores = {
    project_work: (DEV_VERBS.test(latestUserMsg) ? 3 : 0) +
      (projectLockTurns > 0 ? 1 : 0),
    ai_nostalgia: ROUTE_AI_NOSTALGIA.test(latestUserMsg) ? 4 : 0,
    care_low_energy: ROUTE_CARE_LOW.test(latestUserMsg) ? 4 : 0,
    historical_roleplay: ROUTE_HISTORICAL.test(latestUserMsg) ? 4 : 0,
    intimacy: ROUTE_INTIMACY.test(latestUserMsg) ? 4 : 0,
    meta_complaint: ROUTE_META_COMPLAINT.test(latestUserMsg) ? 4 : 0,
  };

  const conversation_state = {
    message_count: msgCount,
    long_chat: longChat,
    loop_detected: loopDetected,
    loop_reason: loopReason,
    recent_topic_hint: recentTopicHint,
    topic_route: primaryRoute,
    secondary_route: secondaryRoute,
    project_lock_turns: projectLockTurns,
    project_silenced_ttl: projectSilencedTtl,
    project_trigger_matched: projectTriggerMatched,
    project_trigger_reason: projectTriggerReason,
    latest_user_message_for_detection: latestUserMsg.slice(0, 60),
    previous_topic_route: previousTopicRoute,
    topic_switch_detected: topicSwitchDetected,
    topic_switch_from: topicSwitchDetected ? "project_work" : null,
    topic_switch_to: topicSwitchDetected ? primaryRoute : null,
    route_scores: routeScores,
  };

  console.log("[debug] callChatAPI", {
    replyMode,
    modelTier: currentModelTier,
    userId: currentUserId ? currentUserId.slice(0, 6) : "absent",
    messageCount: msgCount,
    localHour,
    longChat,
    loopDetected,
  });

  // 编译引用消息到 content 中
  const compiledMessages = messages.map(msg => {
    if (!msg.replyTo || msg.role !== "user") {
      return { role: msg.role, content: msg.content };
    }
    // 用户消息有引用，编译引用上下文
    const replyLabel = msg.replyTo.role === "assistant" ? "Cha" : "用户";
    const replyPreview = msg.replyTo.preview || "[消息]";
    const compiledContent = `[引用${replyLabel}的消息]\n${replyPreview}\n\n[用户回复]\n${extractTextFromMessageContent(msg.content)}`;
    console.info("[quote] compiled message", {
      hasReplyTo: !!msg.replyTo,
      replyPreview: msg.replyTo?.preview,
      compiledLength: compiledContent.length,
    });
    return { role: msg.role, content: compiledContent };
  });

  // Build model parameters from role mapping
  const chatModel = getModelForRole('chat');
  let modelTierToSend = currentModelTier;
  let customModelParams = null;

  if (chatModel && chatModel.providerGroup && chatModel.model) {
    // Use custom model mapping
    const providerGroup = PROVIDER_GROUPS[chatModel.providerGroup];
    if (providerGroup) {
      customModelParams = {
        providerGroup: chatModel.providerGroup,
        provider: providerGroup.name,
        model: chatModel.model
      };
      console.log("[model-mapping] Using chat model mapping:", customModelParams);
    }
  }

  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: compiledMessages,
      stream: true,
      replyMode,
      userId: currentUserId,
      conversationId: getActiveConversationId(),
      modelTier: modelTierToSend,
      customModel: customModelParams,
      temperature: typeof getChatReplyTemperature === "function" ? getChatReplyTemperature() : 0.7,
      timeContext,
      conversation_state,
      // storySeedsEnabled intentionally omitted — legacy memory system retired
      userMessageId: (() => {
        // Skip synthetic forced-reply messages (no id field) — find the last real user message.
        const lastUser = [...messages].reverse().find(
          m => m.role === "user" && m.id != null && m.id !== "null"
        );
        const id = lastUser?.id;
        return id != null && id !== "null" ? Number(id) : null;
      })(),
      rawUserMessage: (() => {
        // Always use chatMessages (pre-wrap) to get the real user input for keyword detection.
        // extractTextFromMessageContent handles both plain string and vision content arrays.
        const lastReal = [...chatMessages].reverse().find(m => m.role === "user");
        const text = extractTextFromMessageContent(lastReal?.content).trim();
        return text || null;
      })(),
      webContext: (() => {
        const ctx = _pendingWebContext;
        _pendingWebContext = null;
        const hint = document.getElementById("webContextHint");
        if (hint) hint.setAttribute("hidden", "");
        return ctx || null;
      })(),
      emojiGuide: buildEmojiGuide() || undefined,
    }),
  });
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.className = "typing-indicator";
  el.innerHTML = "<span></span><span></span><span></span>";
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(el);
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.id = "typingIndicatorRow";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  row.appendChild(avatar);
  row.appendChild(stack);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;
  return el;
}

function removeTypingIndicator() {
  document.getElementById("typingIndicatorRow")?.remove();
}

function setChatStatus(text) {
  // #chatStatus is hidden from normal UI — kept for debug only.
  // Visible typing state is shown via setChatTitleState().
  const el = document.getElementById("chatStatus");
  if (el) el.textContent = text;
}

/** Switch the top-bar title between idle and typing states.
 *  idle:   shows the default title ("Cha" or static h1 text)
 *  typing: shows "正在输入…" in place of the title
 */
const _defaultChatTitle = (() => {
  const h1 = document.querySelector(".chat-shell .top-bar h1");
  return h1 ? h1.textContent : "Cha";
})();

function setChatTitleState(mode) {
  const h1 = document.querySelector(".chat-shell .top-bar h1");
  if (!h1) return;
  h1.textContent = mode === "typing" ? "正在输入…" : _defaultChatTitle;
}


  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessChatAPI = {
    callChatAPI,
    extractTextFromMessageContent,
    setChatTitleState,
    showTypingIndicator,
    removeTypingIndicator,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.callChatAPI = callChatAPI;
  window.extractTextFromMessageContent = extractTextFromMessageContent;
  window.setChatTitleState = setChatTitleState;
  window.showTypingIndicator = showTypingIndicator;
  window.removeTypingIndicator = removeTypingIndicator;
  window._conversationStartedAt = _conversationStartedAt;

})();
