console.log("build cloudflare-002８");

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
    menuBtn.textContent = "···";
    menuBtn.addEventListener("click", (e) => {
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
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left - menu.offsetWidth + anchor.offsetWidth}px`;

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
    .limit(20);

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
    throw new Error((await response.text()) || `请求失败：${response.status}`);
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
  return window.matchMedia("(max-width: 820px)").matches;
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
  return fetch(endpoint + path, {
    ...options,
    headers: { "Content-Type": "application/json", "x-memory-admin-token": token, ...(options.headers || {}) },
  });
}

const MEMORY_DOMAINS = ["general", "persona", "work", "writing", "life", "relation"];

function showMemoryEditDialog(mem) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog memory-edit-dialog";

  const h3 = document.createElement("h3");
  h3.textContent = "编辑记忆";
  dialog.appendChild(h3);

  const input = document.createElement("textarea");
  input.value = mem.content || "";
  dialog.appendChild(input);

  const select = document.createElement("select");
  for (const domain of MEMORY_DOMAINS) {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    select.appendChild(option);
  }
  select.value = MEMORY_DOMAINS.includes(mem.domain) ? mem.domain : "general";
  dialog.appendChild(select);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-confirm";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", async () => {
    const content = input.value.trim();
    if (!content) {
      input.focus();
      return;
    }
    saveBtn.disabled = true;
    const res = await memoryFetch(`?id=${encodeURIComponent(mem.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ content, domain: select.value }),
    });
    saveBtn.disabled = false;
    if (!res.ok) return;
    overlay.remove();
    loadMemories();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  input.focus();
  input.select();
}

async function loadMemories() {
  let res;
  try { res = await memoryFetch(""); } catch { return; }
  if (res.status === 401) {
    memoryList.textContent = "口令错误或未输入";
    memoryList.style.padding = "12px 18px";
    return;
  }
  const data = await res.json();
  memoryList.innerHTML = "";
  for (const mem of data || []) {
    const item = document.createElement("div");
    item.className = "memory-item" + (mem.enabled ? "" : " disabled");
    const domain = document.createElement("small");
    domain.className = "memory-domain";
    domain.textContent = mem.domain || "general";
    const span = document.createElement("span");
    span.textContent = mem.content;
    const btn = document.createElement("button");
    btn.textContent = mem.enabled ? "禁用" : "启用";
    btn.dataset.id = mem.id;
    btn.dataset.enabled = mem.enabled;
    btn.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      await memoryFetch(`?id=${encodeURIComponent(b.dataset.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: b.dataset.enabled !== "true" }),
      });
      loadMemories();
    });
    const editBtn = document.createElement("button");
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => showMemoryEditDialog(mem));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      showDialog({
        title: "删除记忆",
        body: "确定删除这条记忆？",
        confirmLabel: "删除",
        confirmClass: "btn-danger",
        onConfirm: async () => {
          const res = await memoryFetch(`?id=${encodeURIComponent(mem.id)}`, { method: "DELETE" });
          if (res.ok) loadMemories();
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
    memoryList.appendChild(item);
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
  await memoryFetch("", { method: "POST", body: JSON.stringify({ content, domain }) });
  memoryInput.value = "";
  loadMemories();
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
}

function updateAutoReplyToggle() {
  autoReplyToggle.classList.toggle("active", autoReplyEnabled);
  autoReplyToggle.textContent = autoReplyEnabled ? "●" : "◌";
  autoReplyToggle.title = autoReplyEnabled ? "自动接话：开" : "自动接话：关";
  autoReplyToggle.setAttribute("aria-label", autoReplyToggle.title);
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
