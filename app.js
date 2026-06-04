const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messageList = document.getElementById("messageList");
const clearButton = document.getElementById("clearButton");
const toggleMemoryButton = document.getElementById("toggleMemoryButton");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const memoryOverlay = document.getElementById("memoryOverlay");
const memoryList = document.getElementById("memoryList");
const memoryInput = document.getElementById("memoryInput");
const addMemoryButton = document.getElementById("addMemoryButton");
const newConvButton = document.getElementById("newConvButton");
const convList = document.getElementById("convList");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

const appConfig = window.SAVE_PRINCESS_CONFIG || {};
const chatMessages = [];
const supabaseClient = createSupabaseClient();
const welcomeMessage = "欢迎来到救公主。";

const themeButton = document.getElementById("themeButton");

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

// ── Conversations (localStorage) ─────────────────────────────────────────────

function loadConversations() {
  try { return JSON.parse(localStorage.getItem("conversations") || "[]"); } catch { return []; }
}

function saveConversations(convs) {
  localStorage.setItem("conversations", JSON.stringify(convs));
}

function getActiveConversationId() {
  return localStorage.getItem("conversation_id");
}

function initConversations() {
  let convs = loadConversations();
  let id = getActiveConversationId();
  if (!id || !convs.find(c => c.id === id)) {
    id = crypto.randomUUID();
    convs = [{ id, title: "新会话" }, ...convs];
    saveConversations(convs);
    localStorage.setItem("conversation_id", id);
  }
  return id;
}

function updateConvTitle(id, firstUserMessage) {
  const convs = loadConversations();
  const conv = convs.find(c => c.id === id);
  if (conv && conv.title === "新会话" && firstUserMessage) {
    conv.title = firstUserMessage.slice(0, 20);
    saveConversations(convs);
    renderConvList();
  }
}

function renderConvList() {
  const convs = loadConversations();
  const activeId = getActiveConversationId();
  convList.innerHTML = "";
  for (const conv of convs) {
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
  const convs = loadConversations();
  const conv = convs.find(c => c.id === id);
  const menu = document.createElement("div");
  menu.className = "conv-menu";

  const actions = [
    { label: "重命名", fn: () => renameConv(id) },
    { label: conv?.pinned ? "取消置顶" : "置顶", fn: () => pinConv(id) },
    { label: "删除", fn: () => deleteConv(id), danger: true },
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

function showDialog({ title, body, input, confirmLabel, confirmClass, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h3>${title}</h3>
      ${body ? `<p>${body}</p>` : ""}
      ${input !== undefined ? `<input type="text" value="${input.replace(/"/g, "&quot;")}">` : ""}
      <div class="dialog-actions">
        <button class="btn-cancel">取消</button>
        <button class="${confirmClass || "btn-confirm"}">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector("input");
  if (inp) { inp.focus(); inp.select(); }
  overlay.querySelector(".btn-cancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector(`.${confirmClass || "btn-confirm"}`).addEventListener("click", () => {
    overlay.remove();
    onConfirm(inp ? inp.value.trim() : null);
  });
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") overlay.querySelector(`.${confirmClass || "btn-confirm"}`).click(); });
}

function renameConv(id) {
  const convs = loadConversations();
  const conv = convs.find(c => c.id === id);
  if (!conv) return;
  showDialog({
    title: "重命名会话",
    input: conv.title || "新会话",
    confirmLabel: "确定",
    onConfirm: (name) => {
      conv.title = name || "新会话";
      saveConversations(convs);
      renderConvList();
    }
  });
}

function pinConv(id) {
  const convs = loadConversations();
  const conv = convs.find(c => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  convs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  saveConversations(convs);
  renderConvList();
}

async function deleteConv(id) {
  const convs = loadConversations();
  const conv = convs.find(c => c.id === id);
  showDialog({
    title: "删除会话？",
    body: `这会删除"${conv?.title || "新会话"}"。`,
    confirmLabel: "删除",
    confirmClass: "btn-danger",
    onConfirm: async () => {
      let remaining = loadConversations().filter(c => c.id !== id);
      saveConversations(remaining);
      if (supabaseClient) await supabaseClient.from("messages").delete().eq("conversation_id", id);
      if (getActiveConversationId() === id) {
        if (remaining.length) {
          localStorage.setItem("conversation_id", remaining[0].id);
          await reloadHistory();
        } else {
          const newId = crypto.randomUUID();
          remaining = [{ id: newId, title: "新会话" }];
          saveConversations(remaining);
          localStorage.setItem("conversation_id", newId);
          chatMessages.length = 0;
          renderWelcomeMessage();
        }
      }
      renderConvList();
    }
  });
}

async function switchConversation(id) {
  localStorage.setItem("conversation_id", id);
  renderConvList();
  await reloadHistory();
}

// ── Config / Supabase ─────────────────────────────────────────────────────────

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

// ── UI helpers ────────────────────────────────────────────────────────────────

function addMessage(text, role) {
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
  addMessage(welcomeMessage, "assistant");
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

// ── DB ────────────────────────────────────────────────────────────────────────

async function saveMessage(role, content) {
  if (!supabaseClient) return;
  const conversationId = getActiveConversationId();
  const { error } = await supabaseClient.from("messages").insert({ role, content, conversation_id: conversationId });
  if (error) console.error("保存消息失败：", error);
}

async function reloadHistory() {
  if (!supabaseClient) { renderWelcomeMessage(); return; }
  const conversationId = getActiveConversationId();
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
  if (!history.length) { renderWelcomeMessage(); return; }
  for (const m of history) {
    addMessage(m.content, m.role);
    chatMessages.push({ role: m.role, content: m.content });
  }
}

// ── Chat API ──────────────────────────────────────────────────────────────────

async function callChatAPI(messages) {
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

async function requestStreamingReply(assistantMessage) {
  const response = await callChatAPI(chatMessages);
  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `请求失败：${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "", fullReply = "", streamDone = false;

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
        if (!fullReply) {
          removeTypingIndicator();
          assistantMessage.style.display = "";
        }
        fullReply += delta;
        assistantMessage.textContent = stripThinking(fullReply);
        messageList.scrollTop = messageList.scrollHeight;
      }
    }
  }
  if (!fullReply) throw new Error("未收到模型回复");
  const cleanReply = stripThinking(fullReply);
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("hidden"));

newConvButton.addEventListener("click", () => {
  const id = crypto.randomUUID();
  const convs = loadConversations();
  convs.unshift({ id, title: "新会话" });
  saveConversations(convs);
  localStorage.setItem("conversation_id", id);
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

// ── Submit ────────────────────────────────────────────────────────────────────

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const isFirst = chatMessages.length === 0;
  addMessage(text, "user");
  chatMessages.push({ role: "user", content: text });
  await saveMessage("user", text);
  if (isFirst) updateConvTitle(getActiveConversationId(), text);
  messageInput.value = "";

  showTypingIndicator();
  const assistantMessage = addMessage("", "assistant");
  assistantMessage.style.display = "none";
  setLoading(true);
  try {
    await requestStreamingReply(assistantMessage);
  } catch (error) {
    removeTypingIndicator();
    assistantMessage.style.display = "";
    assistantMessage.textContent = `回复失败：${error.message}`;
    chatMessages.pop();
  } finally {
    setLoading(false);
    messageInput.focus();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

initConversations();
renderConvList();
setLoading(true);
reloadHistory().finally(() => {
  setLoading(false);
  messageInput.focus();
});
