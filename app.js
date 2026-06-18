console.log("build cloudflare-0086");

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
const chatBackButton    = document.getElementById("chatBackButton");
const chaAvatarButton   = document.getElementById("chaAvatarButton");
const chatSearchButton  = document.getElementById("chatSearchButton");
const chatOnlineDot     = document.getElementById("chatOnlineDot");
const chatSearchBar     = document.getElementById("chatSearchBar");
const chatSearchInput   = document.getElementById("chatSearchInput");
const chatSearchClear   = document.getElementById("chatSearchClear");

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
  if (!panel.contains(e.target) && !e.target.closest("#chatOnlineDot")) closeStatusPanel();
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
  renderConvList();
  await reloadHistory();
}

// ── Dialog helper ─────────────────────────────────────────────────────────────

function showDialog({ title, body, input, inputType = "text", confirmLabel, confirmClass, onConfirm = () => {} }) {
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

let activeInlineEditor = null;

function closeInlineEditor() {
  if (activeInlineEditor) {
    activeInlineEditor.remove();
    activeInlineEditor = null;
  }
}

function placeInlineEditor(editor, anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(320, window.innerWidth - margin * 2);
  editor.style.width = `${width}px`;
  document.body.appendChild(editor);
  const height = editor.offsetHeight || 120;
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - margin) top = rect.top - height - 6;
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
}

function openInlineEditor(anchor, options = {}) {
  closeInlineEditor();
  const {
    load = () => anchor.textContent || "",
    save,
    label = anchor.getAttribute("aria-label") || anchor.title || "Edit",
    multiline = false,
    inputType = "text",
    placeholder = "",
    validate,
    format = (value) => value,
  } = options;
  if (typeof save !== "function") return null;

  const editor = document.createElement("div");
  editor.className = "inline-editor";
  editor.setAttribute("role", "dialog");
  editor.setAttribute("aria-label", label);

  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  input.className = "inline-editor-input";
  if (!multiline) input.type = inputType;
  input.value = String(load() ?? "");
  input.placeholder = placeholder;
  if (multiline) input.rows = 3;

  const error = document.createElement("div");
  error.className = "inline-editor-error";
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "inline-editor-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "inline-editor-btn";
  cancelBtn.textContent = "Cancel";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "inline-editor-btn inline-editor-btn--primary";
  saveBtn.textContent = "Save";
  actions.append(cancelBtn, saveBtn);
  editor.append(input, error, actions);

  async function submit() {
    const value = input.value.trim();
    const validationError = typeof validate === "function" ? validate(value) : "";
    if (validationError) {
      error.textContent = validationError;
      error.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    error.hidden = true;
    try {
      await save(value);
      anchor.textContent = format(value);
      closeInlineEditor();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : String(err);
      error.hidden = false;
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }

  cancelBtn.addEventListener("click", closeInlineEditor);
  saveBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInlineEditor();
    if (event.key === "Enter" && !multiline && !event.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Enter" && multiline && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  });

  activeInlineEditor = editor;
  placeInlineEditor(editor, anchor);
  input.focus();
  input.select();
  setTimeout(() => {
    document.addEventListener("pointerdown", function onPointerDown(event) {
      if (!activeInlineEditor) return document.removeEventListener("pointerdown", onPointerDown);
      if (activeInlineEditor.contains(event.target) || anchor.contains(event.target)) return;
      closeInlineEditor();
      document.removeEventListener("pointerdown", onPointerDown);
    });
  }, 0);
  return editor;
}

function attachInlineEditor(anchor, options = {}) {
  if (!anchor) return;
  anchor.classList.add("inline-editable");
  anchor.tabIndex = anchor.tabIndex >= 0 ? anchor.tabIndex : 0;
  anchor.addEventListener("click", () => openInlineEditor(anchor, options));
  anchor.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInlineEditor(anchor, options);
    }
  });
}

window.SavePrincessInlineEdit = {
  attach: attachInlineEditor,
  open: openInlineEditor,
  close: closeInlineEditor,
};

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
  const isImageMessage = Array.isArray(text) && text.some(part => part.type === "image_url" && part.image_url?.url);
  const speakerClass = role === "assistant" ? "cha-message" : role === "user" ? "user-message" : "system-message";
  const typeClass = isImageMessage ? "message-image" : role === "system" ? "message-system" : "message-text";
  el.className = `message ${role} ${speakerClass} ${typeClass}`;
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
  const receipt = document.createElement("div");
  receipt.className = "read-receipt";
  receipt.textContent = role === "user" ? "read" : "seen";
  stack.appendChild(receipt);
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  if (msgId) row.dataset.msgId = msgId;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.title = "Cha";
    row.appendChild(avatar);
  }
  row.appendChild(stack);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;
  return el;
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
function insertBubbleSync(text, createdAt, msgId, isSibling) {
  const el = document.createElement("div");
  el.className = "message assistant cha-message message-text";
  el.textContent = text;
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(el);
  const receipt = document.createElement("div");
  receipt.className = "read-receipt";
  receipt.textContent = "seen";
  stack.appendChild(receipt);
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  if (msgId && !isSibling) row.dataset.msgId = msgId;
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

function addAssistantBubbles(rawContent, createdAt, msgId) {
  const bubbles = splitBubbles(typeof rawContent === "string" ? rawContent : "");
  if (bubbles.length === 0) return;
  // 第一个气泡带 msgId，后续气泡带 bubbleSibling=msgId
  insertBubbleSync(bubbles[0], createdAt, msgId, null);
  for (let i = 1; i < bubbles.length; i++) {
    insertBubbleSync(bubbles[i], createdAt, null, String(msgId));
  }
}

// allSiblings=true 时：bubbles 里每一条都作为兄弟气泡插入（第一条已由调用方处理）
function insertBubblesAnimated(bubbles, createdAt, msgId, allSiblings = false) {
  return new Promise(resolve => {
    if (!allSiblings) {
      // 先插入第一条作为主气泡
      insertBubbleSync(bubbles[0], createdAt, msgId, null);
      if (bubbles.length === 1) { resolve(); return; }
    } else {
      if (bubbles.length === 0) { resolve(); return; }
    }
    let i = allSiblings ? 0 : 1;
    function next() {
      if (i >= bubbles.length) { resolve(); return; }
      const delay = 600 + Math.floor(Math.random() * 600); // 600–1200ms
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
    .replace(/\b[A-Z][A-Z_]{2,}_END\b/g, "")
    .trim();
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

/**
 * Upload a compressed image data URL to Supabase Storage.
 * Returns the storage object path (e.g. "{userId}/{filename}.jpg") on success,
 * or null on failure (upload errors are non-fatal — chat still works without image persistence).
 *
 * Path convention: {userId}/{conversationId}_{timestamp}.jpg
 * This puts each user's files in their own folder, matching the RLS policy.
 */
function getFileExtension(file, fallback = "jpg") {
  const name = file?.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ext || fallback;
}

function defaultStoragePath({ userId, scope = "uploads", file }) {
  return `${userId}/${scope}_${Date.now()}.${getFileExtension(file)}`;
}

async function getStorageSignedUrl(bucket, storagePath, expiresIn = 3600) {
  if (!supabaseClient || !bucket || !storagePath) return null;
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

async function uploadStorageAsset({ file, dataUrl, bucket = "chat-images", path, contentType, signedUrlExpiresIn = 3600 }) {
  if (!supabaseClient || (!file && !dataUrl) || !bucket || !path) return null;
  try {
    const blob = file || await fetch(dataUrl).then((res) => res.blob());
    const { error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, blob, {
        contentType: contentType || blob.type || "application/octet-stream",
        upsert: false,
      });
    if (error) {
      console.warn("Storage upload failed:", error.message);
      return null;
    }
    const signedUrl = await getStorageSignedUrl(bucket, path, signedUrlExpiresIn);
    return { bucket, path, signedUrl };
  } catch (err) {
    console.warn("Storage upload error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function createStorageUploader(options = {}) {
  const { accept = "image/*", bucket = "chat-images", scope = "uploads", maxBytes = 20 * 1024 * 1024, pathForFile, onUploaded, onError } = options;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);

  async function open(extra = {}) {
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = extra.userId || user?.id || currentUserId;
    if (!userId) {
      const err = new Error("user_id required for upload");
      if (typeof onError === "function") onError(err);
      throw err;
    }
    return new Promise((resolve) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return resolve(null);
        if (file.size > maxBytes) {
          const err = new Error("file exceeds upload size limit");
          if (typeof onError === "function") onError(err);
          return resolve(null);
        }
        const uploadPath = typeof pathForFile === "function"
          ? pathForFile({ file, userId, scope, extra })
          : defaultStoragePath({ file, userId, scope });
        const result = await uploadStorageAsset({ file, bucket, path: uploadPath, contentType: file.type });
        if (result && typeof onUploaded === "function") onUploaded(result);
        if (!result && typeof onError === "function") onError(new Error("upload failed"));
        resolve(result);
      };
      input.click();
    });
  }

  return { input, open, destroy: () => input.remove() };
}

window.SavePrincessUpload = {
  create: createStorageUploader,
  upload: uploadStorageAsset,
  signedUrl: getStorageSignedUrl,
};

async function uploadImageToStorage(dataUrl, userId, conversationId) {
  if (!supabaseClient || !dataUrl || !userId || !conversationId) return null;
  const uploadResult = await uploadStorageAsset({
    dataUrl,
    bucket: "chat-images",
    path: `${userId}/${conversationId}_${Date.now()}.jpg`,
    contentType: "image/jpeg",
  });
  return uploadResult?.path || null;
}

/**
 * Generate a 1-hour signed URL for a Storage path.
 * Returns null on error (non-fatal).
 */
async function getSignedImageUrl(storagePath) {
  if (!supabaseClient || !storagePath) return null;
  const signedUrl = await getStorageSignedUrl("chat-images", storagePath, 3600);
  if (signedUrl) return signedUrl;
  const { data, error } = await supabaseClient.storage
    .from("chat-images")
    .createSignedUrl(storagePath, 3600); // 1 hour
  if (error) {
    console.warn("生成 signed URL 失败：", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Given an array of raw message rows from DB (each may have image_storage_path),
 * batch-generate signed URLs and return augmented rows where content is replaced
 * by a vision content array when an image is present.
 *
 * Input row shape:  { id, role, content, created_at, image_storage_path? }
 * Output row shape: { id, role, content (string | array), created_at, image_storage_path? }
 */
async function resolveImagePaths(rows) {
  // Collect rows that need a signed URL
  const needsUrl = rows.filter(r => r.image_storage_path);
  if (!needsUrl.length) return rows;

  // Parallel signed URL generation
  const urlResults = await Promise.all(
    needsUrl.map(r => getSignedImageUrl(r.image_storage_path))
  );

  // Build a map: image_storage_path → signedUrl
  const urlMap = new Map();
  needsUrl.forEach((r, i) => {
    if (urlResults[i]) urlMap.set(r.image_storage_path, urlResults[i]);
  });

  // Rebuild rows: upgrade content to vision array when signed URL is available
  return rows.map(r => {
    if (!r.image_storage_path) return r;
    const signedUrl = urlMap.get(r.image_storage_path);
    if (!signedUrl) return r; // fallback: keep text-only content
    const textPart = r.content.replace(/^\[图片\]\s*/, "").trim();
    const parts = [];
    if (textPart) parts.push({ type: "text", text: textPart });
    parts.push({ type: "image_url", image_url: { url: signedUrl, detail: "low" } });
    return { ...r, content: parts };
  });
}

const MESSAGE_EVENT_TYPES = new Set(["message", "image", "system", "dream", "voice"]);
const MESSAGE_SYSTEM_ACTIONS = new Set(["favorite", "edit", "delete", "tag", "game_played"]);

function buildMessageEventFields(fields = {}) {
  const out = {};
  if (MESSAGE_EVENT_TYPES.has(fields.type)) out.type = fields.type;
  if (typeof fields.is_favorite === "boolean") out.is_favorite = fields.is_favorite;
  if (Array.isArray(fields.ai_tags)) out.ai_tags = fields.ai_tags;
  if (fields.system_action === null || MESSAGE_SYSTEM_ACTIONS.has(fields.system_action)) {
    out.system_action = fields.system_action;
  }
  if (
    fields.ref_event_id === null ||
    Number.isInteger(fields.ref_event_id) ||
    (typeof fields.ref_event_id === "string" && /^\d+$/.test(fields.ref_event_id))
  ) {
    out.ref_event_id = fields.ref_event_id;
  }
  return out;
}

async function saveMessage(role, content, imageStoragePath = null, eventFields = {}) {
  if (!supabaseClient) return null;
  const conversationId = getActiveConversationId();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const row = {
    role,
    content,
    conversation_id: conversationId,
    user_id: user.id,
    ...buildMessageEventFields(eventFields),
  };
  if (imageStoragePath && !row.type) row.type = "image";
  if (imageStoragePath) row.image_storage_path = imageStoragePath;
  const { data, error } = await supabaseClient
    .from("messages")
    .insert(row)
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
    .select("id, role, content, created_at, image_storage_path")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);

  if (error) { renderWelcomeMessage(); console.error(error); return; }

  const resolved = await resolveImagePaths([...data].reverse());
  chatMessages.length = 0;
  messageList.innerHTML = "";
  lastMessageTime = null;
  if (!resolved.length) { renderWelcomeMessage(); return; }
  for (const m of resolved) {
    if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id != null ? String(m.id) : null);
    } else {
      addMessage(m.content, m.role, m.created_at, {}, m.id);
    }
    chatMessages.push({ role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null });
  }
  if (resolved.length > 0) oldestLoadedMessageCreatedAt = resolved[0].created_at;
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
    .select("id, role, content, created_at, image_storage_path")
    .eq("conversation_id", conversationId)
    .lt("created_at", oldestLoadedMessageCreatedAt)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  if (error) { console.error("加载更多历史失败：", error); historyLoadingOlder = false; return; }
  if (!data || data.length === 0) { historyHasMore = false; historyLoadingOlder = false; return; }
  const older = await resolveImagePaths([...data].reverse());
  const prevScrollHeight = messageList.scrollHeight;
  const prevScrollTop = messageList.scrollTop;
  const newEntries = older.map(m => ({ role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null }));
  chatMessages.unshift(...newEntries);
  messageList.innerHTML = "";
  lastMessageTime = null;
  for (const m of chatMessages) {
    if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id);
    } else {
      addMessage(m.content, m.role, m.created_at, {}, m.id);
    }
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
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: [
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

function getDefaultPrincessStatus() {
  return {
    display: "G · 在线 · 安静陪伴中",
    energy: "normal",
    clarity: "clear",
    valence: "neutral",
    arousal: "quiet",
    connection: "online",
    details: {
      energy_reason: "体力稳定",
      clarity_reason: "清醒度稳定",
      immersion_reason: "安静陪伴中",
    },
  };
}

function normalizePrincessStatus(raw) {
  if (!raw || typeof raw !== "object") return getDefaultPrincessStatus();
  const def = getDefaultPrincessStatus();
  return {
    display: raw.display || def.display,
    energy: raw.energy || def.energy,
    clarity: raw.clarity || def.clarity,
    valence: raw.valence || def.valence,
    arousal: raw.arousal || def.arousal,
    connection: raw.connection || def.connection,
    details: {
      energy_reason: raw.details?.energy_reason || def.details.energy_reason,
      clarity_reason: raw.details?.clarity_reason || def.details.clarity_reason,
      immersion_reason: raw.details?.immersion_reason || def.details.immersion_reason,
    },
  };
}

function loadLastPrincessStatus() {
  try {
    const stored = localStorage.getItem("lastPrincessStatus");
    if (stored) {
      const parsed = JSON.parse(stored);
      return normalizePrincessStatus(parsed);
    }
  } catch (_) {}
  return null;
}

function saveLastPrincessStatus(status) {
  try {
    localStorage.setItem("lastPrincessStatus", JSON.stringify(status));
  } catch (_) {}
}

function renderPrincessStatusBar() {
  const bar = document.getElementById("princessStatusBar");
  if (!bar) return;
  bar.innerHTML = "";
  bar.classList.add("hidden");
  bar.onclick = null;
}

function updatePrincessStatusBar(status) {
  if (!status || typeof status !== "object") return;
  _lastPrincessStatus = normalizePrincessStatus(status);
  saveLastPrincessStatus(_lastPrincessStatus);
  renderPrincessStatusBar();
}

function initPrincessStatusBar() {
  const stored = loadLastPrincessStatus();
  if (stored) {
    _lastPrincessStatus = stored;
  } else {
    _lastPrincessStatus = getDefaultPrincessStatus();
  }
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
    return pct > 70 ? "#B7C7BA" : pct > 40 ? "#D8CFB8" : "#D5BDBD";
  if (key === "clarity")
    return pct > 80 ? "#AFC2C4" : "#C9CED1";
  if (key === "valence")
    return pct > 60 ? "#B7C7BA" : pct > 40 ? "#D8CFB8" : "#D5BDBD";
  if (key === "arousal")
    return pct > 60 ? "#C9C0D3" : pct > 40 ? "#D6D6D0" : "#B9C7CF";
  if (key === "connection")
    return pct > 60 ? "#D4BFC7" : pct > 40 ? "#D1C3B4" : "#C9CED1";
  return "#C9CED1";
}

function openStatusPanel(anchor) {
  const panel = document.getElementById("statusPanel");
  const rows  = document.getElementById("statusPanelRows");
  if (!panel || !rows) return;

  const s = _lastPrincessStatus || getDefaultPrincessStatus();
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

  // Position near anchor, stay within viewport
  if (anchor) {
    const rect   = anchor.getBoundingClientRect();
    const panelW = 228;
    const panelH = 220;
    let left = rect.left;
    let top  = rect.bottom + 6;
    if (left + panelW > window.innerWidth  - 8) left = window.innerWidth  - panelW - 8;
    if (left < 8) left = 8;
    if (top  + panelH > window.innerHeight - 8) top  = rect.top - panelH - 6;
    if (top < 8) top = 8;
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
    ? [...chatMessages, { role: "user", content: "用户轻轻戳了你一下。请自然接一句，不要提到\u300c戳一下\u300d\u3001\u300c继续推进\u300d\u3001\u300c不要重复\u300d\u3001\u300c复读\u300d这些机制词。不要主动切项目，优先延续上一条真实用户消息的情绪和语境。" }]
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

  // 读取 memory promoted header（promotion 成功时后端写入）
  try {
    const promotedHeader = response.headers.get("x-memory-promoted");
    if (promotedHeader) {
      const n = parseInt(promotedHeader, 10);
      if (Number.isFinite(n) && n > 0) showMemoryToast(n);
    }
  } catch (_) {}

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "", fullReply = "", streamDone = false;
  let assistantEl = null;
  let firstSepSeen = false; // 流式中遇到第一个 ||| 后停止更新 DOM

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
        if (!firstSepSeen) {
          const sepIdx = fullReply.indexOf("|||");
          if (sepIdx !== -1) {
            // 定住第一段，后续 delta 只进 fullReply 不渲染
            assistantEl.textContent = stripThinking(fullReply.slice(0, sepIdx));
            firstSepSeen = true;
          } else {
            assistantEl.textContent = stripThinking(fullReply);
            messageList.scrollTop = messageList.scrollHeight;
          }
        }
        // firstSepSeen 后：数据继续累积进 fullReply，DOM 不再更新
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
  const replyIdStr = replyId != null ? String(replyId) : null;
  chatMessages.push({ role: "assistant", content: cleanReply, created_at: replyTime, id: replyIdStr });
  lastMessageTime = new Date(replyTime).getTime();

  // Fire-and-forget vault extraction — never blocks UI
  {
    const lastUserMsg = [...chatMessages].reverse().find(m => m.role === "user");
    const vaultUserMessage = lastUserMsg
      ? extractTextFromMessageContent(lastUserMsg.content).trim()
      : "";
    if (vaultUserMessage) {
      triggerVaultAfterChat({
        userMessage: vaultUserMessage,
        assistantMessage: cleanReply,
        userMessageId: _currentRequestUserMessageId,
        conversationId: getActiveConversationId(),
        route: localStorage.getItem("previousTopicRoute") || null,
      });
    }
  }

  const bubbles = splitBubbles(cleanReply);
  if (bubbles.length === 1 || !firstSepSeen) {
    // 单气泡或模型没有输出 |||：直接用临时气泡，原地更新内容并转正
    if (assistantEl) {
      assistantEl.textContent = bubbles[0];
      const row = assistantEl.closest(".msg-row");
      if (row && replyIdStr) row.dataset.msgId = replyIdStr;
    } else {
      insertBubbleSync(bubbles[0], replyTime, replyIdStr, null);
    }
  } else {
    // 多气泡：第一个气泡已经在 assistantEl 里，转正 msgId，后续气泡逐条弹出
    if (assistantEl) {
      const row = assistantEl.closest(".msg-row");
      if (row && replyIdStr) row.dataset.msgId = replyIdStr;
    }
    // 从第二段开始动画插入
    await insertBubblesAnimated(bubbles.slice(1), replyTime, replyIdStr, true);
  }

  refreshMessageActions();
  // After stream ends, start short-polling for memory promotion results
  startMemoryPromotionPoller(_currentRequestStartTime, _currentRequestUserMessageId);
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
  // 多气泡时用原始完整内容（去掉 ||| 分隔符），单气泡降级取 textContent
  let text = "";
  const msgId = row.dataset.msgId || row.dataset.bubbleSibling;
  if (msgId) {
    const entry = chatMessages.find(m => m.id === msgId);
    if (entry && typeof entry.content === "string") {
      text = entry.content.replace(/\|\|\|/g, " ").trim();
    }
  }
  if (!text) text = row.querySelector(".message")?.textContent || "";
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
  // 删除所有属于同一条消息的气泡 row（bubbleSibling 指向此 msgId 的兄弟行）
  messageList.querySelectorAll(`[data-bubble-sibling="${msgId}"]`).forEach(r => r.remove());
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
  // oldContent may be a vision array [{type:"text",...},{type:"image_url",...}].
  // showDialog's input field requires a string, so extract the text portion only.
  const oldText = extractTextFromMessageContent(oldContent);
showDialog({
  title: "编辑消息",
  body: "编辑后，这条之后的回复会重新生成。",
  input: oldText,
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
const MEMORY_DOMAIN_TO_PROVIDER_CATEGORY = {
  general: "current_context_summary",
  persona: "identity_context",
  work: "project_memory",
  writing: "writing_memory",
  life: "life_context",
  relation: "relationship_context",
};
const PROVIDER_CATEGORY_TO_MEMORY_DOMAIN = {
  current_context_summary: "general",
  identity_context: "persona",
  project_memory: "work",
  writing_memory: "writing",
  life_context: "life",
  relationship_context: "relation",
};

function memoryDomainToProviderCategory(domain) {
  return MEMORY_DOMAIN_TO_PROVIDER_CATEGORY[domain] || MEMORY_DOMAIN_TO_PROVIDER_CATEGORY.general;
}

function providerCategoryToMemoryDomain(category) {
  return PROVIDER_CATEGORY_TO_MEMORY_DOMAIN[category] ||
    (MEMORY_DOMAINS.includes(category) ? category : "general");
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

function removeMemoryItem(id, isInstruction = false) {
  const state = memoryCenterV2State;
  if (isInstruction) {
    state.instructions = state.instructions.filter(i => i.id !== id);
  } else {
    state.memories = state.memories.filter(m => m.id !== id);
  }
  // Re-render current view if workspace is open
  if (!memoryCenterOverlay?.classList.contains("hidden")) {
    renderMemoryCenterCurrentView();
  }
  // Legacy panel: remove from DOM if present
  const el = memoryList?.querySelector(`.memory-item[data-memory-id="${CSS.escape(id)}"]`);
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

function updateMemoryItem(updatedMem, isInstruction = false) {
  const state = memoryCenterV2State;
  if (isInstruction) {
    const idx = state.instructions.findIndex(i => i.id === updatedMem.id);
    if (idx >= 0) state.instructions[idx] = updatedMem;
  } else {
    const idx = state.memories.findIndex(m => m.id === updatedMem.id);
    if (idx >= 0) state.memories[idx] = updatedMem;
  }
  // Re-render current view if workspace is open
  if (!memoryCenterOverlay?.classList.contains("hidden")) {
    renderMemoryCenterCurrentView();
  }
  // Legacy panel: re-render item if present
  const el = memoryList?.querySelector(`.memory-item[data-memory-id="${CSS.escape(updatedMem.id)}"]`);
  if (!el) return;
  const wasExpanded = el.classList.contains("memory-item--expanded");
  const fresh = renderMemoryItem(updatedMem);
  if (wasExpanded) fresh.classList.add("memory-item--expanded");
  el.replaceWith(fresh);
}

function renderMemoryItem(mem) {
  const text = mem.content || "";
  // Title: prefer mem.title, fall back to auto-generated (never raw full content)
  const title   = (mem.title   && mem.title.trim())   ? mem.title.trim()   : _mcAutoTitle(text);
  // Summary: prefer mem.summary, fall back to auto-generated
  const summary = (mem.summary && mem.summary.trim()) ? mem.summary.trim() : _mcAutoSummary(text);
  // Full content is different from summary only when text is long enough
  const hasFullContent = text.length > 0;
  const isEnabled = mem.enabled !== false;

  let dateStr = "";
  try {
    const d = new Date(mem.updated_at || mem.created_at || Date.now());
    dateStr = d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  } catch (_) {}

  const item = document.createElement("div");
  item.className = "memory-item" + (isEnabled ? "" : " disabled");
  item.dataset.memoryId = mem.id;

  // ── Left: domain label ───────────────────────────────────────────────────
  const domain = document.createElement("small");
  domain.className = "memory-domain";
  domain.textContent = providerCategoryToMemoryDomain(mem.domain || mem.category);

  // ── Middle: content column ───────────────────────────────────────────────
  const mid = document.createElement("div");
  mid.className = "memory-item-mid";

  const titleEl = document.createElement("div");
  titleEl.className = "memory-item-title";
  titleEl.textContent = title || "（无标题）";
  mid.appendChild(titleEl);

  // Summary (2-line clamp via CSS); hidden when expanded
  const summaryEl = document.createElement("div");
  summaryEl.className = "memory-item-summary";
  summaryEl.textContent = summary;
  mid.appendChild(summaryEl);

  // Full content (hidden by default; only added to DOM when it exists)
  let fullEl = null;
  if (hasFullContent) {
    fullEl = document.createElement("div");
    fullEl.className = "memory-item-full";
    fullEl.textContent = text;
    fullEl.hidden = true;
    mid.appendChild(fullEl);
  }

  // Footer: date + status dot
  const footer = document.createElement("div");
  footer.className = "memory-item-footer";
  const metaEl = document.createElement("span");
  metaEl.className = "memory-item-meta";
  metaEl.textContent = [isEnabled ? "启用" : "禁用", dateStr].filter(Boolean).join(" · ");
  footer.appendChild(metaEl);
  mid.appendChild(footer);

  // ── Right: action buttons ────────────────────────────────────────────────
  const actions = document.createElement("div");
  actions.className = "memory-actions";

  // Expand button (only when full content differs from summary)
  if (hasFullContent) {
    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.textContent = "展开";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExp = item.classList.toggle("memory-item--expanded");
      if (fullEl) fullEl.hidden = !isExp;
      summaryEl.hidden = isExp;
      expandBtn.textContent = isExp ? "收起" : "展开";
    });
    actions.appendChild(expandBtn);
  }

  // Toggle enable/disable
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = isEnabled ? "禁用" : "启用";
  toggleBtn.dataset.id = mem.id;
  toggleBtn.dataset.enabled = String(isEnabled);
  toggleBtn.addEventListener("click", async (e) => {
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
        showInlineError(item, "口令过期或错误，请刷新页面后重新进入记忆中心。");
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
      const cached = memoryCenterV2State.memories.find(m => m.id === mem.id);
      if (cached) updateMemoryItem({ ...cached, enabled: newEnabled });
    }
  });
  actions.appendChild(toggleBtn);

  // Edit
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "编辑";
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = memoryCenterV2State.memories.find(m => m.id === mem.id) || mem;
    showMemoryEditDialog(current, item);
  });
  actions.appendChild(editBtn);

  // Delete
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
            showGlobalMemoryError("口令过期或错误，请刷新页面后重新进入记忆中心。");
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
  actions.appendChild(deleteBtn);

  item.appendChild(domain);
  item.appendChild(mid);
  item.appendChild(actions);
  return item;
}

function renderMemoryList(memories) {
  memoryList.innerHTML = "";
  memoryList.style.padding = "";

  if (memories.length > 0) {
    const sectionTitle = document.createElement("div");
    sectionTitle.style.cssText = "font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);padding:10px 18px 4px;";
    sectionTitle.textContent = "🧠 记忆（memories）";
    memoryList.appendChild(sectionTitle);
    const memoriesDesc = document.createElement("div");
    memoriesDesc.style.cssText = "font-size:12px;color:var(--text-muted);padding:0 18px 8px;";
    memoriesDesc.textContent = "事件、偏好、项目——会参与回复。";
    memoryList.appendChild(memoriesDesc);
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

// ── renderInstructionItem ─────────────────────────────────────────────────────
// Rule card: no title/summary layers — shows full content directly.
// Toggle enable/disable and delete only (no edit in this iteration).

function renderInstructionItem(inst) {
  const text = inst.content || "";
  const isEnabled = inst.enabled !== false;

  const item = document.createElement("div");
  item.className = "memory-item" + (isEnabled ? "" : " disabled");
  item.dataset.instructionId = inst.id;

  const domain = document.createElement("small");
  domain.className = "memory-domain";
  domain.textContent = inst.category || "general";

  const mid = document.createElement("div");
  mid.className = "memory-item-mid";

  const contentEl = document.createElement("div");
  contentEl.className = "memory-item-summary";
  contentEl.style.cssText = "-webkit-line-clamp:3;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;";
  contentEl.textContent = text;
  mid.appendChild(contentEl);

  const fullEl = document.createElement("div");
  fullEl.className = "memory-item-full";
  fullEl.textContent = text;
  fullEl.hidden = true;
  mid.appendChild(fullEl);

  item.appendChild(domain);
  item.appendChild(mid);

  const actions = document.createElement("div");
  actions.className = "memory-actions";

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.textContent = "展开";
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const expanded = item.classList.toggle("memory-item--expanded");
    fullEl.hidden = !expanded;
    contentEl.hidden = expanded;
    expandBtn.textContent = expanded ? "收起" : "展开";
  });
  actions.appendChild(expandBtn);

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = isEnabled ? "禁用" : "启用";
  toggleBtn.dataset.id = inst.id;
  toggleBtn.dataset.enabled = String(isEnabled);
  toggleBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const b = e.currentTarget;
    b.disabled = true;
    const newEnabled = b.dataset.enabled !== "true";
    let r;
    try {
      r = await memoryFetch(`?type=instructions&id=${encodeURIComponent(b.dataset.id)}`, {
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
      showInlineError(item, `操作失败（${r.status}）`);
      return;
    }
    b.dataset.enabled = String(newEnabled);
    b.textContent = newEnabled ? "禁用" : "启用";
    item.classList.toggle("disabled", !newEnabled);
  });
  actions.appendChild(toggleBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.textContent = "删除";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showDialog({
      title: "删除长期设定",
      body: "确定删除这条设定？",
      confirmLabel: "删除",
      confirmClass: "btn-danger",
      onConfirm: async () => {
        let r;
        try {
          r = await memoryFetch(`?type=instructions&id=${encodeURIComponent(inst.id)}`, { method: "DELETE" });
        } catch (err) {
          showGlobalMemoryError(`网络错误：${err.message}`);
          return;
        }
        if (!r.ok && r.status !== 204) {
          showGlobalMemoryError(`删除失败（${r.status}）`);
          return;
        }
        item.remove();
      },
    });
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
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
  select.value = providerCategoryToMemoryDomain(mem.domain || mem.category);
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
    const domain = memoryDomainToProviderCategory(select.value);
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

  memoryCenterV2State.memories = memories;

  // ─── Section 1: instructions (non-critical, no block on failure) ───────────
  let instructions = [];
  try {
    const iRes = await memoryFetch("?type=instructions");
    if (iRes.ok) {
      instructions = await iRes.json();
    }
  } catch { /* ignore, instructions section simply won't render */ }

  if (Array.isArray(instructions) && instructions.length > 0) {
    const iTitle = document.createElement("div");
    iTitle.style.cssText = "font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);padding:10px 18px 4px;";
    iTitle.textContent = "⚙️ 长期设定（instructions）";
    memoryList.appendChild(iTitle);
    const iDesc = document.createElement("div");
    iDesc.style.cssText = "font-size:12px;color:var(--text-muted);padding:0 18px 8px;";
    iDesc.textContent = "规则、原则、长期配置——会参与回复。";
    memoryList.appendChild(iDesc);
    for (const inst of instructions) {
      memoryList.appendChild(renderInstructionItem(inst));
    }
    const divider0 = document.createElement("div");
    divider0.style.cssText = "border-top:1px solid var(--border);margin:4px 0";
    memoryList.appendChild(divider0);
  }

  // ─── Section 2: memories ───────────────────────────────────────────────────
  renderMemoryList(memoryCenterV2State.memories);
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
  const domain = memoryDomainToProviderCategory(memoryDomainSelect?.value || "general");
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
    memoryCenterV2State.memories.push(newMem);
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

// distill + showCandidatesDialog 已随 memory_buckets 归档，于 cloudflare-0082 删除

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

chatBackButton?.addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
});

// Reuse C2: SavePrincessUpload provides the shared Supabase Storage uploader.
function applyChaAvatar(url) {
  if (!chaAvatarButton || !url) return;
  chaAvatarButton.style.backgroundImage = `url("${url}")`;
  chaAvatarButton.style.backgroundSize = "cover";
  chaAvatarButton.style.backgroundPosition = "center";
  chaAvatarButton.classList.add("has-image");
}

applyChaAvatar(localStorage.getItem("cha_avatar_url") || "");

chaAvatarButton?.addEventListener("click", async () => {
  if (!window.SavePrincessUpload?.create) return;
  const uploader = window.SavePrincessUpload.create({
    bucket: "chat-images",
    scope: "cha_avatar",
    pathForFile: ({ file, userId }) => {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      return `${userId}/cha_avatar_${Date.now()}.${ext || "jpg"}`;
    },
    onUploaded: (result) => {
      if (result.signedUrl) {
        localStorage.setItem("cha_avatar_url", result.signedUrl);
        applyChaAvatar(result.signedUrl);
      }
    },
  });
  await uploader.open();
  uploader.destroy();
});

function applyChatSearch(query) {
  const q = query.trim().toLocaleLowerCase();
  messageList.querySelectorAll(".msg-row").forEach((row) => {
    const text = row.querySelector(".message")?.textContent?.toLocaleLowerCase() || "";
    const matched = !q || text.includes(q);
    row.classList.toggle("search-hidden", !matched);
    row.classList.toggle("search-hit", Boolean(q && matched));
  });
}

chatSearchButton?.addEventListener("click", () => {
  chatSearchBar?.classList.toggle("hidden");
  if (!chatSearchBar?.classList.contains("hidden")) {
    chatSearchInput?.focus();
    applyChatSearch(chatSearchInput?.value || "");
  } else {
    if (chatSearchInput) chatSearchInput.value = "";
    applyChatSearch("");
  }
});

chatSearchInput?.addEventListener("input", () => applyChatSearch(chatSearchInput.value));
chatSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    chatSearchInput.value = "";
    chatSearchBar?.classList.add("hidden");
    applyChatSearch("");
  }
});
chatSearchClear?.addEventListener("click", () => {
  if (chatSearchInput) chatSearchInput.value = "";
  applyChatSearch("");
  chatSearchInput?.focus();
});

chatOnlineDot?.addEventListener("click", (event) => {
  event.stopPropagation();
  openStatusPanel(event.currentTarget);
});

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
let statusTimer = null;
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
  const isShort = text.length <= 8;
  if (isQuestion) return 0;
  if (isShort) return 10000 + Math.floor(Math.random() * 4000); // 10–14s
  return 6000 + Math.floor(Math.random() * 3000); // 6–9s
}

function cancelAutoReplyTimer() {
  clearTimeout(idleTimer); idleTimer = null;
  clearTimeout(statusTimer); statusTimer = null;
  setChatStatus("");
}

function scheduleAutoReply(lastUserMessage = "") {
  cancelAutoReplyTimer();
  const delay = getAutoReplyDelay(lastUserMessage);
  if (delay === 0) {
    // 问题句：立即触发，不走 idle 状态
    triggerReply("auto");
    return;
  }
  // 普通句/短句：2s 后才显示 status，避免短时间内输入时闪烁
  statusTimer = setTimeout(() => {
    statusTimer = null;
    if (!idleTimer) return; // idleTimer 已被取消，不再显示
    setChatStatus("公主在听…");
  }, 2000);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (messageInput.value.trim() || isComposing) { cancelAutoReplyTimer(); return; }
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
  if (!autoReplyEnabled) cancelAutoReplyTimer();
});

updateAutoReplyToggle();

// ── 关系史入口（已停用，保留避免报错） ──────────────────────────────────────

document.getElementById("storySeedsBtn")?.addEventListener("click", () => {
  // 旧关系史已停用，入口重定向到记忆中枢
  openMemoryCenter();
});

async function triggerReply(replyMode) {
  if (isReplying) { cancelAutoReplyTimer(); return; }
  if (replyMode === "auto" && (messageInput.value.trim() || isComposing)) { cancelAutoReplyTimer(); return; }
  cancelAutoReplyTimer();
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
  if (autoReplyEnabled) cancelAutoReplyTimer();
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
  if (isReplying) return;

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

  // 后台保存：有图时先上传 Storage，拿到 path 后再写 DB
  (async () => {
    let storagePath = null;
    if (snapshot) {
      const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
      const uid = user?.id || currentUserId;
      storagePath = await uploadImageToStorage(snapshot.dataUrl, uid, getActiveConversationId());
      if (storagePath === null) {
        setChatStatus("图片上传失败，消息未发送，请重试");
        // 回滚乐观渲染
        chatMessages.pop();
        msgRow?.remove();
        return;
      }
    }
    const msgId = await saveMessage("user", dbContent, storagePath).catch(() => null);
    if (msgId != null && msgRow) msgRow.dataset.msgId = String(msgId);
    const entry = chatMessages.findLast?.((m) => m.role === "user" && m.id === null);
    if (entry) entry.id = msgId != null ? String(msgId) : null;
    if (autoReplyEnabled) scheduleAutoReply(text);
  })();
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
    if (!autoReplyEnabled) cancelAutoReplyTimer();
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
  initPrincessStatusBar();
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

// ── V2 primary shell / navigation ─────────────────────────────────────────────
function initV2Shell() {
  const pages = Array.from(document.querySelectorAll(".v2-page"));
  const tabs = Array.from(document.querySelectorAll(".bottom-tab"));
  const shell = document.querySelector(".layout");

  function showPage(pageName) {
    const target = pages.find((page) => page.dataset.page === pageName) || pages[0];
    if (!target) return;
    const activeName = target.dataset.page;
    pages.forEach((page) => page.classList.toggle("v2-active", page === target));
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === activeName));
    shell?.setAttribute("data-active-page", activeName);
    if (activeName === "chat") {
      requestAnimationFrame(() => {
        messageList?.scrollTo({ top: messageList.scrollHeight, behavior: "auto" });
        messageInput?.focus({ preventScroll: true });
      });
    }
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => showPage(tab.dataset.tab)));

  document.querySelectorAll("[data-placeholder-route]").forEach((entry) => {
    entry.addEventListener("click", () => {
      const route = entry.dataset.placeholderRoute;
      showDialog({
        title: "入口已预留",
        body: `${route} 将在二级页接入，本轮先保留入口和路由命名。`,
        confirmLabel: "知道了",
      });
    });
  });

  document.querySelectorAll("[data-upload-slot]").forEach((entry) => {
    entry.addEventListener("click", (event) => {
      event.stopPropagation();
      const slot = entry.dataset.uploadSlot;
      showDialog({
        title: "更换入口已预留",
        body: `${slot} 将复用统一上传组件接入，本轮先保留点击入口。`,
        confirmLabel: "知道了",
      });
    });
  });

  document.querySelectorAll("[data-edit-field]").forEach((entry) => {
    entry.addEventListener("click", (event) => {
      event.stopPropagation();
      const field = entry.dataset.editField;
      showDialog({
        title: "编辑入口已预留",
        body: `${field} 将复用统一编辑态组件接入，本轮先保留点击入口。`,
        confirmLabel: "知道了",
      });
    });
  });

  showPage("home");
}

function initV2Composer() {
  const plusButton = document.getElementById("composerMenuBtn");
  const inputBar = document.getElementById("chatForm");
  if (!plusButton || !inputBar) return;

  let emojiButton = document.getElementById("emojiButton");
  if (!emojiButton) {
    emojiButton = document.createElement("button");
    emojiButton.id = "emojiButton";
    emojiButton.type = "button";
    emojiButton.className = "ghost-icon-btn v2-emoji-btn";
    emojiButton.title = "Emoji";
    emojiButton.setAttribute("aria-label", "Emoji");
    emojiButton.innerHTML = '<img src="assets/icons/chat/emoji.svg" alt="">';
    inputBar.insertBefore(emojiButton, plusButton);
  }

  plusButton.innerHTML = '<img src="assets/icons/chat/plus.svg" alt="">';
  plusButton.title = "更多";
  plusButton.setAttribute("aria-label", "更多");

  let panel = null;
  const closePanel = () => {
    panel?.remove();
    panel = null;
    plusButton.classList.remove("active");
  };

  function addPanelItem(group, { label, desc, icon, onClick, disabled = false }) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "plus-panel-item";
    item.disabled = Boolean(disabled);
    item.innerHTML = `<span class="plus-panel-icon">${icon}</span><span><strong>${label}</strong><small>${desc}</small></span>`;
    item.addEventListener("click", () => {
      closePanel();
      onClick?.();
    });
    group.appendChild(item);
  }

  function openPanel() {
    closePanel();
    panel = document.createElement("div");
    panel.className = "plus-panel";

    const actions = document.createElement("div");
    actions.className = "plus-panel-grid";
    addPanelItem(actions, {
      label: "图片上传",
      desc: "相册或文件",
      icon: '<span>＋</span>',
      onClick: () => imageAttachBtn?.click(),
    });
    addPanelItem(actions, {
      label: autoReplyEnabled ? "自动接话开" : "自动接话关",
      desc: "空闲时回应",
      icon: '<img src="assets/icons/chat/regenerate.svg" alt="">',
      onClick: () => {
        autoReplyEnabled = !autoReplyEnabled;
        updateAutoReplyToggle();
        if (!autoReplyEnabled) cancelAutoReplyTimer();
      },
    });
    addPanelItem(actions, {
      label: "戳一下",
      desc: "让 Cha 接话",
      icon: '<img src="assets/icons/chat/poke.svg" alt="">',
      disabled: isReplying || !chatMessages.length,
      onClick: () => triggerReply("forced"),
    });
    panel.appendChild(actions);

    const gamesTitle = document.createElement("div");
    gamesTitle.className = "plus-panel-title";
    gamesTitle.textContent = "游戏模式";
    panel.appendChild(gamesTitle);

    const games = document.createElement("div");
    games.className = "plus-panel-games";
    [
      ["truth-dare.jpg", "真心话大冒险", "/chat/games/truth-dare"],
      ["turtle-soup.jpg", "海龟汤", "/chat/games/turtle-soup"],
      ["trpg.jpg", "跑团", "/chat/games/trpg"],
      ["wicked.jpg", "女巫的毒药", "/chat/games/wicked"],
    ].forEach(([asset, label, route]) => {
      const game = document.createElement("button");
      game.type = "button";
      game.className = "plus-panel-game";
      game.innerHTML = `<img src="assets/icons/games/${asset}" alt=""><span>${label}</span>`;
      game.addEventListener("click", () => {
        closePanel();
        showDialog({
          title: "游戏入口已预留",
          body: `${route} 将接入 sandbox 游戏模式，本轮先保留入口。`,
          confirmLabel: "知道了",
        });
      });
      games.appendChild(game);
    });
    panel.appendChild(games);

    inputBar.parentNode.insertBefore(panel, inputBar);
    plusButton.classList.add("active");
    requestAnimationFrame(() => panel.classList.add("open"));
  }

  plusButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    panel ? closePanel() : openPanel();
  }, true);

  document.addEventListener("click", (event) => {
    if (!panel) return;
    if (panel.contains(event.target) || plusButton.contains(event.target)) return;
    closePanel();
  });
}

initV2Shell();
initV2Composer();

// ── V2 shared status bar ─────────────────────────────────────────────────────
async function initV2StatusBars() {
  const bars = Array.from(document.querySelectorAll(".v2-top-status"));
  if (!bars.length) return;

  let serverBase = new Date();
  let clientBase = Date.now();
  try {
    const response = await fetch(window.location.href, { method: "HEAD", cache: "no-store" });
    const serverDate = response.headers.get("date");
    if (serverDate) {
      const parsed = new Date(serverDate);
      if (!Number.isNaN(parsed.getTime())) {
        serverBase = parsed;
        clientBase = Date.now();
      }
    }
  } catch (_) {
    serverBase = new Date();
    clientBase = Date.now();
  }

  function currentServerTime() {
    return new Date(serverBase.getTime() + (Date.now() - clientBase));
  }

  function formatStatusTime(date) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function updateBars() {
    const timeText = formatStatusTime(currentServerTime());
    bars.forEach((bar) => {
      const parts = bar.querySelectorAll("span");
      if (parts[1]) parts[1].textContent = "冰岛 · -2°C";
      if (parts[2]) parts[2].textContent = timeText;
    });
  }

  bars.forEach((bar) => {
    bar.setAttribute("role", "button");
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("aria-label", "状态设置：定位、天气、时间");
    bar.addEventListener("click", () => {
      showDialog({
        title: "状态设置入口已预留",
        body: "定位、天气和时间将接入统一编辑态；当前默认使用服务器时间，位置和天气暂为冰岛 · -2°C。",
        confirmLabel: "知道了",
      });
    });
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        bar.click();
      }
    });
  });

  updateBars();
  window.setInterval(updateBars, 30 * 1000);
}

initV2StatusBars();

// ── 记忆中枢 Memory Center ─────────────────────────────────────────────────────

const memoryCenterOverlay = document.getElementById("memoryCenterOverlay");
const memoryDebugOverlay = document.getElementById("memoryDebugOverlay");

const MEMORY_PROVIDER_LABELS = {
  persona_memories: "长期记忆",
  mastodon_profile: "用户画像",
  writing_memory: "写作记忆",
  project_memory: "项目记忆",
  relationship_context: "关系上下文",
  life_context: "生活上下文",
  historical_ai_usage: "前世档案",
  openai_archive: "历史档案（已退役）",
  conversation_history: "历史对话",
  mastodon_timeline: "时间线",
  personality_layers: "人格层（已退役）",
};

function getLastMemoryDebug() {
  let debug = window.lastMemoryDebug || null;
  if (!debug) {
    try {
      const stored = localStorage.getItem("lastMemoryDebug");
      if (stored) debug = JSON.parse(stored);
    } catch (_) {}
  }
  return debug;
}

document.getElementById("memoryCenterBtn")?.addEventListener("click", () => {
  openMemoryCenter();
});

document.getElementById("closeMemoryCenterButton")?.addEventListener("click", () => {
  memoryCenterOverlay?.classList.add("hidden");
});



// ── Debug center overlay ───────────────────────────────────────────────────
function openMemoryDebugCenter() {
  if (!memoryDebugOverlay) return;
  memoryCenterOverlay?.classList.add("hidden");
  memoryDebugOverlay.classList.remove("hidden");
  const debug = getLastMemoryDebug();
  updateMemoryCenterCards(debug);
  renderMemoryCenterDebug(debug);
  renderRecentMemoryDebug();
  renderMemoryAuditDebug();
}

document.getElementById("mcDebugOpenBtn")?.addEventListener("click", openMemoryDebugCenter);

document.getElementById("closeMemoryDebugButton")?.addEventListener("click", () => {
  memoryDebugOverlay?.classList.add("hidden");
});

memoryDebugOverlay?.addEventListener("click", (e) => {
  if (e.target === memoryDebugOverlay) memoryDebugOverlay.classList.add("hidden");
});

document.getElementById("memoryDebugBackBtn")?.addEventListener("click", () => {
  memoryDebugOverlay?.classList.add("hidden");
  // openMemoryCenter is now at line ~5063 with full workspace support
  if (memoryCenterOverlay) {
    memoryCenterOverlay.classList.remove("hidden");
    memoryCenterV2State.view = "archive";
    renderMemoryCenterCurrentView();
    refreshMemoryCenterData();
  }
});

function renderMemoryCenterSummary(debug) {
  const personaCountEl = document.getElementById("mcCenterPersonaMemoriesCount");
  const profileCharsEl = document.getElementById("mcCenterProfileChars");
  const projectStatusEl = document.getElementById("mcCenterProjectStatus");

  if (personaCountEl) {
    const count = debug?.persona_memories_count;
    personaCountEl.textContent = typeof count === "number" ? `${count} 条` : "—";
  }

  if (profileCharsEl) {
    const chars = debug?.mastodon_profile_chars;
    const tokens = debug?.mastodon_profile_tokens_estimated ?? Math.ceil((chars || 0) / 3.5);
    profileCharsEl.textContent = chars ? `${chars} chars · ~${tokens} tokens` : "—";
  }

  if (projectStatusEl) {
    if (!debug) {
      projectStatusEl.textContent = "";
    } else if (debug.project_memory_recalled) {
      projectStatusEl.innerHTML =
        `<span class="mc-status-dot mc-status-dot--ok"></span>` +
        `<span class="mc-status-text">本轮已参考</span>`;
    } else {
      projectStatusEl.innerHTML =
        `<span class="mc-status-dot mc-status-dot--idle"></span>` +
        `<span class="mc-status-text">项目话题时参考</span>`;
    }
  }
}

async function renderRecentMemoryDebug() {
  const panel = document.getElementById("mcRecentDebugPanel");
  if (!panel) return;
  panel.innerHTML = '<div class="mc-debug-placeholder">最近记忆元数据加载中...</div>';
  try {
    const userId = currentUserId || "";
    const resp = await memoryFetch(`?type=recent&userId=${encodeURIComponent(userId)}`);
    if (!resp.ok) {
      panel.innerHTML = `<div class="mc-debug-placeholder">最近记忆元数据不可用：HTTP ${resp.status}</div>`;
      return;
    }
    const { source, rows } = await resp.json();
    panel.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      panel.innerHTML = '<div class="mc-debug-placeholder">暂无最近记忆元数据。</div>';
      return;
    }
    const detail = document.createElement("div");
    detail.className = "mc-debug-detail";
    rows.slice(0, 5).forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "mc-debug-row mc-debug-row--stack";
      const key = document.createElement("span");
      key.className = "mc-debug-key";
      key.textContent = `${index + 1}. ${row.category || row.candidate_type || source || "memory"}`;
      const val = document.createElement("span");
      val.className = "mc-debug-val";
      val.textContent = [
        `source=${source || "unknown"}`,
        `source_msg_ids=${Array.isArray(row.source_msg_ids) ? row.source_msg_ids.join(",") || "[]" : "null"}`,
        `confidence=${row.confidence ?? "—"}`,
        `sensitivity=${row.sensitivity ?? "—"}`,
      ].join(" | ");
      item.append(key, val);
      detail.appendChild(item);
    });
    panel.appendChild(detail);
  } catch (err) {
    panel.innerHTML = `<div class="mc-debug-placeholder">最近记忆元数据加载失败：${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

async function renderMemoryAuditDebug() {
  const panel = document.getElementById("mcAuditPanel");
  if (!panel) return;
  panel.innerHTML = '<div class="mc-debug-placeholder">审计加载中...</div>';
  try {
    const res = await memoryFetch("?type=audit");
    if (!res.ok) {
      panel.innerHTML = `<div class="mc-debug-placeholder">审计不可用：HTTP ${res.status}</div>`;
      return;
    }
    const audit = await res.json();
    const memoriesByCategory = audit?.memories?.by_category || {};
    const instructionsByCategory = audit?.instructions?.by_category || {};
    const archive = audit?.openai_archive_entries || {};
    const rows = [
      ["memory_buckets", "旧系统，管理页不展示，不注入"],
      ["distill", "旧沉淀入口保持隐藏"],
      ["openai_archive", `已退役；${archive.enabled_count ?? 0}/${archive.total ?? 0} enabled`],
      ["memories origin_guess", Object.entries(memoriesByCategory).map(([cat, stat]) => `${cat}:${JSON.stringify(stat.origin_distribution || {})}`).join(" | ") || "—"],
      ["instructions origin_guess", Object.entries(instructionsByCategory).map(([cat, stat]) => `${cat}:${stat.origin_guess || "manual_seed_pending_review"}(${stat.count || 0})`).join(" | ") || "—"],
    ];
    panel.innerHTML = "";
    const detail = document.createElement("div");
    detail.className = "mc-debug-detail";
    rows.forEach(([key, val]) => {
      const row = document.createElement("div");
      row.className = "mc-debug-row";
      const keyEl = document.createElement("span");
      keyEl.className = "mc-debug-key";
      keyEl.textContent = key;
      const valEl = document.createElement("span");
      valEl.className = "mc-debug-val";
      valEl.textContent = String(val);
      row.append(keyEl, valEl);
      detail.appendChild(row);
    });
    panel.appendChild(detail);
  } catch (err) {
    panel.innerHTML = `<div class="mc-debug-placeholder">审计加载失败：${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

/**
 * Optimistically renders promoted candidates into the 最近更新 section.
 * Called immediately when poller hits, before memories table write completes.
/**
 * Lightweight toast for memory action feedback.
 */
function showMcToast(msg, isError = false) {
  let el = document.getElementById("mcActionToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "mcActionToast";
    el.className = "mc-action-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle("mc-action-toast--error", isError);
  el.classList.add("mc-action-toast--visible");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("mc-action-toast--visible"), 2200);
}

/**
 * Generate a short title from raw content (≤30 chars, no newlines).
 */
function _mcAutoTitle(content) {
  // Strip common verbose openers so title reflects the core concept
  const PREFIX = /^(用户(?:希望|偏好|需要的是|需要)\s*(?:G|小\s*cha|你)?\s*|G\s*(?:希望|偏好)\s*|小\s*cha\s*(?:希望|偏好)\s*|他(?:希望|偏好)\s*|她(?:希望|偏好)\s*)/;
  let s = (content || "").replace(/\n+/g, " ").trim();
  s = s.replace(PREFIX, "").trim();
  // First phrase before any pause/clause punctuation
  const seg = s.split(/[，。；：！？…、\n]/)[0].trim();
  if (seg.length >= 3 && seg.length <= 18) return seg;
  if (seg.length > 18) return seg.slice(0, 16) + "…";
  // Segment too short — take a slice of the stripped text
  const fallback = s.slice(0, 14).trim();
  return fallback || (content || "").slice(0, 14);
}

/**
 * Generate a 2-line summary from raw content (≤80 chars).
 */
function _mcAutoSummary(content) {
  const PREFIX = /^(用户(?:希望|偏好|需要的是|需要)\s*(?:G|小\s*cha|你)?\s*|G\s*(?:希望|偏好)\s*|小\s*cha\s*(?:希望|偏好)\s*|他(?:希望|偏好)\s*|她(?:希望|偏好)\s*)/;
  let s = (content || "").trim();
  s = s.replace(PREFIX, "").trim();
  const sentenceEnd = s.search(/[。；]/);
  const sentence = sentenceEnd > 0 ? s.slice(0, sentenceEnd + 1) : s;
  if (sentence.length <= 48) return sentence;
  return sentence.slice(0, 48) + "…";
}

/**
 * Build a single mc-recent-item card using DOM API (no innerHTML injection).
 *
 * opts = {
 *   content,          // full text
 *   label,            // status badge text
 *   category,         // type/category badge
 *   timestamp,        // ISO string or epoch
 *   sourcePreview,    // source message preview
 *   memoryId,         // truthy → show disable/delete actions
 *   confidence,       // number 0-1 or null
 *   sensitivity,      // string or null
 *   sourceMsgIds,     // array or null
 * }
 */
function buildRecentMemoryItem({ content, title: titleProp, summary: summaryProp, label, category, timestamp, sourcePreview, memoryId, confidence, sensitivity, sourceMsgIds }) {
  const text = content || "";
  // Prefer DB-supplied title/summary; fall back to auto-generated from content.
  const title = titleProp || _mcAutoTitle(text);
  // Body: prefer explicit summary, then auto-summary, then content itself (never empty).
  const body = summaryProp || _mcAutoSummary(text) || text.slice(0, 80);

  const item = document.createElement("div");
  item.className = "mc-recent-item";

  // ── collapsed header ──────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "mc-recent-header";

  // badge row: category + label
  const badges = document.createElement("div");
  badges.className = "mc-recent-badges";
  if (category) {
    const catEl = document.createElement("span");
    catEl.className = "mc-recent-badge mc-recent-badge--type";
    catEl.textContent = category;
    badges.appendChild(catEl);
  }
  const labelEl = document.createElement("span");
  labelEl.className = "mc-recent-badge mc-recent-badge--status";
  labelEl.textContent = label || "记忆";
  badges.appendChild(labelEl);
  header.appendChild(badges);

  // title
  const titleEl = document.createElement("div");
  titleEl.className = "mc-recent-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);

  // summary body (single source of text in main view — no raw content here)
  const summaryEl = document.createElement("div");
  summaryEl.className = "mc-recent-summary";
  summaryEl.textContent = body;
  header.appendChild(summaryEl);

  item.appendChild(header);

  // ── details panel (collapsed by default) ─────────────────────────────────
  const details = document.createElement("div");
  details.className = "mc-recent-details";
  details.hidden = true;

  // raw content under a disclosure element — debug use only, not shown by default
  if (text) {
    const rawDisclosure = document.createElement("details");
    rawDisclosure.className = "mc-recent-raw-details";
    const rawSummary = document.createElement("summary");
    rawSummary.className = "mc-recent-detail-label mc-recent-raw-toggle";
    rawSummary.textContent = "查看原始注入文本";
    rawDisclosure.appendChild(rawSummary);
    const rawText = document.createElement("div");
    rawText.className = "mc-recent-detail-value mc-recent-full-content";
    rawText.textContent = text;
    rawDisclosure.appendChild(rawText);
    details.appendChild(rawDisclosure);
  }

  // source message preview
  const srcLabel = document.createElement("div");
  srcLabel.className = "mc-recent-detail-label";
  srcLabel.textContent = "来源";
  details.appendChild(srcLabel);
  const srcVal = document.createElement("div");
  srcVal.className = "mc-recent-detail-value";
  srcVal.textContent = sourcePreview ? `「${sourcePreview}」` : "暂无来源";
  details.appendChild(srcVal);

  // last updated
  const date = new Date(timestamp || Date.now());
  const timeStr = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
    " " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const updLabel = document.createElement("div");
  updLabel.className = "mc-recent-detail-label";
  updLabel.textContent = "更新时间";
  details.appendChild(updLabel);
  const updVal = document.createElement("div");
  updVal.className = "mc-recent-detail-value";
  updVal.textContent = timeStr;
  details.appendChild(updVal);

  item.appendChild(details);

  // ── action row ────────────────────────────────────────────────────────────
  const actions = document.createElement("div");
  actions.className = "mc-recent-actions";

  // expand toggle (always present)
  const expandBtn = document.createElement("button");
  expandBtn.className = "mc-recent-action-btn mc-recent-action-btn--expand";
  expandBtn.textContent = "展开";
  expandBtn.addEventListener("click", () => {
    const expanded = !details.hidden;
    details.hidden = expanded;
    expandBtn.textContent = expanded ? "展开" : "收起";
    item.classList.toggle("mc-recent-item--expanded", !expanded);
  });
  actions.appendChild(expandBtn);

  if (memoryId) {
    // copy
    const copyBtn = document.createElement("button");
    copyBtn.className = "mc-recent-action-btn";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(
        () => showMcToast("已复制"),
        () => showMcToast("复制失败", true)
      );
    });
    actions.appendChild(copyBtn);

    // disable
    const disableBtn = document.createElement("button");
    disableBtn.className = "mc-recent-action-btn";
    disableBtn.textContent = "禁用";
    disableBtn.addEventListener("click", async () => {
      if (!confirm("确定禁用这条记忆吗？")) return;
      try {
        const res = await memoryFetch(`?id=${encodeURIComponent(memoryId)}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        });
        if (!res.ok) throw new Error(await res.text());
        showMcToast("已禁用");
        renderRecentMemoryUpdates();
      } catch (e) {
        console.error("[mcAction] disable failed", e);
        showMcToast("操作失败", true);
      }
    });
    actions.appendChild(disableBtn);

    // delete
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "mc-recent-action-btn mc-recent-action-btn--danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("确定删除这条记忆吗？")) return;
      try {
        const res = await memoryFetch(`?id=${encodeURIComponent(memoryId)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error(await res.text());
        showMcToast("已删除");
        renderRecentMemoryUpdates();
      } catch (e) {
        console.error("[mcAction] delete failed", e);
        showMcToast("操作失败", true);
      }
    });
    actions.appendChild(deleteBtn);
  }

  item.appendChild(actions);

  return item;
}

/**
 * @param {Array<{id: string, content: string, promoted_at: string}>} items
 */
function renderRecentMemoryUpdatesOptimistic(items) {
  const container = document.getElementById("mcRecentUpdates");
  if (!container || !items || items.length === 0) return;
  container.innerHTML = "";
  items.slice(0, 3).forEach((item) =>
    container.appendChild(buildRecentMemoryItem({
      content: item.content,
      title: item.title || null,
      summary: item.summary || null,
      label: "自动记忆",
      category: item.category || item.candidate_type || "",
      timestamp: item.promoted_at || Date.now(),
      sourcePreview: null,
      memoryId: null,
      confidence: item.confidence ?? null,
      sensitivity: item.sensitivity ?? null,
      sourceMsgIds: item.source_msg_ids ?? null,
    }))
  );
}

/**
 * 查询并渲染最近 3 条自动沉淀的记忆（source_msg_ids IS NOT NULL）。
 */
async function renderRecentMemoryUpdates() {
  const container = document.getElementById("mcRecentUpdates");
  if (!container) return;
  const hasOptimistic = container.querySelector(".mc-recent-item") !== null;
  if (!hasOptimistic) {
    container.innerHTML = `<div class="mc-recent-loading">加载中…</div>`;
  }

  if (!supabaseClient) {
    if (!hasOptimistic) container.innerHTML = `<div class="mc-recent-empty">还没有当前记忆。聊天后，小钗会把候选记忆放进这里。</div>`;
    return;
  }

  try {
    // ── via Edge Function (service role, bypasses RLS) ─────────────────────
    const userId = currentUserId || "";
    const resp = await memoryFetch(`?type=recent&userId=${encodeURIComponent(userId)}`);
    if (!resp.ok) throw new Error(`recent fetch failed: ${resp.status}`);
    const { source, rows } = await resp.json();
    console.log("[recentMem] source:", source, "rows:", rows?.length, rows);

    if (rows && rows.length > 0) {
      container.innerHTML = "";
      if (source === "memories") {
        rows.forEach((mem) =>
          container.appendChild(buildRecentMemoryItem({
            content: mem.content,
            title: mem.title || null,
            summary: mem.summary || null,
            label: "已写入记忆",
            category: mem.category || "",
            timestamp: mem.created_at,
            sourcePreview: mem.source_preview || null,
            memoryId: mem.id,
            confidence: mem.confidence ?? null,
            sensitivity: mem.sensitivity ?? null,
            sourceMsgIds: mem.source_msg_ids ?? null,
          }))
        );
      } else {
        const LABEL_MAP = {
          promoted: "候选已记忆", approved: "已确认", new: "候选记忆",
          candidate: "候选记忆", pending: "待处理", project: "项目", fact: "事实",
        };
        rows.forEach((c) =>
          container.appendChild(buildRecentMemoryItem({
            content: c.content,
            title: c.title || null,
            summary: c.summary || null,
            label: LABEL_MAP[c.status] || "候选记忆",
            category: c.candidate_type || "",
            timestamp: c.created_at,
            sourcePreview: c.source_preview || null,
            memoryId: null,
            confidence: c.confidence ?? null,
            sensitivity: c.sensitivity ?? null,
            sourceMsgIds: c.source_msg_ids ?? null,
          }))
        );
      }
      return;
    }

    // ── Both empty ─────────────────────────────────────────────────────────
    if (hasOptimistic) {
      const syncHint = container.querySelector(".mc-recent-sync-hint");
      if (!syncHint) {
        const hint = document.createElement("div");
        hint.className = "mc-recent-sync-hint mc-recent-empty";
        hint.textContent = "同步中…";
        container.appendChild(hint);
      }
    } else {
      container.innerHTML = `<div class="mc-recent-empty">还没有当前记忆。聊天后，小钗会把候选记忆放进这里。</div>`;
    }
  } catch (err) {
    console.error("[recentMem] error:", err);
    if (!hasOptimistic) container.innerHTML = `<div class="mc-recent-empty">还没有当前记忆。聊天后，小钗会把候选记忆放进这里。</div>`;
  }
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

  // ── 历史档案（openai_archive，已退役）─────────────────────────────────────
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
    panel.innerHTML = '<div class="mc-debug-placeholder">还没有本轮记忆调试信息，发送一条消息后显示。</div>';
    return;
  }

  // ── 摘要行（始终可见）──────────────────────────────────────────────────
  const providers = Array.isArray(log.active_memory_providers) ? log.active_memory_providers : [];
  const providerCount = log.memory_provider_count ?? providers.length;

  const pillsHtml = providers.map((p) => {
    const label = MEMORY_PROVIDER_LABELS[p] || p;
    return `<span class="mc-debug-pill">${label}</span>`;
  }).join("");

  // ── 折叠详情字段表 ────────────────────────────────────────────────────
  const fields = [
    // 话题
    ["当前话题",               log.topic_route || "—"],
    ["次级话题",               log.secondary_route || "—"],
    ["active_memory_providers", providers.join(", ") || "—"],
    // 长期记忆
    ["长期记忆已加载",         log.persona_memories_loaded],
    ["长期记忆条数",           log.persona_memories_count ?? "—"],
    ["长期记忆类别",           Array.isArray(log.persona_memories_categories) ? log.persona_memories_categories.join(", ") : "—"],
    // 用户画像
    ["用户画像已加载",         log.mastodon_profile_loaded],
    // 写作记忆
    ["写作记忆已召回",         log.writing_memory_recalled],
    ["写作记忆原因",           log.writing_memory_reason || "—"],
    // 项目记忆
    ["项目记忆已召回",         log.project_memory_recalled],
    ["项目记忆命中数",         log.project_memory_hit_count ?? "—"],
    ["项目记忆原因",           log.project_memory_reason || "—"],
    ["项目记忆抑制原因",       log.project_memory_suppressed_reason || "—"],
    // 关系上下文
    ["关系上下文已召回",       log.relationship_context_recalled],
    // 生活上下文
    ["生活上下文已召回",       log.life_context_recalled],
    // 前世档案
    ["前世档案已召回",         log.historical_ai_usage_recalled],
    // 历史档案
    ["历史档案（已退役）",         log.openai_archive_recalled],
    ["历史档案原因",           log.openai_archive_reason || "—"],
    // 旧系统
    ["memory_buckets",        "旧系统，管理页不展示"],
    ["distill",               "旧沉淀入口保持隐藏"],
    // 历史对话
    ["历史对话已召回",         log.conversation_history_recalled],
    ["历史对话命中数",         log.conversation_history_hit_count ?? "—"],
    // 时间线
    ["时间线已召回",           log.timeline_recalled],
    // 汇总
    ["本轮参考来源数",         providerCount],
  ];

  const detailRowsHtml = fields.map(([key, val]) => {
    const valStr = val === null || val === undefined ? "—" : String(val);
    const isTrue = valStr === "true";
    const isFalse = valStr === "false";
    return `<div class="mc-debug-row">
      <span class="mc-debug-key">${key}</span>
      <span class="mc-debug-val${isTrue ? " mc-debug-val--true" : isFalse ? " mc-debug-val--false" : ""}">${valStr}</span>
    </div>`;
  }).join("");

  const detailId = "mcDebugDetail";

  panel.innerHTML = `
    <div class="mc-debug-summary">
      <div class="mc-debug-summary-top">
        <div class="mc-debug-pills">${pillsHtml || '<span class="mc-debug-pill mc-debug-pill--empty">无</span>'}</div>
        <div class="mc-debug-summary-meta">${providerCount} 个来源</div>
      </div>
      <div class="mc-debug-actions">
        <button class="mc-debug-btn" id="mcDebugToggle" aria-expanded="false" aria-controls="${detailId}">展开详情</button>
        <button class="mc-debug-btn mc-debug-btn--copy" id="mcDebugCopy">复制 JSON</button>
      </div>
    </div>
    <div class="mc-debug-detail" id="${detailId}" hidden>
      ${detailRowsHtml}
    </div>
  `;

  // 折叠切换
  panel.querySelector("#mcDebugToggle")?.addEventListener("click", () => {
    const detail = panel.querySelector(`#${detailId}`);
    const btn = panel.querySelector("#mcDebugToggle");
    if (!detail || !btn) return;
    const isHidden = detail.hidden;
    detail.hidden = !isHidden;
    btn.textContent = isHidden ? "收起详情" : "展开详情";
    btn.setAttribute("aria-expanded", String(isHidden));
  });

  // 复制 JSON
  panel.querySelector("#mcDebugCopy")?.addEventListener("click", () => {
    const btn = panel.querySelector("#mcDebugCopy");
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
      if (btn) { btn.textContent = "已复制"; setTimeout(() => { btn.textContent = "复制 JSON"; }, 1500); }
    }).catch(() => {
      if (btn) { btn.textContent = "复制失败"; setTimeout(() => { btn.textContent = "复制 JSON"; }, 1500); }
    });
  });
}

// ── Vault After Chat ──────────────────────────────────────────────────────────
// Fire-and-forget: called after stream ends + assistant message saved.
// Sends user+assistant text to memories?type=vault_after_chat for P1+P2.
// Never blocks UI. On success with promoted_count > 0 shows memory toast.

async function triggerVaultAfterChat({ userMessage, assistantMessage, userMessageId, conversationId, route }) {
  const endpoint = getMemoryEndpoint();
  if (!endpoint) return;
  if (!currentUserId) return;
  if (!userMessage || !assistantMessage) return;
  // Require admin token — same token used by Memory Center.
  // If not configured, skip silently: vault is a best-effort feature.
  const token = getMemoryToken();
  if (!token) {
    console.warn("[vault] skipped no token");
    return;
  }
  // Guard: warn if userMessage looks wrong (empty after trim, or suspiciously short)
  const trimmedUser = userMessage.trim();
  if (!trimmedUser) {
    console.warn("[vault] skipped: userMessage is empty after trim");
    return;
  }
  if (trimmedUser.length < 8) {
    console.warn("[vault] skipped: userMessage too short", { len: trimmedUser.length, preview: trimmedUser });
    return;
  }
  console.log("[vault] request start", {
    userMessage_len: trimmedUser.length,
    assistantMessage_len: assistantMessage.length,
    userMessageHead: trimmedUser.slice(0, 30),
    userMessageId,
    conversationId,
    route,
  });
  try {
    const res = await fetch(endpoint + "?type=vault_after_chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-memory-admin-token": token },
      body: JSON.stringify({
        userId: currentUserId,
        conversationId: conversationId || null,
        userMessage,
        assistantMessage,
        userMessageId: userMessageId != null ? Number(userMessageId) : null,
        route: route || null,
      }),
    });
    if (!res.ok) {
      console.warn("[vault] response non-ok:", res.status);
      return;
    }
    const data = await res.json();
    console.log("[vault] response", {
      ok: data.ok,
      error: data.error ?? data.reason ?? null,
      inserted_count: data.p1?.inserted_count ?? null,
      pending_count: data.p1?.pending_count ?? null,
      auto_accept_count: data.p1?.auto_accept_count ?? null,
      promoted_count: data.promoted_count ?? null,
      p2_skipped: data.p2?.skipped_count ?? null,
      p2_duplicate: data.p2?.duplicate_count ?? null,
    });
    if (data.debug) {
      console.log("[vault] debug", {
        userMessage_len: data.debug.userMessage_len,
        userMessage_head: data.debug.userMessage_head,
        model: data.debug.model,
        has_base_url: data.debug.has_provider_base_url,
        has_api_key: data.debug.has_provider_api_key,
        p1_raw: data.debug.p1_raw_candidates_count,
        extraction_event: data.debug.extraction_event,
        extraction_text_head: data.debug.extraction_text_head,
        extraction_error: data.debug.extraction_error,
      });
    }
    if (data.ok && typeof data.promoted_count === "number" && data.promoted_count > 0) {
      console.log("[vault] show toast", data.promoted_count);
      showMemoryToast(data.promoted_count);
    }
  } catch (err) {
    console.warn("[vault] vault_after_chat error:", err);
  }
}

// ── Memory Promotion Poller ────────────────────────────────────────────────────
// After stream ends, polls auto_memory_candidates for new promotions for up to 8s.
// Stops on first hit. Prevents duplicate toasts via _seenPromotedIds.

const _seenPromotedIds = new Set();
let _currentRequestStartTime = null;
let _currentRequestUserMessageId = null;

async function startMemoryPromotionPoller(sinceIso, userMessageId) {
  if (!supabaseClient || !sinceIso) return;
  const MAX_MS = 8000;
  const INTERVAL_MS = 1000;
  const start = Date.now();

  async function poll() {
    if (Date.now() - start >= MAX_MS) return;

    try {
      let query = supabaseClient
        .from("auto_memory_candidates")
        .select("id, content, promoted_at")
        .eq("status", "promoted")
        .gte("promoted_at", sinceIso)
        .order("promoted_at", { ascending: false })
        .limit(5);

      if (userMessageId != null) {
        query = query.contains("source_msg_ids", [userMessageId]);
      }

      const { data, error } = await query;
      if (error || !data) { setTimeout(poll, INTERVAL_MS); return; }

      const newItems = data.filter(r => !_seenPromotedIds.has(r.id));
      if (newItems.length > 0) {
        newItems.forEach(r => _seenPromotedIds.add(r.id));
        showMemoryToast(newItems.length);
        // Optimistically render promoted candidates immediately,
        // then re-fetch from memories after a short delay for final consistency.
        renderRecentMemoryUpdatesOptimistic(newItems);
        setTimeout(() => renderRecentMemoryUpdates(), 2000);
        return; // stop polling
      }
    } catch (_) {}

    setTimeout(poll, INTERVAL_MS);
  }

  setTimeout(poll, INTERVAL_MS); // first check after 1s
}

// ── Memory Toast ──────────────────────────────────────────────────────────────
// Call showMemoryToast(n) after a successful P2 promotion.
// n = number of promoted memories (1 → "记忆已更新", n>1 → "记住了 n 条新内容")
// Exposed on window for manual testing: window.showMemoryToast(1)

let _memoryToastTimer = null;

function showMemoryToast(count) {
  console.log("[memory-toast] show", count);
  const n = typeof count === "number" ? count : 1;
  const msg = n > 1 ? `记忆已更新 ×${n}` : "记忆已更新";

  // Remove any existing toast first
  const existing = document.querySelector(".memory-toast");
  if (existing) existing.remove();
  if (_memoryToastTimer) { clearTimeout(_memoryToastTimer); _memoryToastTimer = null; }

  const toast = document.createElement("div");
  toast.className = "memory-toast toast-enter";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `<span class="memory-toast-icon">✦</span><span>${msg}</span>`;
  toast.title = "小 cha 记住了一点新的东西";
  toast.addEventListener("click", () => {
    toast.classList.add("toast-exit");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    if (_memoryToastTimer) { clearTimeout(_memoryToastTimer); _memoryToastTimer = null; }
    openMemoryCenter();
  }, { once: true });
  document.body.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.remove("toast-enter"));
  });

  // Auto-dismiss after 2.8s
  _memoryToastTimer = setTimeout(() => {
    toast.classList.add("toast-exit");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    _memoryToastTimer = null;
  }, 2800);
}

window.showMemoryToast = showMemoryToast;

// Fullscreen Memory Center v2.
// Keeps the legacy advanced memory manager hidden and preserves the existing
// auto-memory promotion path by overriding only the visible center renderers.

var memoryCenterV2State = {
  view: "room",
  recentSource: "",
  recentRows: [],
  memories: [],
  instructions: [],
  audit: null,
  loadingRecent: false,
  loadingArchive: false,
  loadingAudit: false,
  recentError: "",
  archiveError: "",
  auditError: "",
  archiveLoaded: false,
  auditLoaded: false,
  query: "",
  statusFilter: "all",
  categoryFilter: "all",
};

var MEMORY_CENTER_CATEGORY_CONFIG = {
  project: { label: "项目记忆", short: "项目", desc: "项目、工作和学习的共同推进", tone: "project" },
  relation: { label: "关系记忆", short: "关系", desc: "我们之间的重要时刻和情感连接", tone: "relation" },
  life: { label: "生活记忆", short: "生活", desc: "日常、兴趣爱好和生活点滴", tone: "life" },
  writing: { label: "写作记忆", short: "写作", desc: "创作、文章和灵感的讨论", tone: "writing" },
  identity: { label: "身份设定", short: "身份", desc: "关于你的偏好、性格和重要设定", tone: "identity" },
  preference: { label: "交互偏好", short: "偏好", desc: "你的习惯、风格和交互方式", tone: "preference" },
  background: { label: "常驻背景", short: "背景", desc: "每轮注入的常驻通用背景", tone: "background" },
};

var MEMORY_CENTER_VIEW_META = {
  room: { title: "cha 的房间", subtitle: "我们一起经历的，都好好收着" },
  archive: { title: "档案馆", subtitle: "我们所有的记忆，按类收着" },
  timeline: { title: "时间线", subtitle: "我们一起走过的日子，按时间倒着翻" },
  lab: { title: "实验室", subtitle: "记忆召回、注入与运行详情 · 仅供调试" },
};

function mcEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function mcSafeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function mcDateKey(value) {
  const date = mcSafeDate(value);
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mcFormatDateTime(value) {
  const date = mcSafeDate(value);
  if (!date) return "暂无时间";
  const day = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function mcAutoTitle(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "未命名记忆";
  const first = text.split(/[，。；：！？…\n]/)[0].trim();
  const title = first || text;
  return title.length > 24 ? `${title.slice(0, 23)}...` : title;
}

function mcAutoSummary(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "暂无摘要";
  return text.length > 84 ? `${text.slice(0, 83)}...` : text;
}

function mcCategoryKey(category, source) {
  const raw = String(category || "").toLowerCase();
  if (source === "instructions") return "background";
  if (["project_memory", "work", "project"].includes(raw)) return "project";
  if (["relationship_context", "relation", "relationship"].includes(raw)) return "relation";
  if (["life_context", "life"].includes(raw)) return "life";
  if (["writing_memory", "writing"].includes(raw)) return "writing";
  if (["identity_context", "persona", "preference"].includes(raw)) return "identity";
  if (["interaction_preferences"].includes(raw)) return "preference";
  return "background";
}

function mcStatusLabel(item) {
  if (item.source === "instructions") return "常驻";
  if (item.source === "recent") return item.statusLabel || "最近";
  return item.enabled === false ? "停用" : "已写入";
}

function normalizeMemoryDisplayItems() {
  const state = memoryCenterV2State;
  const seen = new Set();
  const seenIds = new Set(); // Track IDs across all sources
  const items = [];

  function push(row, source, extra) {
    if (!row) return;
    const id = row.id || `${source}-${items.length}`;
    const key = `${source}:${id}`;
    if (seen.has(key)) return;

    // Dedup: if this ID exists in memories/instructions, skip recent duplicate
    if (source === "recent" && row.id && seenIds.has(row.id)) return;

    seen.add(key);
    if (row.id) seenIds.add(row.id);

    // Clean text fields with trim()
    const rawContent = String(row.content || "").trim();
    const rawSummary = String(row.summary || "").trim();
    const rawTitle = String(row.title || "").trim();
    const rawSourcePreview = String(row.source_preview || "").trim();

    const content = rawContent || rawSummary || rawTitle || "";
    const category = row.category || row.domain || row.candidate_type || extra?.category || "general";
    const categoryKey = mcCategoryKey(category, source);
    const config = MEMORY_CENTER_CATEGORY_CONFIG[categoryKey] || MEMORY_CENTER_CATEGORY_CONFIG.background;

    const tags = Array.isArray(row.tags) ? row.tags : (row.tags ? String(row.tags).split(",").map((t) => t.trim()).filter(Boolean) : []);
    const title = rawTitle || extra?.title || mcAutoTitle(content);
    const summary = rawSummary || rawSourcePreview || extra?.summary || mcAutoSummary(content);
    items.push({
      id,
      source,
      title,
      summary,
      content,
      category,
      categoryKey,
      categoryLabel: config.label,
      categoryShort: config.short,
      tone: config.tone,
      enabled: row.enabled !== false,
      createdAt: row.created_at || row.updated_at || row.promoted_at || extra?.createdAt || null,
      updatedAt: row.updated_at || null,
      sourcePreview: rawSourcePreview,
      status: row.status || "",
      statusLabel: extra?.statusLabel || row.status || "",
      // bridge 新增字段
      tags,
      importance: typeof row.importance === "number" ? row.importance : null,
      sourceType: source,
      isInstruction: source === "instructions",
      isRecent: source === "recent",
      isEnabled: row.enabled !== false,
      raw: row,
      searchText: [title, summary, content, ...tags, config.label].join(" ").toLowerCase(),
    });
  }

  state.memories.forEach((row) => push(row, "memories"));
  state.instructions.forEach((row) => push(row, "instructions"));
  state.recentRows.forEach((row) => {
    const labelMap = {
      promoted: "候选已记忆",
      approved: "已确认",
      new: "候选记忆",
      candidate: "候选记忆",
      pending: "待处理",
    };
    push(row, "recent", { statusLabel: labelMap[row.status] || (state.recentSource === "memories" ? "已写入" : "最近沉淀") });
  });

  return items.sort((a, b) => {
    const at = mcSafeDate(a.createdAt)?.getTime() || 0;
    const bt = mcSafeDate(b.createdAt)?.getTime() || 0;
    return bt - at;
  });
}

// ── Memory Center Bridge ──────────────────────────────────────────────────────
// Getters and fetch wrappers. Four render functions consume only these;
// they do not read memoryCenterV2State raw fields directly (except
// state.query / state.statusFilter which are UI-interaction values).

function mcBridgeGetDisplayItems() {
  return normalizeMemoryDisplayItems();
}

function mcBridgeGetArchiveItems(query, statusFilter, categoryFilter) {
  const items = normalizeMemoryDisplayItems();
  const q = (query || "").trim().toLowerCase();
  const filter = statusFilter || "all";
  const catFilter = categoryFilter || "all";
  return items.filter((item) => {
    const matchesQuery = !q || item.searchText.includes(q);
    // Archive default: exclude recent (memories + instructions only)
    // Recent only shows when explicitly selected
    const matchesStatus =
      (filter === "all" && item.source !== "recent") ||
      (filter === "enabled" && item.source === "memories" && item.enabled !== false) ||
      (filter === "disabled" && item.enabled === false) ||
      (filter === "instructions" && item.source === "instructions") ||
      (filter === "recent" && item.source === "recent");
    const matchesCategory = catFilter === "all" || item.categoryKey === catFilter;
    return matchesQuery && matchesStatus && matchesCategory;
  });
}

function mcBridgeGetTimelineItems() {
  return normalizeMemoryDisplayItems().filter((item) => mcSafeDate(item.createdAt));
}

function mcBridgeGetLabSnapshot() {
  const state = memoryCenterV2State;
  const debug = getLastMemoryDebug();
  const items = normalizeMemoryDisplayItems();
  return {
    debug,
    audit: state.audit,
    recentRows: state.recentRows,
    displayItems: items,
    sourceDistribution: {
      total: items.length,
      memories: items.filter((i) => i.sourceType === "memories").length,
      instructions: items.filter((i) => i.isInstruction).length,
      recent: items.filter((i) => i.isRecent).length,
    },
    loadingStates: {
      loadingRecent: state.loadingRecent,
      loadingArchive: state.loadingArchive,
      loadingAudit: state.loadingAudit,
      archiveLoaded: state.archiveLoaded,
      auditLoaded: state.auditLoaded,
    },
    errors: {
      recentError: state.recentError,
      archiveError: state.archiveError,
      auditError: state.auditError,
    },
    recentSource: state.recentSource,
  };
}

async function mcBridgeFetchRecent() {
  const state = memoryCenterV2State;
  state.loadingRecent = true;
  state.recentError = "";
  try {
    const userId = currentUserId || "";
    const data = await fetchMemoryCenterJson(`?type=recent&userId=${encodeURIComponent(userId)}`);
    state.recentSource = data.source || "";
    state.recentRows = Array.isArray(data.rows) ? data.rows : [];
  } catch (err) {
    state.recentError = err instanceof Error ? err.message : String(err);
  } finally {
    state.loadingRecent = false;
  }
}

async function mcBridgeFetchMemories() {
  const state = memoryCenterV2State;
  try {
    const value = await fetchMemoryCenterJson("");
    state.memories = Array.isArray(value) ? value : [];
    return true;
  } catch (err) {
    state.archiveError = err?.message || "档案加载失败";
    return false;
  }
}

async function mcBridgeFetchInstructions() {
  const state = memoryCenterV2State;
  try {
    const value = await fetchMemoryCenterJson("?type=instructions");
    state.instructions = Array.isArray(value) ? value : [];
    return true;
  } catch (err) {
    if (!state.archiveError) state.archiveError = err?.message || "常驻背景加载失败";
    return false;
  }
}

async function mcBridgeFetchAudit() {
  const state = memoryCenterV2State;
  try {
    state.audit = await fetchMemoryCenterJson("?type=audit");
    state.auditLoaded = true;
    return true;
  } catch (err) {
    state.auditError = err?.message || "审计加载失败";
    return false;
  }
}

async function mcBridgeRefreshAll() {
  const state = memoryCenterV2State;

  // Phase 1: recent (no token required)
  state.loadingRecent = true;
  state.recentError = "";
  renderMemoryCenterCurrentView();
  await mcBridgeFetchRecent();
  renderMemoryCenterCurrentView();

  // Phase 2: archive + audit (token required)
  if (!getMemoryToken()) {
    state.archiveError = "需要记忆口令后显示完整档案";
    state.auditError = "需要记忆口令后显示审计";
    return;
  }

  state.loadingArchive = true;
  state.loadingAudit = true;
  state.archiveError = "";
  state.auditError = "";
  renderMemoryCenterCurrentView();

  const [memOk, instOk, auditOk] = await Promise.all([
    mcBridgeFetchMemories(),
    mcBridgeFetchInstructions(),
    mcBridgeFetchAudit(),
  ]);

  state.archiveLoaded = memOk || instOk;
  state.loadingArchive = false;
  state.loadingAudit = false;
  renderMemoryCenterCurrentView();
}

// ── End Memory Center Bridge ──────────────────────────────────────────────────


function mcSetHeader(view) {
  const meta = MEMORY_CENTER_VIEW_META[view] || MEMORY_CENTER_VIEW_META.room;
  const title = document.getElementById("mcViewTitle");
  const subtitle = document.getElementById("mcViewSubtitle");
  const back = document.getElementById("mcBackButton");
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.subtitle;
  if (back) back.classList.toggle("hidden", view === "room");
  // 同步桌面 nav active 态
  document.querySelectorAll(".mc-nav-item").forEach((btn) => {
    const isActive = btn.dataset.mcView === view;
    btn.classList.toggle("mc-nav-item--active", isActive);
  });
}

function mcRenderEmpty(root, text) {
  root.appendChild(mcEl("div", "mc-empty", text));
}

function mcRenderBadge(text, tone) {
  const badge = mcEl("span", `mc-chip mc-chip--${tone || "background"}`, text);
  return badge;
}

function mcRenderMemoryCard(item, compact = false) {
  const card = mcEl("article", "mc-memory-card");
  const top = mcEl("div", "mc-memory-card-top");
  const chips = mcEl("div", "mc-chip-row");
  chips.appendChild(mcRenderBadge(item.categoryShort, item.tone));
  chips.appendChild(mcRenderBadge(mcStatusLabel(item), "status"));
  top.appendChild(chips);
  top.appendChild(mcEl("span", "mc-memory-time", mcFormatDateTime(item.createdAt)));

  const title = mcEl("h3", "mc-memory-title", item.title);
  const summary = mcEl("p", "mc-memory-summary", item.summary);
  card.append(top, title, summary);

  // Full content (collapsed by default)
  let fullEl = null;
  const hasFullContent = item.content && item.content.trim().length > 0;
  if (hasFullContent) {
    fullEl = mcEl("div", "mc-memory-full");
    fullEl.textContent = item.content;
    // Don't use .hidden, let CSS handle display via .mc-memory-card--expanded
    card.appendChild(fullEl);
  }

  if (!compact && item.sourcePreview) {
    const source = mcEl("div", "mc-memory-source", `来源：${item.sourcePreview}`);
    card.appendChild(source);
  }

  // Add actions section (only if not compact AND not read-only recent)
  if (!compact && item.source !== "recent") {
    const actions = mcEl("div", "mc-memory-actions");

    // Expand button (only if content has actual text after trim)
    if (hasFullContent) {
      const expandBtn = mcEl("button", "mc-action-btn", "展开");
      expandBtn.type = "button";
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExp = card.classList.toggle("mc-memory-card--expanded");
        expandBtn.textContent = isExp ? "收起" : "展开";
      });
      actions.appendChild(expandBtn);
    }

    // Toggle enable/disable (for memories and instructions)
    if (item.source === "memories" || item.source === "instructions") {
      const isEnabled = item.enabled !== false;
      const toggleBtn = mcEl("button", "mc-action-btn", isEnabled ? "禁用" : "启用");
      toggleBtn.type = "button";
      toggleBtn.dataset.id = item.id;
      toggleBtn.dataset.enabled = String(isEnabled);
      toggleBtn.dataset.source = item.source;

      toggleBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        const newEnabled = btn.dataset.enabled !== "true";
        const isInstruction = btn.dataset.source === "instructions";

        let path = `?id=${encodeURIComponent(btn.dataset.id)}`;
        if (isInstruction) path = `?type=instructions&id=${encodeURIComponent(btn.dataset.id)}`;

        let r;
        try {
          r = await memoryFetch(path, {
            method: "PATCH",
            body: JSON.stringify({ enabled: newEnabled }),
          });
        } catch (err) {
          btn.disabled = false;
          showMcToast(`网络错误：${err.message}`, true);
          return;
        }

        btn.disabled = false;
        if (!r.ok) {
          if (r.status === 401) {
            sessionStorage.removeItem("memory_admin_token");
            showMcToast("口令过期，请刷新页面", true);
          } else {
            let msg = `操作失败（${r.status}）`;
            try { const j = await r.json(); msg = j.error || j.message || msg; } catch {}
            showMcToast(msg, true);
          }
          return;
        }

        let updated;
        try { updated = await r.json(); } catch { updated = null; }
        if (updated && updated.id) {
          updateMemoryItem(updated, isInstruction);
        } else {
          const cached = isInstruction
            ? memoryCenterV2State.instructions.find(i => i.id === item.id)
            : memoryCenterV2State.memories.find(m => m.id === item.id);
          if (cached) updateMemoryItem({ ...cached, enabled: newEnabled }, isInstruction);
        }
        showMcToast(newEnabled ? "已启用" : "已停用");
      });

      actions.appendChild(toggleBtn);
    }

    // Edit button (only for memories, not instructions)
    if (item.source === "memories") {
      const editBtn = mcEl("button", "mc-action-btn", "编辑");
      editBtn.type = "button";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = memoryCenterV2State.memories.find(m => m.id === item.id) || item.raw;
        showMemoryEditDialog(current, null);
      });
      actions.appendChild(editBtn);
    }

    // Delete button (for memories and instructions)
    if (item.source === "memories" || item.source === "instructions") {
      const deleteBtn = mcEl("button", "mc-action-btn mc-action-btn--danger", "删除");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isInstruction = item.source === "instructions";
        showDialog({
          title: isInstruction ? "删除设定" : "删除记忆",
          body: isInstruction ? "确定删除这条设定？" : "确定删除这条记忆？",
          confirmLabel: "删除",
          confirmClass: "btn-danger",
          onConfirm: async () => {
            let path = `?id=${encodeURIComponent(item.id)}`;
            if (isInstruction) path = `?type=instructions&id=${encodeURIComponent(item.id)}`;

            let r;
            try {
              r = await memoryFetch(path, { method: "DELETE" });
            } catch (err) {
              showMcToast(`网络错误：${err.message}`, true);
              return;
            }

            if (!r.ok) {
              if (r.status === 401) {
                sessionStorage.removeItem("memory_admin_token");
                showMcToast("口令过期，请刷新页面", true);
              } else {
                let msg = `删除失败（${r.status}）`;
                try { const j = await r.json(); msg = j.error || j.message || msg; } catch {}
                showMcToast(msg, true);
              }
              return;
            }

            removeMemoryItem(item.id, isInstruction);
            showMcToast("已删除");
          },
        });
      });
      actions.appendChild(deleteBtn);
    }

    card.appendChild(actions);
  }

  return card;
}

function switchMemoryCenterView(view, options = {}) {
  memoryCenterV2State.view = view;
  renderMemoryCenterCurrentView(options);
}

function renderMemoryCenterCurrentView(options = {}) {
  const root = document.getElementById("mcViewRoot");
  if (!root) return;
  root.innerHTML = "";
  // 视图专属 class，供 CSS 控制各视图宽度
  root.className = `mc-view-root mc-view-root--${memoryCenterV2State.view}`;
  mcSetHeader(memoryCenterV2State.view);

  if (memoryCenterV2State.view === "archive") {
    renderMemoryArchiveView(root, options);
  } else if (memoryCenterV2State.view === "timeline") {
    renderMemoryTimelineView(root);
  } else if (memoryCenterV2State.view === "lab") {
    renderMemoryLabView(root);
  } else {
    renderMemoryRoomView(root);
  }
}

function renderMemoryRoomView(root) {
  const items = mcBridgeGetDisplayItems();
  const debug = getLastMemoryDebug();

  const status = mcEl("div", "mc-room-status");
  const avatar = mcEl("div", "mc-room-avatar", "⌂");
  const copy = mcEl("div", "mc-room-copy");
  copy.append(
    mcEl("div", "mc-room-title", "cha 的房间"),
    mcEl("div", "mc-room-subtitle", "我们一起经历的，都好好收着")
  );
  const online = mcEl("div", "mc-online");
  online.append(mcEl("span", "mc-online-dot"), document.createTextNode("记忆中心在线"));
  status.append(avatar, copy, online);
  root.appendChild(status);

  const section = mcEl("section", "mc-section");
  section.appendChild(mcEl("h2", "mc-section-title", "最近"));
  const recentWrap = mcEl("div", "mc-card-list");
  const _snap = mcBridgeGetLabSnapshot();
  if (_snap.loadingStates.loadingRecent && !items.length) {
    mcRenderEmpty(recentWrap, "加载中...");
  } else if (items.length) {
    items.slice(0, 2).forEach((item) => recentWrap.appendChild(mcRenderMemoryCard(item, true)));
  } else {
    mcRenderEmpty(recentWrap, _snap.errors.recentError || "还没有当前记忆。");
  }
  section.appendChild(recentWrap);
  root.appendChild(section);

  const archiveLink = mcEl("button", "mc-inline-link", `走进档案馆，看更早的记忆（共 ${items.length} 条） →`);
  archiveLink.type = "button";
  archiveLink.addEventListener("click", () => switchMemoryCenterView("archive"));
  root.appendChild(archiveLink);

  const actions = mcEl("div", "mc-room-actions");
  [
    ["档案馆", "archive", false],
    ["实验室", "lab", false],
  ].forEach(([label, view, focus]) => {
    const btn = mcEl("button", "mc-room-action-btn", label);
    btn.type = "button";
    btn.addEventListener("click", () => switchMemoryCenterView(view, { focusSearch: Boolean(focus) }));
    actions.appendChild(btn);
  });
  root.appendChild(actions);

  if (debug?.active_memory_providers?.length) {
    const note = mcEl("div", "mc-footnote", `本轮参考：${debug.active_memory_providers.length} 个来源`);
    root.appendChild(note);
  }
}

function renderMemoryArchiveView(root, options = {}) {
  const items = mcBridgeGetDisplayItems();
  const toolbar = mcEl("div", "mc-archive-toolbar");
  const input = mcEl("input", "mc-search-input");
  input.type = "search";
  input.placeholder = "找一段记忆...";
  input.value = memoryCenterV2State.query;
  input.addEventListener("input", (event) => {
    memoryCenterV2State.query = event.target.value;
    renderMemoryCenterCurrentView({ focusSearch: true });
  });

  const select = mcEl("select", "mc-status-select");
  [
    ["all", "全部状态"],
    ["enabled", "已写入"],
    ["disabled", "停用"],
    ["instructions", "常驻"],
    ["recent", "最近沉淀"],
  ].forEach(([value, label]) => {
    const option = mcEl("option", "", label);
    option.value = value;
    option.selected = memoryCenterV2State.statusFilter === value;
    select.appendChild(option);
  });
  select.addEventListener("change", (event) => {
    memoryCenterV2State.statusFilter = event.target.value;
    renderMemoryCenterCurrentView();
  });

  const catSelect = mcEl("select", "mc-status-select");
  const catOptions = [["all", "全部分类"], ...Object.entries(MEMORY_CENTER_CATEGORY_CONFIG).map(([key, cfg]) => [key, cfg.label])];
  catOptions.forEach(([value, label]) => {
    const option = mcEl("option", "", label);
    option.value = value;
    option.selected = memoryCenterV2State.categoryFilter === value;
    catSelect.appendChild(option);
  });
  catSelect.addEventListener("change", (event) => {
    memoryCenterV2State.categoryFilter = event.target.value;
    renderMemoryCenterCurrentView();
  });

  toolbar.append(input, select, catSelect);
  root.appendChild(toolbar);

  const grid = mcEl("div", "mc-category-grid");
  Object.entries(MEMORY_CENTER_CATEGORY_CONFIG).forEach(([key, config]) => {
    const count = items.filter((item) => item.categoryKey === key).length;
    const card = mcEl("button", "mc-category-card");
    card.type = "button";
    card.addEventListener("click", () => {
      memoryCenterV2State.categoryFilter = key;
      renderMemoryCenterCurrentView();
    });
    const head = mcEl("div", "mc-category-head");
    head.append(mcRenderBadge(config.short, config.tone), mcEl("span", "mc-category-count", count));
    card.append(head, mcEl("div", "mc-category-title", config.label), mcEl("div", "mc-category-desc", config.desc), mcEl("div", "mc-category-open", "翻开 →"));
    grid.appendChild(card);
  });
  root.appendChild(grid);

  const list = mcEl("div", "mc-card-list mc-card-list--archive");
  const filtered = mcBridgeGetArchiveItems(memoryCenterV2State.query, memoryCenterV2State.statusFilter, memoryCenterV2State.categoryFilter);
  const _archiveSnap = mcBridgeGetLabSnapshot();

  if (_archiveSnap.loadingStates.loadingArchive && !_archiveSnap.loadingStates.archiveLoaded) {
    mcRenderEmpty(list, "档案加载中...");
  } else if (!getMemoryToken() && !_archiveSnap.loadingStates.archiveLoaded) {
    const authPrompt = mcEl("div", "mc-auth-prompt");
    authPrompt.innerHTML = `
      <div class="mc-auth-icon">🔒</div>
      <div class="mc-auth-title">需要记忆口令</div>
      <div class="mc-auth-desc">输入口令后可查看完整档案并进行管理操作</div>
    `;
    const authBtn = mcEl("button", "mc-auth-btn", "输入口令");
    authBtn.type = "button";
    authBtn.addEventListener("click", () => {
      showDialog({
        title: "记忆管理口令",
        input: "",
        inputType: "password",
        confirmLabel: "确定",
        onConfirm: (val) => {
          if (val) {
            sessionStorage.setItem("memory_admin_token", val);
            mcBridgeRefreshAll();
          }
        },
      });
    });
    authPrompt.appendChild(authBtn);
    list.appendChild(authPrompt);

    // Still show recent items
    const recentTitle = mcEl("h3", "mc-section-subtitle", "最近沉淀（无需口令）");
    list.appendChild(recentTitle);
    items.filter((item) => item.source === "recent").forEach((item) => list.appendChild(mcRenderMemoryCard(item)));
  } else if (filtered.length) {
    filtered.forEach((item) => list.appendChild(mcRenderMemoryCard(item)));
  } else {
    mcRenderEmpty(list, _archiveSnap.errors.archiveError || "没有匹配的记忆。");
  }
  root.appendChild(list);

  if (options.focusSearch) {
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
}

function renderMemoryTimelineView(root) {
  const items = mcBridgeGetTimelineItems();
  const intro = mcEl("div", "mc-footnote", "热力条只代表当前已加载数据，不代表全量历史。");
  root.appendChild(intro);

  const heat = mcEl("div", "mc-heat-panel");
  const now = new Date();
  const monthLabel = `${now.getFullYear()} · ${now.getMonth() + 1}月`;
  heat.appendChild(mcEl("div", "mc-heat-label", monthLabel));
  const counts = new Map();
  items.forEach((item) => {
    const key = mcDateKey(item.createdAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const maxCount = Math.max(1, ...counts.values());
  const cells = mcEl("div", "mc-heat-cells");
  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = mcDateKey(date);
    const count = counts.get(key) || 0;
    const level = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
    const cell = mcEl("span", `mc-heat-cell mc-heat-cell--${level}`);
    cell.title = `${key}: ${count} 条`;
    cells.appendChild(cell);
  }
  heat.appendChild(cells);
  root.appendChild(heat);

  const list = mcEl("div", "mc-timeline-list");
  if (!items.length) {
    mcRenderEmpty(list, "当前没有可用于时间线的已加载记忆。");
  } else {
    let lastDay = "";
    items.forEach((item) => {
      const day = mcDateKey(item.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        list.appendChild(mcEl("div", "mc-timeline-day", day));
      }
      const row = mcEl("article", "mc-timeline-item");
      row.append(mcRenderBadge(item.categoryShort, item.tone));
      const body = mcEl("div", "mc-timeline-body");
      body.append(mcEl("div", "mc-timeline-title", item.title), mcEl("div", "mc-timeline-summary", item.summary));
      row.append(body, mcEl("time", "mc-timeline-time", mcFormatDateTime(item.createdAt).split(" ").pop()));
      list.appendChild(row);
    });
  }
  root.appendChild(list);
}

function renderMemoryLabView(root) {
  const snap = mcBridgeGetLabSnapshot();
  const debug = snap.debug;
  const recentRows = snap.recentRows;
  const audit = snap.audit;
  const items = snap.displayItems;

  const metrics = mcEl("div", "mc-lab-metrics");
  const tokenVal = (typeof debug?.input_tokens === "number" && typeof debug?.output_tokens === "number")
    ? `↑${debug.input_tokens} ↓${debug.output_tokens}`
    : (typeof debug?.input_tokens === "number" ? `↑${debug.input_tokens}` : "暂无本轮数据");
  [
    ["当前模型", debug?.model || "暂无本轮数据"],
    ["本轮 token", tokenVal],
    ["召回来源", debug ? `${debug.memory_provider_count ?? debug.active_memory_providers?.length ?? 0} 个` : "暂无本轮数据"],
    ["注入 token", typeof debug?.memory_context_tokens_estimated === "number" ? String(debug.memory_context_tokens_estimated) : "暂无本轮数据"],
  ].forEach(([label, value]) => {
    const card = mcEl("div", "mc-lab-metric");
    card.append(mcEl("div", "mc-lab-label", label), mcEl("div", "mc-lab-value", value));
    metrics.appendChild(card);
  });
  root.appendChild(metrics);

  const grid = mcEl("div", "mc-lab-grid");
  grid.appendChild(renderMemoryLabPanel("本轮召回", renderRecallDebugRows(debug)));
  grid.appendChild(renderMemoryLabPanel("记忆审计", renderAuditRows(audit, snap.loadingStates, snap.errors)));
  grid.appendChild(renderMemoryLabPanel("最近沉淀", renderRecentLabRows(recentRows, snap.loadingStates, snap.errors, snap.recentSource)));
  grid.appendChild(renderMemoryLabPanel("事件日志", renderLabEventRows(debug, audit, recentRows)));
  root.appendChild(grid);

  // bridge 分布统计
  const distRows = [
    ["总条目", String(snap.sourceDistribution.total)],
    ["memories", String(snap.sourceDistribution.memories)],
    ["instructions", String(snap.sourceDistribution.instructions)],
    ["recent", String(snap.sourceDistribution.recent)],
  ];
  root.appendChild(renderMemoryLabPanel("bridge 分布", distRows));

  // raw 折叠区
  root.appendChild(mcLabRawSection("raw: lastMemoryDebug", debug));
  root.appendChild(mcLabRawSection("raw: audit summary", audit));
  const recentSlice = recentRows.length ? recentRows.slice(0, 5) : null;
  root.appendChild(mcLabRawSection(`raw: recent rows（最多 5 条，共 ${recentRows.length} 条）`, recentSlice));
}

function mcLabRawSection(label, data) {
  const details = document.createElement("details");
  details.className = "mc-lab-raw";
  const summary = document.createElement("summary");
  summary.className = "mc-lab-raw-summary";
  summary.textContent = data ? label : `${label}（暂无数据）`;
  details.appendChild(summary);
  if (data) {
    const pre = document.createElement("pre");
    pre.className = "mc-lab-raw-pre";
    try { pre.textContent = JSON.stringify(data, null, 2); } catch { pre.textContent = String(data); }
    details.appendChild(pre);
  }
  return details;
}

function renderMemoryLabPanel(title, rows) {
  const panel = mcEl("section", "mc-lab-panel");
  panel.appendChild(mcEl("h2", "mc-section-title", title));
  if (!rows.length) {
    mcRenderEmpty(panel, "暂无本轮数据");
    return panel;
  }
  const list = mcEl("div", "mc-lab-rows");
  rows.forEach(([key, value]) => {
    const row = mcEl("div", "mc-lab-row");
    row.append(mcEl("span", "mc-lab-key", key), mcEl("span", "mc-lab-row-value", value));
    list.appendChild(row);
  });
  panel.appendChild(list);
  return panel;
}

function renderRecallDebugRows(debug) {
  if (!debug) return [];
  const providers = Array.isArray(debug.active_memory_providers) ? debug.active_memory_providers : [];
  const rows = [];

  // 路由决策
  if (debug.topic_route) rows.push(["话题路由", debug.topic_route + (debug.secondary_route ? ` / ${debug.secondary_route}` : "")]);

  // 激活来源
  rows.push(["激活来源", providers.length ? providers.map((p) => MEMORY_PROVIDER_LABELS[p] || p).join("、") : "无"]);

  // 长期记忆（persona_memories）
  if (debug.persona_memories_loaded) {
    const cats = Array.isArray(debug.persona_memories_categories) ? debug.persona_memories_categories.join("、") : "";
    rows.push(["长期记忆", `已加载 ${debug.persona_memories_count ?? 0} 条${cats ? `（${cats}）` : ""}`]);
  } else if (debug.persona_memories_error) {
    rows.push(["长期记忆", `加载失败: ${debug.persona_memories_error}`]);
  }

  // 用户画像
  if (debug.mastodon_profile_loaded) {
    const chars = debug.mastodon_profile_chars ?? 0;
    const tok = debug.mastodon_profile_tokens_estimated ?? 0;
    rows.push(["用户画像", `${chars} 字符 / ~${tok} tokens`]);
  }

  // 项目记忆
  if (debug.project_memory_recalled) {
    const hits = debug.project_memory_hit_count ?? 0;
    const keys = Array.isArray(debug.project_memory_keys) ? debug.project_memory_keys.join("、") : "";
    rows.push(["项目记忆", `已召回 ${hits} 条${keys ? `（${keys}）` : ""}`]);
  } else {
    const reason = debug.project_memory_suppressed_reason || debug.project_memory_reason || "未触发";
    rows.push(["项目记忆", reason]);
  }

  // 写作记忆
  if (debug.writing_memory_recalled) {
    rows.push(["写作记忆", "已召回"]);
  } else {
    rows.push(["写作记忆", debug.writing_memory_reason || "未触发"]);
  }

  // 生活上下文
  if (debug.life_context_recalled) {
    rows.push(["生活上下文", "已召回"]);
  } else {
    rows.push(["生活上下文", debug.life_context_reason || "未触发"]);
  }

  // 关系上下文
  if (debug.relationship_context_recalled) {
    rows.push(["关系上下文", "已召回"]);
  } else {
    rows.push(["关系上下文", debug.relationship_context_reason || "未触发"]);
  }

  // 历史对话
  if (debug.conversation_history_recalled) {
    const hitCount = debug.conversation_history_hit_count ?? 0;
    const convIds = Array.isArray(debug.conversation_history_hit_conversation_ids)
      ? debug.conversation_history_hit_conversation_ids.slice(0, 3).join("、")
      : "";
    rows.push(["历史对话", `${hitCount} 条${convIds ? `（会话: ${convIds}）` : ""}`]);
  } else {
    rows.push(["历史对话", debug.conversation_history_reason || "未触发"]);
  }

  // 时间线
  if (debug.mastodon_timeline_enabled) {
    if (debug.timeline_recalled) {
      const hitKeys = Array.isArray(debug.mastodon_timeline_hit_keys) ? debug.mastodon_timeline_hit_keys.join("、") : "";
      rows.push(["时间线", `${debug.timeline_hit_count ?? 0} 个命中${hitKeys ? `（${hitKeys}）` : ""}`]);
    } else {
      rows.push(["时间线", debug.mastodon_timeline_reason || "未触发"]);
    }
  }

  // 历史档案（openai_archive）
  if (debug.openai_archive_recalled) {
    const hitKeys = Array.isArray(debug.openai_archive_keys) ? debug.openai_archive_keys.join("、") : "";
    rows.push(["历史档案", `${debug.openai_archive_hit_count ?? 0} 条${hitKeys ? `（${hitKeys}）` : ""}`]);
  } else if (debug.openai_archive_loaded === false) {
    rows.push(["历史档案", debug.openai_archive_reason || "未触发"]);
  }

  return rows;
}

function renderAuditRows(audit, loadingStates, errors) {
  loadingStates = loadingStates || {};
  errors = errors || {};
  if (loadingStates.loadingAudit) return [["状态", "审计加载中..."]];
  if (!getMemoryToken() && !audit) return [["状态", "需要记忆口令后显示"]];
  if (errors.auditError && !audit) return [["状态", errors.auditError]];
  if (!audit) return [];

  const rows = [];

  // 快照时间
  if (audit.generated_at) rows.push(["快照时间", mcFormatDateTime(audit.generated_at)]);

  // 总量
  rows.push(["memories", `${audit.memories?.total ?? 0} 条`]);
  rows.push(["instructions", `${audit.instructions?.total ?? 0} 条`]);
  rows.push(["openai_archive", `${audit.openai_archive_entries?.enabled_count ?? 0}/${audit.openai_archive_entries?.total ?? 0} enabled`]);
  rows.push(["persona_profile", `${audit.persona_profile?.enabled_count ?? 0}/${audit.persona_profile?.total ?? 0} enabled`]);

  // memories by_category 分布
  const byCategory = audit.memories?.by_category;
  if (byCategory && typeof byCategory === "object") {
    Object.entries(byCategory).forEach(([cat, data]) => {
      if (data?.count > 0) {
        const originParts = data.origin_distribution
          ? Object.entries(data.origin_distribution)
              .filter(([, n]) => n > 0)
              .map(([origin, n]) => `${origin.slice(0, 12)}:${n}`)
              .join(" ")
          : "";
        rows.push([`  └ ${cat}`, `${data.count} 条${originParts ? `（${originParts}）` : ""}`]);
      }
    });
  }

  // persona_profile rows（最多 3 条预览）
  const profileRows = Array.isArray(audit.persona_profile?.rows) ? audit.persona_profile.rows : [];
  if (profileRows.length) {
    profileRows.slice(0, 3).forEach((r, i) => {
      const preview = r.content_preview ? r.content_preview.slice(0, 40) : r.note || "";
      rows.push([`  画像 ${i + 1}`, `${r.enabled ? "✓" : "✗"} ${preview}`]);
    });
  }

  return rows;
}

function renderRecentLabRows(rows, loadingStates, errors, recentSource) {
  loadingStates = loadingStates || {};
  errors = errors || {};
  if (loadingStates.loadingRecent) return [["状态", "最近沉淀加载中..."]];
  if (errors.recentError) return [["状态", errors.recentError]];
  if (!rows.length) return [];
  const result = [];
  rows.slice(0, 5).forEach((row, index) => {
    const cat = row.category || row.candidate_type || recentSource || "memory";
    const time = mcFormatDateTime(row.created_at || row.promoted_at);
    result.push([`${index + 1}. ${cat}`, time]);

    // status
    if (row.status) result.push(["  状态", row.status]);

    // confidence / sensitivity（candidates 专有字段）
    if (typeof row.confidence === "number") result.push(["  置信度", String(row.confidence)]);
    if (typeof row.sensitivity === "number") result.push(["  敏感度", String(row.sensitivity)]);

    // source_preview
    if (row.source_preview) {
      const preview = String(row.source_preview).slice(0, 80);
      result.push(["  来源摘要", preview.length < String(row.source_preview).length ? `${preview}…` : preview]);
    }
  });
  return result;
}

function renderLabEventRows(debug, audit, recentRows) {
  const rows = [];
  if (debug) {
    rows.push(["本轮召回", `${debug.memory_provider_count ?? 0} 个来源`]);
    if (typeof debug.memory_context_tokens_estimated === "number") {
      rows.push(["构建注入内容", `${debug.memory_context_tokens_estimated} tokens`]);
    }
    if (debug.model) rows.push(["发送请求到 LLM", debug.model]);
  }
  if (audit) rows.push(["审计快照", audit.generated_at ? mcFormatDateTime(audit.generated_at) : "已加载"]);
  if (recentRows.length) rows.push(["最近沉淀", `${recentRows.length} 条`]);
  return rows;
}

async function fetchMemoryCenterJson(path) {
  const res = await memoryFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshMemoryCenterData() {
  // Delegates to bridge; kept for backwards-compat call sites.
  await mcBridgeRefreshAll();
}

function openMemoryCenter() {
  if (!memoryCenterOverlay) return;
  memoryCenterOverlay.classList.remove("hidden");
  memoryCenterV2State.view = "archive"; // 直接进档案馆，支持 CRUD
  renderMemoryCenterCurrentView();
  refreshMemoryCenterData();
  // 绑定桌面 nav 点击（用 _mcNavBound 标记避免重复绑定）
  if (!memoryCenterOverlay._mcNavBound) {
    memoryCenterOverlay._mcNavBound = true;
    memoryCenterOverlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".mc-nav-item[data-mc-view]");
      if (btn) switchMemoryCenterView(btn.dataset.mcView);
    });
    document.getElementById("mcNavCloseBtn")?.addEventListener("click", () => {
      memoryCenterOverlay.classList.add("hidden");
    });
  }
}

function renderRecentMemoryUpdatesOptimistic(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  memoryCenterV2State.recentSource = "candidates";
  memoryCenterV2State.recentRows = items.concat(memoryCenterV2State.recentRows).slice(0, 5);
  if (!memoryCenterOverlay?.classList.contains("hidden")) renderMemoryCenterCurrentView();
}

async function renderRecentMemoryUpdates() {
  try {
    const userId = currentUserId || "";
    const data = await fetchMemoryCenterJson(`?type=recent&userId=${encodeURIComponent(userId)}`);
    memoryCenterV2State.recentSource = data.source || "";
    memoryCenterV2State.recentRows = Array.isArray(data.rows) ? data.rows : [];
    memoryCenterV2State.recentError = "";
  } catch (err) {
    memoryCenterV2State.recentError = err instanceof Error ? err.message : String(err);
  }
  if (!memoryCenterOverlay?.classList.contains("hidden")) renderMemoryCenterCurrentView();
}

document.getElementById("mcBackButton")?.addEventListener("click", () => {
  switchMemoryCenterView("room");
});
