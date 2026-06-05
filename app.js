console.log("build cloudflare-0038");

// ── Config / Supabase ─────────────────────────────────────────────────────────

const appConfig = window.SAVE_PRINCESS_CONFIG || {};

function getConfigValue(key, placeholder) {
  const value = appConfig[key];
  return (!value || value === placeholder) ? "" : value;
}

function createSupabaseClient() {
  const url = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");
  const key = getConfigValue("SUPABASE_ANON_KEY", "YOUR_SUPABASE_ANON_KEY");
  if (!url || !key || !window.supabase) return null;
  return window.supabase.createClient(url, key);
}

const supabaseClient = createSupabaseClient();
const welcomeMessage = "欢迎回家，kk。";
let currentUserId = "";
const _VALID_TIERS_INIT = ["instant", "general", "advanced"];
const _storedTier = localStorage.getItem("modelTier");
let currentModelTier = _VALID_TIERS_INIT.includes(_storedTier) ? _storedTier : "general";
// Sanitise: if stored value was invalid, overwrite it so localStorage stays clean.
if (!_VALID_TIERS_INIT.includes(_storedTier)) localStorage.setItem("modelTier", "general");

// ── DOM refs ──────────────────────────────────────────────────────────────────

const chatForm          = document.getElementById("chatForm");
const messageInput      = document.getElementById("messageInput");
const messageList       = document.getElementById("messageList");
const toggleMemoryButton = document.getElementById("toggleMemoryButton");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const memoryOverlay     = document.getElementById("memoryOverlay");
const memoryList        = document.getElementById("memoryList");
const memoryInput       = document.getElementById("memoryInput");
const memoryDomainSelect = document.getElementById("memoryDomainSelect");
const addMemoryButton   = document.getElementById("addMemoryButton");
const newConvButton     = document.getElementById("newConvButton");
const convList          = document.getElementById("convList");
const sidebar           = document.getElementById("sidebar");
const sidebarToggle     = document.getElementById("sidebarToggle");
const themeButton       = document.getElementById("themeButton");
const loginOverlay      = document.getElementById("loginOverlay");
const loginEmail        = document.getElementById("loginEmail");
const loginMsg          = document.getElementById("loginMsg");
const loginPassword      = document.getElementById("loginPassword");
const loginBtn          = document.getElementById("loginBtn");
const logoutBtn         = document.getElementById("logoutBtn");

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
const themeOrder = ["system", "light", "dark"];
const themeLabelMap = {
  system: "系统",
  light: "浅色",
  dark: "深色",
};

function getThemeMode() {
  const stored = localStorage.getItem("theme");
  return themeOrder.includes(stored) ? stored : "system";
}

function getEffectiveTheme(mode = getThemeMode()) {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return themeMediaQuery.matches ? "light" : "dark";
}

function applyTheme(mode = getThemeMode()) {
  const effectiveTheme = getEffectiveTheme(mode);
  if (effectiveTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  themeButton.textContent = themeLabelMap[mode] || "系统";
  themeButton.title = `主题：${mode === "system" ? "跟随系统" : mode === "light" ? "浅色" : "深色"}`;
  themeButton.setAttribute("aria-label", themeButton.title);
}

function setThemeMode(mode) {
  localStorage.setItem("theme", mode);
  applyTheme(mode);
}

applyTheme();

themeButton.addEventListener("click", () => {
  const currentMode = getThemeMode();
  const nextMode = themeOrder[(themeOrder.indexOf(currentMode) + 1) % themeOrder.length];
  setThemeMode(nextMode);
});

const onSystemThemeChange = () => {
  if (getThemeMode() === "system") applyTheme("system");
};
if (typeof themeMediaQuery.addEventListener === "function") {
  themeMediaQuery.addEventListener("change", onSystemThemeChange);
} else if (typeof themeMediaQuery.addListener === "function") {
  themeMediaQuery.addListener(onSystemThemeChange);
}

// ── Conversations (Supabase) ──────────────────────────────────────────────────

// In-memory cache of the conversation list for the current session
let conversationsCache = [];

function getActiveConversationId() {
  return localStorage.getItem("active_conversation_id");
}

function setActiveConversationId(id) {
  localStorage.setItem("active_conversation_id", id);
}

async function loadConversationsFromDB() {
  const { data, error } = await supabaseClient
    .from("conversations")
    .select("id, title, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { console.error("加载会话列表失败：", error); return []; }
  return data || [];
}

async function initConversations() {
  conversationsCache = await loadConversationsFromDB();

  // Warn if old localStorage conversations exist
  const oldConvs = (() => { try { return JSON.parse(localStorage.getItem("conversations") || "[]"); } catch { return []; } })();
  if (oldConvs.length > 0 && conversationsCache.length === 0) {
    showLegacyDataNotice();
  }

  // Ensure active conversation is valid
  let activeId = getActiveConversationId();
  if (!activeId || !conversationsCache.find(c => c.id === activeId)) {
    if (conversationsCache.length > 0) {
      activeId = conversationsCache[0].id;
    } else {
      // No conversations at all — create one
      activeId = await createConversation("新会话");
    }
    setActiveConversationId(activeId);
  }

  renderConvList();
  return activeId;
}

async function createConversation(title) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from("conversations")
    .insert({ title, user_id: user.id })
    .select("id, title, pinned, created_at")
    .single();
  if (error) { console.error("创建会话失败：", error); return null; }
  conversationsCache.unshift(data);
  return data.id;
}

async function updateConvTitle(id, firstUserMessage) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv || conv.title !== "新会话" || !firstUserMessage) return;
  const title = firstUserMessage.slice(0, 20);
  conv.title = title;
  renderConvList();
  await supabaseClient.from("conversations").update({ title }).eq("id", id);
}

function renderConvList() {
  const activeId = getActiveConversationId();
  convList.innerHTML = "";
  for (const conv of conversationsCache) {
    const li = document.createElement("li");
    if (conv.pinned) li.classList.add("pinned");
    if (conv.id === activeId) li.classList.add("active");

    const titleRow = document.createElement("div");
    titleRow.className = "conv-title-row";

    const title = document.createElement("span");
    title.className = "conv-title";
    title.textContent = conv.title || "新会话";
    title.addEventListener("click", () => switchConversation(conv.id));

    const timeEl = document.createElement("span");
    timeEl.className = "conv-time";
    timeEl.textContent = formatConvTime(conv.updated_at || conv.created_at);

    titleRow.appendChild(title);
    titleRow.appendChild(timeEl);

    const menuBtn = document.createElement("button");
    menuBtn.className = "conv-menu-btn";
    menuBtn.type = "button";
    menuBtn.textContent = "···";
    menuBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openConvMenu(conv.id, menuBtn);
    });

    li.appendChild(titleRow);
    li.appendChild(menuBtn);
    li.addEventListener("click", () => switchConversation(conv.id));
    convList.appendChild(li);
  }
}

let activeMenu = null;

function closeActiveMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

function openConvMenu(id, anchor) {
  closeActiveMenu();
  const conv = conversationsCache.find(c => c.id === id);
  const menu = document.createElement("div");
  menu.className = "conv-menu";

  const actions = [
    { label: "重命名", fn: () => renameConv(id) },
    { label: conv?.pinned ? "取消置顶" : "置顶", fn: () => pinConv(id) },
    { label: "抹掉", fn: () => deleteConv(id), danger: true },
  ];

  for (const a of actions) {
    const btn = document.createElement("button");
    btn.textContent = a.label;
    if (a.danger) btn.classList.add("danger");
    btn.addEventListener("click", (e) => { e.stopPropagation(); closeActiveMenu(); a.fn(); });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const menuW = menu.offsetWidth || 120;
  const menuH = menu.offsetHeight || 110;
  const margin = 6;
  let top = rect.bottom + 4;
  let left = rect.left - menuW + anchor.offsetWidth;
  // Clamp to viewport
  left = Math.max(margin, Math.min(left, window.innerWidth - menuW - margin));
  top  = Math.max(margin, Math.min(top,  window.innerHeight - menuH - margin));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  setTimeout(() => document.addEventListener("click", closeActiveMenu, { once: true }), 0);
}

function renameConv(id) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv) return;
  showDialog({
    title: "重命名会话",
    input: conv.title || "新会话",
    confirmLabel: "确定",
    onConfirm: async (name) => {
      const title = name || "新会话";
      conv.title = title;
      renderConvList();
      await supabaseClient.from("conversations").update({ title }).eq("id", id);
    }
  });
}

async function pinConv(id) {
  const conv = conversationsCache.find(c => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  conversationsCache.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  renderConvList();
  await supabaseClient.from("conversations").update({ pinned: conv.pinned }).eq("id", id);
}

async function deleteConv(id) {
  showDialog({
    title: "抹掉这段？",
    body: "这段记录会从这里消失。",
    confirmLabel: "抹掉",
    confirmClass: "btn-danger",
    onConfirm: async () => {
      conversationsCache = conversationsCache.filter(c => c.id !== id);
      await supabaseClient.from("messages").delete().eq("conversation_id", id);
      await supabaseClient.from("conversations").delete().eq("id", id);

      if (getActiveConversationId() === id) {
        if (conversationsCache.length) {
          setActiveConversationId(conversationsCache[0].id);
          await reloadHistory();
        } else {
          const newId = await createConversation("新会话");
          setActiveConversationId(newId);
          chatMessages.length = 0;
          renderWelcomeMessage();
        }
      }
      renderConvList();
    }
  });
}

async function switchConversation(id) {
  setActiveConversationId(id);
  renderConvList();
  await reloadHistory();
  if (window.matchMedia("(max-width: 820px)").matches) closeMobileSidebar();
}

// ── Dialog helper ─────────────────────────────────────────────────────────────

function showDialog({ title, body, input, inputType = "text", confirmLabel, confirmClass, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  dialog.appendChild(h3);

  if (body) {
    const p = document.createElement("p");
    p.textContent = body;
    dialog.appendChild(p);
  }

  let inp = null;
  if (input !== undefined) {
    inp = document.createElement("input");
    inp.type = inputType;
    inp.value = input;
    if (inputType === "password") inp.autocomplete = "current-password";
    dialog.appendChild(inp);
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.className = confirmClass || "btn-confirm";
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener("click", () => {
    overlay.remove();
    onConfirm(inp ? inp.value.trim() : null);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  if (inp) { inp.focus(); inp.select(); }
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") confirmBtn.click(); });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const APP_TIME_ZONE = "Asia/Shanghai";

function parseDbTime(value) {
  if (!value) return null;
  const s = String(value);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

function getZonedParts(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function zonedDayKey(date) {
  const p = getZonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

const chatMessages = [];
let lastMessageTime = null;

function formatMsgTime(iso) {
  const d = parseDbTime(iso);
  if (!d) return "";
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const p = getZonedParts(d);
  const todayKey = zonedDayKey(now);
  const yestKey = zonedDayKey(new Date(now - 86400000));
  const dKey = zonedDayKey(d);
  if (dKey === todayKey) return `今天 ${p.hour}:${p.minute}`;
  if (dKey === yestKey) return `昨天 ${p.hour}:${p.minute}`;
  const nowP = getZonedParts(now);
  if (p.year === nowP.year) return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function formatConvTime(iso) {
  const d = parseDbTime(iso);
  if (!d) return "";
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const p = getZonedParts(d);
  const todayKey = zonedDayKey(now);
  const yestKey = zonedDayKey(new Date(now - 86400000));
  const dKey = zonedDayKey(d);
  if (dKey === todayKey) return `今天 ${p.hour}:${p.minute}`;
  if (dKey === yestKey) return "昨天";
  const nowP = getZonedParts(now);
  if (p.year === nowP.year) return `${p.month}-${p.day}`;
  return `${p.year}-${p.month}-${p.day}`;
}

function maybeAddTimeSeparator(createdAt) {
  const d = parseDbTime(createdAt);
  if (!d) return;
  const t = d.getTime();
  const isFirst = lastMessageTime === null;
  const gap = lastMessageTime !== null ? t - lastMessageTime : Infinity;
  const crossDay = lastMessageTime !== null &&
    zonedDayKey(new Date(lastMessageTime)) !== zonedDayKey(d);
  if (isFirst || crossDay || gap > 5 * 60 * 1000) {
    lastMessageTime = t;
    const div = document.createElement("div");
    div.className = "time-separator";
    div.textContent = formatMsgTime(createdAt);
    messageList.appendChild(div);
  } else {
    lastMessageTime = t;
  }
}

function addMessage(text, role, createdAt = new Date().toISOString(), options = {}, msgId = null) {
  if (!options.skipTimeSeparator) maybeAddTimeSeparator(createdAt);
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(el);
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  if (msgId) row.dataset.msgId = msgId;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    row.appendChild(avatar);
  }
  row.appendChild(stack);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;
  return el;
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
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/, "").trim();
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

// ── DB ────────────────────────────────────────────────────────────────────────

async function saveMessage(role, content) {
  if (!supabaseClient) return null;
  const conversationId = getActiveConversationId();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from("messages")
    .insert({ role, content, conversation_id: conversationId, user_id: user.id })
    .select("id")
    .single();
  if (error) { console.error("保存消息失败：", error); return null; }
  supabaseClient.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).then(() => {});
  return data?.id || null;
}

async function reloadHistory() {
  if (!supabaseClient) { renderWelcomeMessage(); return; }
  const conversationId = getActiveConversationId();
  if (!conversationId) { renderWelcomeMessage(); return; }
  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) { renderWelcomeMessage(); console.error(error); return; }

  const history = [...data].reverse();
  chatMessages.length = 0;
  messageList.innerHTML = "";
  lastMessageTime = null;
  if (!history.length) { renderWelcomeMessage(); return; }
  for (const m of history) {
    addMessage(m.content, m.role, m.created_at, {}, m.id);
    chatMessages.push({ role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null });
  }
  refreshMessageActions();
}

// ── Chat API ──────────────────────────────────────────────────────────────────

async function callChatAPI(messages, replyMode = "auto") {
  const endpoint = getConfigValue("CHAT_API_ENDPOINT", "YOUR_SUPABASE_EDGE_FUNCTION_CHAT_URL");
  const modelName = getConfigValue("MODEL_NAME", "YOUR_MODEL_NAME");
  if (!endpoint) throw new Error("CHAT_API_ENDPOINT 未配置");
  if (!modelName) throw new Error("MODEL_NAME 未配置");
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: `不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。日常聊天、情绪回应、普通问答，控制在 1-3 段内，每段不超过 2 句，不主动写长列表。
日常闲聊只回应用户刚刚那句话，不复盘、不总结、不安排下一步、不主动推进任务，学习模仿用户的句子长度。 
如果用户明确要求“详细、展开、分析、写代码、排查 bug、写方案、写 PRD、总结文档”，则优先完整解决问题，不限制长度。
不要为了凑字解释显而易见的事情。\n\n当前应用时间：${(() => { const p = getZonedParts(new Date()); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; })()}\n当前应用时区：UTC+8 / Asia/Shanghai\n涉及今天、昨天、现在几点、刚才、上次对话时，一律以当前应用时间为准。` },
        ...messages.map(({ role, content }) => ({ role, content })),
      ],
      stream: true,
      replyMode,
      userId: currentUserId,
      modelTier: currentModelTier,
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
  const el = document.getElementById("chatStatus");
  if (el) el.textContent = text;
}

async function requestStreamingReply(replyMode = "auto") {
  const messages = replyMode === "forced"
    ? [...chatMessages, { role: "user", content: "继续推进，别重复刚才说过的" }]
    : chatMessages;
  const response = await callChatAPI(messages, replyMode);
  if (!response.ok || !response.body) {
    const raw = await response.text();
    // Translate common upstream errors to user-friendly messages
    const lower = raw.toLocaleLowerCase();
    let friendly = `请求失败（${response.status}）`;
    if (lower.includes("insufficient credits") || lower.includes("insufficient_credits")) {
      friendly = "当前模型额度不足，已尝试切换备用模型，请稍后重试。";
    } else if (response.status === 429 || lower.includes("rate limit")) {
      friendly = "请求太频繁，请稍等片刻再试。";
    } else if (response.status >= 500) {
      friendly = "模型服务暂时异常，请稍后重试。";
    }
    throw new Error(friendly);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "", fullReply = "", streamDone = false;
  let assistantEl = null;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") { streamDone = true; break; }
      const delta = readDelta(JSON.parse(data));
      if (delta) {
        if (!assistantEl) {
          removeTypingIndicator();
          assistantEl = addMessage("", "assistant");
        }
        fullReply += delta;
        assistantEl.textContent = stripThinking(fullReply);
        messageList.scrollTop = messageList.scrollHeight;
      }
    }
  }
  if (!fullReply) throw new Error("未收到模型回复");
  const cleanReply = stripThinking(fullReply);
  if (cleanReply === "<NO_REPLY>") {
    removeTypingIndicator();
    if (assistantEl) assistantEl.closest(".msg-row")?.remove();
    return;
  }
  const replyTime = new Date().toISOString();
  const replyId = await saveMessage("assistant", cleanReply);
  chatMessages.push({ role: "assistant", content: cleanReply, created_at: replyTime, id: replyId != null ? String(replyId) : null });
  lastMessageTime = new Date(replyTime).getTime();
  if (assistantEl && replyId) { const savedRow = assistantEl.closest(".msg-row"); if (savedRow) savedRow.dataset.msgId = replyId; }
  refreshMessageActions();
}

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

function refreshMessageActions() {
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
    if (isAssistant && !row.dataset.msgId) continue;

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

async function copyMessage(row, btn) {
  const text = row.querySelector(".message")?.textContent || "";
  const feedback = (label) => {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = prev; }, 1200);
  };
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      feedback("已复制");
      return true;
    }
  } catch (error) {
    console.warn("clipboard copy failed, trying fallback", error);
  }
  try {
    if (fallbackCopy(text)) {
      feedback("已复制");
      return true;
    }
  } catch (error) {
    console.warn("fallback copy failed", error);
  }
  feedback("复制失败");
  return false;
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

async function regenerateMessage(row) {
  if (isReplying || row !== getLastMessageRow("assistant")) return;
  const msgId = row.dataset.msgId;
  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) return;
  closeMessageActionMenu();
  chatMessages.splice(idx, 1);
  row.remove();
  if (msgId) await supabaseClient.from("messages").delete().eq("id", msgId);
  triggerReply("forced");
}

async function editUserMessage(row) {
  if (row !== getLastMessageRow("user")) return;
  const msgId = row.dataset.msgId;
  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) return;
  closeMessageActionMenu();
  const oldContent = chatMessages[idx].content;
showDialog({
  title: "编辑消息",
  body: "编辑后，这条之后的回复会重新生成。",
  input: oldContent,
  confirmLabel: "确定",
  onConfirm: async (newContent) => {
      if (!newContent || newContent === oldContent) return;
      if (!msgId) return;

const { error: updateError } = await supabaseClient
  .from("messages")
  .update({ content: newContent })
  .eq("id", msgId);

if (updateError) {
  console.error("编辑消息失败：", updateError);
  addMessage(`编辑失败：${updateError.message}`, "assistant");
  return;
}

chatMessages[idx].content = newContent;
row.querySelector(".message").textContent = newContent;

const afterIdx = idx + 1;
const toRemove = chatMessages.slice(afterIdx);
chatMessages.splice(afterIdx);

for (const m of toRemove) {
  if (m.id) await supabaseClient.from("messages").delete().eq("id", m.id);
}

await reloadHistory();
await triggerReply("forced");
    }
  });
}

messageList.addEventListener("mouseenter", refreshMessageActions);
window.addEventListener("resize", () => {
  closeMessageActionMenu();
  refreshMessageActions();
});

let messageActionMenu = null;
let longPressTimer = null;
let longPressStart = null;
let longPressOpened = false;

function closeMessageActionMenu() {
  if (messageActionMenu) {
    messageActionMenu.remove();
    messageActionMenu = null;
  }
}

function placeMessageActionMenu(menu, x, y) {
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(margin, x - rect.width / 2), window.innerWidth - rect.width - margin);
  let top = y - rect.height - 10;
  if (top < margin) top = y + 10;
  top = Math.min(Math.max(margin, top), window.innerHeight - rect.height - margin);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function addMessageMenuButton(menu, label, action) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await action(btn);
  });
  menu.appendChild(btn);
}

function showMessageActionMenu(row, x, y) {
  closeMessageActionMenu();
  const isAssistant = row.classList.contains("assistant");
  const isUser = row.classList.contains("user");
  if (!isAssistant && !isUser) return;

  const menu = document.createElement("div");
  menu.className = "message-action-menu";
  addMessageMenuButton(menu, "复制", async (btn) => {
    await copyMessage(row, btn);
  });

  if (isUser && row === getLastMessageRow("user") && row.dataset.msgId) {
    addMessageMenuButton(menu, "编辑", () => editUserMessage(row));
  }
  if (isAssistant && canRegenerateRow(row)) {
    addMessageMenuButton(menu, "重新生成", () => regenerateMessage(row));
  }

  document.body.appendChild(menu);
  messageActionMenu = menu;
  placeMessageActionMenu(menu, x, y);
}

function startLongPress(row, x, y) {
  cancelLongPress();
  longPressOpened = false;
  longPressStart = { x, y };
  console.log("long press start");
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (longPressOpened) return;
    longPressOpened = true;
    console.log("long press menu open");
    if (navigator.vibrate) navigator.vibrate(8);
    showMessageActionMenu(row, x, y);
  }, 450);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressStart = null;
}

messageList.addEventListener("contextmenu", (e) => {
  if (!isMobileMessageActions()) return;
  if (e.target instanceof Element && e.target.closest(".message")) e.preventDefault();
});

messageList.addEventListener("scroll", () => {
  closeMessageActionMenu();
  cancelLongPress();
});

messageList.addEventListener("pointerdown", (e) => {
  if (!isMobileMessageActions()) return;
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(".msg-actions") || e.target.closest(".message-action-menu")) return;
  const bubble = e.target.closest(".message");
  const row = bubble?.closest(".msg-row");
  if (!bubble || !row || row.id === "typingIndicatorRow") return;

  startLongPress(row, e.clientX, e.clientY);
});

messageList.addEventListener("pointermove", (e) => {
  if (!longPressStart) return;
  const dx = Math.abs(e.clientX - longPressStart.x);
  const dy = Math.abs(e.clientY - longPressStart.y);
  if (dx > 10 || dy > 10) cancelLongPress();
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  messageList.addEventListener(eventName, cancelLongPress);
}

messageList.addEventListener("touchstart", (e) => {
  if (!isMobileMessageActions()) return;
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(".msg-actions") || e.target.closest(".message-action-menu")) return;
  const touch = e.touches[0];
  if (!touch) return;
  const bubble = e.target.closest(".message");
  const row = bubble?.closest(".msg-row");
  if (!bubble || !row || row.id === "typingIndicatorRow") return;

  startLongPress(row, touch.clientX, touch.clientY);
}, { passive: true });

messageList.addEventListener("touchmove", (e) => {
  if (!longPressStart) return;
  const touch = e.touches[0];
  if (!touch) return;
  const dx = Math.abs(touch.clientX - longPressStart.x);
  const dy = Math.abs(touch.clientY - longPressStart.y);
  if (dx > 10 || dy > 10) cancelLongPress();
}, { passive: true });

messageList.addEventListener("touchend", cancelLongPress, { passive: true });
messageList.addEventListener("touchcancel", cancelLongPress, { passive: true });

document.addEventListener("pointerdown", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".message-action-menu")) return;
  if (messageActionMenu && !target.closest(".message")) closeMessageActionMenu();
  if (target.closest(".input-bar")) return;
  if (target.closest(".top-bar")) return;
  if (target.closest(".sidebar")) return;
  if (target.closest(".dialog-overlay")) return;
  if (target.closest(".overlay")) return;
  if (target.closest(".conv-menu")) return;
  if (target.closest(".more-menu")) return;
  if (target.closest(".composer-menu")) return;
  if (target.closest(".tier-dropdown-menu")) return;
  if (target.closest(".msg-actions")) return;
  if (document.activeElement === messageInput) messageInput.blur();
});

// ── Memory panel ──────────────────────────────────────────────────────────────

function getMemoryEndpoint() {
  return getConfigValue("MEMORIES_API_ENDPOINT", "YOUR_SUPABASE_EDGE_FUNCTION_MEMORIES_URL");
}

function getMemoryToken() {
  return sessionStorage.getItem("memory_admin_token") || "";
}

async function memoryFetch(path, options = {}) {
  const endpoint = getMemoryEndpoint();
  if (!endpoint) throw new Error("MEMORIES_API_ENDPOINT 未配置");
  const token = getMemoryToken();
  const url = new URL(endpoint);
  if (path.startsWith("?")) {
    const params = new URLSearchParams(path.slice(1));
    for (const [k, v] of params) url.searchParams.set(k, v);
  }
  return fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", "x-memory-admin-token": token, ...(options.headers || {}) },
  });
}

const MEMORY_DOMAINS = ["general", "persona", "work", "writing", "life", "relation"];

function normalizeBucketDomain(domain) {
  const compat = { emotion: "relation", creative: "writing", knowledge: "general", preference: "persona" };
  const d = typeof domain === "string" ? (compat[domain] || domain) : "general";
  return MEMORY_DOMAINS.includes(d) ? d : "general";
}

// ── Memory cache & DOM helpers ────────────────────────────────────────────────

let memoriesCache = [];

function showInlineError(itemEl, msg) {
  let errEl = itemEl.querySelector(".memory-inline-error");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "memory-inline-error";
    errEl.style.cssText = "color:oklch(62% 0.2 25);font-size:12px;width:100%;padding:4px 18px 0;";
    itemEl.appendChild(errEl);
  }
  errEl.textContent = msg;
}

function showGlobalMemoryError(msg) {
  let errEl = memoryList.querySelector(".memory-global-error");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "memory-global-error";
    errEl.style.cssText = "color:oklch(62% 0.2 25);font-size:13px;padding:8px 18px;";
    memoryList.prepend(errEl);
  }
  errEl.textContent = msg;
}

function removeMemoryItem(id) {
  memoriesCache = memoriesCache.filter(m => m.id !== id);
  const el = memoryList.querySelector(`.memory-item[data-memory-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.style.transition = "opacity 0.12s, max-height 0.12s";
  el.style.overflow = "hidden";
  el.style.maxHeight = el.offsetHeight + "px";
  el.style.opacity = "0";
  setTimeout(() => {
    el.style.maxHeight = "0";
    el.style.padding = "0";
    setTimeout(() => el.remove(), 130);
  }, 120);
}

function updateMemoryItem(updatedMem) {
  const idx = memoriesCache.findIndex(m => m.id === updatedMem.id);
  if (idx !== -1) memoriesCache[idx] = updatedMem;
  const el = memoryList.querySelector(`.memory-item[data-memory-id="${CSS.escape(updatedMem.id)}"]`);
  if (!el) return;
  el.className = "memory-item" + (updatedMem.enabled ? "" : " disabled");
  const domainEl = el.querySelector(".memory-domain");
  if (domainEl) domainEl.textContent = updatedMem.domain || "general";
  const spanEl = el.querySelector("span.memory-content");
  if (spanEl) spanEl.textContent = updatedMem.content;
  const toggleBtn = el.querySelector("button[data-id]");
  if (toggleBtn) {
    toggleBtn.textContent = updatedMem.enabled ? "禁用" : "启用";
    toggleBtn.dataset.enabled = updatedMem.enabled;
  }
}

function renderMemoryItem(mem) {
  const item = document.createElement("div");
  item.className = "memory-item" + (mem.enabled ? "" : " disabled");
  item.dataset.memoryId = mem.id;

  const domain = document.createElement("small");
  domain.className = "memory-domain";
  domain.textContent = mem.domain || "general";

  const span = document.createElement("span");
  span.className = "memory-content";
  span.textContent = mem.content;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = mem.enabled ? "禁用" : "启用";
  btn.dataset.id = mem.id;
  btn.dataset.enabled = String(mem.enabled);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = e.currentTarget;
    b.disabled = true;
    const newEnabled = b.dataset.enabled !== "true";
    let r;
    try {
      r = await memoryFetch(`?id=${encodeURIComponent(b.dataset.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch (err) {
      b.disabled = false;
      showInlineError(item, `网络错误：${err.message}`);
      return;
    }
    b.disabled = false;
    if (!r.ok) {
      if (r.status === 401) {
        sessionStorage.removeItem("memory_admin_token");
        showInlineError(item, "口令过期或错误，请重新打开记忆匣。");
      } else {
        let msg = `操作失败（${r.status}）`;
        try { const j = await r.json(); msg = j.error || j.message || msg; } catch { try { msg = await r.text() || msg; } catch {} }
        showInlineError(item, msg);
      }
      return;
    }
    let updated;
    try { updated = await r.json(); } catch { updated = null; }
    if (updated && updated.id) {
      updateMemoryItem(updated);
    } else {
      // PATCH didn't return body (shouldn't happen now), fall back to local update
      const cached = memoriesCache.find(m => m.id === mem.id);
      if (cached) updateMemoryItem({ ...cached, enabled: newEnabled });
    }
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "编辑";
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = memoriesCache.find(m => m.id === mem.id) || mem;
    console.log("memory edit click", { id: current.id });
    showMemoryEditDialog(current, item);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.textContent = "删除";
  deleteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDialog({
      title: "删除记忆",
      body: "确定删除这条记忆？",
      confirmLabel: "删除",
      confirmClass: "btn-danger",
      onConfirm: async () => {
        let r;
        try {
          r = await memoryFetch(`?id=${encodeURIComponent(mem.id)}`, { method: "DELETE" });
        } catch (err) {
          showGlobalMemoryError(`网络错误：${err.message}`);
          return;
        }
        if (!r.ok) {
          if (r.status === 401) {
            sessionStorage.removeItem("memory_admin_token");
            showGlobalMemoryError("口令过期或错误，请重新打开记忆匣。");
          } else {
            let msg = `删除失败（${r.status}）`;
            try { const j = await r.json(); msg = j.error || j.message || msg; } catch { try { msg = await r.text() || msg; } catch {} }
            showGlobalMemoryError(msg);
          }
          return;
        }
        removeMemoryItem(mem.id);
      },
    });
  });

  const actions = document.createElement("div");
  actions.className = "memory-actions";
  actions.appendChild(btn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(domain);
  item.appendChild(span);
  item.appendChild(actions);
  return item;
}

function renderMemoryList(memories) {
  memoryList.innerHTML = "";
  memoryList.style.padding = "";

  if (memories.length > 0) {
    const sectionTitle = document.createElement("div");
    sectionTitle.style.cssText = "font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);padding:10px 18px 4px;";
    sectionTitle.textContent = "记忆";
    memoryList.appendChild(sectionTitle);
    for (const mem of memories) {
      memoryList.appendChild(renderMemoryItem(mem));
    }
  } else {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:10px 18px;font-size:13px;color:var(--text-muted)";
    empty.textContent = "暂无记忆";
    memoryList.appendChild(empty);
  }
}

function showMemoryEditDialog(mem, itemEl) {
  console.log("[memory edit] 打开编辑弹窗", { id: mem.id, content: mem.content, domain: mem.domain, enabled: mem.enabled });

  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.style.zIndex = "800";

  const dialog = document.createElement("div");
  dialog.className = "dialog memory-edit-dialog";

  const h3 = document.createElement("h3");
  h3.textContent = "编辑记忆";
  dialog.appendChild(h3);

  const input = document.createElement("textarea");
  input.value = mem.content || "";
  dialog.appendChild(input);

  const select = document.createElement("select");
  for (const d of MEMORY_DOMAINS) {
    const option = document.createElement("option");
    option.value = d;
    option.textContent = d;
    select.appendChild(option);
  }
  select.value = MEMORY_DOMAINS.includes(mem.domain) ? mem.domain : "general";
  dialog.appendChild(select);

  // errorEl must be appended before actions so insertBefore has a valid reference node
  const errorEl = document.createElement("p");
  errorEl.style.cssText = "color:oklch(62% 0.2 25);font-size:13px;margin:0 0 8px;display:none";
  dialog.appendChild(errorEl);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[memory edit] 取消编辑", { id: mem.id });
    overlay.remove();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-confirm";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const content = input.value.trim();
    const domain = select.value;
    if (!content) { input.focus(); return; }
    const payload = { content, domain };
    console.log("[memory edit] 保存请求", { id: mem.id, payload });
    saveBtn.disabled = true;
    errorEl.style.display = "none";
    let res;
    try {
      res = await memoryFetch(`?id=${encodeURIComponent(mem.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      saveBtn.disabled = false;
      console.error("[memory edit] 网络错误", err);
      errorEl.textContent = `网络错误：${err.message}`;
      errorEl.style.display = "block";
      return;
    }
    saveBtn.disabled = false;
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem("memory_admin_token");
        errorEl.textContent = "口令过期或错误，请关闭后重新输入口令。";
      } else {
        let msg = `保存失败（${res.status}）`;
        try { const j = await res.json(); msg = j.error || j.message || msg; } catch { try { msg = await res.text() || msg; } catch {} }
        errorEl.textContent = msg;
      }
      console.error("[memory edit] 保存失败", { status: res.status, text: errorEl.textContent });
      errorEl.style.display = "block";
      return;
    }
    let updated;
    try { updated = await res.json(); } catch {
      errorEl.textContent = "保存成功但无法读取返回数据，请手动刷新。";
      errorEl.style.display = "block";
      return;
    }
    console.log("[memory edit] 保存成功，更新列表", updated);
    overlay.remove();
    updateMemoryItem(updated);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  console.log("[memory edit] 弹窗已挂载，editForm:", { content: input.value, domain: select.value });
  input.focus();
  input.select();
}

function renderBucketItem(b) {
  const item = document.createElement("div");
  item.className = "memory-item";
  item.dataset.bucketId = b.id;

  const domainEl = document.createElement("small");
  domainEl.className = "memory-domain";
  domainEl.textContent = normalizeBucketDomain(b.domain);

  const span = document.createElement("span");
  span.style.cssText = "flex:1;min-width:0;overflow-wrap:break-word;";
  const titleEl = document.createElement("div");
  titleEl.className = "bucket-title";
  titleEl.style.cssText = "font-weight:500;";
  titleEl.textContent = b.title || "";
  const summaryEl = document.createElement("div");
  summaryEl.className = "bucket-summary";
  summaryEl.style.cssText = "font-size:12px;color:var(--text-muted);margin-top:2px;";
  summaryEl.textContent = b.summary || "";
  span.appendChild(titleEl);
  span.appendChild(summaryEl);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "编辑";
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    editBucket({ ...b, domain: normalizeBucketDomain(b.domain) });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.textContent = "删除";
  deleteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDialog({
      title: "删除沉淀记忆",
      body: "��定删除这条沉淀记忆？",
      confirmLabel: "删除",
      confirmClass: "btn-danger",
      onConfirm: async () => {
        let r;
        try {
          r = await memoryFetch(`?type=buckets&id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
        } catch (err) {
          showGlobalMemoryError(`网络错误：${err.message}`);
          return;
        }
        if (!r.ok) {
          let msg = `删除失败（${r.status}）`;
          try { const j = await r.json(); msg = j.error || j.message || msg; } catch { try { msg = await r.text() || msg; } catch {} }
          showGlobalMemoryError(msg);
          return;
        }
        const el = memoryList.querySelector(`.memory-item[data-bucket-id="${CSS.escape(b.id)}"]`);
        if (el) {
          el.style.transition = "opacity 0.12s, max-height 0.12s";
          el.style.overflow = "hidden";
          el.style.maxHeight = el.offsetHeight + "px";
          el.style.opacity = "0";
          setTimeout(() => { el.style.maxHeight = "0"; el.style.padding = "0"; setTimeout(() => el.remove(), 130); }, 120);
        }
      },
    });
  });

  const actions = document.createElement("div");
  actions.className = "memory-actions";
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(domainEl);
  item.appendChild(span);
  item.appendChild(actions);
  return item;
}

function updateBucketItem(bucket) {
  const el = memoryList.querySelector(`.memory-item[data-bucket-id="${CSS.escape(bucket.id)}"]`);
  if (!el) return;
  const domainEl = el.querySelector(".memory-domain");
  if (domainEl) domainEl.textContent = normalizeBucketDomain(bucket.domain);
  const titleEl = el.querySelector(".bucket-title");
  if (titleEl) titleEl.textContent = bucket.title || "";
  const summaryEl = el.querySelector(".bucket-summary");
  if (summaryEl) summaryEl.textContent = bucket.summary || "";
}

function editBucket(b) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.style.zIndex = "800";

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.width = "400px";

  const h3 = document.createElement("h3");
  h3.textContent = "编辑沉淀记忆";
  dialog.appendChild(h3);

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = b.title || "";
  titleInput.placeholder = "标题";
  dialog.appendChild(titleInput);

  const summaryInput = document.createElement("textarea");
  summaryInput.value = b.summary || "";
  summaryInput.placeholder = "摘要";
  dialog.appendChild(summaryInput);

  const domainSelect = document.createElement("select");
  for (const d of MEMORY_DOMAINS) {
    const option = document.createElement("option");
    option.value = d;
    option.textContent = d;
    domainSelect.appendChild(option);
  }
  domainSelect.value = MEMORY_DOMAINS.includes(b.domain) ? b.domain : "general";
  dialog.appendChild(domainSelect);

  const errorEl = document.createElement("p");
  errorEl.style.cssText = "color:oklch(62% 0.2 25);font-size:13px;margin:0 0 8px;display:none";
  dialog.appendChild(errorEl);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); overlay.remove(); });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-confirm";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const title = titleInput.value.trim();
    const summary = summaryInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    saveBtn.disabled = true;
    errorEl.style.display = "none";
    let res;
    try {
      res = await memoryFetch(`?type=buckets&id=${encodeURIComponent(b.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ title, summary, domain: domainSelect.value }),
      });
    } catch (err) {
      saveBtn.disabled = false;
      errorEl.textContent = `网络错误：${err.message}`;
      errorEl.style.display = "block";
      return;
    }
    saveBtn.disabled = false;
    if (!res.ok) {
      let msg = `保存失败（${res.status}）`;
      try { const j = await res.json(); msg = j.error || j.message || msg; } catch { try { msg = await res.text() || msg; } catch {} }
      errorEl.textContent = msg;
      errorEl.style.display = "block";
      return;
    }
    let updated;
    try { updated = await res.json(); } catch {
      errorEl.textContent = "保存成功但无法读取返回数据，请手动刷新。";
      errorEl.style.display = "block";
      return;
    }
    overlay.remove();
    updateBucketItem(updated);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  titleInput.focus();
  titleInput.select();
}

async function loadMemories() {
  memoryList.innerHTML = "";
  memoryList.style.padding = "";

  let res;
  try {
    res = await memoryFetch("");
  } catch (err) {
    memoryList.innerHTML = `<div style="padding:12px 18px;color:oklch(62% 0.2 25)">记忆列表加载失败（网络错误：${err.message}）</div>`;
    return;
  }
  if (res.status === 401) {
    memoryList.innerHTML = `<div style="padding:12px 18px;color:oklch(62% 0.2 25)">口令错误或未输入</div>`;
    return;
  }
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try { const j = await res.json(); errMsg = j.error || j.message || errMsg; } catch { try { errMsg = await res.text() || errMsg; } catch {} }
    memoryList.innerHTML = `<div style="padding:12px 18px;color:oklch(62% 0.2 25)">记忆列表加载失败（${errMsg}）</div>`;
    return;
  }

  let memories = [];
  try { memories = await res.json(); } catch (err) {
    memoryList.innerHTML = `<div style="padding:12px 18px;color:oklch(62% 0.2 25)">记忆列表解析失败（${err.message}）</div>`;
    return;
  }

  memoriesCache = memories;
  renderMemoryList(memoriesCache);

  // ��─ Load memory buckets (non-critical) ────────────────────────────────────
  let bRes;
  try { bRes = await memoryFetch("?type=buckets"); } catch { return; }
  if (!bRes.ok) return;
  let buckets = [];
  try { buckets = await bRes.json(); } catch { return; }
  if (!Array.isArray(buckets) || buckets.length === 0) return;

  const divider = document.createElement("div");
  divider.style.cssText = "border-top:1px solid var(--border);margin:4px 0";
  memoryList.appendChild(divider);

  const bucketTitle = document.createElement("div");
  bucketTitle.style.cssText = "font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);padding:10px 18px 4px;";
  bucketTitle.textContent = "沉淀记忆";
  memoryList.appendChild(bucketTitle);

  for (const b of buckets) {
    memoryList.appendChild(renderBucketItem(b));
  }
}

toggleMemoryButton.addEventListener("click", () => {
  if (!getMemoryToken()) {
    showDialog({
      title: "记忆管理口令",
      input: "",
      inputType: "password",
      confirmLabel: "确定",
      onConfirm: (val) => {
        if (val) sessionStorage.setItem("memory_admin_token", val);
        memoryOverlay.classList.remove("hidden");
        loadMemories();
      },
    });
  } else {
    memoryOverlay.classList.remove("hidden");
    loadMemories();
  }
});

closeMemoryButton.addEventListener("click", () => memoryOverlay.classList.add("hidden"));
memoryOverlay.addEventListener("click", (e) => { if (e.target === memoryOverlay) memoryOverlay.classList.add("hidden"); });

addMemoryButton.addEventListener("click", async () => {
  const content = memoryInput.value.trim();
  if (!content) return;
  const domain = memoryDomainSelect?.value || "general";
  let res;
  try {
    res = await memoryFetch("", { method: "POST", body: JSON.stringify({ content, domain }) });
  } catch (err) {
    showGlobalMemoryError(`新增失败（网络错误：${err.message}）`);
    return;
  }
  if (!res.ok) {
    let msg = `新增失败（${res.status}）`;
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch { try { msg = await res.text() || msg; } catch {} }
    showGlobalMemoryError(msg);
    return;
  }
  let newMem;
  try {
    const data = await res.json();
    // POST returns an array from Supabase representation
    newMem = Array.isArray(data) ? data[0] : data;
    if (newMem && !newMem.domain) newMem.domain = newMem.category || domain;
  } catch { newMem = null; }
  memoryInput.value = "";
  if (newMem && newMem.id) {
    memoriesCache.push(newMem);
    // Remove "暂无记忆" placeholder if present
    const empty = memoryList.querySelector("div[style*='暂无记忆']");
    if (empty) empty.remove();
    // Find the memories section title or insert before bucket divider
    const bucketDivider = memoryList.querySelector("div[style*='border-top']");
    const newItem = renderMemoryItem(newMem);
    if (bucketDivider) {
      memoryList.insertBefore(newItem, bucketDivider);
    } else {
      memoryList.appendChild(newItem);
    }
  } else {
    // Can't surgically insert without an id, fall back to full reload
    await loadMemories();
  }
});

memoryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addMemoryButton.click(); });

// ── Distill ───────────────────────────────────────────────────────────────────

const distillButton = document.getElementById("distillButton");

distillButton.addEventListener("click", async () => {
  if (!chatMessages.length) return;
  if (!getMemoryToken()) {
    showDialog({
      title: "记忆管理口令",
      input: "",
      inputType: "password",
      confirmLabel: "确定",
      onConfirm: (val) => { if (val) sessionStorage.setItem("memory_admin_token", val); distillButton.click(); },
    });
    return;
  }
  distillButton.disabled = true;
  distillButton.textContent = "沉淀中…";
  let result;
  try {
    const res = await memoryFetch("?type=distill", {
      method: "POST",
      body: JSON.stringify({ messages: chatMessages }),
    });
    result = await res.json();
  } catch (e) {
    distillButton.disabled = false;
    distillButton.textContent = "沉淀";
    return;
  }
  distillButton.disabled = false;
  distillButton.textContent = "沉淀";

  const candidates = result.candidates || [];
  if (!candidates.length) return;
  showCandidatesDialog(candidates);
});

function showCandidatesDialog(candidates) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.cssText = "width:400px;max-width:90vw";

  const h3 = document.createElement("h3");
  h3.textContent = "可沉淀的记忆";
  dialog.appendChild(h3);

  const p = document.createElement("p");
  p.textContent = "挑出值得留下的部分：";
  dialog.appendChild(p);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:16px";

  for (const c of candidates) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--surface);border-radius:10px;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.style.marginTop = "3px";

    const text = document.createElement("div");
    text.style.cssText = "flex:1;min-width:0;overflow-wrap:break-word;";
    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font-weight:600;font-size:14px";
    titleEl.textContent = c.title;
    const summaryEl = document.createElement("div");
    summaryEl.style.cssText = "font-size:13px;color:var(--text-muted);margin-top:2px";
    summaryEl.textContent = c.summary;
    text.appendChild(titleEl);
    text.appendChild(summaryEl);

    row.appendChild(checkbox);
    row.appendChild(text);
    row._candidate = c;
    row._checkbox = checkbox;
    list.appendChild(row);
  }
  dialog.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn-confirm";
  confirmBtn.textContent = "留下";
  confirmBtn.addEventListener("click", async () => {
    overlay.remove();
    const selected = [...list.children].filter(r => r._checkbox.checked).map(r => r._candidate);
    for (const c of selected) {
      await memoryFetch("?type=buckets", {
        method: "POST",
        body: JSON.stringify({ title: c.title, summary: c.summary, domain: c.domain || "general" }),
      });
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const sidebarBackdrop = document.createElement("div");
sidebarBackdrop.id = "sidebarBackdrop";
sidebarBackdrop.className = "sidebar-backdrop hidden";
document.body.appendChild(sidebarBackdrop);

function isMobileLayout() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function closeMobileSidebar() {
  sidebar.classList.remove("mobile-open");
  sidebarBackdrop.classList.add("hidden");
}

// On mobile: ensure sidebar starts closed
if (isMobileLayout()) {
  sidebar.classList.remove("hidden");
}

sidebarToggle.addEventListener("click", () => {
  if (isMobileLayout()) {
    const opening = !sidebar.classList.contains("mobile-open");
    sidebar.classList.toggle("mobile-open", opening);
    sidebarBackdrop.classList.toggle("hidden", !opening);
  } else {
    sidebar.classList.toggle("hidden");
  }
});

sidebarBackdrop.addEventListener("click", closeMobileSidebar);

// ── More menu (mobile) ────────────────────────────────────────────────────────

let activeMoreMenu = null;

function closeMoreMenu() {
  if (activeMoreMenu) { activeMoreMenu.remove(); activeMoreMenu = null; }
}

document.getElementById("moreButton")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeMoreMenu) { closeMoreMenu(); return; }
  const items = [
    { label: "沉淀", id: "distillButton" },
    { label: "记忆匣", id: "toggleMemoryButton" },
    { label: "退出", id: "logoutBtn" },
  ];
  const menu = document.createElement("div");
  menu.className = "more-menu";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      closeMoreMenu();
      document.getElementById(item.id)?.click();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  activeMoreMenu = menu;
  const rect = e.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
  setTimeout(() => document.addEventListener("click", closeMoreMenu, { once: true }), 0);
});

newConvButton.addEventListener("click", async () => {
  const id = await createConversation("新会话");
  if (!id) return;
  setActiveConversationId(id);
  chatMessages.length = 0;
  renderWelcomeMessage();
  renderConvList();
});

// ── Submit & reply control ────────────────────────────────────────────────────

let idleTimer = null;
let isReplying = false;
let autoReplyEnabled = false;
const IDLE_DELAY = 5000;

const forceReplyBtn = document.getElementById("forceReplyBtn");
const autoReplyToggle = document.getElementById("autoReplyToggle");
const sendButton = document.getElementById("sendButton");

function setReplyingState(replying) {
  isReplying = replying;
  messageInput.disabled = replying;
  forceReplyBtn.disabled = replying;
  sendButton.disabled = replying;
  const composerMenuBtn = document.getElementById("composerMenuBtn");
  if (composerMenuBtn) composerMenuBtn.disabled = replying;
}

function updateAutoReplyToggle() {
  autoReplyToggle.classList.toggle("active", autoReplyEnabled);
  autoReplyToggle.textContent = autoReplyEnabled ? "●" : "◌";
  autoReplyToggle.title = autoReplyEnabled ? "自动接话：开" : "自动接话：关";
  autoReplyToggle.setAttribute("aria-label", autoReplyToggle.title);
}

// ── Model tier selector ────────────────────────────────────────────────────────

const VALID_TIERS = ["instant", "general", "advanced"];
const TIER_LABELS = { instant: "Instant", general: "General", advanced: "Advanced" };

function updateTierDropdownLabel() {
  const el = document.getElementById("tierDropdownLabel");
  if (el) el.textContent = TIER_LABELS[currentModelTier] || currentModelTier;
}

function initTierBar() {
  const buttons = document.querySelectorAll("#tierBar .tier-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.tier === currentModelTier) btn.classList.add("active");
    btn.addEventListener("click", () => {
      const tier = btn.dataset.tier;
      if (!VALID_TIERS.includes(tier)) return;
      currentModelTier = tier;
      localStorage.setItem("modelTier", tier);
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.tier === tier));
      updateTierDropdownLabel();
    });
  });

  // Mobile tier dropdown
  const dropdownBtn = document.getElementById("tierDropdownBtn");
  if (dropdownBtn) {
    updateTierDropdownLabel();
    dropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Build menu
      const existing = document.querySelector(".tier-dropdown-menu");
      if (existing) { existing.remove(); return; }
      const menu = document.createElement("div");
      menu.className = "composer-menu tier-dropdown-menu";
      for (const tier of VALID_TIERS) {
        const btn = document.createElement("button");
        btn.type = "button";
        if (tier === currentModelTier) btn.classList.add("active-item");
        const icon = document.createElement("span");
        icon.className = "menu-icon";
        icon.textContent = tier === "instant" ? "⚡" : tier === "general" ? "✦" : "🔮";
        const label = document.createElement("span");
        label.textContent = TIER_LABELS[tier];
        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener("click", () => {
          menu.remove();
          currentModelTier = tier;
          localStorage.setItem("modelTier", tier);
          buttons.forEach((b) => b.classList.toggle("active", b.dataset.tier === tier));
          updateTierDropdownLabel();
        });
        menu.appendChild(btn);
      }
      document.body.appendChild(menu);
      const rect = dropdownBtn.getBoundingClientRect();
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      menu.style.left = `${rect.left}px`;
      setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
    });
  }
}

autoReplyToggle.addEventListener("click", () => {
  autoReplyEnabled = !autoReplyEnabled;
  updateAutoReplyToggle();
  if (!autoReplyEnabled) { clearTimeout(idleTimer); idleTimer = null; setChatStatus(""); }
});

updateAutoReplyToggle();

async function triggerReply(replyMode) {
  if (isReplying) return;
  clearTimeout(idleTimer);
  idleTimer = null;
  setChatStatus("正在输入…");
  showTypingIndicator();
  setReplyingState(true);
  try {
    await requestStreamingReply(replyMode);
  } catch (error) {
    removeTypingIndicator();
    addMessage(`回复失败：${error.message}`, "assistant");
  } finally {
    setChatStatus("");
    setReplyingState(false);
    messageInput.focus();
  }
}

let isComposing = false;
messageInput.addEventListener("compositionstart", () => { isComposing = true; });
messageInput.addEventListener("compositionend", () => { isComposing = false; });
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isComposing) {
    e.preventDefault();
    handleSubmit();
  }
});

async function handleSubmit() {
  const text = messageInput.value.trim();
  if (!text || isReplying) return;

  messageInput.value = "";
  const isFirst = chatMessages.length === 0;
  const now = new Date().toISOString();
  const msgId = await saveMessage("user", text);
  addMessage(text, "user", now, {}, msgId);
  chatMessages.push({ role: "user", content: text, created_at: now, id: msgId != null ? String(msgId) : null });
  refreshMessageActions();
  if (isFirst) updateConvTitle(getActiveConversationId(), text);

  if (autoReplyEnabled) {
    setChatStatus("公主在听…");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => triggerReply("auto"), IDLE_DELAY);
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSubmit();
});

sendButton.addEventListener("click", (e) => {
  e.preventDefault();
  handleSubmit();
});

forceReplyBtn.addEventListener("click", () => {
  if (isReplying || !chatMessages.length) return;
  triggerReply("forced");
});

// ── Composer menu (mobile: replaces forceReplyBtn + autoReplyToggle) ──────────

let activeComposerMenu = null;

function closeComposerMenu() {
  if (activeComposerMenu) { activeComposerMenu.remove(); activeComposerMenu = null; }
}

function buildComposerMenu(anchorBtn) {
  closeComposerMenu();
  const menu = document.createElement("div");
  menu.className = "composer-menu";

  // Force reply item
  const forceItem = document.createElement("button");
  forceItem.type = "button";
  forceItem.innerHTML = `<span class="menu-icon">✦</span><span>让公主回复</span>`;
  if (isReplying || !chatMessages.length) forceItem.disabled = true;
  forceItem.addEventListener("click", () => {
    closeComposerMenu();
    if (!isReplying && chatMessages.length) triggerReply("forced");
  });
  menu.appendChild(forceItem);

  // Auto reply toggle item
  const autoItem = document.createElement("button");
  autoItem.type = "button";
  if (autoReplyEnabled) autoItem.classList.add("active-item");
  const autoIcon = autoReplyEnabled ? "●" : "◌";
  const autoLabel = autoReplyEnabled ? "自动接话：开" : "自动接话：关";
  autoItem.innerHTML = `<span class="menu-icon">${autoIcon}</span><span>${autoLabel}</span>`;
  autoItem.addEventListener("click", () => {
    closeComposerMenu();
    autoReplyEnabled = !autoReplyEnabled;
    updateAutoReplyToggle();
    if (!autoReplyEnabled) { clearTimeout(idleTimer); idleTimer = null; setChatStatus(""); }
  });
  menu.appendChild(autoItem);

  document.body.appendChild(menu);
  activeComposerMenu = menu;

  const rect = anchorBtn.getBoundingClientRect();
  menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
  const menuW = menu.offsetWidth || 160;
  let left = rect.right - menuW;
  left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
  menu.style.left = `${left}px`;

  setTimeout(() => document.addEventListener("click", closeComposerMenu, { once: true }), 0);
}

document.getElementById("composerMenuBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (activeComposerMenu) { closeComposerMenu(); return; }
  buildComposerMenu(e.currentTarget);
});

// ── Auth (password only, no magic link) ───────────────────────────────────────

async function signIn() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email) { loginMsg.textContent = "请输入邮箱地址。"; return; }
  if (!password) { loginMsg.textContent = "请输入密码。"; return; }
  loginBtn.disabled = true;
  loginMsg.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.textContent = error.message === "Invalid login credentials"
      ? "邮箱或密码错误。"
      : error.message;
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener("click", signIn);
loginEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword.focus(); });
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  conversationsCache = [];
  chatMessages.length = 0;
  messageList.innerHTML = "";
  logoutBtn.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
});

async function hideLoginAndInit(session) {
  currentUserId = session?.user?.id || "";
  loginOverlay.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.remove("hidden");
  setLoading(true);
  await initConversations();
  await reloadHistory();
  setLoading(false);
  messageInput.focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session && !loginOverlay.classList.contains("hidden")) {
      hideLoginAndInit(session);
    }
  });

  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      hideLoginAndInit(session);
    } else {
      loginOverlay.classList.remove("hidden");
    }
  });
} else {
  loginOverlay.classList.remove("hidden");
}

initTierBar();
