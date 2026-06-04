console.log("build cloudflare-0005");

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
const clearButton       = document.getElementById("clearButton");
const toggleMemoryButton = document.getElementById("toggleMemoryButton");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const memoryOverlay     = document.getElementById("memoryOverlay");
const memoryList        = document.getElementById("memoryList");
const memoryInput       = document.getElementById("memoryInput");
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
const userEmailLabel    = document.getElementById("userEmailLabel");

// ── Theme ─────────────────────────────────────────────────────────────────────

const savedTheme = localStorage.getItem("theme") || "dark";
if (savedTheme === "light") document.documentElement.setAttribute("data-theme", "light");
themeButton.textContent = savedTheme === "light" ? "🌙" : "☀️";

themeButton.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
    themeButton.textContent = "☀️";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    themeButton.textContent = "🌙";
  }
});

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
    .select("id, title, pinned, created_at")
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

    const title = document.createElement("span");
    title.className = "conv-title";
    title.textContent = conv.title || "新会话";
    title.addEventListener("click", () => switchConversation(conv.id));

    const menuBtn = document.createElement("button");
    menuBtn.className = "conv-menu-btn";
    menuBtn.textContent = "···";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openConvMenu(conv.id, menuBtn);
    });

    li.appendChild(title);
    li.appendChild(menuBtn);
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
}

// ── Dialog helper ─────────────────────────────────────────────────────────────

function showDialog({ title, body, input, confirmLabel, confirmClass, onConfirm }) {
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
    inp.type = "text";
    inp.value = input;
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

const chatMessages = [];
let lastRenderedDateKey = null;

function getDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateDivider(date) {
  const d = new Date(date);
  const now = new Date();
  const today = getDateKey(now);
  const yesterday = getDateKey(new Date(now - 86400000));
  const key = getDateKey(d);
  if (key === today) return "今天";
  if (key === yesterday) return "昨天";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function maybeAddDateDivider(createdAt) {
  const key = getDateKey(createdAt);
  if (key === lastRenderedDateKey) return;
  lastRenderedDateKey = key;
  const div = document.createElement("div");
  div.className = "date-divider";
  div.textContent = formatDateDivider(createdAt);
  messageList.appendChild(div);
}

function addMessage(text, role, createdAt = new Date().toISOString(), options = {}) {
  if (!options.skipDateDivider) maybeAddDateDivider(createdAt);
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = text;
  if (role === "assistant") {
    const row = document.createElement("div");
    row.className = "msg-row assistant";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    row.appendChild(avatar);
    row.appendChild(el);
    messageList.appendChild(row);
  } else {
    const row = document.createElement("div");
    row.className = "msg-row user";
    row.appendChild(el);
    messageList.appendChild(row);
  }
  messageList.scrollTop = messageList.scrollHeight;
  return el;
}

function renderWelcomeMessage() {
  messageList.innerHTML = "";
  lastRenderedDateKey = null;
  addMessage(welcomeMessage, "assistant", new Date().toISOString(), { skipDateDivider: true });
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
  if (!supabaseClient) return;
  const conversationId = getActiveConversationId();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient
    .from("messages")
    .insert({ role, content, conversation_id: conversationId, user_id: user.id });
  if (error) console.error("保存消息失败：", error);
}

async function reloadHistory() {
  if (!supabaseClient) { renderWelcomeMessage(); return; }
  const conversationId = getActiveConversationId();
  if (!conversationId) { renderWelcomeMessage(); return; }
  const { data, error } = await supabaseClient
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { renderWelcomeMessage(); console.error(error); return; }

  const history = [...data].reverse();
  chatMessages.length = 0;
  messageList.innerHTML = "";
  lastRenderedDateKey = null;
  if (!history.length) { renderWelcomeMessage(); return; }
  for (const m of history) {
    addMessage(m.content, m.role, m.created_at);
    chatMessages.push({ role: m.role, content: m.content });
  }
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
        { role: "system", content: "不要输出 <think>、</think>、推理过程、内部思考或分析过程。只输出最终回复。" },
        ...messages,
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
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.id = "typingIndicatorRow";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  row.appendChild(avatar);
  row.appendChild(el);
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
  chatMessages.push({ role: "assistant", content: cleanReply });
  await saveMessage("assistant", cleanReply);
}

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
    const span = document.createElement("span");
    span.textContent = mem.content;
    const btn = document.createElement("button");
    btn.textContent = mem.enabled ? "禁用" : "启用";
    btn.dataset.id = mem.id;
    btn.dataset.enabled = mem.enabled;
    btn.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      await memoryFetch(`?id=${b.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: b.dataset.enabled !== "true" }),
      });
      loadMemories();
    });
    item.appendChild(span);
    item.appendChild(btn);
    memoryList.appendChild(item);
  }
}

toggleMemoryButton.addEventListener("click", () => {
  if (!getMemoryToken()) {
    showDialog({
      title: "记忆管理口令",
      input: "",
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
  await memoryFetch("", { method: "POST", body: JSON.stringify({ content }) });
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

sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("hidden"));

newConvButton.addEventListener("click", async () => {
  const id = await createConversation("新会话");
  if (!id) return;
  setActiveConversationId(id);
  chatMessages.length = 0;
  renderWelcomeMessage();
  renderConvList();
});

clearButton.addEventListener("click", async () => {
  if (!supabaseClient) return;
  const conversationId = getActiveConversationId();
  await supabaseClient.from("messages").delete().eq("conversation_id", conversationId);
  chatMessages.length = 0;
  renderWelcomeMessage();
});

// ── Submit & reply control ────────────────────────────────────────────────────

let idleTimer = null;
let isReplying = false;
const IDLE_DELAY = 2500;

const forceReplyBtn = document.getElementById("forceReplyBtn");
const sendButton = document.getElementById("sendButton");

function setReplyingState(replying) {
  isReplying = replying;
  messageInput.disabled = replying;
  forceReplyBtn.disabled = replying;
  sendButton.disabled = replying;
}

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

  const isFirst = chatMessages.length === 0;
  addMessage(text, "user");
  chatMessages.push({ role: "user", content: text });
  await saveMessage("user", text);
  if (isFirst) updateConvTitle(getActiveConversationId(), text);
  messageInput.value = "";

  setChatStatus("公主在听…");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => triggerReply("auto"), IDLE_DELAY);
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
  userEmailLabel.textContent = "";
  logoutBtn.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
});

async function hideLoginAndInit(session) {
  loginOverlay.classList.add("hidden");
  if (userEmailLabel && session?.user?.email) {
    userEmailLabel.textContent = session.user.email;
  }
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
