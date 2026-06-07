console.log("build cloudflare-0052");

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

// ── Story Seeds 开关（旧关系史已停用，保留变量避免引用报错） ──────────────────
// LEGACY_MEMORY_ENABLED=false，storySeedsEnabled 不再影响 chat 注入。
const storySeedsEnabled = false;

// ── Pending image state ────────────────────────────────────────────────────────
let pendingImage = null; // { dataUrl: string|null, loading: boolean, error: string|null, file: File|null } | null

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
const loginOverlay      = document.getElementById("loginOverlay");
const loginEmail        = document.getElementById("loginEmail");
const loginMsg          = document.getElementById("loginMsg");
const loginPassword      = document.getElementById("loginPassword");
const loginBtn          = document.getElementById("loginBtn");
const logoutBtn         = document.getElementById("logoutBtn");
const imageInput        = document.getElementById("imageInput");
const imagePreviewBar   = document.getElementById("imagePreviewBar");
const imageAttachBtn    = document.getElementById("imageAttachBtn");

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
  // 更新系统弹窗内主题选项的选中态
  document.querySelectorAll(".theme-option-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeMode === mode);
  });
}

function setThemeMode(mode) {
  localStorage.setItem("theme", mode);
  applyTheme(mode);
}

applyTheme();

// ── 系统设置弹窗 ──────────────────────────────────────────────────────────────

const systemOverlay = document.getElementById("systemOverlay");

document.getElementById("systemButton")?.addEventListener("click", () => {
  applyTheme(); // 确保选中态最新
  systemOverlay?.classList.remove("hidden");
});

document.getElementById("closeSystemButton")?.addEventListener("click", () => {
  systemOverlay?.classList.add("hidden");
});

document.getElementById("closeStatusPanelBtn")?.addEventListener("click", closeStatusPanel);
document.addEventListener("click", (e) => {
  const panel = document.getElementById("statusPanel");
  if (!panel || panel.classList.contains("hidden")) return;
  if (!panel.contains(e.target) && !e.target.closest(".avatar")) closeStatusPanel();
});

document.getElementById("themeOptions")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".theme-option-btn");
  if (!btn) return;
  setThemeMode(btn.dataset.themeMode);
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
  if (window.matchMedia("(max-width: 820px)").matches) closeMobileSidebar();
  setActiveConversationId(id);
  _conversationStartedAt = null; // reset for new conversation context
  _lastPrincessStatus = null;
  const bar = document.getElementById("princessStatusBar");
  if (bar) { bar.innerHTML = ""; bar.classList.add("hidden"); }
  renderConvList();
  await reloadHistory();
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

// ── Chat history pagination ────────────────────────────────────────────────────
const HISTORY_PAGE_SIZE = 20;
let historyHasMore = false;
let historyLoadingOlder = false;
let oldestLoadedMessageCreatedAt = null;

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
  if (Array.isArray(text)) {
    for (const part of text) {
      if (part.type === "image_url" && part.image_url?.url) {
        const img = document.createElement("img");
        img.className = "msg-image";
        img.src = part.image_url.url;
        img.alt = "";
        el.appendChild(img);
      } else if (part.type === "text" && part.text) {
        const span = document.createElement("span");
        span.textContent = part.text;
        el.appendChild(span);
      }
    }
  } else {
    el.textContent = text;
  }
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(el);
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  if (msgId) row.dataset.msgId = msgId;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.title = "查看 G 的状态";
    avatar.addEventListener("click", (e) => openStatusPanel(e.currentTarget));
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
  pendingImage = null;
  updateAttachmentCard();
  if (imageInput) imageInput.value = "";

  // Reset pagination state
  historyHasMore = false;
  historyLoadingOlder = false;
  oldestLoadedMessageCreatedAt = null;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);

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
  if (history.length > 0) oldestLoadedMessageCreatedAt = history[0].created_at;
  historyHasMore = data.length === HISTORY_PAGE_SIZE;
  refreshMessageActions();
}

async function loadOlderMessages() {
  if (historyLoadingOlder || !historyHasMore || !oldestLoadedMessageCreatedAt) return;
  const conversationId = getActiveConversationId();
  if (!conversationId || !supabaseClient) return;
  historyLoadingOlder = true;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .lt("created_at", oldestLoadedMessageCreatedAt)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  if (error) { console.error("加载更多历史失败：", error); historyLoadingOlder = false; return; }
  if (!data || data.length === 0) { historyHasMore = false; historyLoadingOlder = false; return; }
  const older = [...data].reverse();
  const prevScrollHeight = messageList.scrollHeight;
  const prevScrollTop = messageList.scrollTop;
  const newEntries = older.map(m => ({ role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null }));
  chatMessages.unshift(...newEntries);
  messageList.innerHTML = "";
  lastMessageTime = null;
  for (const m of chatMessages) {
    addMessage(m.content, m.role, m.created_at, {}, m.id);
  }
  messageList.scrollTop = prevScrollTop + (messageList.scrollHeight - prevScrollHeight);
  oldestLoadedMessageCreatedAt = older[0].created_at;
  historyHasMore = data.length === HISTORY_PAGE_SIZE;
  historyLoadingOlder = false;
  refreshMessageActions();
}

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
  const modelName = getConfigValue("MODEL_NAME", "YOUR_MODEL_NAME");
  if (!endpoint) throw new Error("CHAT_API_ENDPOINT 未配置");
  if (!modelName) throw new Error("MODEL_NAME 未配置");

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
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: `不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。日常聊天、情绪回应、普通问答，控制在 1-3 段内，每段不超过 2 句，不主动写长列表。
日常闲聊只回应用户刚刚那句话，不复盘、不总结、不安排下一步、不主动推进任务，学习模仿用户的句子长度。
如果用户明确要求"详细、展开、分析、写代码、排查 bug、写方案、写 PRD、总结文档"，则优先完整解决问题，不限制长度。
不要为了凑字解释显而易见的事情。\n\n当前应用时间：${(() => { const p = getZonedParts(new Date()); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; })()}\n当前应用时区：UTC+8 / Asia/Shanghai\n涉及今天、昨天、现在几点、刚才、上次对话时，一律以当前应用时间为准。` },
        ...messages.map(({ role, content }) => ({ role, content })),
      ],
      stream: true,
      replyMode,
      userId: currentUserId,
      conversationId: getActiveConversationId(),
      modelTier: currentModelTier,
      timeContext,
      conversation_state,
      // storySeedsEnabled intentionally omitted — legacy memory system retired
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

// ── Princess Status Bar ────────────────────────────────────────────────────────
// Independent from setChatStatus. Shows G's current state from chat_status API response.
// Uses #princessStatusBar element injected into the DOM below the top-bar.

let _lastPrincessStatus = null;

function renderPrincessStatusBar() {
  const bar = document.getElementById("princessStatusBar");
  if (!bar || !_lastPrincessStatus) return;
  const s = _lastPrincessStatus;
  bar.innerHTML = `
    <span class="princess-status-text" title="点击查看详情">${s.display || ""}</span>
    <span class="princess-status-details hidden">
      <span>${s.details?.energy_reason || ""}</span>
      <span>${s.details?.clarity_reason || ""}</span>
      ${s.details?.immersion_reason ? `<span>${s.details.immersion_reason}</span>` : ""}
    </span>`;
  bar.classList.remove("hidden");
  const textEl = bar.querySelector(".princess-status-text");
  const detailEl = bar.querySelector(".princess-status-details");
  if (textEl && detailEl) {
    textEl.onclick = () => detailEl.classList.toggle("hidden");
  }
}

function updatePrincessStatusBar(status) {
  if (!status || typeof status !== "object") return;
  _lastPrincessStatus = status;
  renderPrincessStatusBar();
}

// ── 血条面板 ──────────────────────────────────────────────────────────────

const STATUS_VAL = {
  energy:     { fresh: 85, normal: 55, tired: 25 },
  clarity:    { clear: 90, foggy: 40 },
  valence:    { happy: 75, neutral: 50, sad: 25 },
  arousal:    { active: 75, normal: 50, quiet: 25 },
  connection: { close: 80, online: 55, distant: 25 },
};

const STAT_META = [
  { key: "energy",     label: "能量" },
  { key: "clarity",    label: "清醒度" },
  { key: "valence",    label: "心情" },
  { key: "arousal",    label: "兴致" },
  { key: "connection", label: "连结" },
];

function statBarColor(key, pct) {
  if (key === "energy")
    return pct > 70 ? "#4ade80" : pct > 40 ? "#facc15" : "#f87171";
  if (key === "clarity")
    return pct > 80 ? "#60a5fa" : "#94a3b8";
  if (key === "valence")
    return pct > 60 ? "#4ade80" : pct > 40 ? "#facc15" : "#f87171";
  if (key === "arousal")
    return pct > 60 ? "#c084fc" : pct > 40 ? "#e2e8f0" : "#60a5fa";
  if (key === "connection")
    return pct > 60 ? "#f472b6" : pct > 40 ? "#fb923c" : "#94a3b8";
  return "#94a3b8";
}

function openStatusPanel(anchor) {
  const panel = document.getElementById("statusPanel");
  const rows  = document.getElementById("statusPanelRows");
  if (!panel || !rows) return;

  if (!_lastPrincessStatus) {
    rows.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px 0 2px;text-align:center">还没有状态数据<br>发条消息之后就会出现</div>';
  } else {
    const s = _lastPrincessStatus;
    rows.innerHTML = STAT_META.map(({ key, label }) => {
      const pct   = STATUS_VAL[key]?.[s[key]] ?? 50;
      const color = statBarColor(key, pct);
      return `<div class="status-bar-row">
        <span class="status-bar-label">${label}</span>
        <div class="status-bar-track">
          <div class="status-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
    }).join("");
  }

  // Position near the clicked avatar, stay within viewport
  if (anchor) {
    const rect    = anchor.getBoundingClientRect();
    const panelW  = 228;
    const panelH  = 220;
    let left = rect.left;
    let top  = rect.bottom + 6;
    if (left + panelW > window.innerWidth  - 8) left = window.innerWidth  - panelW - 8;
    if (left < 8) left = 8;
    if (top  + panelH > window.innerHeight - 8) top  = rect.top - panelH - 6;
    panel.style.left = left + "px";
    panel.style.top  = top  + "px";
  }

  panel.classList.remove("hidden");
}

function closeStatusPanel() {
  document.getElementById("statusPanel")?.classList.add("hidden");
}

async function requestStreamingReply(replyMode = "auto") {
  const messages = replyMode === "forced"
    ? [...chatMessages, { role: "user", content: "用户轻轻戳了你一下。请自然接一句，不要提到"戳一下"、"继续推进"、"不要重复"、"复读"这些机制词。不要主动切项目，优先延续上一条真实用户消息的情绪和语境。" }]
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

  // 读取 memory debug header（在 body 消费前）
  try {
    const debugHeader = response.headers.get("x-save-princess-memory-debug");
    if (debugHeader) {
      const debug = JSON.parse(base64DecodeUtf8(debugHeader));
      window.lastMemoryDebug = debug;
      try { localStorage.setItem("lastMemoryDebug", JSON.stringify(debug)); } catch (_) {}
    }
  } catch (_) {}

  // 读取 chat status header
  try {
    const statusHeader = response.headers.get("x-chat-status");
    if (statusHeader) {
      const status = JSON.parse(base64DecodeUtf8(statusHeader));
      updatePrincessStatusBar(status);
    }
  } catch (_) {}

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
  if (messageList.scrollTop <= 40) loadOlderMessages();
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
        showInlineError(item, "口令过期或错误，请重新打开旧记忆匣。");
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
            showGlobalMemoryError("口令过期或错误，请重新打开旧记忆匣。");
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
  autoResizeTextarea(input);
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

  const keywordsInput = document.createElement("input");
  keywordsInput.type = "text";
  keywordsInput.value = Array.isArray(b.keywords) ? b.keywords.join(", ") : "";
  keywordsInput.placeholder = "关键词（逗号分隔）";
  dialog.appendChild(keywordsInput);

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
        body: JSON.stringify({ title, summary, domain: domainSelect.value, keywords: keywordsInput.value.split(/[,，\s]+/).map(k => k.trim()).filter(Boolean) }),
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
  autoResizeTextarea(summaryInput);
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
    sessionStorage.removeItem("memory_admin_token");
    memoryList.innerHTML = `<div style="padding:12px 18px;color:oklch(62% 0.2 25)">口令错误，请重新输入。</div>`;
    showDialog({
      title: "记忆管理口令",
      input: "",
      inputType: "password",
      confirmLabel: "重试",
      onConfirm: (val) => {
        if (val) sessionStorage.setItem("memory_admin_token", val);
        loadMemories();
      },
    });
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
  bucketTitle.textContent = "沉淀记忆（旧系统 · 不参与回复）";
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

memoryInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) addMemoryButton.click(); });

// ── Distill ───────────────────────────────────────────────────────────────────

const distillButton = document.getElementById("distillButton");
let _distilling = false;

distillButton.addEventListener("click", async () => {
  if (_distilling || !chatMessages.length) return;
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

  _distilling = true;

  // 立刻弹出 loading 面板
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.cssText = "width:400px;max-width:90vw;min-height:120px";

  const body = document.createElement("div");
  body.id = "distill-body";
  body.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;color:var(--text-muted);font-size:14px;">
    <span class="spinner" style="width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--text-muted);border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0;"></span>
    <span>正在沉淀这段对话…</span>
  </div>`;
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 与 distill 后端一致，只取最后 20 条，id 窗口严格对应
  const distillMsgIds = chatMessages.slice(-20)
    .map(m => m.id != null ? Number(m.id) : null)
    .filter(id => id !== null);

  let result;
  try {
    const res = await memoryFetch("?type=distill", {
      method: "POST",
      body: JSON.stringify({ messages: chatMessages.slice(-20) }),
    });
    result = await res.json();
  } catch {
    body.innerHTML = `<div style="color:oklch(62% 0.2 25);font-size:14px;margin-bottom:12px;">沉淀失败了，稍后再试。</div>
      <div class="dialog-actions"><button class="btn-cancel" id="distill-retry">重试</button><button class="btn-cancel" id="distill-close">关闭</button></div>`;
    body.querySelector("#distill-retry").addEventListener("click", () => { overlay.remove(); _distilling = false; distillButton.click(); });
    body.querySelector("#distill-close").addEventListener("click", () => { overlay.remove(); });
    _distilling = false;
    return;
  }

  _distilling = false;
  const candidates = result.candidates || [];
  overlay.remove();
  if (!candidates.length) return;
  showCandidatesDialog(candidates, distillMsgIds);
});

function showCandidatesDialog(candidates, sourceMsgIds = []) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.style.cssText = "width:400px;max-width:90vw";

  const h3 = document.createElement("h3");
  h3.textContent = "可沉淀的记忆（旧系统）";
  dialog.appendChild(h3);

  const p = document.createElement("p");
  p.textContent = "挑出值得留下的部分。保存后进入旧记忆库，仅供管理和迁移，不会自动影响回复。";
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
        body: JSON.stringify({ title: c.title, summary: c.summary, domain: c.domain || "general", keywords: c.keywords || [], source_msg_ids: sourceMsgIds }),
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
  closeMobileSidebar();
  if (activeMoreMenu) { closeMoreMenu(); return; }
  const items = [
    { label: "记忆", action: () => openMemoryCenter() },
    { label: "旧记忆匣（高级）", id: "toggleMemoryButton" },
  ];
  const menu = document.createElement("div");
  menu.className = "more-menu";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      closeMobileSidebar();
      closeMoreMenu();
      if (item.action) {
        item.action();
      } else {
        document.getElementById(item.id)?.click();
      }
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
  if (isMobileLayout()) closeMobileSidebar();
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

const forceReplyBtn = document.getElementById("forceReplyBtn");
const autoReplyToggle = document.getElementById("autoReplyToggle");
const sendButton = document.getElementById("sendButton");

function setReplyingState(replying) {
  isReplying = replying;
  // messageInput intentionally NOT disabled — user can draft while assistant replies
  forceReplyBtn.disabled = replying;
  sendButton.disabled = replying;
  const composerMenuBtn = document.getElementById("composerMenuBtn");
  if (composerMenuBtn) composerMenuBtn.disabled = replying;
  if (imageAttachBtn) imageAttachBtn.disabled = replying;
}

function updateAutoReplyToggle() {
  autoReplyToggle.classList.toggle("active", autoReplyEnabled);
  autoReplyToggle.textContent = autoReplyEnabled ? "●" : "◌";
  autoReplyToggle.title = autoReplyEnabled ? "自动接话：开" : "自动接话：关";
  autoReplyToggle.setAttribute("aria-label", autoReplyToggle.title);
  const composerMenuBtn = document.getElementById("composerMenuBtn");
  if (composerMenuBtn) composerMenuBtn.classList.toggle("auto-badge", autoReplyEnabled);
}

function getAutoReplyDelay(lastUserMessage = "") {
  const text = typeof lastUserMessage === "string" ? lastUserMessage.trim() : "";
  const isQuestion = /[？?吗呢么]$/.test(text) || /怎么|为什么|要不要|可以吗|怎么办|你觉得/.test(text);
  const looksUnfinished = /[，,、….]$/.test(text) || text.length < 12;
  const base = isQuestion ? 9000 : looksUnfinished ? 20000 : 14000;
  const jitter = Math.floor(Math.random() * 5000);
  return base + jitter;
}

function cancelAutoReplyTimer(reason = "") {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (reason) setChatStatus("");
}

function scheduleAutoReply(lastUserMessage = "") {
  cancelAutoReplyTimer();
  const delay = getAutoReplyDelay(lastUserMessage);
  setChatStatus("公主在听…");
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (messageInput.value.trim() || isComposing) { setChatStatus(""); return; }
    triggerReply("auto");
  }, delay);
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
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
        const label = document.createElement("span");
        label.textContent = TIER_LABELS[tier];
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
  if (!autoReplyEnabled) cancelAutoReplyTimer("off");
});

updateAutoReplyToggle();

// ── 关系史入口（已停用，保留避免报错） ──────────────────────────────────────

document.getElementById("storySeedsBtn")?.addEventListener("click", () => {
  // 旧关系史已停用，入口重定向到记忆中枢
  openMemoryCenter();
});

async function triggerReply(replyMode) {
  if (isReplying) return;
  if (replyMode === "auto" && (messageInput.value.trim() || isComposing)) return;
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
messageInput.addEventListener("compositionstart", () => { isComposing = true; cancelAutoReplyTimer(); });
messageInput.addEventListener("compositionend", () => { isComposing = false; autoResizeTextarea(messageInput); });
messageInput.addEventListener("input", () => {
  autoResizeTextarea(messageInput);
  if (autoReplyEnabled && idleTimer) cancelAutoReplyTimer();
});
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isComposing) {
    e.preventDefault();
    handleSubmit();
  }
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_PX = 1600;
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片解码失败"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX; }
          else { width = Math.round(width * MAX_PX / height); height = MAX_PX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateAttachmentCard() {
  if (!imagePreviewBar) return;
  if (!pendingImage) {
    imagePreviewBar.classList.add("hidden");
    imagePreviewBar.classList.remove("loading", "error");
    const thumb = imagePreviewBar.querySelector(".img-preview-thumb");
    if (thumb) thumb.src = "";
    return;
  }
  imagePreviewBar.classList.remove("hidden");
  imagePreviewBar.classList.toggle("loading", !!pendingImage.loading);
  imagePreviewBar.classList.toggle("error", !!pendingImage.error);
  const thumb = imagePreviewBar.querySelector(".img-preview-thumb");
  if (thumb && pendingImage.dataUrl) thumb.src = pendingImage.dataUrl;
  const errorMsg = imagePreviewBar.querySelector(".img-preview-error-msg");
  const errorRow = imagePreviewBar.querySelector(".img-preview-error-row");
  if (errorMsg) errorMsg.textContent = pendingImage.error || "";
  if (errorRow) errorRow.classList.toggle("hidden", !pendingImage.error);
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function handleImageFile(file) {
  if (!file) return;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    pendingImage = { dataUrl: null, loading: false, error: "仅支持 JPEG、PNG、WebP、GIF 格式。", file: null };
    updateAttachmentCard();
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    pendingImage = { dataUrl: null, loading: false, error: "图片超过 20MB 限制，请选择更小的图片。", file: null };
    updateAttachmentCard();
    return;
  }
  pendingImage = { dataUrl: null, loading: true, error: null, file };
  updateAttachmentCard();
  try {
    const dataUrl = await compressImage(file);
    pendingImage = { dataUrl, loading: false, error: null, file };
    updateAttachmentCard();
  } catch (err) {
    pendingImage = { dataUrl: null, loading: false, error: `压缩失败：${err.message}`, file };
    updateAttachmentCard();
  }
}

function showLightbox(src) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.src = src;
  img.alt = "";
  const closeBtn = document.createElement("button");
  closeBtn.className = "lightbox-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "关闭");
  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

function showImageBottomSheet() {
  const sheetOverlay = document.createElement("div");
  sheetOverlay.className = "img-bottom-sheet-overlay";
  const sheet = document.createElement("div");
  sheet.className = "img-bottom-sheet";
  const close = () => { sheetOverlay.remove(); albumInput.remove(); cameraInput.remove(); };

  const albumInput = document.createElement("input");
  albumInput.type = "file";
  albumInput.accept = "image/*";
  albumInput.style.display = "none";
  albumInput.addEventListener("change", () => {
    const f = albumInput.files?.[0];
    if (f) { imageInput.value = ""; handleImageFile(f); }
  });
  document.body.appendChild(albumInput);

  const cameraInput = document.createElement("input");
  cameraInput.type = "file";
  cameraInput.accept = "image/*";
  cameraInput.capture = "environment";
  cameraInput.style.display = "none";
  cameraInput.addEventListener("change", () => {
    const f = cameraInput.files?.[0];
    if (f) { imageInput.value = ""; handleImageFile(f); }
  });
  document.body.appendChild(cameraInput);

  const albumBtn = document.createElement("button");
  albumBtn.textContent = "从相册选择";
  albumBtn.addEventListener("click", () => { close(); albumInput.click(); });

  const cameraBtn = document.createElement("button");
  cameraBtn.textContent = "拍照";
  cameraBtn.addEventListener("click", () => { close(); cameraInput.click(); });

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "img-bottom-sheet-cancel";
  cancelBtn.addEventListener("click", close);

  sheetOverlay.addEventListener("click", (e) => { if (e.target === sheetOverlay) close(); });

  sheet.appendChild(albumBtn);
  sheet.appendChild(cameraBtn);
  sheet.appendChild(cancelBtn);
  sheetOverlay.appendChild(sheet);
  document.body.appendChild(sheetOverlay);
}

imageAttachBtn?.addEventListener("click", () => {
  if (isMobileLayout()) {
    showImageBottomSheet();
  } else {
    imageInput.value = "";
    imageInput.click();
  }
});

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (file) handleImageFile(file);
});

document.getElementById("imgPreviewRemove")?.addEventListener("click", () => {
  pendingImage = null;
  updateAttachmentCard();
  imageInput.value = "";
});

document.getElementById("imgPreviewRetry")?.addEventListener("click", () => {
  if (pendingImage?.file) handleImageFile(pendingImage.file);
});

const chatShell = document.querySelector(".chat-shell");
if (chatShell) {
  chatShell.addEventListener("dragover", (e) => {
    e.preventDefault();
    chatShell.classList.add("drag-over");
  });
  chatShell.addEventListener("dragleave", (e) => {
    if (!chatShell.contains(e.relatedTarget)) chatShell.classList.remove("drag-over");
  });
  chatShell.addEventListener("drop", (e) => {
    e.preventDefault();
    chatShell.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) handleImageFile(file);
  });
}

messageInput.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) handleImageFile(file);
      break;
    }
  }
});

messageList.addEventListener("click", (e) => {
  const img = e.target.closest("img.msg-image");
  if (img) showLightbox(img.src);
});

async function handleSubmit() {
  const text = messageInput.value.trim();
  if ((!text && !pendingImage?.dataUrl) || pendingImage?.loading) return;
  if (isReplying) {
    const hint = document.getElementById("chatStatus");
    if (hint) {
      const prev = hint.textContent;
      hint.textContent = "等我说完再发…";
      setTimeout(() => { if (hint.textContent === "等我说完再发…") hint.textContent = prev; }, 1200);
    }
    return;
  }

  messageInput.value = "";
  autoResizeTextarea(messageInput);
  const snapshot = pendingImage?.dataUrl ? { dataUrl: pendingImage.dataUrl } : null;
  pendingImage = null;
  updateAttachmentCard();
  imageInput.value = "";

  const isFirst = chatMessages.length === 0;
  const now = new Date().toISOString();

  let content;
  if (snapshot) {
    content = [];
    if (text) content.push({ type: "text", text });
    content.push({ type: "image_url", image_url: { url: snapshot.dataUrl, detail: "low" } });
  } else {
    content = text;
  }

  // Optimistic update：先渲染，不等接口
  const msgEl = addMessage(content, "user", now, {});
  const msgRow = msgEl.closest(".msg-row");
  const dbContent = snapshot ? (text ? `[图片] ${text}` : "[图片]") : text;
  chatMessages.push({ role: "user", content, created_at: now, id: null });
  refreshMessageActions();
  if (isFirst) updateConvTitle(getActiveConversationId(), text || "[图片]");

  // 后台保存，完成后补 msgId
  saveMessage("user", dbContent).then((msgId) => {
    if (msgId != null && msgRow) msgRow.dataset.msgId = String(msgId);
    const entry = chatMessages.findLast?.((m) => m.role === "user" && m.id === null);
    if (entry) entry.id = msgId != null ? String(msgId) : null;
  }).catch(() => {
    // 保存失败时静默，不影响聊天流程
  });

  if (autoReplyEnabled) scheduleAutoReply(text);
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
  forceItem.innerHTML = `<span class="menu-icon">✦</span><span>戳一下</span>`;
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
    if (!autoReplyEnabled) cancelAutoReplyTimer("off");
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

// ── 记忆中枢 Memory Center ─────────────────────────────────────────────────────

const memoryCenterOverlay = document.getElementById("memoryCenterOverlay");

document.getElementById("memoryCenterBtn")?.addEventListener("click", () => {
  openMemoryCenter();
});

document.getElementById("closeMemoryCenterButton")?.addEventListener("click", () => {
  memoryCenterOverlay?.classList.add("hidden");
});

document.getElementById("mcLegacyOpenBtn")?.addEventListener("click", () => {
  memoryCenterOverlay?.classList.add("hidden");
  toggleMemoryButton?.click();
});

function openMemoryCenter() {
  if (!memoryCenterOverlay) return;
  memoryCenterOverlay.classList.remove("hidden");
  // 读取最近一次 chat 的 memory debug（内存优先，fallback localStorage）
  let debug = window.lastMemoryDebug || null;
  if (!debug) {
    try {
      const stored = localStorage.getItem("lastMemoryDebug");
      if (stored) debug = JSON.parse(stored);
    } catch (_) {}
  }
  updateMemoryCenterCards(debug);
  renderMemoryCenterDebug(debug);
}

/**
 * 用 lastMemoryDebug 更新 Core Profile / Timeline Archive 卡片的动态状态行。
 * @param {object|null} debug
 */
function updateMemoryCenterCards(debug) {
  // ── Core Profile ────────────────────────────────────────────────────────
  const profileCharsEl = document.getElementById("mcProfileChars");
  const profileStatusEl = document.getElementById("mcProfileStatus");

  if (debug) {
    const loaded = debug.mastodon_profile_loaded;
    const chars = debug.mastodon_profile_chars;
    const tokens = debug.mastodon_profile_tokens_estimated ?? Math.ceil((chars || 0) / 3.5);

    if (profileCharsEl) {
      profileCharsEl.textContent = chars ? `${chars} chars · ~${tokens} tokens` : "—";
    }
    if (profileStatusEl) {
      profileStatusEl.innerHTML = loaded
        ? `<span class="mc-status-dot mc-status-dot--ok"></span><span class="mc-status-text">已加载</span>`
        : `<span class="mc-status-dot mc-status-dot--warn"></span><span class="mc-status-text">未加载</span>`;
    }
  } else {
    if (profileCharsEl) profileCharsEl.textContent = "—";
    if (profileStatusEl) profileStatusEl.textContent = "";
  }

  // ── Timeline Archive ─────────────────────────────────────────────────────
  const timelineStatusEl = document.getElementById("mcTimelineStatus");
  if (timelineStatusEl) {
    if (debug) {
      const recalled = debug.timeline_recalled;
      const hitCount = debug.timeline_hit_count ?? 0;
      const hitKeys = Array.isArray(debug.timeline_hit_keys) && debug.timeline_hit_keys.length
        ? debug.timeline_hit_keys.join(", ")
        : null;
      if (recalled) {
        timelineStatusEl.innerHTML =
          `<span class="mc-status-dot mc-status-dot--ok"></span>` +
          `<span class="mc-status-text">本轮已召回 · ${hitCount} 个触发词${hitKeys ? `：${hitKeys}` : ""}</span>`;
      } else {
        timelineStatusEl.innerHTML =
          `<span class="mc-status-dot mc-status-dot--idle"></span>` +
          `<span class="mc-status-text">本轮未触发</span>`;
      }
    } else {
      timelineStatusEl.textContent = "";
    }
  }

  // ── OpenAI Archive ───────────────────────────────────────────────────────
  const archiveStatusEl = document.getElementById("mcArchiveStatus");
  if (archiveStatusEl) {
    if (debug) {
      const recalled = debug.openai_archive_recalled;
      const hitCount = debug.openai_archive_hit_count ?? 0;
      const hitKeys = Array.isArray(debug.openai_archive_keys) && debug.openai_archive_keys.length
        ? debug.openai_archive_keys.join(", ")
        : null;
      const reason = debug.openai_archive_reason || null;
      if (recalled) {
        archiveStatusEl.innerHTML =
          `<span class="mc-status-dot mc-status-dot--ok"></span>` +
          `<span class="mc-status-text">本轮已召回 · ${hitCount} 条${hitKeys ? `：${hitKeys}` : ""}${reason ? ` · ${reason}` : ""}</span>`;
      } else {
        archiveStatusEl.innerHTML =
          `<span class="mc-status-dot mc-status-dot--idle"></span>` +
          `<span class="mc-status-text">本轮未触发${reason ? ` · ${reason}` : ""}</span>`;
      }
    } else {
      archiveStatusEl.textContent = "";
    }
  }
}

/**
 * 渲染本轮记忆调用 debug 区域。
 * @param {object|null} log - lastMemoryDebug，null 时显示占位。
 */
function renderMemoryCenterDebug(log) {
  const panel = document.getElementById("mcDebugPanel");
  if (!panel) return;

  if (!log) {
    panel.innerHTML = '<div class="mc-debug-placeholder">还没有本轮记忆调用日志，发送一条消息后显示。</div>';
    return;
  }

  const fields = [
    ["legacy_memory_enabled",              log.legacy_memory_enabled],
    ["active_memory_providers",            Array.isArray(log.active_memory_providers) ? log.active_memory_providers.join(", ") || "—" : "—"],
    ["memory_provider_count",              log.memory_provider_count],
    // ── L1 persona_memories ──────────────────────────────────────────
    ["persona_memories_loaded",            log.persona_memories_loaded],
    ["persona_memories_count",             log.persona_memories_count ?? "—"],
    ["persona_memories_categories",        Array.isArray(log.persona_memories_categories) ? log.persona_memories_categories.join(", ") || "—" : "—"],
    ["persona_memories_error",             log.persona_memories_error || "—"],
    // ── mastodon_profile ─────────────────────────────────────────────
    ["mastodon_profile_loaded",            log.mastodon_profile_loaded],
    ["mastodon_profile_chars",             log.mastodon_profile_chars],
    ["mastodon_profile_tokens_estimated",  log.mastodon_profile_tokens_estimated ?? "—"],
    // ── mastodon_timeline ────────────────────────────────────────────
    ["timeline_query_detected",            log.timeline_query_detected],
    ["timeline_loaded",                    log.timeline_loaded],
    ["timeline_recalled",                  log.timeline_recalled],
    ["timeline_hit_count",                 log.timeline_hit_count],
    ["timeline_hit_keys",                  Array.isArray(log.timeline_hit_keys) ? log.timeline_hit_keys.join(", ") || "—" : "—"],
    ["timeline_reason",                    log.timeline_reason || "—"],
    // ── L2 project_memory ────────────────────────────────────────────
    ["project_memory_loaded",              log.project_memory_loaded],
    ["project_memory_recalled",            log.project_memory_recalled],
    ["project_memory_hit_count",           log.project_memory_hit_count ?? "—"],
    ["project_memory_keys",                Array.isArray(log.project_memory_keys) ? log.project_memory_keys.join(", ") || "—" : "—"],
    ["project_memory_reason",              log.project_memory_reason || "—"],
    // ── L3 openai_archive ────────────────────────────────────────────
    ["openai_archive_loaded",              log.openai_archive_loaded],
    ["openai_archive_recalled",            log.openai_archive_recalled],
    ["openai_archive_hit_count",           log.openai_archive_hit_count ?? "—"],
    ["openai_archive_keys",                Array.isArray(log.openai_archive_keys) ? log.openai_archive_keys.join(", ") || "—" : "—"],
    ["openai_archive_reason",              log.openai_archive_reason || "—"],
    ["historical_roleplay_hit_count",      log.historical_roleplay_hit_count ?? "—"],
    ["historical_roleplay_reason",         log.historical_roleplay_reason || "—"],
    // ── conversation_history ─────────────────────────────────────────
    ["conversation_history_query_detected", log.conversation_history_query_detected],
    ["conversation_history_recalled",       log.conversation_history_recalled],
    ["conversation_history_hit_count",      log.conversation_history_hit_count ?? "—"],
    ["conversation_history_reason",         log.conversation_history_reason || "—"],
    // ── token summary ────────────────────────────────────────────────
    ["memory_context_tokens_estimated",    log.memory_context_tokens_estimated],
  ];

  panel.innerHTML = fields.map(([key, val]) => {
    const valStr = val === null || val === undefined ? "—" : String(val);
    const isTrue = valStr === "true";
    const isFalse = valStr === "false";
    return `<div class="mc-debug-row">
      <span class="mc-debug-key">${key}</span>
      <span class="mc-debug-val${isTrue ? " mc-debug-val--true" : isFalse ? " mc-debug-val--false" : ""}">${valStr}</span>
    </div>`;
  }).join("");
}
