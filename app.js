console.log("build", window.SAVE_PRINCESS_BUILD || "dev");

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

// Expose runtime context for modules
if (supabaseClient) {
  window.supabaseClient = supabaseClient;
}
// currentUserId is set by auth.js
window.currentUserId = window.currentUserId || "";
// Expose getConfigValue for modules
window.getConfigValue = getConfigValue;

const _VALID_TIERS_INIT = ["instant", "general", "advanced"];
const _storedTier = localStorage.getItem("modelTier");
let currentModelTier = _VALID_TIERS_INIT.includes(_storedTier) ? _storedTier : "general";
// Sanitise: if stored value was invalid, overwrite it so localStorage stays clean.
if (!_VALID_TIERS_INIT.includes(_storedTier)) localStorage.setItem("modelTier", "general");

// ── Provider Groups & Model Role Mapping ──────────────────────────────────────

// Provider groups configuration
// All providers now managed through UI - no hardcoded providers
const PROVIDER_GROUPS = {};

// Load custom providers from localStorage
(function loadCustomProviders() {
  try {
    const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
    Object.entries(customProviders).forEach(([id, config]) => {
      PROVIDER_GROUPS[id] = {
        name: config.name,
        endpoint: config.endpoint,
        models: config.models,
        description: config.description || '自定义配置',
        requiresAuth: true
      };
    });
  } catch (err) {
    console.error('Failed to load custom providers:', err);
  }
})();

// Model role definitions
const MODEL_ROLES = {
  chat: { label: "对话模型", description: "主聊天回复" },
  diary: { label: "日记模型", description: "自动写日记、手动生成日记" },
  webReader: { label: "联网工具读取模型", description: "读取网页、搜索结果总结" },
  utility: { label: "脏活/后台任务模型", description: "摘要、分类、标签提取等低成本任务" }
};

// Storage key for model role mapping
const MODEL_ROLE_MAPPING_KEY = "spc_model_role_mapping_v1";

// Get model role mapping from localStorage
function getModelRoleMapping() {
  try {
    const stored = localStorage.getItem(MODEL_ROLE_MAPPING_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    console.error("Failed to parse model role mapping:", err);
    return {};
  }
}

// Save model role mapping to localStorage
function saveModelRoleMapping(mapping) {
  try {
    const data = {
      ...mapping,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(MODEL_ROLE_MAPPING_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error("Failed to save model role mapping:", err);
    return false;
  }
}

// Get provider group and model for a specific role
function getModelForRole(role) {
  const mapping = getModelRoleMapping();
  return mapping[role] || null;
}

// Expose to global for modules
window.PROVIDER_GROUPS = PROVIDER_GROUPS;
window.getModelForRole = getModelForRole;
window.MODEL_ROLES = MODEL_ROLES;

console.log('[app] PROVIDER_GROUPS and getModelForRole exposed to window');

// ── Story Seeds 开关（旧关系史已停用，保留变量避免引用报错） ──────────────────
// LEGACY_MEMORY_ENABLED=false，storySeedsEnabled 不再影响 chat 注入。
const storySeedsEnabled = false;

// ── Emoji Pack Registry (moved to modules/emoji-lexicon.js + modules/emoji-catalog.js) ──
// ── Compatibility aliases ────────────────────────────────────────────────────
// These let existing app.js code keep working without changes during Phase 1.
// Keep in sync with the module exports. Remove after full migration.

// Storage keys (still needed by app.js for clearance / settings UI)
const EMOJI_PACK_CONFIG_KEY   = window.SPEmoji.EMOJI_PACK_CONFIG_KEY;
const EMOJI_CATALOG_CACHE_KEY = window.SPEmoji.EMOJI_CATALOG_CACHE_KEY;
const EMOJI_RECENT_KEY        = window.SPEmoji.EMOJI_RECENT_KEY;
const EMOJI_FREQUENCY_KEY     = window.SPEmoji.EMOJI_FREQUENCY_KEY;
const EMOJI_FAVORITE_KEY      = window.SPEmoji.EMOJI_FAVORITE_KEY;
const EMOJI_RENDER_CACHE_KEY  = window.SPEmojiRender.EMOJI_RENDER_CACHE_KEY;
const EMOJI_RENDER_CACHE_VERSION     = window.SPEmojiRender.EMOJI_RENDER_CACHE_VERSION;
const EMOJI_RENDER_CACHE_MAX_ENTRIES = window.SPEmojiRender.EMOJI_RENDER_CACHE_MAX_ENTRIES;

const EMOJI_PACK_SOURCES_DEFAULT = window.SPEmoji.EMOJI_PACK_SOURCES_DEFAULT;
let emojiSourceAdapters = window.SPEmoji.emojiSourceAdapters;
let emojiCatalog = window.SPEmoji.emojiCatalog;
const EMOJI_LEXICON  = window.SPEmoji.EMOJI_LEXICON;
const KAOMOJI_LIST   = window.SPEmoji.KAOMOJI_LIST;

// Function aliases — move callers to window.SPEmoji.* / window.SPEmojiRender.* / window.SPEmojiPanel.*
// progressively. For Phase 1 we keep these shims so existing call sites are untouched.
const buildEmojiGuide           = () => window.SPEmoji.buildEmojiGuide();
const loadEmojiCatalog          = () => window.SPEmoji.loadEmojiCatalog();
const resolveEmojiToken         = (t) => window.SPEmoji.resolveEmojiToken(t);
const pickInsertToken           = (e) => window.SPEmoji.pickInsertToken(e);
const recordEmojiUsed           = (id) => window.SPEmoji.recordEmojiUsed(id);
const filterEmojis              = (e, q) => window.SPEmoji.filterEmojis(e, q);
const getLexiconMap             = () => window.SPEmoji.getLexiconMap();
const isFavorite                = (id) => window.SPEmoji.isFavorite(id);
const toggleFavorite            = (id) => window.SPEmoji.toggleFavorite(id);

const setMessageContent         = (el, text, opts) => window.SPEmojiRender.setMessageContent(el, text, opts);
const renderTextWithEmoji       = (text) => window.SPEmojiRender.renderTextWithEmoji(text);
const hashString                = (s) => window.SPEmojiRender.hashString(s);
const invalidateRenderCache     = (id) => window.SPEmojiRender.invalidateRenderCache(id);
const migrateRenderCacheTempId  = (tid, rid, h) => window.SPEmojiRender.migrateRenderCacheTempId(tid, rid, h);
const getRenderCacheTokens      = (id, h) => window.SPEmojiRender.getRenderCacheTokens(id, h);
const setRenderCacheTokens      = (id, h, t) => window.SPEmojiRender.setRenderCacheTokens(id, h, t);
const preloadVisibleMessageEmojis = () => window.SPEmojiRender.preloadVisibleMessageEmojis(messageList);

const openEmojiPanel            = () => window.SPEmojiPanel.openEmojiPanel();
const closeEmojiPanel           = () => window.SPEmojiPanel.closeEmojiPanel();


// ── Pending image state ────────────────────────────────────────────────────────
let pendingImage = null; // { dataUrl: string|null, loading: boolean, error: string|null, file: File|null } | null

// ── Inline edit-message state ─────────────────────────────────────────────────
let composerEditMode = "send"; // "send" | "edit"
let editingMessageId = null;
let editingMessageRow = null;
let editingOriginalText = "";

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
const voiceInputBtn     = document.getElementById("voiceInputBtn");
const chatBackButton    = document.getElementById("chatBackButton");
const chaAvatarButton   = document.getElementById("chaAvatarButton");
const chatSearchButton  = document.getElementById("chatSearchButton");
const chatOnlineDot     = document.getElementById("chatOnlineDot");
const chatSearchBar     = document.getElementById("chatSearchBar");
const chatSearchSheet   = document.getElementById("chatSearchSheet");
const chatSearchOverlay = document.getElementById("chatSearchOverlay");
const chatSearchClose   = document.getElementById("chatSearchClose");
const chatSearchInput   = document.getElementById("chatSearchInput");
const chatSearchClear   = document.getElementById("chatSearchClear");
const chatSearchResults = document.getElementById("chatSearchResults");

// ── Reply / Quote draft state ────────────────────────────────────────────────
var _replyToId      = null;
var _replyToPreview = null;
var _replyToRole    = null;

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
  if (!panel.contains(e.target) && !e.target.closest("#chatOnlineDot, .top-bar h1")) closeStatusPanel();
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

// ── Conversations (moved to modules/conversation-manager.js) ─────────────────
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

// ── Unread state ──────────────────────────────────────────────────────────────
// chaUnreadCount: number of assistant messages the user hasn't seen yet.
// Managed by markReadByUser() and updateChaUnreadBadge().
let chaUnreadCount = 0;
const chatUnreadBadge = document.getElementById("chatUnreadBadge");

// ── Chat history pagination ────────────────────────────────────────────────────
const HISTORY_PAGE_SIZE = 20;
let historyHasMore = false;
let historyLoadingOlder = false;
let oldestLoadedMessageCreatedAt = null;

// ── Chat render state — used to skip full re-render on tab switch ─────────────
const chatRenderState = {
  renderedConversationId: null,
  renderedMessageCount: 0,
}

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

// ── Message Renderer (moved to modules/message-renderer.js) ──────────────────
// ── Quote / Reply helpers (moved to modules/quote-reply.js) ─────────────────
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
    const userId = extra.userId || user?.id || window.currentUserId;
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

async function saveMessage(role, content, imageStoragePath = null, eventFields = {}, replyTo = null) {
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
  if (replyTo?.id) {
    row.reply_to_message_id = replyTo.id;
    row.reply_to_preview    = replyTo.preview || null;
    row.reply_to_role       = replyTo.role   || null;
  }
  const { data, error } = await supabaseClient
    .from("messages")
    .insert(row)
    .select("id")
    .single();
  if (error) { console.error("保存消息失败：", error); return null; }
  supabaseClient.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).then(() => {});
  return data?.id || null;
}

async function reloadHistory(opts = {}) {
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
    .select("id, role, content, created_at, image_storage_path, read_by_cha_at, read_by_user_at, reply_to_message_id, reply_to_preview, reply_to_role")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);

  if (error) { renderWelcomeMessage(); console.error(error); return; }

  const resolved = await resolveImagePaths([...data].reverse());
  chatMessages.length = 0;
  messageList.innerHTML = "";
  lastMessageTime = null;
  chaUnreadCount = 0;
  if (!resolved.length) { renderWelcomeMessage(); return; }
  for (const m of resolved) {
    const replyTo = m.reply_to_message_id
      ? { id: String(m.reply_to_message_id), preview: m.reply_to_preview || "", role: m.reply_to_role || "user" }
      : null;
    if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id != null ? String(m.id) : null, !!m.read_by_user_at, replyTo);
    } else {
      addMessage(m.content, m.role, m.created_at, { readByChaAt: m.read_by_cha_at, replyTo }, m.id);
    }
    const replyToData = replyTo ? { id: replyTo.id, role: replyTo.role, preview: replyTo.preview } : null;
  chatMessages.push({ role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null, read_by_cha_at: m.read_by_cha_at ?? null, read_by_user_at: m.read_by_user_at ?? null, replyTo: replyToData });
  }
  if (resolved.length > 0) oldestLoadedMessageCreatedAt = resolved[0].created_at;
  historyHasMore = data.length === HISTORY_PAGE_SIZE;
  // Stamp render state so tab switches don't re-render needlessly
  chatRenderState.renderedConversationId = conversationId;
  chatRenderState.renderedMessageCount = chatMessages.length;
  refreshMessageActions();
  syncChaUnreadCount();
  observeUnreadChaRows();
  insertUnreadDivider();
  refreshUserReceipts();
  // If user is already on the Chat tab, immediately mark visible assistant rows as read
  markVisibleAssistantRowsRead();
  // Pre-warm emoji image cache for visible messages (non-blocking)
  preloadVisibleMessageEmojis();
}

async function loadOlderHistory() {
  if (historyLoadingOlder || !historyHasMore || !oldestLoadedMessageCreatedAt) return;
  const conversationId = getActiveConversationId();
  if (!conversationId || !supabaseClient) return;
  historyLoadingOlder = true;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, role, content, created_at, image_storage_path, read_by_cha_at, read_by_user_at, reply_to_message_id, reply_to_preview, reply_to_role")
    .eq("conversation_id", conversationId)
    .lt("created_at", oldestLoadedMessageCreatedAt)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  if (error) { console.error("加载更多历史失败：", error); historyLoadingOlder = false; return; }
  if (!data || data.length === 0) { historyHasMore = false; historyLoadingOlder = false; return; }
  const older = await resolveImagePaths([...data].reverse());
  const prevScrollHeight = messageList.scrollHeight;
  const prevScrollTop = messageList.scrollTop;
  const newEntries = older.map(m => {
    const rt = m.reply_to_message_id ? { id: String(m.reply_to_message_id), preview: m.reply_to_preview || "", role: m.reply_to_role || "user" } : null;
    return { role: m.role, content: m.content, created_at: m.created_at, id: m.id != null ? String(m.id) : null, read_by_cha_at: m.read_by_cha_at ?? null, read_by_user_at: m.read_by_user_at ?? null, replyTo: rt };
  });
  chatMessages.unshift(...newEntries);
  messageList.innerHTML = "";
  lastMessageTime = null;
  for (const m of chatMessages) {
    const rt = m.reply_to_message_id ? { id: String(m.reply_to_message_id), preview: m.reply_to_preview || "", role: m.reply_to_role || "user" } : null;
    if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id, !!m.read_by_user_at, rt);
    } else {
      addMessage(m.content, m.role, m.created_at, { readByChaAt: m.read_by_cha_at, replyTo: rt }, m.id);
    }
  }
  messageList.scrollTop = prevScrollTop + (messageList.scrollHeight - prevScrollHeight);
  oldestLoadedMessageCreatedAt = older[0].created_at;
  historyHasMore = data.length === HISTORY_PAGE_SIZE;
  historyLoadingOlder = false;
  refreshMessageActions();
  syncChaUnreadCount();
  observeUnreadChaRows();
  refreshUserReceipts();
}

// ── Chat API (moved to modules/chat-api.js) ─────────────────────────────────
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
  window.closeV2PlusPanel?.();

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

  // Position near the chat header/status affordance, stay within the app shell.
  if (anchor) {
    const rect   = anchor.getBoundingClientRect();
    const shell = document.querySelector(".layout")?.getBoundingClientRect();
    const panelW = Math.min(280, window.innerWidth - 28);
    const panelH = 220;
    const minLeft = (shell?.left ?? 0) + 14;
    const maxRight = (shell?.right ?? window.innerWidth) - 14;
    let left = rect.left;
    let top  = rect.bottom + 8;
    if (left + panelW > maxRight) left = maxRight - panelW;
    if (left < minLeft) left = minLeft;
    if (top + panelH > window.innerHeight - 12) top = Math.max(rect.bottom + 8, window.innerHeight - panelH - 12);
    panel.style.left = left + "px";
    panel.style.top  = top  + "px";
  }

  panel.classList.remove("hidden");
}

function closeStatusPanel() {
  document.getElementById("statusPanel")?.classList.add("hidden");
}

// Set status dot state: "online" (green), "busy" (yellow/orange), "error" (red)
function setStatusDotState(state = "online") {
  const dot = document.querySelector(".online-dot");
  if (!dot) return;

  dot.classList.remove("status-busy", "status-error");
  if (state === "busy") {
    dot.classList.add("status-busy");
  } else if (state === "error") {
    dot.classList.add("status-error");
  }
  // "online" state is the default (no additional class needed)
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
  const { thought: visibleThought, reply: cleanReply } = parseVisibleThought(fullReply);
  if (cleanReply === "<NO_REPLY>") {
    removeTypingIndicator();
    if (assistantEl) assistantEl.closest(".msg-row")?.remove();
    return;
  }

  const replyTime = new Date().toISOString();
  const replyId = await saveMessage("assistant", cleanReply);
  const replyIdStr = replyId != null ? String(replyId) : null;
  chatMessages.push({ role: "assistant", content: cleanReply, created_at: replyTime, id: replyIdStr, read_by_cha_at: null, read_by_user_at: null, replyTo: null });
  lastMessageTime = new Date(replyTime).getTime();

  // If the user is already on the Chat tab, pre-mark this reply as read by user
  // so it never gets stuck as "unread" after the stream finishes.
  const _isOnChatNow = document.querySelector(".layout")?.getAttribute("data-active-page") === "chat";
  if (_isOnChatNow && replyIdStr && supabaseClient) {
    const readNow = new Date().toISOString();
    const entry = chatMessages.find(m => m.id === replyIdStr);
    if (entry) entry.read_by_user_at = readNow;
    supabaseClient.from("messages")
      .update({ read_by_user_at: readNow })
      .eq("id", Number(replyIdStr))
      .then(({ error }) => { if (error) console.warn("pre-mark read_by_user_at failed:", error); });
  }

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

  // ── Visible thought bubble (webContext replies only) ──────────────────────
  if (visibleThought && assistantEl) {
    const thinkAvatar = document.createElement("div");
    thinkAvatar.className = "avatar";
    thinkAvatar.title = "Cha";
    const thinkBubble = document.createElement("div");
    thinkBubble.className = "message assistant cha-message message-text thinking-bubble";
    thinkBubble.textContent = "💭 " + visibleThought;
    const thinkStack = document.createElement("div");
    thinkStack.className = "msg-stack";
    thinkStack.appendChild(thinkBubble);
    const thinkRow = document.createElement("div");
    thinkRow.className = "msg-row assistant";
    thinkRow.appendChild(thinkAvatar);
    thinkRow.appendChild(thinkStack);
    messageList.insertBefore(thinkRow, assistantEl.closest(".msg-row"));
  }

  const bubbles = splitBubbles(cleanReply);
  if (bubbles.length === 1 || !firstSepSeen) {
    // 单气泡或模型没有输出 |||：直接用临时气泡，原地更新内容并转正
    if (assistantEl) {
      setMessageContent(assistantEl, bubbles[0], { messageId: replyIdStr || undefined });
      const row = assistantEl.closest(".msg-row");
      if (row && replyIdStr) row.dataset.msgId = replyIdStr;
    } else {
      insertBubbleSync(bubbles[0], replyTime, replyIdStr, null);
    }
  } else {
    // 多气泡：第一个气泡已经在 assistantEl 里，转正 msgId，后续气泡逐条弹出
    if (assistantEl) {
      setMessageContent(assistantEl, bubbles[0], { messageId: replyIdStr || undefined });
      const row = assistantEl.closest(".msg-row");
      if (row && replyIdStr) row.dataset.msgId = replyIdStr;
    }
    // 从第二段开始动画插入
    await insertBubblesAnimated(bubbles.slice(1), replyTime, replyIdStr, true);
  }

  // Pre-warm emoji image cache for the freshly received reply (non-blocking)
  preloadVisibleMessageEmojis();

  refreshMessageActions();
  // Sync user read receipts now that a new assistant message has been appended.
  // This ensures all user messages before the reply get the watermark treatment.
  refreshUserReceipts();
  // Maintain bottom anchor after assistant reply completes
  maintainBottomAnchor("assistant-done");
  // After stream ends, start short-polling for memory promotion results
  startMemoryPromotionPoller(_currentRequestStartTime, _currentRequestUserMessageId);
}

// ── Message Actions (moved to modules/message-actions.js) ───────────────────
// ── Read state ────────────────────────────────────────────────────────────────

/** Update the chat tab unread badge based on chaUnreadCount. */
function updateChaUnreadBadge() {
  if (!chatUnreadBadge) return;
  if (chaUnreadCount > 0) {
    chatUnreadBadge.hidden = false;
    chatUnreadBadge.textContent = chaUnreadCount > 99 ? "99+" : String(chaUnreadCount);
  } else {
    chatUnreadBadge.hidden = true;
    chatUnreadBadge.textContent = "";
  }
}

/**
 * Insert the "以下为未读消息" divider before the first unread Cha row.
 * Safe to call multiple times — removes any existing divider first.
 */
function insertUnreadDivider() {
  document.getElementById("unreadDivider")?.remove();
  const firstUnread = messageList.querySelector(".msg-row.assistant[data-unread-cha]");
  if (!firstUnread) return;
  const divider = document.createElement("div");
  divider.className = "unread-divider";
  divider.id = "unreadDivider";
  divider.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "unread-divider-label";
  label.textContent = "以下为未读消息";
  divider.appendChild(label);
  messageList.insertBefore(divider, firstUnread);
}

/**
 * Mark a user message as read by Cha (called when Cha actually processes it).
 * Applies a read watermark: marking message N as read also marks all earlier
 * unread user messages (index < N) as read, so receipts never appear inverted.
 * Updates in-memory chatMessages entry, updates DOM receipt, persists to DB.
 * @param {string|null} msgId - the message id to mark, or null to mark all pending user messages
 */
function markReadByCha(msgId = null) {
  const now = new Date().toISOString();

  let targets;
  if (msgId == null) {
    // null → mark every unread user message
    targets = chatMessages.filter(m => m.role === "user" && !m.read_by_cha_at);
  } else {
    // msgId given → mark that message AND all earlier unread user messages (watermark cascade)
    const anchorIdx = chatMessages.findIndex(m => m.role === "user" && m.id === String(msgId));
    if (anchorIdx === -1) return;
    targets = chatMessages
      .slice(0, anchorIdx + 1)
      .filter(m => m.role === "user" && !m.read_by_cha_at);
  }

  if (!targets.length) return;

  targets.forEach(m => { m.read_by_cha_at = now; });

  // Update DOM receipts for these messages
  refreshUserReceipts();

  // Persist to DB (best-effort, fire and forget)
  if (supabaseClient) {
    const ids = targets.map(m => m.id).filter(Boolean).map(Number);
    if (ids.length) {
      supabaseClient.from("messages")
        .update({ read_by_cha_at: now })
        .in("id", ids)
        .then(({ error }) => { if (error) console.warn("markReadByCha DB update failed:", error); });
    }
  }
}

/**
 * Refresh all user-side read-receipt DOM nodes to match current chatMessages state.
 *
 * Read watermark rule: once a user message is considered read, every earlier
 * user message is also considered read. This prevents the visible inversion where
 * an older message shows "未读" while a newer one shows "已读".
 *
 * A user message at index i is initially read if:
 *   (a) entry.read_by_cha_at is set, OR
 *   (b) an assistant message exists anywhere after index i in chatMessages.
 *
 * The watermark then extends read status backwards: every user message whose
 * index is <= the latest initially-read user message index is also read.
 *
 * UI: only the last user message row in each group shows a receipt; all earlier
 * rows in the group are hidden to avoid visual clutter.
 */
function refreshUserReceipts() {
  // Find all user msg-rows that have a receipt
  const userRows = Array.from(messageList.querySelectorAll(".msg-row.user"));
  if (!userRows.length) return;

  // --- Step 1: pre-compute read state map using watermark ---

  // Build an index-keyed list of user messages from chatMessages
  const userEntries = []; // { index, id, read_by_cha_at }
  for (let i = 0; i < chatMessages.length; i++) {
    if (chatMessages[i].role === "user") {
      userEntries.push({ index: i, id: chatMessages[i].id, read_by_cha_at: chatMessages[i].read_by_cha_at });
    }
  }

  // Pre-compute whether each chatMessages index has an assistant message after it
  // by scanning once from the right.
  const hasAssistantAfter = new Array(chatMessages.length).fill(false);
  let sawAssistant = false;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].role === "assistant") { sawAssistant = true; }
    hasAssistantAfter[i] = sawAssistant;
  }

  // Find latestReadUserIndex: the highest chatMessages index of a user message
  // that is directly read (by read_by_cha_at or by having an assistant after it).
  let latestReadUserIndex = -1;
  for (const entry of userEntries) {
    const directlyRead = !!entry.read_by_cha_at || hasAssistantAfter[entry.index];
    if (directlyRead && entry.index > latestReadUserIndex) {
      latestReadUserIndex = entry.index;
    }
  }

  // Build id → isRead map applying the watermark
  const userReadStateById = new Map();
  for (const entry of userEntries) {
    if (!entry.id) continue;
    const isRead = !!entry.read_by_cha_at
      || hasAssistantAfter[entry.index]
      || entry.index <= latestReadUserIndex;
    userReadStateById.set(String(entry.id), isRead);
  }

  // --- Step 2: update DOM ---

  // Group by groupId to find the last row in each group
  const groups = new Map();
  userRows.forEach(row => {
    const gid = row.dataset.groupId;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(row);
  });

  // For each group, show receipt only on last row; sync text from read state map
  groups.forEach(rows => {
    rows.forEach((row, idx) => {
      const receipt = row.querySelector(".read-receipt");
      if (!receipt) return;
      const isLast = idx === rows.length - 1;
      if (!isLast) { receipt.style.display = "none"; return; }
      receipt.style.display = "";
      const msgId = row.dataset.msgId;
      if (msgId) {
        const isRead = userReadStateById.get(String(msgId)) ?? false;
        receipt.textContent = isRead ? "已读" : "未读";
        receipt.dataset.receiptState = isRead ? "read" : "unread";
      }
    });
  });
}

/**
 * Mark an assistant message as read by the user.
 * Called by IntersectionObserver when the message enters the viewport while on Chat tab.
 * @param {Element} row - the .msg-row.assistant element
 */
function markReadByUser(row) {
  if (!row.dataset.unreadCha) return; // already marked or not a tracked row
  const msgId = row.dataset.msgId;
  if (!msgId) return;

  const now = new Date().toISOString();
  delete row.dataset.unreadCha;
  chaUnreadCount = Math.max(0, chaUnreadCount - 1);
  updateChaUnreadBadge();

  // Remove divider once all unread messages have been seen
  if (chaUnreadCount === 0) {
    document.getElementById("unreadDivider")?.remove();
  }

  // Update in-memory entry
  const entry = chatMessages.find(m => m.id === String(msgId));
  if (entry) entry.read_by_user_at = now;

  // Persist to DB (best-effort)
  if (supabaseClient) {
    supabaseClient.from("messages")
      .update({ read_by_user_at: now })
      .eq("id", Number(msgId))
      .then(({ error }) => { if (error) console.warn("markReadByUser DB update failed:", error); });
  }
}

// IntersectionObserver: watches assistant rows for viewport visibility.
// Only fires markReadByUser when on the Chat tab.
const _chaReadObserver = new IntersectionObserver((entries) => {
  const isOnChat = document.querySelector(".layout")?.getAttribute("data-active-page") === "chat";
  if (!isOnChat) return;
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const row = entry.target;
      // Small delay so a quick scroll-past doesn't count as "read"
      setTimeout(() => {
        if (!document.contains(row)) return;
        const stillOnChat = document.querySelector(".layout")?.getAttribute("data-active-page") === "chat";
        if (!stillOnChat) return;
        markReadByUser(row);
        _chaReadObserver.unobserve(row);
      }, 500);
    }
  });
}, { threshold: 0.5 });

/** Observe all currently unread assistant rows. Called after rendering new messages. */
function observeUnreadChaRows() {
  document.querySelectorAll(".msg-row.assistant[data-unread-cha]").forEach(row => {
    _chaReadObserver.observe(row);
  });
}

/**
 * Immediately mark any unread assistant rows that are currently visible in the
 * viewport (intersectionRatio ≥ 0.5) while the user is on the Chat tab.
 * Call this after switching to Chat, after reloadHistory, and after a new
 * assistant reply finishes rendering so visible messages are never left as unread.
 */
function markVisibleAssistantRowsRead() {
  const isOnChat = document.querySelector(".layout")?.getAttribute("data-active-page") === "chat";
  if (!isOnChat) return;
  const unreadRows = Array.from(document.querySelectorAll(".msg-row.assistant[data-unread-cha]"));
  if (!unreadRows.length) return;
  const listRect = messageList.getBoundingClientRect();
  unreadRows.forEach(row => {
    const rowRect = row.getBoundingClientRect();
    // Check if at least half the row is within the messageList viewport
    const overlap = Math.min(rowRect.bottom, listRect.bottom) - Math.max(rowRect.top, listRect.top);
    const visible = overlap / rowRect.height >= 0.5;
    if (visible) {
      setTimeout(() => {
        if (!document.contains(row)) return;
        const stillOnChat = document.querySelector(".layout")?.getAttribute("data-active-page") === "chat";
        if (!stillOnChat) return;
        markReadByUser(row);
        _chaReadObserver.unobserve(row);
      }, 500);
    }
  });
}

/** Recount chaUnreadCount from DOM and update badge. */
function syncChaUnreadCount() {
  chaUnreadCount = document.querySelectorAll(".msg-row.assistant[data-unread-cha]").length;
  updateChaUnreadBadge();
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

// ── Multi-select Mode State ────────────────────────────────────────────────
let multiSelectMode = false;
let selectedMessageIds = new Set();

function enterMultiSelectMode() {
  multiSelectMode = true;
  selectedMessageIds.clear();
  messageList.classList.add('multi-select-mode');

  getMessageRows().forEach(row => {
    const msgId = row.dataset.msgId || row.dataset.bubbleSibling;
    if (!msgId || row.querySelector('.multi-select-checkbox')) return;

    const checkbox = document.createElement('div');
    checkbox.className = 'multi-select-checkbox';
    checkbox.dataset.msgId = msgId;
    checkbox.innerHTML = '<div class="checkbox-inner"></div>';
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMessageSelection(msgId);
    });
    row.insertBefore(checkbox, row.firstChild);
  });

  showMultiSelectBar();
}

function exitMultiSelectMode() {
  multiSelectMode = false;
  selectedMessageIds.clear();
  messageList.classList.remove('multi-select-mode');
  document.querySelectorAll('.multi-select-checkbox').forEach(el => el.remove());
  hideMultiSelectBar();
}

function toggleMessageSelection(msgId) {
  if (selectedMessageIds.has(msgId)) {
    selectedMessageIds.delete(msgId);
  } else {
    selectedMessageIds.add(msgId);
  }
  updateMultiSelectUI();
}

function updateMultiSelectUI() {
  document.querySelectorAll('.multi-select-checkbox').forEach(checkbox => {
    const msgId = checkbox.dataset.msgId;
    checkbox.classList.toggle('selected', selectedMessageIds.has(msgId));
  });

  const countEl = document.querySelector('.multi-select-count');
  if (countEl) countEl.textContent = `已选择 ${selectedMessageIds.size} 条`;

  const forwardBtn = document.getElementById('multiSelectForwardBtn');
  const deleteBtn = document.getElementById('multiSelectDeleteBtn');
  if (forwardBtn) forwardBtn.disabled = selectedMessageIds.size === 0;
  if (deleteBtn) deleteBtn.disabled = selectedMessageIds.size === 0;
}

function showMultiSelectBar() {
  hideMultiSelectBar();
  const bar = document.createElement('div');
  bar.id = 'multiSelectBar';
  bar.className = 'multi-select-bar';
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg);border-top:1px solid var(--border);padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;z-index:1000;box-shadow:0 -2px 10px rgba(0,0,0,0.1);';

  const leftSection = document.createElement('div');
  leftSection.style.cssText = 'display:flex;align-items:center;gap:12px;';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = '全选';
  selectAllBtn.style.cssText = 'padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;font-size:14px;';
  selectAllBtn.addEventListener('click', () => {
    const allMsgIds = Array.from(document.querySelectorAll('.multi-select-checkbox')).map(el => el.dataset.msgId);
    if (selectedMessageIds.size === allMsgIds.length) {
      selectedMessageIds.clear();
    } else {
      allMsgIds.forEach(id => selectedMessageIds.add(id));
    }
    updateMultiSelectUI();
  });

  const countSpan = document.createElement('span');
  countSpan.className = 'multi-select-count';
  countSpan.textContent = '已选择 0 条';
  countSpan.style.cssText = 'color:var(--text-secondary);font-size:14px;';

  leftSection.appendChild(selectAllBtn);
  leftSection.appendChild(countSpan);

  const rightSection = document.createElement('div');
  rightSection.style.cssText = 'display:flex;align-items:center;gap:8px;';

  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'multiSelectDeleteBtn';
  deleteBtn.textContent = '删除';
  deleteBtn.disabled = true;
  deleteBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#ff4444;color:white;cursor:pointer;font-size:14px;';
  deleteBtn.addEventListener('click', async () => {
    if (selectedMessageIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedMessageIds.size} 条消息吗？`)) return;
    for (const msgId of selectedMessageIds) {
      const row = messageList.querySelector(`[data-msg-id="${msgId}"]`);
      if (row) await deleteMessage(row, msgId);
    }
    exitMultiSelectMode();
  });

  const forwardBtn = document.createElement('button');
  forwardBtn.id = 'multiSelectForwardBtn';
  forwardBtn.textContent = '转发';
  forwardBtn.disabled = true;
  forwardBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:var(--accent-primary);color:white;cursor:pointer;font-size:14px;';
  forwardBtn.addEventListener('click', () => {
    if (typeof showToast === 'function') showToast('转发功能开发中...');
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;font-size:14px;';
  cancelBtn.addEventListener('click', () => exitMultiSelectMode());

  rightSection.appendChild(deleteBtn);
  rightSection.appendChild(forwardBtn);
  rightSection.appendChild(cancelBtn);

  bar.appendChild(leftSection);
  bar.appendChild(rightSection);
  document.body.appendChild(bar);
}

function hideMultiSelectBar() {
  document.getElementById('multiSelectBar')?.remove();
}

// 暴露多选模式API
window.enterMultiSelectMode = enterMultiSelectMode;
window.exitMultiSelectMode = exitMultiSelectMode;

async function regenerateMessage(row) {
  // Stop TTS playback when regenerating
  if (window.SPVoice) window.SPVoice.stopSpeaking();

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
  const oldText = extractTextFromMessageContent(oldContent);
  enterEditMessageMode(row, msgId, oldText);
}

// 撤回消息（仅用户消息）
async function recallMessage(row, msgId) {
  closeMessageActionMenu();

  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) return;

  const originalContent = extractTextFromMessageContent(chatMessages[idx].content);

  // 前端显示撤回提示
  const textEl = row.querySelector(".message-text");
  if (textEl) {
    textEl.innerHTML = `<span style="color: var(--text-muted); font-size: 13px;">你撤回了一条消息</span><br><span style="color: var(--text-muted); font-size: 12px;">原文：${originalContent}</span>`;
  }

  // TODO: 调用后端API标记消息为已撤回
  // await fetch('/api/messages/recall', { method: 'POST', body: JSON.stringify({ messageId: msgId }) });

  if (typeof showToast === 'function') {
    showToast('已撤回');
  }
}

// 删除消息（用户和助手消息都支持）
async function deleteMessage(row, msgId) {
  closeMessageActionMenu();

  // 确认删除
  if (!confirm('确定要删除这条消息吗？删除后无法恢复。')) {
    return;
  }

  // 前端移除消息
  row.remove();

  // 从 chatMessages 中移除
  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    chatMessages.splice(idx, 1);
  }

  // TODO: 调用后端API标记消息为已删除（不真正删除，只是标记 is_deleted）
  // await fetch('/api/messages/delete', { method: 'POST', body: JSON.stringify({ messageId: msgId }) });

  if (typeof showToast === 'function') {
    showToast('已删除');
  }

  // 刷新消息分组样式
  if (typeof refreshGroupClasses === 'function') {
    refreshGroupClasses();
  }
}

// 编辑图片描述
async function editImageDescription(row, msgId) {
  closeMessageActionMenu();

  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) return;

  const currentDescription = chatMessages[idx].image_description || '';

  // 创建弹窗
  const overlay = document.createElement('div');
  overlay.className = 'image-description-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const dialog = document.createElement('div');
  dialog.className = 'image-description-dialog';
  dialog.style.cssText = `
    background: var(--bg);
    border-radius: 12px;
    padding: 20px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = '编辑图片描述';
  title.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 18px;
    color: var(--text);
  `;

  const textarea = document.createElement('textarea');
  textarea.value = currentDescription;
  textarea.placeholder = '输入图片描述...';
  textarea.style.cssText = `
    width: 100%;
    min-height: 100px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    resize: vertical;
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
  `;

  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 16px;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => overlay.remove());

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    font-size: 14px;
  `;

  saveBtn.addEventListener('click', async () => {
    const newDescription = textarea.value.trim();

    // 更新数据库
    const { error: updateError } = await supabaseClient
      .from("messages")
      .update({ image_description: newDescription })
      .eq("id", msgId);

    if (updateError) {
      console.error("保存图片描述失败：", updateError);
      if (typeof showToast === 'function') {
        showToast('保存失败，请重试');
      }
      return;
    }

    // 更新本地数据
    chatMessages[idx].image_description = newDescription;

    // 更新UI显示
    const messageEl = row.querySelector('.message-image');
    if (messageEl) {
      let descEl = messageEl.querySelector('.image-description');
      if (newDescription) {
        if (!descEl) {
          descEl = document.createElement('div');
          descEl.className = 'image-description';
          descEl.style.cssText = `
            margin-top: 8px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.05);
            border-radius: 8px;
            font-size: 13px;
            line-height: 1.4;
            color: var(--text-secondary);
          `;
          messageEl.appendChild(descEl);
        }
        descEl.textContent = newDescription;
      } else if (descEl) {
        descEl.remove();
      }
    }

    overlay.remove();

    if (typeof showToast === 'function') {
      showToast('描述已保存');
    }
  });

  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);

  dialog.appendChild(title);
  dialog.appendChild(textarea);
  dialog.appendChild(buttons);
  overlay.appendChild(dialog);

  document.body.appendChild(overlay);
  textarea.focus();

  // 点击背景关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
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
  // 延迟重置 longPressOpened，避免菜单关闭后立即触发点击
  setTimeout(() => {
    longPressOpened = false;
  }, 100);
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

  // Get msgId from either msgId or bubbleSibling (for split messages)
  const effectiveMsgId = row.dataset.msgId || row.dataset.bubbleSibling;
  if (effectiveMsgId) {
    addMessageMenuButton(menu, "引用", () => {
      const role = isAssistant ? "assistant" : "user";
      const preview = getMessageQuotePreview(row);
      closeMessageActionMenu();
      setReplyDraft(effectiveMsgId, preview, role);
    });
  }

  // 只有 user 的最后一条消息可以编辑
  if (isUser && row === getLastMessageRow("user") && row.dataset.msgId) {
    addMessageMenuButton(menu, "编辑", () => editUserMessage(row));
  }

  // 图片消息编辑描述（所有图片消息）
  const hasImage = row.querySelector(".message-image");
  if (hasImage && effectiveMsgId) {
    addMessageMenuButton(menu, "编辑描述", () => editImageDescription(row, effectiveMsgId));
  }

  // 重新生成功能（仅 assistant 的最后一条消息）
  if (isAssistant && row === getLastMessageRow("assistant") && canRegenerateRow(row)) {
    addMessageMenuButton(menu, "重新生成", () => regenerateMessage(row));
  }

  // 撤回功能（仅 user 消息）
  if (isUser && effectiveMsgId) {
    addMessageMenuButton(menu, "撤回", () => recallMessage(row, effectiveMsgId));
  }

  // 删除功能（user 和 assistant 都支持）
  if (effectiveMsgId) {
    addMessageMenuButton(menu, "删除", () => deleteMessage(row, effectiveMsgId));
  }

  // 朗读功能（仅 assistant 文字消息）
  if (isAssistant && effectiveMsgId) {
    const hasText = row.querySelector(".message-text");
    if (hasText && window.SPVoice) {
      addMessageMenuButton(menu, "朗读", () => {
        closeMessageActionMenu();
        const messageEl = row.querySelector(".message");
        if (messageEl) {
          window.SPVoice.speakMessage(messageEl, effectiveMsgId);
        }
      });
    }
  }

  document.body.appendChild(menu);
  messageActionMenu = menu;
  placeMessageActionMenu(menu, x, y);
}

function startLongPress(row, x, y) {
  cancelLongPress();
  longPressOpened = false;
  longPressStart = { x, y };
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (longPressOpened) return;
    longPressOpened = true;
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
  // 禁用消息区域的原生右键菜单，改用自定义菜单
  if (!(e.target instanceof Element)) return;
  const row = e.target.closest(".msg-row");
  if (!row || row.id === "typingIndicatorRow") return;

  e.preventDefault();
  e.stopPropagation();

  // 桌面端：右键直接打开自定义菜单
  if (!isMobileMessageActions()) {
    showMessageActionMenu(row, e.clientX, e.clientY);
  }
}, { capture: true });  // 使用捕获阶段拦截

messageList.addEventListener("scroll", () => {
  closeMessageActionMenu();
  cancelLongPress();
  if (messageList.scrollTop <= 40) loadOlderHistory();
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
  // Deselect TTS message when clicking outside speaker button or assistant bubble
  if (!target.closest(".speaker-btn") && !target.closest(".message.assistant") && window.SPVoice) {
    window.SPVoice.stopSpeaking();
  }
});

// ── Memory panel ──────────────────────────────────────────────────────────────

function getMemoryEndpoint() {
  return getConfigValue("MEMORIES_API_ENDPOINT", "YOUR_SUPABASE_EDGE_FUNCTION_MEMORIES_URL");
}

function getWebApiEndpoint() {
  return getConfigValue("WEB_API_ENDPOINT", "YOUR_WEB_API_ENDPOINT");
}

// Export for use in settings page
window.getMemoryEndpoint = getMemoryEndpoint;
window.getMemoryToken = function() {
  return sessionStorage.getItem("memory_admin_token") || "";
};

// ── Web context injection ──────────────────────────────────────────────────────
// Set by phone.js "在聊天里讲给KK"; consumed once by the next callChatAPI call.
let _pendingWebContext = null;
let _bypassUrlCheck = false;

window.injectWebContextToChat = function ({ summary, sourceUrl, title }) {
  _pendingWebContext = `[cha 刚读了一个链接]\n来源：${title || sourceUrl}\n内容摘要：${summary}`;
  // Show a subtle indicator in the composer area
  const hint = document.getElementById("webContextHint");
  if (hint) {
    hint.textContent = `cha 会在下条回复里结合这个链接的内容。`;
    hint.removeAttribute("hidden");
  }
};

async function getAuthHeaders() {
  if (!supabaseClient) return {};
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  } catch (err) {
    console.warn("[auth] Failed to get session:", err);
    return {};
  }
}

async function memoryFetch(path, options = {}) {
  const endpoint = getMemoryEndpoint();
  if (!endpoint) throw new Error("MEMORIES_API_ENDPOINT 未配置");

  const url = new URL(endpoint);
  if (path.startsWith("?")) {
    const params = new URLSearchParams(path.slice(1));
    for (const [k, v] of params) url.searchParams.set(k, v);
  }

  const authHeaders = await getAuthHeaders();
  const headers = {
    "Content-Type": "application/json",
    ...authHeaders,
    ...(options.headers || {}),
  };

  return fetch(url.toString(), {
    ...options,
    headers,
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
  openMemoryCenter();
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

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", () => {
    if (isMobileLayout()) {
      const opening = !sidebar.classList.contains("mobile-open");
      sidebar.classList.toggle("mobile-open", opening);
      sidebarBackdrop.classList.toggle("hidden", !opening);
    } else {
      sidebar.classList.toggle("hidden");
    }
  });
}

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
  if (!url) return;
  if (chaAvatarButton) {
    chaAvatarButton.style.backgroundImage = `url("${url}")`;
    chaAvatarButton.style.backgroundSize = "cover";
    chaAvatarButton.style.backgroundPosition = "center";
    chaAvatarButton.classList.add("has-image");
  }
  document.querySelectorAll('[data-avatar-role="cha"]').forEach(el => {
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  });
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

// 在一起天数真实计算
(function() {
  const DEFAULT_START = "2022-07-15";
  const STORAGE_KEY = "relationship_start_date";
  const daysEl = document.getElementById("togetherDays");
  const startEl = document.getElementById("togetherStartDate");
  if (!daysEl || !startEl) return;

  function calcDays(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((todayNorm - start) / 86400000) + 1;
  }

  function formatDisplay(dateStr) {
    return dateStr.replace(/-/g, ".");
  }

  function applyDate(dateStr) {
    daysEl.textContent = calcDays(dateStr);
    startEl.textContent = "从 " + formatDisplay(dateStr) + " 开始";
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  applyDate(saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : DEFAULT_START);

  startEl.addEventListener("click", () => {
    const cur = (localStorage.getItem(STORAGE_KEY) || DEFAULT_START);
    const input = prompt("修改开始日期（格式：YYYY-MM-DD）", cur);
    if (input === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      alert("格式错误，请使用 YYYY-MM-DD");
      return;
    }
    localStorage.setItem(STORAGE_KEY, input);
    applyDate(input);
  });
})();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightSearchKeyword(text, keyword) {
  const safeText = escapeHtml(text);
  const safeKeyword = escapeRegExp(keyword.trim());
  if (!safeKeyword) return safeText;
  return safeText.replace(new RegExp(`(${safeKeyword})`, "gi"), '<mark class="search-result-highlight">$1</mark>');
}

function getSearchableMessageRows() {
  return Array.from(messageList.querySelectorAll(".msg-row:not(#typingIndicatorRow)"))
    .map((row, index) => {
      const message = row.querySelector(".message");
      const text = message?.textContent?.trim() || "";
      if (!text) return null;
      if (!row.dataset.searchId) row.dataset.searchId = row.dataset.msgId || `rendered-${index}`;
      return {
        id: row.dataset.searchId,
        row,
        role: row.classList.contains("user") ? "你" : row.classList.contains("assistant") ? "Cha" : "系统",
        text,
      };
    })
    .filter(Boolean);
}

function renderSearchEmpty(text) {
  if (!chatSearchResults) return;
  chatSearchResults.innerHTML = `<div class="search-empty">${escapeHtml(text)}</div>`;
}

function renderChatSearchResults(keyword) {
  const q = keyword.trim();
  if (!q) {
    renderSearchEmpty("输入关键词搜索当前聊天记录");
    return;
  }

  const results = getSearchableMessageRows().filter(({ text }) => text.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  if (!results.length) {
    renderSearchEmpty("没有找到相关聊天记录");
    return;
  }

  chatSearchResults.innerHTML = results.map(({ id, role, text }) => `
    <button type="button" class="search-result-item" data-search-target="${escapeHtml(id)}" role="listitem">
      <span class="search-result-time">${escapeHtml(role)}</span>
      <span class="search-result-text">${highlightSearchKeyword(text, q)}</span>
    </button>
  `).join("");
}

function openChatSearchSheet() {
  if (!chatSearchSheet || !chatSearchInput) return;
  chatSearchSheet.classList.remove("hidden");
  chatSearchSheet.setAttribute("aria-hidden", "false");
  renderChatSearchResults(chatSearchInput.value || "");
  setTimeout(() => chatSearchInput.focus({ preventScroll: true }), 260);
}

function closeChatSearchSheet({ clear = true } = {}) {
  if (!chatSearchSheet) return;
  chatSearchSheet.classList.add("hidden");
  chatSearchSheet.setAttribute("aria-hidden", "true");
  if (clear && chatSearchInput) chatSearchInput.value = "";
  chatSearchInput?.blur();
  renderSearchEmpty("输入关键词搜索当前聊天记录");
  messageList.querySelectorAll(".msg-row.search-hit, .msg-row.search-jump-highlight").forEach((row) => {
    row.classList.remove("search-hit", "search-jump-highlight");
  });
}

function jumpToSearchResult(targetId) {
  const row = Array.from(messageList.querySelectorAll(".msg-row")).find((item) => item.dataset.searchId === targetId);
  closeChatSearchSheet({ clear: true });
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("search-jump-highlight");
  setTimeout(() => row.classList.remove("search-jump-highlight"), 2000);
}

chatSearchButton?.addEventListener("click", openChatSearchSheet);
chatSearchClose?.addEventListener("click", () => closeChatSearchSheet({ clear: true }));
chatSearchOverlay?.addEventListener("click", () => closeChatSearchSheet({ clear: true }));

chatSearchInput?.addEventListener("input", () => renderChatSearchResults(chatSearchInput.value));
chatSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeChatSearchSheet({ clear: true });
});
chatSearchClear?.addEventListener("click", () => {
  if (chatSearchInput) chatSearchInput.value = "";
  renderSearchEmpty("输入关键词搜索当前聊天记录");
  chatSearchInput?.focus({ preventScroll: true });
});

chatSearchResults?.addEventListener("click", (event) => {
  const item = event.target.closest(".search-result-item");
  if (!item) return;
  jumpToSearchResult(item.dataset.searchTarget || "");
});

chatOnlineDot?.addEventListener("click", (event) => {
  event.stopPropagation();
  openStatusPanel(event.currentTarget);
});

document.querySelector(".v2-page--chat .top-bar h1")?.addEventListener("click", (event) => {
  event.stopPropagation();
  openStatusPanel(chatOnlineDot || event.currentTarget);
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
Object.defineProperty(window, "isReplying", { get: () => isReplying });
let autoReplyEnabled = false;

const forceReplyBtn = document.getElementById("forceReplyBtn");
const autoReplyToggle = document.getElementById("autoReplyToggle");
const sendButton = document.getElementById("sendButton");

// ── Inline edit-message helpers ───────────────────────────────────────────────
function enterEditMessageMode(row, msgId, originalText) {
  composerEditMode = "edit";
  editingMessageId = msgId;
  editingMessageRow = row;
  editingOriginalText = originalText;

  // ── Mutual exclusion: clear reply/attachment state ──
  // Edit mode is incompatible with pending replies and image attachments.
  clearReplyDraft();
  if (pendingImage) {
    pendingImage = null;
    updateAttachmentCard();
  }

  messageInput.value = originalText;
  autoResizeTextarea(messageInput);
  messageInput.focus();
  // Move cursor to end
  const len = originalText.length;
  messageInput.setSelectionRange(len, len);

  // Visual indicator: change send button to checkmark (save) icon
  sendButton.setAttribute("aria-label", "保存编辑");
  sendButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 9.5L7 13.5L15 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  sendButton.classList.add("edit-mode");

  // Show cancel button next to send
  let cancelEditBtn = document.getElementById("cancelEditBtn");
  if (!cancelEditBtn) {
    cancelEditBtn = document.createElement("button");
    cancelEditBtn.id = "cancelEditBtn";
    cancelEditBtn.type = "button";
    cancelEditBtn.className = "ghost-icon-btn cancel-edit-btn";
    cancelEditBtn.setAttribute("aria-label", "取消编辑");
    cancelEditBtn.title = "取消编辑";
    cancelEditBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    cancelEditBtn.addEventListener("click", () => exitEditMessageMode({ restoreDraft: false }));
    sendButton.parentNode.insertBefore(cancelEditBtn, sendButton);
  }
}

/** Exit inline edit mode, restoring the composer to normal send mode. */
function exitEditMessageMode({ restoreDraft = false } = {}) {
  composerEditMode = "send";
  editingMessageId = null;
  editingMessageRow = null;
  editingOriginalText = "";

  // Clear composer
  messageInput.value = "";
  autoResizeTextarea(messageInput);

  // Restore send button
  sendButton.setAttribute("aria-label", "发送");
  sendButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 15V3M9 3L4 8M9 3L14 8" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  sendButton.classList.remove("edit-mode");

  document.getElementById("cancelEditBtn")?.remove();
}

function setReplyingState(replying) {
  isReplying = replying;
  if (forceReplyBtn) forceReplyBtn.disabled = replying;
  if (sendButton) sendButton.disabled = replying;
}

function updateAutoReplyToggle() {
  if (autoReplyToggle) {
    autoReplyToggle.classList.toggle("active", autoReplyEnabled);
    autoReplyToggle.textContent = autoReplyEnabled ? "●" : "◌";
    autoReplyToggle.title = autoReplyEnabled ? "自动接话：开" : "自动接话：关";
    autoReplyToggle.setAttribute("aria-label", autoReplyToggle.title);
  }
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
  // Clear any lingering status text
  const el = document.getElementById("chatStatus");
  if (el) el.textContent = "";
}

function scheduleAutoReply(lastUserMessage = "") {
  cancelAutoReplyTimer();
  const delay = getAutoReplyDelay(lastUserMessage);
  if (delay === 0) {
    // 问题句：立即触发，不走 idle 状态
    triggerReply("auto");
    return;
  }
  // 普通句/短句：内部计时，不显示给用户
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

/**
 * Insert text at the current cursor position in messageInput.
 * Used by emoji panel and suggestion bar (referenced as global by those modules).
 */
function insertTextAtCursor(text) {
  const el = messageInput;
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const newPos = start + text.length;
  el.setSelectionRange(newPos, newPos);
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function scrollChatToLatest(behavior = "auto") {
  if (!messageList) return;
  requestAnimationFrame(() => {
    // Force layout recalc to ensure padding changes are applied before measuring scrollHeight
    messageList.offsetHeight;
    requestAnimationFrame(() => {
      messageList.scrollTo({ top: messageList.scrollHeight, behavior });
    });
  });
}

// Returns true when the user is close enough to the bottom that auto-scroll
// should run (≤ 120px above the bottom edge).
function isNearBottom() {
  if (!messageList) return true;
  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight <= 120;
}

// Only scroll to bottom when the user is already near the bottom, or when
// explicitly forced (e.g. after sending a message or assistant reply done).
function maintainBottomAnchor(reason) {
  if (!messageList) return;

  // keyboard 不触发滚动，交给 CSS padding
  if (reason === "keyboard") return;

  const force = reason === "send" || reason === "assistant-done" || reason === "open-panel";
  if (force || isNearBottom()) {
    requestAnimationFrame(() => scrollChatToLatest());
  }
}

// ── Keyboard / viewport init — delegated to modules/keyboard-viewport.js ──────
function initKeyboardViewportState() {
  window.SPKeyboardViewport.initKeyboardViewportState({
    messageInput:       messageInput,
    chatSearchInput:    chatSearchInput,
    getChatInputMode:   () => _chatInputMode,
    setChatInputMode:   setChatInputMode,
    maintainBottomAnchor: maintainBottomAnchor,
    onKeyboardOpen:     () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollChatToLatest();
        });
      });
    },
  });
}

function initStableShellHeight() {
  window.SPKeyboardViewport.initStableShellHeight();
}

function initVisualVh() {
  window.SPKeyboardViewport.initVisualVh();
}

function initInputKeyboardHints(root = document) {
  root.querySelectorAll('textarea, input[type="text"], input[type="search"]').forEach((input) => {
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    if (input.tagName === "TEXTAREA" && !input.hasAttribute("enterkeyhint")) {
      input.setAttribute("enterkeyhint", "send");
    }
    if (input.type === "search" && !input.hasAttribute("enterkeyhint")) {
      input.setAttribute("enterkeyhint", "search");
    }
  });
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

if (autoReplyToggle) {
  autoReplyToggle.addEventListener("click", () => {
    autoReplyEnabled = !autoReplyEnabled;
    updateAutoReplyToggle();
    if (!autoReplyEnabled) cancelAutoReplyTimer();
  });
}

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
  // Mark only the unread user messages that will actually enter Cha's context this request.
  // For "forced" mode, no real user message is added (synthetic poke), so leave read state alone.
  // For "auto" and default mode, mark the trailing unread user messages (those after the last
  // assistant message, or all of them if there is no assistant message yet).
  if (replyMode !== "forced") {
    // Find the index of the last assistant message in chatMessages
    let lastAsstIdx = -1;
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "assistant") { lastAsstIdx = i; break; }
    }
    // Collect unread user messages that appear after the last assistant reply
    const unreadIds = chatMessages
      .slice(lastAsstIdx + 1)
      .filter(m => m.role === "user" && !m.read_by_cha_at && m.id)
      .map(m => m.id);
    if (unreadIds.length) {
      unreadIds.forEach(id => markReadByCha(id));
    } else {
      // Fallback: mark all trailing unread user messages (e.g. conversation has no assistant yet)
      markReadByCha();
    }
  }
  setChatTitleState("typing");
  showTypingIndicator();
  setReplyingState(true);
  setStatusDotState("busy"); // Set to busy state while replying
  try {
    await requestStreamingReply(replyMode);
    setStatusDotState("online"); // Return to online after success
  } catch (error) {
    removeTypingIndicator();
    showToast(error.message || "回复失败，请稍后重试");
    setStatusDotState("error");
    setTimeout(() => setStatusDotState("online"), 5000);
  } finally {
    setChatTitleState("idle");
    setReplyingState(false);
    // Desktop only: re-focus after reply. Mobile must not re-trigger soft keyboard.
    if (!isMobileLayout()) messageInput.focus();
    maintainBottomAnchor("send");
    // Observe any new unread assistant rows and update badge
    syncChaUnreadCount();
    observeUnreadChaRows();
    // If user is already on the Chat tab, mark any newly rendered assistant rows as read
    markVisibleAssistantRowsRead();
  }
}

let isComposing = false;
messageInput.addEventListener("compositionstart", () => { isComposing = true; cancelAutoReplyTimer(); });
messageInput.addEventListener("compositionend", () => { isComposing = false; autoResizeTextarea(messageInput); });
messageInput.addEventListener("input", () => {
  autoResizeTextarea(messageInput);
  // Don't scroll on every keystroke — composer resize handles itself via flex
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

    // Update composer state for mic/send toggle
    if (window.updateComposerState) {
      window.updateComposerState({ hasImage: false });
    }
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

  // Update composer state for mic/send toggle
  if (window.updateComposerState) {
    window.updateComposerState({ hasImage: !!(pendingImage.dataUrl && !pendingImage.error) });
  }
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function handleImageFile(file) {
  if (!file) return;
  // Block image attachment while in edit mode
  if (composerEditMode === "edit") return;
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

/** Save an edited user message (called from handleSubmit when in edit mode). */
async function saveEditedMessage(newText) {
  const msgId = editingMessageId;
  const row = editingMessageRow;
  if (!msgId || !row) { exitEditMessageMode(); return; }

  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) { exitEditMessageMode(); return; }

  const { error: updateError } = await supabaseClient
    .from("messages")
    .update({ content: newText, edited: true })
    .eq("id", msgId);

  if (updateError) {
    console.error("编辑消息失败：", updateError);
    setChatStatus(`编辑失败：${updateError.message}`);
    setTimeout(() => setChatStatus(""), 3000);
    return; // keep edit mode so user can retry
  }

  chatMessages[idx].content = newText;
  chatMessages[idx].edited = true;

  // Invalidate old render cache before re-rendering with new content
  invalidateRenderCache(msgId);

  const messageEl = row.querySelector(".message");
  setMessageContent(messageEl, newText, { messageId: String(msgId) });

  // 添加"已编辑"标记
  let editedLabel = messageEl.querySelector(".edited-label");
  if (!editedLabel) {
    editedLabel = document.createElement("span");
    editedLabel.className = "edited-label";
    editedLabel.style.cssText = "color: var(--text-muted); font-size: 11px; margin-left: 6px;";
    editedLabel.textContent = "(已编辑)";
    messageEl.appendChild(editedLabel);
  }

  // Remove all subsequent messages and retrigger reply
  // Stop TTS in case one of the messages being deleted is currently playing
  if (window.SPVoice) window.SPVoice.stopSpeaking();
  const afterIdx = idx + 1;
  const toRemove = chatMessages.slice(afterIdx);
  chatMessages.splice(afterIdx);
  for (const m of toRemove) {
    if (m.id) await supabaseClient.from("messages").delete().eq("id", m.id);
  }

  exitEditMessageMode();
  await reloadHistory();
  await triggerReply("forced");
}

messageList.addEventListener("click", (e) => {
  // 如果刚打开长按菜单，阻止其他点击操作
  if (longPressOpened) {
    e.preventDefault();
    e.stopPropagation();
    longPressOpened = false;
    return;
  }

  const img = e.target.closest("img.msg-image");
  if (img) {
    showLightbox(img.src);
    return;
  }

  // Click on message list background (not on bubbles/controls) clears keyboard
  if (e.target === messageList) {
    // DIAGNOSTIC: Capture state before clearing keyboard
    if (window.__dumpViewportDrift) {
      console.info("[viewport-drift blank click]", window.__dumpViewportDrift("blank-click"));
    }

    clearKeyboardState("messageList-background-click");
    // Reset horizontal viewport drift after blank click
    if (window.SPKeyboardViewport?.resetHorizontalSoon) {
      window.SPKeyboardViewport.resetHorizontalSoon("blank-click");
    }
  }
});

async function handleSubmit() {
  // Stop TTS playback when sending a new message
  if (window.SPVoice) window.SPVoice.stopSpeaking();

  // ── Edit mode: save the edited message ──────────────────────────────────────
  if (composerEditMode === "edit") {
    const newText = messageInput.value.trim();
    if (!newText) return; // prevent saving empty message
    await saveEditedMessage(newText);
    return;
  }

  const text = messageInput.value.trim();
  if ((!text && !pendingImage?.dataUrl) || pendingImage?.loading) return;
  if (isReplying) {
    setChatStatus("Cha 正在回复，等他说完再发～");
    setTimeout(() => setChatStatus(""), 2000);
    return;
  }

  // ── URL detection: confirm before send ──────────────────────────────────
  const _URL_RE = /https?:\/\/[^\s<>"'{}|\\^`\[\]]{4,}/i;
  const detectedUrl = _URL_RE.exec(text)?.[0];
  const shouldBypass = _bypassUrlCheck;
  _bypassUrlCheck = false;
  if (detectedUrl && !shouldBypass) {
    const hint = document.getElementById("webUrlHint");
    if (hint) {
      hint.innerHTML = `要让 cha 先打开看看吗？ <button type="button" id="webUrlReadBtn" class="web-url-hint-btn">让cha先读</button> <button type="button" id="webUrlSendBtn" class="web-url-hint-btn web-url-hint-btn--secondary">直接发送</button>`;
      hint.removeAttribute("hidden");
      document.getElementById("webUrlReadBtn")?.addEventListener("click", () => {
        hint.setAttribute("hidden", "");
        window.openPhoneOverlayWithUrl?.(detectedUrl);
      }, { once: true });
      document.getElementById("webUrlSendBtn")?.addEventListener("click", () => {
        hint.setAttribute("hidden", "");
        _bypassUrlCheck = true;
        handleSubmit();
      }, { once: true });
    }
    return;
  }

  messageInput.value = "";
  autoResizeTextarea(messageInput);
  const snapshot = pendingImage?.dataUrl ? { dataUrl: pendingImage.dataUrl } : null;
  pendingImage = null;
  updateAttachmentCard();
  imageInput.value = "";

  // Capture and clear reply state before render
  const replyId      = _replyToId;
  const replyPreview = _replyToPreview;
  const replyRole    = _replyToRole;
  clearReplyDraft();

  // Reset composer state after sending
  if (window.updateComposerState) {
    window.updateComposerState({
      hasText: false,
      hasImage: false,
      hasQuote: false,
      hasAttachment: false
    });
  }

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

  const replyTo = replyId ? { id: replyId, preview: replyPreview || "", role: replyRole || "user" } : null;

  // Optimistic update：先渲染，不等接口
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const msgEl = addMessage(content, "user", now, { tempId, replyTo });
  const msgGroupId = msgEl.closest(".msg-row")?.dataset.groupId;
  const getMsgRows = () => msgGroupId
    ? Array.from(messageList.querySelectorAll(`.msg-row[data-group-id="${msgGroupId}"]`))
    : (msgEl.closest(".msg-row") ? [msgEl.closest(".msg-row")] : []);
  maintainBottomAnchor("send");
  const dbContent = snapshot ? (text ? `[图片] ${text}` : "[图片]") : text;
  chatMessages.push({ role: "user", content, created_at: now, id: null, read_by_cha_at: null, read_by_user_at: null, replyTo });
  refreshMessageActions();
  if (isFirst) updateConvTitle(getActiveConversationId(), text || "[图片]");

  // 后台保存：有图时先上传 Storage，拿到 path 后再写 DB
  (async () => {
    let storagePath = null;
    if (snapshot) {
      const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
      const uid = user?.id || window.currentUserId;
      storagePath = await uploadImageToStorage(snapshot.dataUrl, uid, getActiveConversationId());
      if (storagePath === null) {
        setChatStatus("图片上传失败，消息未发送，请重试");
        // 回滚乐观渲染，清理 temp render cache
        chatMessages.pop();
        getMsgRows().forEach(r => r.remove());
        invalidateRenderCache(tempId);
        // Restore reply state so the user doesn't lose their reply context
        if (replyId) setReplyDraft(replyId, replyPreview, replyRole);
        return;
      }
    }
    const msgId = await saveMessage("user", dbContent, storagePath, {}, replyTo).catch(() => null);
    if (msgId != null) {
      getMsgRows().forEach(r => { r.dataset.msgId = String(msgId); });
      // Migrate render cache from tempId to real msgId
      if (text) {
        migrateRenderCacheTempId(tempId, String(msgId), hashString(text));
      }
    }
    const entry = chatMessages.findLast?.((m) => m.role === "user" && m.id === null);
    if (entry) entry.id = msgId != null ? String(msgId) : null;
    if (autoReplyEnabled) scheduleAutoReply(text);
  })();
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSubmit();
  maintainBottomAnchor("send");
});

sendButton.addEventListener("click", (e) => {
  e.preventDefault();
  handleSubmit();
  maintainBottomAnchor("send");
});

if (forceReplyBtn) {
  forceReplyBtn.addEventListener("click", () => {
    if (isReplying || !chatMessages.length) return;
    triggerReply("forced");
  });
}

// ── Chat more sheet ──────────────────────────────────────────────────────────

var CHAT_REPLY_STYLE_KEY = "chat_reply_style_v1";    // "stable" | "balanced" | "creative"
var CHAT_AUTO_FREQ_KEY   = "chat_auto_reply_frequency_v1"; // "off" | "low" | "normal" | "high"
var CHAT_KEEPALIVE_KEY   = "chat_keepalive_preference_v1"; // "on" | "off"
var CHAT_BLOCK_CHA_KEY   = "chat_block_cha_v1";      // "on" | "off"

var REPLY_STYLE_TEMP = { stable: 0.4, balanced: 0.7, creative: 1.0 };
var AUTO_FREQ_DELAY  = { off: 0, low: 18000, normal: 9000, high: 4000 }; // ms, 0 = disabled

var _chatMoreSheetOpen    = false;
var _chatMoreSubsheetOpen = null; // id string or null

// ── Chat input mode state machine ─────────────────────────────────────────────
// Exactly one mode is active at a time. Transitions enforce mutual exclusion
// so panels never fight over layout.
// Allowed values: "plain" | "keyboard" | "emoji" | "emojiSearch" | "more" | "edit"
var _chatInputMode = "plain";

function setChatInputMode(mode) {
  if (_chatInputMode === mode) return;
  const prev = _chatInputMode;
  _chatInputMode = mode;

  // Close panels that are no longer active
  if (prev === "emoji" || prev === "emojiSearch") {
    if (mode !== "emoji" && mode !== "emojiSearch") {
      window.SPEmojiPanel?.closeEmojiPanel();
    }
  }
  if (prev === "more") {
    if (mode !== "more") {
      closeChatMoreSheet();
    }
  }
  if (prev !== "plain" && mode === "plain") {
    window.closeV2PlusPanel?.();
  }
}

// Close every chat overlay/panel and return to plain mode
function closeAllChatPanels() {
  window.SPEmojiPanel?.closeEmojiPanel();
  window.closeV2PlusPanel?.();
  closeChatMoreSheet?.();
  _chatInputMode = "plain";
}

// ── Clear keyboard state (Section VII) ────────────────────────────────────────
// Unified click-outside handler for keyboard dismissal. Schedules deferred blur
// with 120-180ms delay to allow blur→focus handoff window for panel transitions.
// Called when user clicks outside input areas or when panels close programmatically.
let _clearKeyboardTimeout = null;

function clearKeyboardState(reason = "click-outside") {
  // Cancel any pending clear operation
  if (_clearKeyboardTimeout) {
    clearTimeout(_clearKeyboardTimeout);
    _clearKeyboardTimeout = null;
  }

  // Close all panels immediately
  closeAllChatPanels();

  // Reset horizontal viewport drift immediately
  if (window.SPKeyboardViewport?.resetHorizontalSoon) {
    window.SPKeyboardViewport.resetHorizontalSoon(`clear-keyboard:${reason}`);
  }

  // Schedule deferred blur with 150ms delay (midpoint of 120-180ms spec)
  _clearKeyboardTimeout = setTimeout(() => {
    _clearKeyboardTimeout = null;

    // Only blur if no input currently has focus (respects handoff window)
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.isContentEditable
    );

    if (!isTextInput) {
      // Safe to blur messageInput if it still has focus
      if (messageInput === activeEl) {
        messageInput.blur();
      }
    }
  }, 150);
}

function getChatReplyStyle()  { return localStorage.getItem(CHAT_REPLY_STYLE_KEY)  || "balanced"; }
function getChatAutoFreq()    { return localStorage.getItem(CHAT_AUTO_FREQ_KEY)    || "off"; }
function getChatBlockCha()    { return localStorage.getItem(CHAT_BLOCK_CHA_KEY)    === "on"; }
function getChatKeepAlive()   { return localStorage.getItem(CHAT_KEEPALIVE_KEY)    !== "off"; }

// Exposed for API call site: returns temperature number
function getChatReplyTemperature() {
  return REPLY_STYLE_TEMP[getChatReplyStyle()] ?? 0.7;
}

var _FREQ_LABEL = { off: "关", low: "偶尔", normal: "正常", high: "积极" };
var _STYLE_LABEL = { stable: "稳定", balanced: "均衡", creative: "发散" };

function applyChatAutoFreq(freq) {
  localStorage.setItem(CHAT_AUTO_FREQ_KEY, freq);
  // "off" turns off auto-reply; anything else turns it on
  const shouldEnable = (freq !== "off") && !getChatBlockCha();
  if (autoReplyEnabled !== shouldEnable) {
    autoReplyEnabled = shouldEnable;
    updateAutoReplyToggle();
    if (!autoReplyEnabled) cancelAutoReplyTimer();
  }
}


function openChatMoreSheet() {
  const sheet = document.getElementById("chatMoreSheet");
  if (!sheet) return;
  setChatInputMode("more");
  _chatMoreSheetOpen = true;
  _chatMoreSubsheetOpen = null;
  _showChatMoreMain(true);
  sheet.classList.remove("hidden");
  sheet.removeAttribute("aria-hidden");
  document.getElementById("cmsSearchBtn")?.focus({ preventScroll: true });
}

function closeChatMoreSheet() {
  const sheet = document.getElementById("chatMoreSheet");
  if (!sheet) return;
  // Sync state machine — use direct assignment to avoid recursion since
  // setChatInputMode("plain") would call closeChatMoreSheet() again.
  if (_chatInputMode === "more") _chatInputMode = "plain";
  _chatMoreSheetOpen = false;
  _chatMoreSubsheetOpen = null;
  sheet.classList.add("hidden");
  sheet.setAttribute("aria-hidden", "true");
  // close any sub-sheets
  document.querySelectorAll(".chat-more-subsheet").forEach(s => s.classList.add("hidden"));
  document.getElementById("chatMoreMain")?.classList.remove("hidden");
}

function openChatMoreSubsheet(id) {
  _showChatMoreMain(false);
  _chatMoreSubsheetOpen = id;
  document.querySelectorAll(".chat-more-subsheet").forEach(s => s.classList.add("hidden"));
  const sub = document.getElementById(id);
  if (sub) { sub.classList.remove("hidden"); sub.querySelector("button")?.focus(); }
  _syncChatMoreSubsheet(id);
}

function closeChatMoreSubsheet() {
  if (!_chatMoreSubsheetOpen) return;
  document.querySelectorAll(".chat-more-subsheet").forEach(s => s.classList.add("hidden"));
  _chatMoreSubsheetOpen = null;
  _showChatMoreMain(true);
}

function _showChatMoreMain(show) {
  const main = document.getElementById("chatMoreMain");
  if (main) main.classList.toggle("hidden", !show);
}

function _updateChatMoreSheetValues() {
  const styleEl = document.getElementById("cmsReplyStyleVal");
  if (styleEl) styleEl.textContent = _STYLE_LABEL[getChatReplyStyle()] || "均衡";
  const freqEl = document.getElementById("cmsAutoFreqVal");
  if (freqEl) freqEl.textContent = _FREQ_LABEL[getChatAutoFreq()] || "关";
}

function _syncChatMoreSubsheet(id) {
  if (id === "cmsReplyStyleSheet") {
    const cur = getChatReplyStyle();
    document.querySelectorAll("#cmsReplyStyleSheet .cms-radio-item").forEach(btn => {
      const selected = btn.dataset.style === cur;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
      btn.querySelector(".cms-radio-dot")?.classList.toggle("cms-radio-dot--on", selected);
    });
  } else if (id === "cmsAutoReplyFreqSheet") {
    const cur = getChatAutoFreq();
    document.querySelectorAll("#cmsAutoReplyFreqSheet .cms-radio-item").forEach(btn => {
      const selected = btn.dataset.freq === cur;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
      btn.querySelector(".cms-radio-dot")?.classList.toggle("cms-radio-dot--on", selected);
    });
  } else if (id === "cmsKeepAliveSheet") {
    const on = getChatKeepAlive();
    const toggle = document.getElementById("cmsKeepAliveToggle");
    if (toggle) {
      toggle.setAttribute("aria-checked", on ? "true" : "false");
      toggle.classList.toggle("cms-toggle--on", on);
    }
    const status = document.getElementById("cmsKeepAliveStatus");
    if (status) status.textContent = on ? "已开启" : "已关闭";
  } else if (id === "cmsVoiceSheet") {
    if (window.SPVoice) {
      const engine = window.SPVoice.getTTSEngine();
      const rate = window.SPVoice.getTTSRate();
      const volume = window.SPVoice.getTTSVolume();

      const engineEl = document.getElementById("cmsVoiceEngine");
      if (engineEl) engineEl.value = engine;

      const rateEl = document.getElementById("cmsVoiceRate");
      const rateValEl = document.getElementById("cmsVoiceRateVal");
      if (rateEl) rateEl.value = rate;
      if (rateValEl) rateValEl.textContent = rate.toFixed(1);

      const volumeEl = document.getElementById("cmsVoiceVolume");
      const volumeValEl = document.getElementById("cmsVoiceVolumeVal");
      if (volumeEl) volumeEl.value = volume;
      if (volumeValEl) volumeValEl.textContent = volume.toFixed(1);
    }
  } else if (id === "cmsAppearanceSheet") {
    const bgVal = localStorage.getItem("ui_custom_chat_background") ? "已自定义" : "默认";
    const bubbleVal = localStorage.getItem("ui_chat_bubble_theme") || "默认";
    const bgEl = document.getElementById("cmsChatBgVal");
    if (bgEl) bgEl.textContent = bgVal;
    const bubbleEl = document.getElementById("cmsBubbleThemeVal");
    if (bubbleEl) bubbleEl.textContent = bubbleVal;
  }
}

// ── Chat more sheet event listeners ──────────────────────────

(function initChatMoreSheetListeners() {
  // Open button
  document.getElementById("chatMoreBtn")?.addEventListener("click", () => {
    _updateChatMoreSheetValues();
    openChatMoreSheet();
  });

  // Overlay (backdrop) closes sheet
  document.getElementById("chatMoreOverlay")?.addEventListener("click", () => {
    closeChatMoreSheet();
    clearKeyboardState("chat-more-overlay-click");
  });

  // Main list items
  document.getElementById("cmsSearchBtn")?.addEventListener("click", () => {
    closeChatMoreSheet();
    // reuse existing search sheet open
    const searchBtn = document.getElementById("chatSearchButton");
    if (searchBtn) searchBtn.click();
  });

  document.getElementById("cmsMultiSelectBtn")?.addEventListener("click", () => {
    closeChatMoreSheet();
    if (typeof enterMultiSelectMode === 'function') {
      enterMultiSelectMode();
    }
  });

  document.getElementById("cmsAppearanceBtn")?.addEventListener("click", () => {
    openChatMoreSubsheet("cmsAppearanceSheet");
  });
  document.getElementById("cmsReplyStyleBtn")?.addEventListener("click", () => {
    openChatMoreSubsheet("cmsReplyStyleSheet");
  });
  document.getElementById("cmsVoiceBtn")?.addEventListener("click", () => {
    openChatMoreSubsheet("cmsVoiceSheet");
  });
  document.getElementById("cmsAutoFreqBtn")?.addEventListener("click", () => {
    openChatMoreSubsheet("cmsAutoReplyFreqSheet");
  });
  document.getElementById("cmsKeepAliveBtn")?.addEventListener("click", () => {
    openChatMoreSubsheet("cmsKeepAliveSheet");
  });

  // Sub-sheet back buttons
  document.getElementById("cmsAppearanceBack")?.addEventListener("click", closeChatMoreSubsheet);
  document.getElementById("cmsReplyStyleBack")?.addEventListener("click", closeChatMoreSubsheet);
  document.getElementById("cmsVoiceBack")?.addEventListener("click", closeChatMoreSubsheet);
  document.getElementById("cmsAutoFreqBack")?.addEventListener("click", closeChatMoreSubsheet);
  document.getElementById("cmsKeepAliveBack")?.addEventListener("click", closeChatMoreSubsheet);

  // Appearance sub-sheet
  document.getElementById("cmsChatBgBtn")?.addEventListener("click", () => {
    closeChatMoreSheet();
    openSettingsSubpage("appearance-resources");
  });
  document.getElementById("cmsBubbleThemeBtn")?.addEventListener("click", () => {
    closeChatMoreSheet();
    openSettingsSubpage("appearance-resources");
  });
  document.getElementById("cmsChatBgResetBtn")?.addEventListener("click", () => {
    localStorage.removeItem("ui_custom_chat_background");
    localStorage.removeItem("ui_chat_bubble_theme");
    _syncChatMoreSubsheet("cmsAppearanceSheet");
  });

  // Reply style radios
  document.querySelectorAll("#cmsReplyStyleSheet .cms-radio-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const style = btn.dataset.style;
      if (!style) return;
      localStorage.setItem(CHAT_REPLY_STYLE_KEY, style);
      _syncChatMoreSubsheet("cmsReplyStyleSheet");
      _updateChatMoreSheetValues();
    });
  });

  // Auto freq radios
  document.querySelectorAll("#cmsAutoReplyFreqSheet .cms-radio-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const freq = btn.dataset.freq;
      if (!freq) return;
      applyChatAutoFreq(freq);
      _syncChatMoreSubsheet("cmsAutoReplyFreqSheet");
      _updateChatMoreSheetValues();
    });
  });

  // Keep alive toggle
  document.getElementById("cmsKeepAliveToggle")?.addEventListener("click", () => {
    const next = !getChatKeepAlive();
    localStorage.setItem(CHAT_KEEPALIVE_KEY, next ? "on" : "off");
    _syncChatMoreSubsheet("cmsKeepAliveSheet");
  });

  // Voice controls
  document.getElementById("cmsVoiceEngine")?.addEventListener("change", (e) => {
    if (window.SPVoice) {
      window.SPVoice.setTTSEngine(e.target.value);
    }
  });
  document.getElementById("cmsVoiceRate")?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    const valEl = document.getElementById("cmsVoiceRateVal");
    if (valEl) valEl.textContent = val.toFixed(1);
    if (window.SPVoice) window.SPVoice.setTTSRate(val);
  });
  document.getElementById("cmsVoiceVolume")?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    const valEl = document.getElementById("cmsVoiceVolumeVal");
    if (valEl) valEl.textContent = val.toFixed(1);
    if (window.SPVoice) window.SPVoice.setTTSVolume(val);
  });

  // Esc key closes sheet
  document.addEventListener("keydown", (e) => {
    if (!_chatMoreSheetOpen) return;
    if (e.key === "Escape") {
      if (_chatMoreSubsheetOpen) { closeChatMoreSubsheet(); }
      else { closeChatMoreSheet(); }
    }
  });

  // Tab switch closes sheet
  document.querySelectorAll(".bottom-tab").forEach(tab => {
    tab.addEventListener("click", () => { if (_chatMoreSheetOpen) closeChatMoreSheet(); });
  });

  // Apply saved auto-freq pref on load
  const savedFreq = localStorage.getItem(CHAT_AUTO_FREQ_KEY);
  if (savedFreq && savedFreq !== "off") applyChatAutoFreq(savedFreq);
})();

// ── Auth (moved to modules/auth.js) ─────────────────────────────────────────
// Note: Auth initialization is now handled in modules/auth.js
// The auth module listens to auth state changes and calls hideLoginAndInit automatically

// ── Init ──────────────────────────────────────────────────────────────────────
// (Auth state management moved to modules/auth.js)


initTierBar();

// ── V2 primary shell / navigation ─────────────────────────────────────────────
// ── Shell navigation — delegated to modules/v2-shell.js ─────────────────────
function initV2Shell() {
  window.SPV2Shell.initV2Shell();
}

// ── Settings subpage system (moved to modules/settings-manager.js) ──────────
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
    const userId = window.currentUserId || "";
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

// NOTE: renderRecentMemoryUpdatesOptimistic and renderRecentMemoryUpdates are
// defined in the Memory Center V2 section below (line ~8430). The V1 versions
// that used buildRecentMemoryItem have been removed to eliminate duplicate definitions.

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
    // 世界书
    ["世界书已注入",           log.worldbook_loaded],
    ["世界书数量",             log.worldbook_count ?? "—"],
    ["世界书标题",             Array.isArray(log.worldbook_titles) ? log.worldbook_titles.join(", ") : "—"],
    ["世界书字数",             log.worldbook_chars ?? "—"],
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
  if (!window.currentUserId) return;
  if (!userMessage || !assistantMessage) return;
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
    const authHeaders = await getAuthHeaders();
    const res = await fetch(endpoint + "?type=vault_after_chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        userId: window.currentUserId,
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
  // candidates view state
  candidates: [],
  loadingCandidates: false,
  candidatesLoaded: false,
  candidatesError: "",
  candidateTypeFilter: "all",
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
  candidates: { title: "候选池", subtitle: "待审核的记忆候选，接受后才会写入档案馆" },
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
    const userId = window.currentUserId || "";
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

  // Phase 1: recent
  state.loadingRecent = true;
  state.recentError = "";
  renderMemoryCenterCurrentView();
  await mcBridgeFetchRecent();
  renderMemoryCenterCurrentView();

  // Phase 2: archive + audit + candidates (parallel)
  state.loadingArchive = true;
  state.loadingAudit = true;
  state.loadingCandidates = true;
  state.archiveError = "";
  state.auditError = "";
  state.candidatesError = "";
  renderMemoryCenterCurrentView();

  const [memOk, instOk, auditOk] = await Promise.all([
    mcBridgeFetchMemories(),
    mcBridgeFetchInstructions(),
    mcBridgeFetchAudit(),
    mcBridgeFetchCandidates(),
  ]);

  state.archiveLoaded = memOk || instOk;
  state.loadingArchive = false;
  state.loadingAudit = false;
  renderMemoryCenterCurrentView();
}

// ── Candidates fetch ──────────────────────────────────────────────────────────

async function mcBridgeFetchCandidates() {
  const state = memoryCenterV2State;
  const token = getMemoryToken();
  if (!token) {
    state.loadingCandidates = false;
    state.candidatesError = "需要 admin token（在调试面板里设置）";
    if (state.view === "candidates") renderMemoryCenterCurrentView();
    return false;
  }
  try {
    const endpoint = getMemoryEndpoint();
    const userId = getCurrentUserId?.() || "";
    if (!userId) throw new Error("未登录");
    const res = await fetch(
      `${endpoint}?type=backfill_cleanup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-memory-admin-token": token,
        },
        body: JSON.stringify({ action: "report", userId }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "unknown error");

    // Flatten candidates from report for display — we need the raw rows too,
    // so fetch them separately for the list view.
    const listRes = await fetch(
      `${endpoint}?type=candidates_list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-memory-admin-token": token,
        },
        body: JSON.stringify({ userId, limit: 200 }),
      }
    );
    let rows = [];
    if (listRes.ok) {
      const listData = await listRes.json();
      if (listData.ok && Array.isArray(listData.candidates)) rows = listData.candidates;
    }

    state.candidates = rows;
    state.candidatesLoaded = true;
    state.loadingCandidates = false;
    state.candidatesStats = {
      total: data.total_candidates,
      type_breakdown: data.type_breakdown,
      action_breakdown: data.action_breakdown,
    };
    if (state.view === "candidates") renderMemoryCenterCurrentView();
    return true;
  } catch (err) {
    state.loadingCandidates = false;
    state.candidatesError = err.message;
    if (state.view === "candidates") renderMemoryCenterCurrentView();
    return false;
  }
}

// ── Candidate Pool View ───────────────────────────────────────────────────────

const CANDIDATE_TYPE_LABELS = {
  project: "项目",
  fact: "事实",
  preference: "偏好",
  relationship: "关系",
  emotion: "情感",
  event: "事件",
};

const CANDIDATE_ACTION_TONE = {
  auto_accept: "status-enabled",
  pending: "status-recent",
  quarantine: "status-disabled",
};

function renderCandidatePoolView(root) {
  const state = memoryCenterV2State;
  const token = getMemoryToken();

  if (!token) {
    const warn = mcEl("div", "mc-empty");
    warn.textContent = "需要 admin token 才能查看候选池。请在实验室 > 调试设置里输入 token。";
    root.appendChild(warn);
    return;
  }

  if (state.loadingCandidates) {
    mcRenderEmpty(root, "加载候选池中...");
    return;
  }

  if (state.candidatesError) {
    mcRenderEmpty(root, `加载失败：${state.candidatesError}`);
    const retryBtn = mcEl("button", "mc-action-btn", "重试");
    retryBtn.type = "button";
    retryBtn.style.marginTop = "12px";
    retryBtn.addEventListener("click", () => {
      state.loadingCandidates = true;
      state.candidatesError = "";
      renderMemoryCenterCurrentView();
      mcBridgeFetchCandidates();
    });
    root.appendChild(retryBtn);
    return;
  }

  // ── Stats bar ────────────────────────────────────────────────────────────────
  if (state.candidatesStats) {
    const stats = state.candidatesStats;
    const bar = mcEl("div", "mc-cand-stats-bar");
    const total = mcEl("span", "mc-cand-stat", `共 ${stats.total} 条`);
    bar.appendChild(total);
    if (stats.action_breakdown) {
      const ab = stats.action_breakdown;
      if (ab.auto_accept) bar.appendChild(mcEl("span", "mc-cand-stat mc-cand-stat--accept", `自动接受 ${ab.auto_accept}`));
      if (ab.pending) bar.appendChild(mcEl("span", "mc-cand-stat mc-cand-stat--pending", `待审核 ${ab.pending}`));
      if (ab.quarantine) bar.appendChild(mcEl("span", "mc-cand-stat mc-cand-stat--quarantine", `隔离 ${ab.quarantine}`));
    }
    root.appendChild(bar);
  }

  // ── Type filter tabs ─────────────────────────────────────────────────────────
  const filterBar = mcEl("div", "mc-cand-filter-bar");
  const types = ["all", "project", "fact", "preference", "relationship"];
  types.forEach((t) => {
    const btn = mcEl("button", "mc-cand-filter-btn" + (state.candidateTypeFilter === t ? " mc-cand-filter-btn--active" : ""), t === "all" ? "全部" : (CANDIDATE_TYPE_LABELS[t] || t));
    btn.type = "button";
    btn.dataset.type = t;
    btn.addEventListener("click", () => {
      state.candidateTypeFilter = t;
      renderMemoryCenterCurrentView();
    });
    filterBar.appendChild(btn);
  });
  root.appendChild(filterBar);

  // ── Candidate list ───────────────────────────────────────────────────────────
  let items = state.candidates;
  if (state.candidateTypeFilter !== "all") {
    items = items.filter(c => c.candidate_type === state.candidateTypeFilter);
  }

  if (!items.length) {
    mcRenderEmpty(root, state.candidatesLoaded ? "没有符合条件的候选。" : "还没有加载候选池。");
    return;
  }

  const list = mcEl("div", "mc-card-list");

  items.forEach((cand) => {
    const card = mcEl("article", "mc-memory-card mc-cand-card");
    const top = mcEl("div", "mc-memory-card-top");
    const chips = mcEl("div", "mc-chip-row");
    chips.appendChild(mcRenderBadge(CANDIDATE_TYPE_LABELS[cand.candidate_type] || cand.candidate_type, cand.candidate_type));
    chips.appendChild(mcRenderBadge(cand.recommended_action === "auto_accept" ? "自动接受" : cand.recommended_action === "pending" ? "待审核" : "隔离", CANDIDATE_ACTION_TONE[cand.recommended_action] || "status"));
    top.appendChild(chips);
    top.appendChild(mcEl("span", "mc-memory-time", mcFormatDateTime(cand.created_at)));

    const title = mcEl("h3", "mc-memory-title", cand.title || cand.content.slice(0, 28));
    const summary = mcEl("p", "mc-memory-summary", cand.summary || cand.content.slice(0, 84));
    card.append(top, title, summary);

    if (cand.content) {
      const full = mcEl("div", "mc-memory-full", cand.content);
      card.appendChild(full);
    }

    if (cand.source_preview) {
      card.appendChild(mcEl("div", "mc-memory-source", `来源：${cand.source_preview}`));
    }

    const confPct = Math.round((cand.confidence || 0) * 100);
    const meta = mcEl("div", "mc-cand-meta", `置信度 ${confPct}%`);
    card.appendChild(meta);

    // ── Action buttons ────────────────────────────��───────────────────────────
    const actions = mcEl("div", "mc-memory-actions");

    // Expand
    const expandBtn = mcEl("button", "mc-action-btn", "展开");
    expandBtn.type = "button";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExp = card.classList.toggle("mc-memory-card--expanded");
      expandBtn.textContent = isExp ? "收起" : "展开";
    });
    actions.appendChild(expandBtn);

    // Accept (pending → auto_accept)
    if (cand.recommended_action === "pending" || cand.recommended_action === "quarantine") {
      const acceptBtn = mcEl("button", "mc-action-btn mc-action-btn--accept", "接受");
      acceptBtn.type = "button";
      acceptBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        acceptBtn.disabled = true;
        acceptBtn.textContent = "...";
        const ok = await mcCandidatePatch(cand.id, { recommended_action: "auto_accept" });
        if (ok) {
          cand.recommended_action = "auto_accept";
          renderMemoryCenterCurrentView();
        } else {
          acceptBtn.disabled = false;
          acceptBtn.textContent = "接受";
          showMcToast("操作失败", true);
        }
      });
      actions.appendChild(acceptBtn);
    }

    // Reject
    if (cand.recommended_action !== "rejected") {
      const rejectBtn = mcEl("button", "mc-action-btn mc-action-btn--danger", "丢弃");
      rejectBtn.type = "button";
      rejectBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        rejectBtn.disabled = true;
        rejectBtn.textContent = "...";
        const ok = await mcCandidatePatch(cand.id, { recommended_action: "pending", status: "rejected" });
        if (ok) {
          state.candidates = state.candidates.filter(c => c.id !== cand.id);
          renderMemoryCenterCurrentView();
        } else {
          rejectBtn.disabled = false;
          rejectBtn.textContent = "丢弃";
          showMcToast("操作失败", true);
        }
      });
      actions.appendChild(rejectBtn);
    }

    card.appendChild(actions);
    list.appendChild(card);
  });

  root.appendChild(list);
}

async function mcCandidatePatch(id, patch) {
  const token = getMemoryToken();
  const endpoint = getMemoryEndpoint();
  const userId = getCurrentUserId?.() || "";
  if (!token || !endpoint || !userId) return false;
  try {
    const res = await fetch(
      `${endpoint}?type=candidate_patch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-memory-admin-token": token,
        },
        body: JSON.stringify({ userId, candidateId: id, patch }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
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
  } else if (memoryCenterV2State.view === "candidates") {
    renderCandidatePoolView(root);
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
    const userId = window.currentUserId || "";
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

// ═════════════════════════════════════════════════════════════════════════════
// 世界书管理
// ═════════════════════════════════════════════════════════════════════════════

// ── Worldbook (moved to modules/worldbook.js) ───────────────────────────────
// ── Toast helper (reuse existing showDialog or fallback) ─────────────────────
// The app uses showDialog(). For non-blocking brief feedback we use it as
// a simple one-button alert. If a lighter toast API exists in the codebase
// we can swap this out, but showDialog is the existing pattern.

function showToast(message, duration = 2800) {
  const el = document.createElement("div");
  el.className = "memory-toast toast-enter";
  el.textContent = message;
  el.addEventListener("click", () => dismiss());
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.remove("toast-enter"));
  const t = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(t);
    el.classList.add("toast-exit");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }
}

// ── Service Worker registration ───────────────────────────────────────────────
// SW is disabled on localhost and *.dev.* preview deployments.
// On those hosts we also proactively unregister any previously installed SW
// and clear all spc-shell-* caches so stale assets can't mask fresh deploys.
const _SW_DEV_HOST =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname.includes(".dev.") ||
  location.hostname.includes("dev.");

async function _cleanupSwAndCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("spc-shell")).map((k) => caches.delete(k))
      );
    }
    console.info("[SW] unregistered and stale caches cleared");
  } catch (err) {
    console.warn("[SW] cleanup failed:", err);
  }
}

if (_SW_DEV_HOST) {
  // Dev / preview: tear down any existing SW so we always load fresh files.
  _cleanupSwAndCaches();
} else if ("serviceWorker" in navigator) {
  // Production: register the cleanup SW which will unregister itself after
  // deleting all caches. Re-enable a real caching SW in a future PR.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] registration failed:", err);
    });
  });
}

// ── Diary Module Initialization ──────────────────────────────────────────────

// Update Home diary card on page load and start auto-schedule checker
window.addEventListener("load", () => {
  if (supabaseClient && window.SPDiary) {
    window.SPDiary.updateHomeDiaryCard(supabaseClient, window.currentUserId || 'default')
      .catch(err => console.error('Failed to update diary card:', err));
    window.SPDiary.initDiaryScheduler();
  }
});

// ── V2 Composer (Plus Panel & Emoji Button) ──────────────────────────────────

/**
 * Show voice call loading page with heartbeat/ripple animation
 */
function showVoiceCallLoadingPage() {
  const overlay = document.createElement('div');
  overlay.className = 'voice-call-overlay';
  overlay.innerHTML = `
    <div class="voice-call-container">
      <div class="heartbeat-pulse"></div>
      <p>正在连接通话服务...</p>
      <button type="button" class="voice-call-cancel" aria-label="取消">取消</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.voice-call-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  // 自动移除（预留：未来可以链接真实的 tts 和语音通话）
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 3000);
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
    emojiButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="8" r="1" fill="currentColor"/><circle cx="11.5" cy="8" r="1" fill="currentColor"/><path d="M6 11c.7 1.2 1.8 2 3 2s2.3-.8 3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    inputBar.insertBefore(emojiButton, plusButton);
  }

  // Wire up emoji button
  emojiButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    openEmojiPanel();
  }, true);

  plusButton.innerHTML = '<img src="assets/icons/chat/plus.svg" alt="">';
  plusButton.title = "更多";
  plusButton.setAttribute("aria-label", "更多");

  let panel = null;
  const closePanel = () => {
    if (panel) {
      panel.remove();
      panel = null;
      plusButton.classList.remove("active");
      document.querySelector(".chat-shell")?.classList.remove("plus-panel-open");
      // 清理动态注入的面板高度变量
      document.documentElement.style.removeProperty('--plus-panel-h');
      if (_chatInputMode !== "plain") {
        _chatInputMode = "plain";
      }
      maintainBottomAnchor("close-panel");
    }
  };
  window.closeV2PlusPanel = closePanel;

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
    closeStatusPanel();
    closePanel();
    // Close emoji panel if open (mutual exclusion)
    if (typeof window.closeEmojiPanel === "function") window.closeEmojiPanel();
    // Dismiss the soft keyboard cleanly so the plus panel takes its place,
    // preventing the composer from drifting with the keyboard-close animation.
    if (messageInput && document.activeElement === messageInput) {
      messageInput.blur();
    }
    // Force a clean non-keyboard state immediately so --dock-gap resolves to
    // the stable baseline instead of --kb+10 during the keyboard-close window.
    document.querySelector(".layout")?.classList.remove("keyboard-open");
    document.documentElement.style.setProperty("--kb", "0px");
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    panel = document.createElement("div");
    panel.className = "plus-panel";

    const actions = document.createElement("div");
    actions.className = "plus-panel-grid";

    // Voice call
    addPanelItem(actions, {
      label: "语音电话",
      desc: "通话服务",
      icon: '<img src="assets/icons/others/voice-call.svg" alt="">',
      onClick: () => {
        closePanel();
        // 显示心跳/水波纹加载页面，链接 tts 和语音通话
        showVoiceCallLoadingPage();
      },
      disabled: false,
    });

    addPanelItem(actions, {
      label: "图片",
      desc: "相册或文件",
      icon: '<span>＋</span>',
      onClick: () => {
        if (isMobileLayout()) {
          showImageBottomSheet();
        } else {
          imageInput.value = "";
          imageInput.click();
        }
      },
    });
    addPanelItem(actions, {
      label: "接话",
      desc: autoReplyEnabled ? "已开启" : "已关闭",
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

    // 浮模式：append 到 chat-shell，加 plus-panel-open class（和 emoji 一致）
    const chatShell = document.querySelector(".chat-shell");
    (chatShell || inputBar.parentNode).appendChild(panel);
    chatShell?.classList.add("plus-panel-open");
    plusButton.classList.add("active");
    setChatInputMode("plain"); // plus-panel is not a keyboard-replacement state

    // 记录打开前是否在底部
    const wasNearBottom = isNearBottom();

    requestAnimationFrame(() => {
      panel.classList.add("open");

      // 测量面板实际高度，注入 CSS 变量用于 padding 计算
      const panelHeight = panel.offsetHeight;
      if (panelHeight > 0) {
        document.documentElement.style.setProperty('--plus-panel-h', `${panelHeight + 12}px`);
      }

      // 只在原本就在底部时才跟随滚动
      if (wasNearBottom) {
        scrollChatToLatest();
      }
    });
  }

  plusButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    panel ? closePanel() : openPanel();
  }, true);

  messageInput?.addEventListener("focus", closePanel);

  document.addEventListener("click", (event) => {
    if (!panel) return;
    if (panel.contains(event.target) || plusButton.contains(event.target)) return;
    closePanel();
  });
}

// ── App Initialization ───────────────────────────────────────────────────────

initV2Shell();
initV2Composer();
initInputKeyboardHints();
initKeyboardViewportState();
initStableShellHeight();
initVisualVh();

// Initialize voice module
if (window.SPVoice) {
  window.SPVoice.initVoice();
}

// Voice input button handler (MVP placeholder)
if (voiceInputBtn) {
  voiceInputBtn.addEventListener("click", () => {
    console.log("Voice input clicked - recording UI not yet implemented");
    alert("语音输入功能\n\n录音界面开发中...");
  });
}

// Start loading emoji catalog in the background — never blocks UI
window.SPEmoji.loadEmojiCatalog().catch(err => console.warn("[emoji] catalog load error:", err));

// Shortcode emoji suggestion bar (moved to modules/emoji-suggestions.js)
window.SPEmojiSuggestions.initEmojiSuggestionBar();

// ── Chat Transformation Integration ──────────────────────────────────────────

// Initialize contact manager and chat navigation
if (window.ContactManager) {
  window.ContactManager.init();
}

if (window.ChatNavigation) {
  window.ChatNavigation.init();
}

// Composer state for mic/send toggle
const composerState = {
  hasText: false,
  hasImage: false,
  hasQuote: false,
  hasAttachment: false
};

function updateComposerButtons() {
  const hasSendable = composerState.hasText ||
                      composerState.hasImage ||
                      composerState.hasQuote ||
                      composerState.hasAttachment;

  const micBtn = document.getElementById('voiceInputBtn');
  const sendBtn = document.getElementById('sendButton');

  if (hasSendable) {
    micBtn?.classList.add('hidden');
    sendBtn?.classList.remove('hidden');
  } else {
    micBtn?.classList.remove('hidden');
    sendBtn?.classList.add('hidden');
  }
}

// Hook into message input
if (messageInput) {
  const originalInputListener = messageInput.oninput;
  messageInput.addEventListener('input', () => {
    composerState.hasText = messageInput.value.trim().length > 0;
    updateComposerButtons();
  });
}

// Export for other modules to use
window.updateComposerState = function(updates) {
  Object.assign(composerState, updates);
  updateComposerButtons();
};

// ── Contact List Page Rendering ──────────────────────────────────────────────

async function renderChatContactsList() {
  const contactsList = document.getElementById('chatContactsList');
  if (!contactsList || !window.ContactManager) return;

  const contacts = await window.ContactManager.getContactList();

  contactsList.innerHTML = '';

  for (const contact of contacts) {
    const row = document.createElement('div');
    row.className = 'contact-row';
    row.dataset.contactId = contact.id;

    // Avatar
    const avatar = document.createElement('img');
    avatar.className = 'contact-avatar';
    avatar.src = contact.avatar || 'assets/avatars/cha.png';
    avatar.alt = contact.nickname;

    // Info column
    const info = document.createElement('div');
    info.className = 'contact-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'contact-name-row';

    const name = document.createElement('span');
    name.className = 'contact-name';
    name.textContent = contact.nickname;

    const statusDot = document.createElement('span');
    statusDot.className = 'online-dot';
    if (contact.status !== 'online') {
      statusDot.style.display = 'none';
    }

    nameRow.appendChild(name);
    nameRow.appendChild(statusDot);

    const preview = document.createElement('div');
    preview.className = 'contact-preview';
    preview.textContent = contact.lastMessage || '开始聊天...';

    info.appendChild(nameRow);
    info.appendChild(preview);

    // Meta column
    const meta = document.createElement('div');
    meta.className = 'contact-meta';

    const time = document.createElement('span');
    time.className = 'contact-time';
    time.textContent = contact.lastMessageTime || '';

    meta.appendChild(time);

    if (contact.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'contact-unread-badge';
      badge.textContent = contact.unreadCount;
      meta.appendChild(badge);
    }

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(meta);

    // Click handler
    row.addEventListener('click', () => enterChatDetailForContact(contact.id));

    contactsList.appendChild(row);
  }
}

async function enterChatDetailForContact(contactId) {
  if (!window.ContactManager || !window.ChatNavigation) return;

  const convId = window.ContactManager.getChatThreadForContact(contactId);
  if (convId) {
    setActiveConversationId(convId);
  }

  window.ChatNavigation.navigateToChatPage('chat-detail');

  // Update top bar with contact info
  updateChatDetailTopBar(contactId);

  // Reload history
  await reloadHistory();
  scrollToBottom(messageList);
  markReadByUser();
}

function updateChatDetailTopBar(contactId) {
  if (!window.ContactManager) return;

  const contact = window.ContactManager.getContactById(contactId);
  if (!contact) return;

  const nameEl = document.querySelector('.chat-detail-name');
  const dotEl = document.querySelector('.chat-detail-contact-btn .online-dot');

  if (nameEl) {
    nameEl.textContent = contact.nickname;
  }

  if (dotEl) {
    dotEl.style.display = contact.status === 'online' ? 'block' : 'none';
  }
}

// ── Chat Detail Navigation ───────────────────────────────────────────────────

const chatDetailBackBtn = document.getElementById('chatDetailBackBtn');
const chatDetailContactBtn = document.getElementById('chatDetailContactBtn');

if (chatDetailBackBtn) {
  chatDetailBackBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('chat-contacts');
    }
  });
}

if (chatDetailContactBtn) {
  chatDetailContactBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('contact-profile', { contactId: 'cha' });
    }
  });
}

// ── Contact Profile Page ──────────────────────────────────────────────────────

function loadContactProfilePage(contactId) {
  if (!window.ContactManager) return;

  const contact = window.ContactManager.getContactById(contactId);
  if (!contact) return;

  // Update profile fields
  const nicknameEl = document.getElementById('profileNickname');
  const nicknameCalledEl = document.getElementById('profileNicknameCalled');
  const introEl = document.getElementById('profileIntro');
  const statusEl = document.getElementById('profileStatus');
  const avatarBtn = document.getElementById('profileAvatarBtn');

  if (nicknameEl) nicknameEl.textContent = contact.nickname;
  if (nicknameCalledEl) nicknameCalledEl.textContent = contact.nicknameCalled;
  if (introEl) introEl.textContent = contact.intro;
  if (statusEl) statusEl.textContent = contact.status === 'online' ? '在线' : '离线';

  if (avatarBtn) {
    avatarBtn.style.backgroundImage = `url(${contact.avatar})`;
  }

  // Update hints
  const notesHint = document.getElementById('profileNotesHint');
  const chatBgHint = document.getElementById('profileChatBgHint');

  if (notesHint) {
    notesHint.textContent = contact.notes || '未设置';
  }

  if (chatBgHint) {
    // Read directly from Settings storage key so they stay in sync
    const hasChatBg = !!localStorage.getItem('ui_custom_chat_background');
    chatBgHint.textContent = hasChatBg ? '已自定义' : '默认';
  }
}

// Profile back button
const contactProfileBackBtn = document.getElementById('contactProfileBackBtn');
if (contactProfileBackBtn) {
  contactProfileBackBtn.addEventListener('click', () => {
    if (window.ChatNavigation) {
      window.ChatNavigation.navigateToChatPage('chat-detail');
    }
  });
}

// Profile edit buttons
document.querySelectorAll('.profile-edit-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const row = e.target.closest('.profile-info-row');
    if (!row) return;

    const field = row.dataset.field;
    const label = row.querySelector('.profile-label')?.textContent || '字段';
    const currentValue = row.querySelector('.profile-value')?.textContent || '';

    showDialog({
      title: `编辑${label}`,
      input: currentValue,
      confirmLabel: '确定',
      onConfirm: (newValue) => {
        if (!window.ContactManager) return;

        const updates = {};

        if (field === 'nickname') {
          updates.nickname = newValue;
        } else if (field === 'nicknameCalled') {
          updates.nicknameCalled = newValue;
        } else if (field === 'intro') {
          updates.intro = newValue;
        } else if (field === 'status') {
          updates.status = newValue === '在线' ? 'online' : 'offline';
        }

        window.ContactManager.updateContactMetadata('cha', updates);
        loadContactProfilePage('cha');
        updateChatDetailTopBar('cha');
      }
    });
  });
});

// Profile clear history button
const profileClearHistoryBtn = document.getElementById('profileClearHistoryBtn');
if (profileClearHistoryBtn) {
  profileClearHistoryBtn.addEventListener('click', () => {
    showDialog({
      title: '清空聊天记录',
      body: '确定要清空与 Cha 的所有聊天记录吗？此操作不可撤销。',
      confirmLabel: '清空',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        const convId = getActiveConversationId();
        if (!convId) return;

        await supabaseClient.from('messages').delete().eq('conversation_id', convId);
        chatMessages.length = 0;
        renderWelcomeMessage();

        if (window.ChatNavigation) {
          window.ChatNavigation.navigateToChatPage('chat-detail');
        }
      }
    });
  });
}

// Profile notes button
const profileNotesBtn = document.getElementById('profileNotesBtn');
if (profileNotesBtn) {
  profileNotesBtn.addEventListener('click', () => {
    if (!window.ContactManager) return;
    const contact = window.ContactManager.getContactById('cha');
    showDialog({
      title: '备注',
      input: contact?.notes || '',
      confirmLabel: '保存',
      onConfirm: (newValue) => {
        window.ContactManager.updateContactMetadata('cha', { notes: newValue.trim() });
        loadContactProfilePage('cha');
      }
    });
  });
}

// Profile chat background button — syncs with ui_custom_chat_background (Settings)
const profileChatBgBtn = document.getElementById('profileChatBgBtn');
if (profileChatBgBtn) {
  profileChatBgBtn.addEventListener('click', async () => {
    // Direct file upload for chat background (shares ui_custom_chat_background with Settings)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      // Validate type: JPEG, PNG, WebP, GIF only
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        if (typeof showToast === 'function') {
          showToast('仅支持 JPEG、PNG、WebP、GIF 格式');
        }
        fileInput.remove();
        return;
      }

      // Validate size: max 10MB for backgrounds
      if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') {
          showToast('图片不能超过 10MB');
        }
        fileInput.remove();
        return;
      }

      try {
        // Compress and save
        const dataUrl = await compressImage(file);
        localStorage.setItem('ui_custom_chat_background', dataUrl);

        // Update hint text in profile page
        const hintEl = document.getElementById('profileChatBgHint');
        if (hintEl) hintEl.textContent = '已自定义';

        // Apply to chat shell immediately
        const chatShell = document.querySelector('.chat-shell');
        if (chatShell) {
          chatShell.style.backgroundImage = `url(${dataUrl})`;
          chatShell.style.backgroundSize = 'cover';
          chatShell.style.backgroundPosition = 'center';
          chatShell.style.backgroundRepeat = 'no-repeat';
        }

        if (typeof showToast === 'function') {
          showToast('聊天背景已更新');
        }
      } catch (err) {
        console.error('Failed to set chat background:', err);
        if (typeof showToast === 'function') {
          showToast('背景图片处理失败，请重试');
        }
      }

      fileInput.remove();
    });

    document.body.appendChild(fileInput);
    fileInput.click();
  });
}

// ── Bottom Tab Chat Integration ──────────────────────────────────────────────

// Listen for page activation and show chat detail when chat page becomes active
(function initChatPageObserver() {
  const chatPage = document.querySelector('.v2-page--chat');
  if (!chatPage) {
    console.warn('[Chat] Chat page not found, will retry...');
    setTimeout(initChatPageObserver, 100);
    return;
  }

  function ensureChatDetailShown() {
    if (chatPage.classList.contains('v2-active')) {
      const currentChatPage = window.ChatNavigation?.getCurrentChatPage();
      // Always show chat detail when chat page is active, unless explicitly on another subpage
      if (!currentChatPage || currentChatPage === 'chat-contacts') {
        console.log('[Chat] Navigating to chat detail');
        if (window.ChatNavigation) {
          window.ChatNavigation.navigateToChatPage('chat-detail');
          // Also update top bar
          if (window.updateChatDetailTopBar) {
            window.updateChatDetailTopBar('cha');
          }
        }
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        ensureChatDetailShown();
      }
    });
  });

  observer.observe(chatPage, { attributes: true });

  // Also call immediately in case page is already active
  ensureChatDetailShown();

  console.log('[Chat] Page observer initialized');
})();


// ── Search Contact Functionality ─────────────────────────────────────────────

const chatContactsSearchBtn = document.getElementById('chatContactsSearchBtn');
const chatContactsSearch = document.getElementById('chatContactsSearch');
const contactSearchInput = document.getElementById('contactSearchInput');

if (chatContactsSearchBtn && chatContactsSearch) {
  chatContactsSearchBtn.addEventListener('click', () => {
    chatContactsSearch.classList.toggle('hidden');
    if (!chatContactsSearch.classList.contains('hidden')) {
      contactSearchInput?.focus();
    }
  });
}

if (contactSearchInput) {
  contactSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.contact-row');

    rows.forEach(row => {
      const name = row.querySelector('.contact-name')?.textContent.toLowerCase() || '';
      const preview = row.querySelector('.contact-preview')?.textContent.toLowerCase() || '';

      if (name.includes(query) || preview.includes(query)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

// Export functions for global use
window.renderChatContactsList = renderChatContactsList;
window.loadContactProfilePage = loadContactProfilePage;
window.updateChatDetailTopBar = updateChatDetailTopBar;

// Initialize on page load
updateComposerButtons();
