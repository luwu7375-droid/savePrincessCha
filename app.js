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

// Chat now has one canonical mode. Keep the legacy request field set to
// "general" until the backend API can remove tier compatibility entirely.
const currentModelTier = "general";
localStorage.removeItem("modelTier");

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
  utility: { label: "脏活/后台任务模型", description: "摘要、分类、标签提取等低成本任务" },
  imageGeneration: { label: "图片生成模型", description: "Cha 生成图片时使用" }
};

// Storage key for model role mapping
const MODEL_ROLE_MAPPING_KEY = "spc_model_role_mapping_v1";

// Get model role mapping from localStorage
function getModelRoleMapping() {
  try {
    const stored = localStorage.getItem(MODEL_ROLE_MAPPING_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    console.log('[app] getModelRoleMapping returned:', parsed);
    return parsed;
  } catch (err) {
    console.error("Failed to parse model role mapping:", err);
    return {};
  }
}

// Save model role mapping to localStorage
function saveModelRoleMapping(mapping) {
  console.log('[app] saveModelRoleMapping called with:', mapping);
  try {
    const data = {
      ...mapping,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(MODEL_ROLE_MAPPING_KEY, JSON.stringify(data));
    console.log('[app] Saved to localStorage:', MODEL_ROLE_MAPPING_KEY, data);

    // Verify it was saved
    const saved = localStorage.getItem(MODEL_ROLE_MAPPING_KEY);
    console.log('[app] Verification read from localStorage:', saved);
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
window.getModelRoleMapping = getModelRoleMapping;
window.saveModelRoleMapping = saveModelRoleMapping;
window.MODEL_ROLES = MODEL_ROLES;

console.log('[app] PROVIDER_GROUPS and model functions exposed to window');

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


// ── Pending images state (multi-image support) ────────────────────────────
let pendingImages = []; // Array<{ id: string, dataUrl: string|null, loading: boolean, error: string|null, file: File }>

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
  if (!uploadResult?.path) return null;
  return { path: uploadResult.path, signedUrl: uploadResult.signedUrl || null };
}

/**
 * Generate a 1-hour signed URL for a Storage path.
 * Returns null on error (non-fatal).
 */
async function getSignedImageUrl(storagePath) {
  if (!supabaseClient || !storagePath) return null;

  // If storagePath is already a full URL (external image), return it directly
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    console.log("[getSignedImageUrl] External URL detected, returning directly:", storagePath.slice(0, 100));
    return storagePath;
  }

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

  // Parse image_storage_path: could be single string or JSON array
  const pathsToResolve = [];
  const pathIndexMap = new Map(); // path -> [row, index]

  needsUrl.forEach(r => {
    let paths;
    try {
      // Try to parse as JSON array first
      paths = JSON.parse(r.image_storage_path);
      if (!Array.isArray(paths)) paths = [r.image_storage_path];
    } catch {
      // Not JSON, treat as single path
      paths = [r.image_storage_path];
    }

    paths.forEach((path, idx) => {
      if (!pathIndexMap.has(path)) {
        pathIndexMap.set(path, []);
        pathsToResolve.push(path);
      }
      pathIndexMap.get(path).push({ row: r, index: idx, totalPaths: paths.length });
    });
  });

  // Parallel signed URL generation for all unique paths
  const urlResults = await Promise.all(
    pathsToResolve.map(path => getSignedImageUrl(path))
  );

  // Build a map: path → signedUrl
  const urlMap = new Map();
  pathsToResolve.forEach((path, i) => {
    if (urlResults[i]) urlMap.set(path, urlResults[i]);
  });

  // Rebuild rows: upgrade content to vision array when signed URL is available
  return rows.map(r => {
    if (!r.image_storage_path) return r;

    let paths;
    try {
      paths = JSON.parse(r.image_storage_path);
      if (!Array.isArray(paths)) paths = [r.image_storage_path];
    } catch {
      paths = [r.image_storage_path];
    }

    const signedUrls = paths.map(path => urlMap.get(path)).filter(Boolean);
    if (!signedUrls.length) return r; // fallback: keep text-only content

    // Extract text content (remove [图片] or [图片×N] prefix)
    const textPart = r.content.replace(/^\[图片(?:×\d+)?\]\s*/, "").trim();
    const parts = [];
    if (textPart) parts.push({ type: "text", text: textPart });

    // Add all image URLs
    signedUrls.forEach(url => {
      parts.push({ type: "image_url", image_url: { url, detail: "low" } });
    });

    // Preserve original database content for quote preview
    return { ...r, db_content: r.content, content: parts };
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

async function saveMessage(role, content, imageStoragePath = null, eventFields = {}, replyTo = null, thought = null) {
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
  if (thought) row.thought = thought;
  const { data, error } = await supabaseClient
    .from("messages")
    .insert(row)
    .select("id")
    .single();
  if (error) { console.error("保存消息失败：", error); return null; }
  supabaseClient.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).then(() => {});
  return data?.id || null;
}

function isExplicitVoiceMessage(message) {
  // Voice message if:
  // 1. type is "voice" (legacy), or
  // 2. audio_type_explicit is true (user explicitly sent voice), or
  // 3. has audio_type = "fake" (user fake voice message), or
  // 4. has audio_transcribed_text (any voice message with transcription)
  return message?.type === "voice"
    || message?.audio_type_explicit === true
    || message?.audio_type === "fake"
    || (message?.audio_transcribed_text && message?.role === "user");
}

function shouldRenderVoiceMessage(message) {
  return isExplicitVoiceMessage(message) && !!window.SPVoiceMessage;
}

function shouldAddAssistantVoiceIndicator(message) {
  return message?.role === "assistant"
    && !!message.audio_url
    && message.audio_type === "real"
    && !isExplicitVoiceMessage(message)
    && !!message.id;
}

let chaVoiceTtsDebug = {};

function updateChaVoiceTtsDebug(fields = {}) {
  chaVoiceTtsDebug = {
    ...chaVoiceTtsDebug,
    ...fields,
    updated_at: new Date().toISOString(),
  };
  window.chaVoiceTtsDebug = chaVoiceTtsDebug;
  return chaVoiceTtsDebug;
}

function getChaTtsFailureReason(error) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message || "unknown";
  return String(error);
}

function estimateChaVoiceDuration(text, language = "zh") {
  const charsPerMinute = language === "zh" ? 150 : 180;
  return Math.max(1, Math.ceil(((text || "").length / charsPerMinute) * 60));
}

function getChaTtsRequestConfig(text) {
  const ttsConfig = typeof SPVoice !== "undefined" && SPVoice.getTTSConfig
    ? SPVoice.getTTSConfig()
    : null;

  if (!ttsConfig || !ttsConfig.provider) {
    throw new Error("TTS provider is not configured");
  }

  const language = typeof SPVoice !== "undefined" && SPVoice.detectTtsLanguage
    ? SPVoice.detectTtsLanguage(text)
    : "zh";

  const supabaseUrl = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");
  const anonKey = getConfigValue("SUPABASE_ANON_KEY", "YOUR_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey || supabaseUrl === "YOUR_SUPABASE_URL" || anonKey === "YOUR_SUPABASE_ANON_KEY") {
    throw new Error("TTS endpoint is not configured");
  }

  const profiles = ttsConfig.profiles || {};
  const profile = profiles[language] || profiles.default || profiles.en || {};
  const voiceId = profile.voice_id || profiles.en?.voice_id || profiles.default?.voice_id || "";
  const modelId = ttsConfig.model_id || profile.model_id || "eleven_v3";

  if (!voiceId) {
    throw new Error("TTS voice_id is not configured");
  }

  return {
    endpoint: `${supabaseUrl}/functions/v1/tts`,
    anonKey,
    language,
    provider: ttsConfig.provider || "elevenlabs",
    voiceId,
    modelId,
    profile,
  };
}

async function requestChaTts(text, { messageId = null, purpose = "attachment" } = {}) {
  const cfg = getChaTtsRequestConfig(text);
  updateChaVoiceTtsDebug({
    tts_provider: cfg.provider,
    voice_id: cfg.voiceId,
    model_id: cfg.modelId,
    tts_endpoint: cfg.endpoint,
    tts_status: "pending",
    tts_error: null,
    storage_upload_status: null,
    audio_url_returned: false,
    purpose,
  });

  let response;
  let data = null;
  try {
    response = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.anonKey}`,
        "apikey": cfg.anonKey,
      },
      body: JSON.stringify({
        message_id: messageId != null ? Number(messageId) : null,
        text,
        language_hint: cfg.language,
        provider: cfg.provider,
        voice_profile: {
          voice_id: cfg.voiceId,
          model_id: cfg.modelId,
          settings: cfg.profile.settings,
        },
      }),
    });

    const raw = await response.text();
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw };
    }

    if (!response.ok || data?.ok === false) {
      const reason = data?.message || data?.code || response.statusText || "TTS request failed";
      throw new Error(`${response.status}: ${reason}`);
    }

    const audioUrl = data.audio_url || data.url;
    if (!audioUrl) {
      throw new Error("TTS returned no audio URL");
    }

    const audioDuration = data.duration || estimateChaVoiceDuration(text, cfg.language);
    updateChaVoiceTtsDebug({
      tts_status: response.status,
      tts_error: null,
      storage_upload_status: data.storage_upload_status || data.audio_url_type || (data.cache_write_failed ? "data_fallback" : null),
      audio_url_returned: true,
      tts_provider: data.provider || cfg.provider,
      voice_id: data.voice_id || cfg.voiceId,
      model_id: data.model_id || cfg.modelId,
    });

    return {
      data,
      audioUrl,
      audioDuration,
      language: cfg.language,
      provider: data.provider || cfg.provider,
      voiceId: data.voice_id || cfg.voiceId,
      modelId: data.model_id || cfg.modelId,
    };
  } catch (error) {
    updateChaVoiceTtsDebug({
      tts_status: response?.status || "error",
      tts_error: getChaTtsFailureReason(error),
      storage_upload_status: data?.storage_upload_status || data?.audio_url_type || (data?.cache_write_failed ? "data_fallback" : null),
      audio_url_returned: !!(data?.audio_url || data?.url),
    });
    throw error;
  }
}

/**
 * Generate TTS voice for Cha's assistant message
 * Calls TTS endpoint, saves audio_url to database, updates UI
 * @param {string} messageId - The message ID
 * @param {string} text - The message text content
 */
async function generateChaVoice(messageId, text) {
  if (!supabaseClient || !messageId || !text.trim()) return;

  // Check if voice generation is enabled (default: true)
  const autoVoiceEnabled = localStorage.getItem("cha_auto_voice_enabled") !== "false";
  if (!autoVoiceEnabled) return;

  try {
    // Get TTS config
    const ttsConfig = typeof SPVoice !== "undefined" && SPVoice.getTTSConfig
      ? SPVoice.getTTSConfig()
      : null;

    if (!ttsConfig || !ttsConfig.provider) {
      console.log("TTS not configured, skipping Cha voice generation");
      return;
    }

    // Detect language for voice profile selection
    const language = typeof SPVoice !== "undefined" && SPVoice.detectTtsLanguage
      ? SPVoice.detectTtsLanguage(text)
      : "zh";

    // Call TTS endpoint — pass message_id so the function attempts Storage upload
    const voice_id = ttsConfig.profiles?.[language]?.voice_id || ttsConfig.profiles?.default?.voice_id;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message_id: Number(messageId),
        text: text,
        language_hint: language,
        provider: ttsConfig.provider,
        voice_profile: {
          voice_id: voice_id,
          model_id: ttsConfig.model_id,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("TTS generation failed:", response.status, errorText);
      return;
    }

    const data = await response.json();
    const audioUrl = data.audio_url || data.url;

    if (!audioUrl) {
      console.warn("TTS returned no audio URL");
      return;
    }

    const charsPerMinute = language === "zh" ? 150 : 180;
    const estimatedDuration = Math.max(1, Math.ceil((text.length / charsPerMinute) * 60));
    const audioDuration = data.duration || estimatedDuration;

    // Guard: never write a base64 data URL into messages.audio_url (causes Postgres index overflow)
    const isDataUrl = typeof audioUrl === "string" && audioUrl.startsWith("data:audio");
    const isDataFallback = data.audio_url_type === "data_fallback" || data.cache_write_failed === true;

    if (isDataUrl || isDataFallback) {
      console.warn("[TTS] Storage upload failed — playing locally, not persisted", {
        storage_upload_status: data.storage_upload_status,
        audio_url_type: data.audio_url_type,
        cache_write_failed: data.cache_write_failed,
        request_id: data.request_id,
        message_id: messageId,
      });
      if (typeof showToast === "function") {
        showToast("语音已生成，但音频上传失败，未持久保存");
      }
      addVoiceIndicatorToMessage(messageId, audioUrl, audioDuration, text);
      return;
    }

    // Only reach here when audioUrl is a real http(s) Storage URL
    const { error: updateError } = await supabaseClient
      .from("messages")
      .update({
        audio_url: audioUrl,
        audio_duration: audioDuration,
        audio_type: "real",
        audio_type_explicit: false,
        audio_transcribed_text: text,
      })
      .eq("id", Number(messageId));

    if (updateError) {
      console.warn("Failed to save Cha voice attachment to database:", updateError);
      showToast("Cha 朗读保存失败");
      return;
    }

    const msgEntry = chatMessages.find(m => m.id === messageId);
    if (msgEntry) {
      msgEntry.audio_url = audioUrl;
      msgEntry.audio_duration = audioDuration;
      msgEntry.audio_type = "real";
      msgEntry.audio_type_explicit = false;
      msgEntry.audio_transcribed_text = text;
    }

    addVoiceIndicatorToMessage(messageId, audioUrl, audioDuration, text);

    console.log(`✓ Cha voice generated and saved for message ${messageId}`);
  } catch (error) {
    const reason = getChaTtsFailureReason(error);
    console.warn("Cha voice attachment generation error:", error);
    showToast(`Cha 朗读生成失败：${reason}`);
  }
}

async function sendChaVoiceMessage(text, options = {}) {
  if (!supabaseClient || !text || !text.trim()) return null;
  if (window.SPVoice) window.SPVoice.stopSpeaking();
  if (window.SPVoiceMessage) window.SPVoiceMessage.stopVoicePlayback();

  const now = new Date().toISOString();
  const tempId = `tmp-cha-voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const conversationId = getActiveConversationId();
  const cleanedText = text.trim();

  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.dataset.tempId = tempId;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.title = "Cha";
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  const pending = document.createElement("div");
  pending.className = "message assistant cha-message message-voice voice-pending";
  pending.textContent = "语音生成中...";
  stack.appendChild(pending);
  row.appendChild(avatar);
  row.appendChild(stack);
  maybeAddTimeSeparator(now);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;

  try {
    const { audioUrl, audioDuration } = await requestChaTts(cleanedText, {
      messageId: null,
      purpose: options.purpose || "explicit_voice_message",
    });
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = user?.id || window.currentUserId;
    const { data, error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: cleanedText || "[语音]",
        type: "voice",
        audio_type: "real",
        audio_type_explicit: true,
        audio_url: audioUrl,
        audio_duration: audioDuration,
        audio_transcribed_text: cleanedText,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    const msgId = data?.id != null ? String(data.id) : null;
    const createdAt = data?.created_at || now;
    delete row.dataset.tempId;
    if (msgId) {
      row.dataset.msgId = msgId;
      row.dataset.unreadCha = "1";
    }

    stack.innerHTML = "";
    if (window.SPVoiceMessage) {
      const voiceBubble = window.SPVoiceMessage.createVoiceMessageBubble({
        audioUrl,
        duration: audioDuration,
        audioType: "real",
        transcribedText: cleanedText,
        role: "assistant",
        msgId,
      });
      stack.appendChild(voiceBubble);
    } else {
      pending.textContent = cleanedText;
      stack.appendChild(pending);
      if (msgId) addVoiceIndicatorToMessage(msgId, audioUrl, audioDuration, cleanedText);
    }

    chatMessages.push({
      role: "assistant",
      content: cleanedText,
      created_at: createdAt,
      id: msgId,
      type: "voice",
      audio_type: "real",
      audio_type_explicit: true,
      audio_url: audioUrl,
      audio_duration: audioDuration,
      audio_transcribed_text: cleanedText,
      read_by_user_at: null,
    });
    refreshMessageActions();
    syncChaUnreadCount();
    observeUnreadChaRows();
    markVisibleAssistantRowsRead();
    return msgId;
  } catch (error) {
    const reason = getChaTtsFailureReason(error);
    console.warn("Cha explicit voice message failed:", error);
    pending.textContent = "语音生成失败";
    pending.title = reason;
    showToast(`Cha 语音消息生成失败：${reason}`);
    return null;
  }
}

window.sendChaVoiceMessage = sendChaVoiceMessage;
window.generateChaVoiceMessage = sendChaVoiceMessage;

/**
 * Generate an image using the configured image generation model
 * @param {string} prompt - Image generation prompt
 * @param {Object} options - Optional parameters
 * @returns {Promise<string|null>} - Message ID or null on failure
 */
async function generateChaImage(prompt, options = {}) {
  if (!supabaseClient || !prompt || !prompt.trim()) return null;

  const conversationId = getActiveConversationId();
  if (!conversationId) {
    showToast("无法生成图片：未找到当前对话");
    return null;
  }

  // Get image generation model config
  const modelMapping = getModelRoleMapping();
  const imageGenConfig = modelMapping?.imageGeneration;

  if (!imageGenConfig?.providerGroup || !imageGenConfig?.model) {
    showToast("请先在设置中配置图片生成模型");
    return null;
  }

  // Get provider config
  const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  const provider = customProviders[imageGenConfig.providerGroup];

  if (!provider) {
    showToast("图片生成通道配置不存在");
    return null;
  }

  // Show loading indicator
  showTypingIndicator("正在生成图片...");

  try {
    // Get user session token for authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      removeTypingIndicator();
      showToast("用户未登录，无法生成图片");
      return null;
    }

    const result = await callImageGenerationDirect(prompt.trim(), {
      size: options.size || "1024x1024",
      quality: options.quality || "standard",
      style: options.style,
    });
    removeTypingIndicator();

    if (!result.success) {
      console.error("Image generation failed:", result.error);
      showToast(`图片生成失败：${result.error || "未知错误"}`);
      return null;
    }
    console.log("Image generated:", result);

    // Reload messages to show the new image
    await reloadHistory();

    showToast("图片已生成");
    return result.message_id;

  } catch (error) {
    removeTypingIndicator();
    console.error("Image generation error:", error);
    showToast(`图片生成失败：${error.message}`);
    return null;
  }
}

window.generateChaImage = generateChaImage;

/**
 * Call image-generation edge function directly with prompt (for auto-generation)
 * @param {string} prompt - Final image prompt
 * @param {Object} params - Image parameters (size, quality, style)
 * @returns {Promise<{success: boolean, image_url?: string, message_id?: string, error?: string}>}
 */
async function callImageGenerationDirect(prompt, params, options = {}) {
  if (!supabaseClient) return { success: false, error: '未初始化' };

  const conversationId = getActiveConversationId();
  if (!conversationId) {
    return { success: false, error: '未找到当前对话' };
  }

  // Get image generation model config
  const modelMapping = getModelRoleMapping();
  const imageGenConfig = modelMapping?.imageGeneration;

  if (!imageGenConfig?.providerGroup || !imageGenConfig?.model) {
    return { success: false, error: '请先配置图片生成模型' };
  }

  const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  const provider = customProviders[imageGenConfig.providerGroup];

  if (!provider) {
    return { success: false, error: '图片生成通道配置不存在' };
  }

  console.log('[callImageGenerationDirect] Using provider config:', {
    providerGroup: imageGenConfig.providerGroup,
    model: imageGenConfig.model,
    endpoint: provider.endpoint,
    hasApiKey: !!provider.apiKey
  });

  try {
    const supabaseUrl = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");

    // Get user session token for authentication
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: '用户未登录' };
    }

    const candidates = [...new Set([imageGenConfig.model, imageGenConfig.fallbackModel].filter(Boolean))];
    let lastError = '生成失败';
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const response = await fetch(`${supabaseUrl}/functions/v1/image-generation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prompt,
          conversation_id: conversationId,
          provider_config: { endpoint: provider.endpoint, api_key: provider.apiKey, model },
          size: params.size,
          quality: params.quality,
          style: params.style,
          generation_source: options.source === "proactive" ? "proactive" : "explicit",
          use_identity_reference: params.useIdentityReference !== false,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (i > 0) console.info('[image-generation] fallback model used:', model);
        return { success: true, image_url: result.image_url, message_id: result.message_id, model };
      }

      const errorText = await response.text();
      console.error('[callImageGenerationDirect] HTTP error:', response.status, errorText);
      try {
        const error = JSON.parse(errorText);
        const rawError = error.details || error.error || errorText;
        lastError = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
      } catch {
        lastError = errorText || "生成失败";
      }
      const retryable = response.status === 429 || response.status >= 500 ||
        /model_not_found|no available channel|渠道|通道|reference_image_not_supported|does not support Cha identity references|images\/edits/i.test(lastError);
      if (!retryable) break;
    }
    return { success: false, error: lastError };

  } catch (error) {
    console.error('[callImageGenerationDirect] error:', error);
    return { success: false, error: error.message };
  }
}

// ── Proactive image sharing policy ───────────────────────────────────────────
// Explicit user requests bypass this policy. It only controls photos Cha chooses
// to share on his own, and the server repeats the hard checks before billing.
const PROACTIVE_IMAGE_POLICY = Object.freeze({
  enabled: true,
  minAssistantTurns: 10,
  cooldownMs: 4 * 60 * 60 * 1000,
  maxPerShanghaiDay: 2,
  fallbackChance: 0.25,
});

function getShanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readProactiveImageState() {
  try {
    return JSON.parse(localStorage.getItem("cha_proactive_image_state") || "{}");
  } catch {
    return {};
  }
}

function getAssistantTurnCount() {
  return chatMessages.filter(message => message.role === "assistant").length;
}

function recentUserRejectedImages() {
  return chatMessages
    .filter(message => message.role === "user")
    .slice(-8)
    .some(message => /不(用|要|必)发图|别发图|不要(发|生成|画|拍)|图片功能|生图功能|图片模型.*(失败|坏|不可用)/i
      .test(extractTextFromMessageContent(message.content)));
}

function canShareProactiveImage() {
  if (!PROACTIVE_IMAGE_POLICY.enabled || recentUserRejectedImages()) {
    return { allowed: false, reason: "disabled_or_rejected" };
  }
  const now = Date.now();
  const dayKey = getShanghaiDayKey();
  const state = readProactiveImageState();
  const todayCount = state.dayKey === dayKey ? Number(state.count || 0) : 0;
  if (todayCount >= PROACTIVE_IMAGE_POLICY.maxPerShanghaiDay) {
    return { allowed: false, reason: "daily_limit" };
  }
  if (state.lastSuccessAt && now - Number(state.lastSuccessAt) < PROACTIVE_IMAGE_POLICY.cooldownMs) {
    return { allowed: false, reason: "cooldown" };
  }
  const assistantTurns = getAssistantTurnCount();
  if (state.lastAssistantTurn != null &&
      assistantTurns - Number(state.lastAssistantTurn) < PROACTIVE_IMAGE_POLICY.minAssistantTurns) {
    return { allowed: false, reason: "turn_interval" };
  }
  // New installs/conversations must also build a little context before Cha
  // spontaneously spends an image-generation request.
  if (!state.lastSuccessAt && assistantTurns < PROACTIVE_IMAGE_POLICY.minAssistantTurns) {
    return { allowed: false, reason: "initial_turn_interval" };
  }
  return { allowed: true, reason: "eligible" };
}

function recordProactiveImageSuccess() {
  const dayKey = getShanghaiDayKey();
  const oldState = readProactiveImageState();
  const count = oldState.dayKey === dayKey ? Number(oldState.count || 0) + 1 : 1;
  localStorage.setItem("cha_proactive_image_state", JSON.stringify({
    dayKey,
    count,
    lastSuccessAt: Date.now(),
    lastAssistantTurn: getAssistantTurnCount(),
  }));
}

function buildFallbackProactiveImageAction(finalReply) {
  if (Math.random() >= PROACTIVE_IMAGE_POLICY.fallbackChance) return null;
  const latestUser = [...chatMessages].reverse().find(message => message.role === "user");
  const latestText = extractTextFromMessageContent(latestUser?.content).trim();
  // Project/debug/meta conversations are poor moments for an unsolicited,
  // billable lifestyle image.
  if (/代码|报错|日志|部署|模型|通道|生图|图片功能|prompt|github|supabase|修复|测试/i.test(latestText)) {
    return null;
  }
  const shanghaiHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  const moment = shanghaiHour < 6 ? "上海时间的深夜" :
    shanghaiHour < 11 ? "上海时间的早晨" :
    shanghaiHour < 17 ? "上海时间的白天" :
    shanghaiHour < 21 ? "上海时间的傍晚" : "上海时间的夜晚";
  return {
    route: "slice_of_life",
    description: `${moment}，Cha 自然地分享此刻正在做的小事。画面要承接刚才聊天的情绪，但不要出现文字、聊天界面或摆拍感。当前回复语气参考：${String(finalReply || "").slice(0, 180)}`,
  };
}

/**
 * Handle automatic image generation based on intent detection
 * @param {Object} intent - Intent detection result from SavePrincessImagePolicy.detectImageIntent
 * @param {string} userText - Original user message
 */
async function handleImageGeneration(intent, userText) {
  const { route, face_policy, reason } = intent;

  console.log(`[image-gen] ========== AUTO IMAGE GENERATION START ==========`);
  console.log(`[image-gen] intercepted userText:`, userText);
  console.log(`[image-gen] route:`, route);
  console.log(`[image-gen] face_policy:`, face_policy);
  console.log(`[image-gen] reason:`, reason);

  // First, save user message to database and render it
  console.log(`[image-gen] saving user message before generation`);
  const now = new Date().toISOString();
  const isFirst = chatMessages.length === 0;
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Render user message optimistically
  addMessage(userText, "user", now, { tempId });
  chatMessages.push({ role: "user", content: userText, created_at: now, id: null });

  // Save user message to database
  let userMessageId = null;
  try {
    const { data: userMsg, error: userMsgError } = await supabaseClient
      .from("messages")
      .insert({
        role: "user",
        content: userText,
        conversation_id: getActiveConversationId(),
        user_id: currentUserId,
        created_at: now,
      })
      .select("id")
      .single();

    if (userMsgError) {
      console.error('[image-gen] Failed to save user message:', userMsgError);
    } else {
      userMessageId = userMsg.id;
      console.log('[image-gen] User message saved with id:', userMessageId);
      // Update the last message in chatMessages with the real ID
      if (chatMessages.length > 0) {
        chatMessages[chatMessages.length - 1].id = String(userMessageId);
      }
    }
  } catch (err) {
    console.error('[image-gen] Error saving user message:', err);
  }

  if (isFirst) updateConvTitle(getActiveConversationId(), userText);

  // Build prompt using template system
  const finalPrompt = window.SavePrincessImagePolicy.buildImagePrompt(route, userText);
  const params = window.SavePrincessImagePolicy.getDefaultImageParams(route);

  console.log('[image-gen] Final prompt:', finalPrompt.slice(0, 200) + '...');
  console.log('[image-gen] Params:', params);

  // Show loading message
  const loadingEl = addMessage("正在生成图片...", "assistant");
  const loadingRow = loadingEl?.closest('.msg-row');
  console.log('[image-gen] Loading message added');

  try {
    // Call existing image generation function
    console.log('[image-gen] Calling callImageGenerationDirect...');
    const result = await callImageGenerationDirect(finalPrompt, params);

    console.log('[image-gen] response:', result);

    if (result.success) {
      // Remove loading message
      if (loadingRow) {
        loadingRow.remove();
        console.log('[image-gen] Loading message removed');
      }

      console.log('[image-gen] Success! Image URL:', result.image_url);
      console.log('[image-gen] Message ID:', result.message_id);
      console.log('[image-gen] Reloading history to display image...');

      // Reload history to show new image
      await reloadHistory();

      console.log('[image-gen] ========== AUTO IMAGE GENERATION COMPLETE ==========');
    } else {
      throw new Error(result.error || '生成失败');
    }

  } catch (error) {
    console.error('[image-gen] ❌ Error:', error);

    // Update loading message to error state
    if (loadingEl) {
      loadingEl.textContent = "图片生成失败，可以稍后再试";
      loadingEl.style.color = "var(--text-muted)";
    }

    showToast(`图片生成失败：${error.message}`);
    console.log('[image-gen] ========== AUTO IMAGE GENERATION FAILED ==========');
  }
}

/**
 * Add a voice playback indicator to an existing text message
 * Shows a small voice icon that allows playing the TTS audio
 */
function addVoiceIndicatorToMessage(messageId, audioUrl, duration, transcribedText) {
  const row = messageList.querySelector(`[data-msg-id="${messageId}"]`);
  if (!row) return;

  const messageEl = row.querySelector(".message");
  if (!messageEl) return;

  // Don't add if already has voice indicator
  if (messageEl.querySelector(".voice-indicator")) return;

  // Create voice indicator button
  const voiceBtn = document.createElement("button");
  voiceBtn.className = "voice-indicator";
  voiceBtn.type = "button";
  voiceBtn.title = "播放语音";
  voiceBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    padding: 4px 8px;
    border: none;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    vertical-align: middle;
  `;

  voiceBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3L5 6H2v4h3l3 3V3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 5.5c.5.5 1 1.5 1 2.5s-.5 2-1 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>${Math.floor(duration)}s</span>
  `;

  // Store audio data
  voiceBtn.dataset.audioUrl = audioUrl;
  voiceBtn.dataset.duration = duration;
  voiceBtn.dataset.transcribedText = transcribedText;

  // Play audio on click
  voiceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    playVoiceIndicatorAudio(voiceBtn);
  });

  // Add hover effect
  voiceBtn.addEventListener("mouseenter", () => {
    voiceBtn.style.background = "rgba(91, 159, 245, 0.12)";
    voiceBtn.style.color = "var(--accent-primary)";
  });
  voiceBtn.addEventListener("mouseleave", () => {
    if (!voiceBtn.classList.contains("playing")) {
      voiceBtn.style.background = "rgba(0, 0, 0, 0.06)";
      voiceBtn.style.color = "var(--text-muted)";
    }
  });

  // Append to message bubble
  messageEl.appendChild(voiceBtn);
}

/**
 * Play audio from voice indicator button
 */
let currentVoiceIndicatorAudio = null;
let currentVoiceIndicatorBtn = null;

function playVoiceIndicatorAudio(button) {
  const audioUrl = button.dataset.audioUrl;
  if (!audioUrl) return;

  // If this button is currently playing, pause it
  if (currentVoiceIndicatorAudio && currentVoiceIndicatorBtn === button) {
    currentVoiceIndicatorAudio.pause();
    button.classList.remove("playing");
    button.style.background = "rgba(0, 0, 0, 0.06)";
    button.style.color = "var(--text-muted)";
    currentVoiceIndicatorAudio = null;
    currentVoiceIndicatorBtn = null;
    return;
  }

  // Stop any other playing audio
  if (currentVoiceIndicatorAudio) {
    currentVoiceIndicatorAudio.pause();
    if (currentVoiceIndicatorBtn) {
      currentVoiceIndicatorBtn.classList.remove("playing");
      currentVoiceIndicatorBtn.style.background = "rgba(0, 0, 0, 0.06)";
      currentVoiceIndicatorBtn.style.color = "var(--text-muted)";
    }
  }

  // Start playing
  const audio = new Audio(audioUrl);
  currentVoiceIndicatorAudio = audio;
  currentVoiceIndicatorBtn = button;

  button.classList.add("playing");
  button.style.background = "rgba(91, 159, 245, 0.18)";
  button.style.color = "var(--accent-primary)";

  const onEnded = () => {
    if (audio !== currentVoiceIndicatorAudio) return;
    button.classList.remove("playing");
    button.style.background = "rgba(0, 0, 0, 0.06)";
    button.style.color = "var(--text-muted)";
    currentVoiceIndicatorAudio = null;
    currentVoiceIndicatorBtn = null;
  };

  audio.addEventListener("ended", onEnded);
  audio.addEventListener("error", () => {
    onEnded();
    if (typeof showToast === "function") {
      showToast("语音播放失败");
    }
  });

  audio.play().catch(err => {
    console.error("Voice indicator audio playback error:", err);
    onEnded();
    if (typeof showToast === "function") {
      showToast("语音播放失败");
    }
  });
}

async function reloadHistory(opts = {}) {
  if (!supabaseClient) { renderWelcomeMessage(); return; }
  const conversationId = getActiveConversationId();
  if (!conversationId) { renderWelcomeMessage(); return; }
  clearAllImages();

  // Reset pagination state
  historyHasMore = false;
  historyLoadingOlder = false;
  oldestLoadedMessageCreatedAt = null;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, role, content, type, created_at, image_storage_path, read_by_cha_at, read_by_user_at, reply_to_message_id, reply_to_preview, reply_to_role, is_deleted, is_recalled, original_content, is_favorited, favorited_at, image_description, image_prompt, audio_url, audio_duration, audio_type, audio_type_explicit, audio_transcribed_text, edited, edited_at, edit_count, edit_history, thought")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);

  if (error) {
    console.error("❌ reloadHistory error:", error);
    renderWelcomeMessage();
    return;
  }

  console.log("✅ reloadHistory loaded:", data?.length, "messages for conversation:", conversationId);

  const resolved = await resolveImagePaths([...data].reverse());
  chatMessages.length = 0;
  messageList.innerHTML = "";
  lastMessageTime = null;
  chaUnreadCount = 0;
  if (!resolved.length) {
    console.warn("⚠️ No messages after resolveImagePaths");
    renderWelcomeMessage();
    return;
  }
  for (const m of resolved) {
    const replyTo = m.reply_to_message_id
      ? { id: String(m.reply_to_message_id), preview: m.reply_to_preview || "", role: m.reply_to_role || "user" }
      : null;

    // Skip deleted messages (soft delete)
    if (m.is_deleted) {
      // Optionally: render as deleted placeholder, for now just skip
      continue;
    }

    // Debug log for image messages
    if (m.type === "image" || m.image_storage_path) {
      console.log("[image-gen] Loading image message:", {
        id: m.id,
        role: m.role,
        type: m.type,
        content: m.content?.slice?.(0, 100) || m.content,
        image_storage_path: m.image_storage_path,
        isArray: Array.isArray(m.content),
        contentType: typeof m.content,
        hasImageUrl: m.content && Array.isArray(m.content) && m.content.some(p => p.type === "image_url"),
      });
    }

    // Render recalled messages as system notice
    if (m.is_recalled && m.role === 'user') {
      renderRecalledMessage(m);
    } else if (shouldRenderVoiceMessage(m)) {
      // Render voice message
      renderVoiceMessage(m, replyTo);
    } else if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id != null ? String(m.id) : null, !!m.read_by_user_at, replyTo, m.thought);
    } else {
      addMessage(m.content, m.role, m.created_at, { readByChaAt: m.read_by_cha_at, replyTo }, m.id);
    }

    const replyToData = replyTo ? { id: replyTo.id, role: replyTo.role, preview: replyTo.preview } : null;
    chatMessages.push({
      role: m.role,
      content: m.content,
      type: m.type ?? "message",
      created_at: m.created_at,
      id: m.id != null ? String(m.id) : null,
      read_by_cha_at: m.read_by_cha_at ?? null,
      read_by_user_at: m.read_by_user_at ?? null,
      is_deleted: m.is_deleted ?? false,
      is_recalled: m.is_recalled ?? false,
      original_content: m.original_content ?? null,
      is_favorited: m.is_favorited ?? false,
      favorited_at: m.favorited_at ?? null,
      image_description: m.image_description ?? null,
      image_prompt: m.image_prompt ?? null,
      audio_url: m.audio_url ?? null,
      audio_duration: m.audio_duration ?? null,
      audio_type: m.audio_type ?? null,
      audio_type_explicit: m.audio_type_explicit ?? false,
      audio_transcribed_text: m.audio_transcribed_text ?? null,
      edited: m.edited ?? false,
      edited_at: m.edited_at ?? null,
      edit_count: m.edit_count ?? 0,
      edit_history: m.edit_history ?? [],
      thought: m.thought ?? null,
      replyTo: replyToData
    });

    // Add edit indicator if message was edited
    if (m.edited && m.id) {
      addEditIndicatorToMessage(m.id, m.edit_count || 0);
    }

    // Add voice indicator for assistant messages with auto-generated voice
    if (shouldAddAssistantVoiceIndicator(m)) {
      addVoiceIndicatorToMessage(m.id, m.audio_url, m.audio_duration || 0, m.audio_transcribed_text || m.content);
    }
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
    .select("id, role, content, type, created_at, image_storage_path, read_by_cha_at, read_by_user_at, reply_to_message_id, reply_to_preview, reply_to_role, is_deleted, is_recalled, original_content, is_favorited, favorited_at, image_description, image_prompt, audio_url, audio_duration, audio_type, audio_type_explicit, audio_transcribed_text, edited, edited_at, edit_count, edit_history")
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
    return {
      role: m.role,
      content: m.content,
      type: m.type ?? "message",
      created_at: m.created_at,
      id: m.id != null ? String(m.id) : null,
      read_by_cha_at: m.read_by_cha_at ?? null,
      read_by_user_at: m.read_by_user_at ?? null,
      is_deleted: m.is_deleted ?? false,
      is_recalled: m.is_recalled ?? false,
      original_content: m.original_content ?? null,
      is_favorited: m.is_favorited ?? false,
      favorited_at: m.favorited_at ?? null,
      image_description: m.image_description ?? null,
      image_prompt: m.image_prompt ?? null,
      audio_url: m.audio_url ?? null,
      audio_duration: m.audio_duration ?? null,
      audio_type: m.audio_type ?? null,
      audio_type_explicit: m.audio_type_explicit ?? false,
      audio_transcribed_text: m.audio_transcribed_text ?? null,
      replyTo: rt
    };
  });
  chatMessages.unshift(...newEntries);
  messageList.innerHTML = "";
  lastMessageTime = null;
  for (const m of chatMessages) {
    const rt = m.replyTo || (m.reply_to_message_id ? { id: String(m.reply_to_message_id), preview: m.reply_to_preview || "", role: m.reply_to_role || "user" } : null);
    if (shouldRenderVoiceMessage(m)) {
      // Render voice message
      renderVoiceMessage(m, rt);
    } else if (m.role === "assistant") {
      addAssistantBubbles(m.content, m.created_at, m.id, !!m.read_by_user_at, rt);
    } else {
      addMessage(m.content, m.role, m.created_at, { readByChaAt: m.read_by_cha_at, replyTo: rt }, m.id);
    }

    // Add edit indicator if message was edited
    if (m.edited && m.id) {
      addEditIndicatorToMessage(m.id, m.edit_count || 0);
    }

    // Add voice indicator for assistant messages with auto-generated voice
    if (shouldAddAssistantVoiceIndicator(m)) {
      addVoiceIndicatorToMessage(m.id, m.audio_url, m.audio_duration || 0, m.audio_transcribed_text || m.content);
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
  const forcedByVisualEvent = replyMode === "forced" && typeof window.hasPendingGsEyesVisualEvent === "function" && window.hasPendingGsEyesVisualEvent();
  const messages = replyMode === "forced" && !forcedByVisualEvent
    ? [...chatMessages, { role: "user", content: "用户轻轻戳了你一下。请自然接一句，不要提到「戳一下」、「继续推进」、「不要重复」、「复读」这些机制词。不要主动切项目，优先延续上一条真实用户消息的情绪和语境。" }]
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

  // 读取 server tools 执行结果
  try {
    const functionVersion = response.headers.get("x-save-princess-function-version");
    const toolsUsed = response.headers.get("x-save-princess-tools-used");
    console.log("[chat-tools] response:", {
      functionVersion: functionVersion || "absent",
      toolsUsed: toolsUsed || "none",
    });
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
            assistantEl.textContent = stripReplyToTag(stripThinking(fullReply.slice(0, sepIdx)));
            firstSepSeen = true;
          } else {
            assistantEl.textContent = stripReplyToTag(stripThinking(fullReply));
            messageList.scrollTop = messageList.scrollHeight;
          }
        }
        // firstSepSeen 后：数据继续累积进 fullReply，DOM 不再更新
      }
    }
  }
  if (!fullReply) throw new Error("未收到模型回复");
  console.log("[VT-debug] fullReply (first 500):", fullReply.slice(0, 500));
  console.log("[VT-debug] fullReply contains <visible_thought>:", fullReply.includes("<visible_thought>"));
  console.log("[VT-debug] fullReply contains <reply>:", fullReply.includes("<reply>"));

  function parseAssistantImageAction(text) {
    const match = text.match(/<image_action>\s*([\s\S]*?)\s*<\/image_action>/i);
    if (!match) return { cleanText: text, action: null };
    let action = null;
    try {
      const parsed = JSON.parse(match[1]);
      const validRoutes = new Set(["portrait", "slice_of_life", "together", "mood"]);
      if (validRoutes.has(parsed?.route) && typeof parsed?.description === "string" && parsed.description.trim()) {
        action = { route: parsed.route, description: parsed.description.trim().slice(0, 1200) };
      }
    } catch (error) {
      console.warn("[image-action] Invalid model action:", error);
    }
    return { cleanText: text.replace(match[0], "").trim(), action };
  }

  const { cleanText: replyWithoutImageAction, action: assistantImageAction } = parseAssistantImageAction(fullReply);

  // Parse assistant proactive quote FIRST (before visible thought parsing loses it)
  const { cleanText: replyWithoutQuote, replyTo: assistantReplyTo } = parseAssistantReplyTo(replyWithoutImageAction);
  console.log("[VT-debug] replyWithoutQuote (first 500):", replyWithoutQuote.slice(0, 500));

  const { bubbles: thoughtBubbles, reply: cleanReply, thought } = parseVisibleThought(replyWithoutQuote);
  console.log("[VT-debug] bubbles:", JSON.stringify(thoughtBubbles));
  console.log("[VT-debug] thought:", thought);
  console.log("[VT-debug] cleanReply (first 200):", cleanReply.slice(0, 200));
  if (cleanReply === "<NO_REPLY>") {
    removeTypingIndicator();
    if (assistantEl) assistantEl.closest(".msg-row")?.remove();
    return;
  }

  const finalReply = cleanReply;

  // Persist Cha's first recognition of the newest user image. Future turns send
  // this text instead of asking the upstream model to download the image again.
  const latestUserImage = [...chatMessages].reverse().find(m =>
    m.role === "user" && Array.isArray(m.content) &&
    m.content.some(part => part?.type === "image_url") && !m.image_description
  );
  if (latestUserImage?.id && finalReply.trim() && supabaseClient) {
    const recognizedDescription = finalReply.trim().slice(0, 4000);
    latestUserImage.image_description = recognizedDescription;
    supabaseClient.from("messages")
      .update({ image_description: recognizedDescription })
      .eq("id", latestUserImage.id)
      .then(({ error }) => {
        if (error) console.warn("Failed to persist first image recognition:", error);
      });
  }

  const replyTime = new Date().toISOString();
  const replyId = await saveMessage("assistant", finalReply, null, {}, assistantReplyTo, thought);
  const replyIdStr = replyId != null ? String(replyId) : null;
  chatMessages.push({ role: "assistant", content: finalReply, created_at: replyTime, id: replyIdStr, read_by_cha_at: null, read_by_user_at: null, replyTo: assistantReplyTo, thought });
  lastMessageTime = new Date(replyTime).getTime();

  // Fire-and-forget: Auto-generate Cha voice for this reply
  if (replyIdStr && finalReply.trim()) {
    generateChaVoice(replyIdStr, finalReply).catch(err => {
      console.warn("Cha voice auto-generation failed:", err);
    });
  }

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
        assistantMessage: finalReply,
        userMessageId: _currentRequestUserMessageId,
        conversationId: getActiveConversationId(),
        route: localStorage.getItem("previousTopicRoute") || null,
      });
    }
  }

  // ── Multi-bubble visible thought rendering ──────────────────────────────────
  const hasThoughts = thoughtBubbles.some(b => b.type === "thought");
  if (hasThoughts) {
    // 有思考气泡：移除流式占位，按顺序渲染所有气泡
    if (assistantEl) {
      const placeholderRow = assistantEl.closest(".msg-row");
      if (placeholderRow) placeholderRow.remove();
      assistantEl = null;
    }
    let isFirstReply = true;
    for (const bubble of thoughtBubbles) {
      if (bubble.type === "thought") {
        const thinkAvatar = document.createElement("div");
        thinkAvatar.className = "avatar";
        thinkAvatar.title = "Cha";
        const thinkBubble = document.createElement("div");
        thinkBubble.className = "message assistant cha-message message-thought";
        thinkBubble.textContent = "\u{1F4AD} " + bubble.content;
        const thinkStack = document.createElement("div");
        thinkStack.className = "msg-stack";
        thinkStack.appendChild(thinkBubble);
        const thinkRow = document.createElement("div");
        thinkRow.className = "msg-row assistant";
        thinkRow.appendChild(thinkAvatar);
        thinkRow.appendChild(thinkStack);
        messageList.appendChild(thinkRow);
      } else {
        // reply 气泡：用 splitBubbles 支持 ||| 分割
        const subBubbles = splitBubbles(bubble.content);
        console.log("[VT-debug] rendering reply, subBubbles:", subBubbles.length, "replyIdStr:", replyIdStr, "isFirstReply:", isFirstReply);
        for (let si = 0; si < subBubbles.length; si++) {
          const isFirstSubBubble = (isFirstReply && si === 0);
          const msgId = isFirstSubBubble ? replyIdStr : null;
          const sibling = isFirstSubBubble ? null : String(replyIdStr);
          console.log("[VT-debug] insertBubbleSync si:", si, "isFirstSubBubble:", isFirstSubBubble, "msgId:", msgId, "sibling:", sibling, "text:", subBubbles[si].slice(0, 30));
          insertBubbleSync(subBubbles[si], replyTime, msgId, sibling, isFirstSubBubble ? assistantReplyTo : undefined);
        }
        if (isFirstReply && subBubbles.length > 0) isFirstReply = false;
      }
    }
  } else {
    // 无思考气泡：走原来的 splitBubbles 路径
    const bubbles = splitBubbles(finalReply);
    if (bubbles.length === 1 || !firstSepSeen) {
      if (assistantEl) {
        // Prepend quote block to the streaming placeholder if needed
        if (assistantReplyTo) {
          assistantEl.prepend(makeQuoteBlock(assistantReplyTo));
        }
        setMessageContent(assistantEl, bubbles[0], { messageId: replyIdStr || undefined });
        const row = assistantEl.closest(".msg-row");
        if (row && replyIdStr) row.dataset.msgId = replyIdStr;
      } else {
        insertBubbleSync(bubbles[0], replyTime, replyIdStr, null, assistantReplyTo);
      }
    } else {
      if (assistantEl) {
        if (assistantReplyTo) {
          assistantEl.prepend(makeQuoteBlock(assistantReplyTo));
        }
        setMessageContent(assistantEl, bubbles[0], { messageId: replyIdStr || undefined });
        const row = assistantEl.closest(".msg-row");
        if (row && replyIdStr) row.dataset.msgId = replyIdStr;
      }
      await insertBubblesAnimated(bubbles.slice(1), replyTime, replyIdStr, true);
    }
  }

  // Pre-warm emoji image cache for the freshly received reply (non-blocking)
  preloadVisibleMessageEmojis();

  refreshMessageActions();
  // Sync user read receipts now that a new assistant message has been appended.
  // This ensures all user messages before the reply get the watermark treatment.
  refreshUserReceipts();
  // Maintain bottom anchor after assistant reply completes
  maintainBottomAnchor("assistant-done");
  if (window.SavePrincessImagePolicy) {
    const proactiveGate = canShareProactiveImage();
    const proactiveAction = proactiveGate.allowed
      ? (assistantImageAction || buildFallbackProactiveImageAction(finalReply))
      : null;
    console.info("[image-action] proactive decision:", {
      modelProposed: !!assistantImageAction,
      allowed: proactiveGate.allowed,
      reason: proactiveGate.reason,
      selected: !!proactiveAction,
    });
    if (proactiveAction) {
      const imagePrompt = window.SavePrincessImagePolicy.buildImagePrompt(
        proactiveAction.route,
        proactiveAction.description,
      );
      const imageParams = window.SavePrincessImagePolicy.getDefaultImageParams(proactiveAction.route);
      callImageGenerationDirect(imagePrompt, imageParams, { source: "proactive" }).then(async (result) => {
        if (result.success) {
          recordProactiveImageSuccess();
          await reloadHistory();
        } else {
          console.warn("[image-action] Proactive generation failed:", result.error);
        }
      }).catch(error => console.warn("[image-action] Unexpected proactive failure:", error));
    }
  }
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
  // A split reply is rendered as separate rows. Copy only the bubble whose
  // action button was pressed; copying the whole stored response is surprising.
  const text = row.querySelector(".message")?.textContent?.trim() || "";
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
let selectedBubbles = new Map(); // Map<bubbleId, row>

function enterMultiSelectMode() {
  multiSelectMode = true;
  selectedBubbles.clear();
  messageList.classList.add('multi-select-mode');

  getMessageRows().forEach(row => {
    // Skip recalled messages
    if (row.classList.contains('recalled-message-row')) return;

    // Use effectiveMsgId to support both primary and sibling bubbles
    const effectiveMsgId = row.dataset.msgId || row.dataset.bubbleSibling;
    if (!effectiveMsgId || row.querySelector('.multi-select-checkbox')) return;

    // Create a unique identifier for this specific bubble/row
    const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;

    console.log('Creating checkbox for bubble:', {
      bubbleId,
      hasMsgId: !!row.dataset.msgId,
      hasBubbleSibling: !!row.dataset.bubbleSibling,
      effectiveMsgId
    });

    const checkbox = document.createElement('div');
    checkbox.className = 'multi-select-checkbox';
    checkbox.dataset.bubbleId = bubbleId;  // Store unique bubble ID
    checkbox.dataset.msgId = effectiveMsgId;  // Store message ID for reference
    checkbox.innerHTML = '<div class="checkbox-inner"></div>';
    checkbox.style.cssText = `
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      border: 2px solid var(--border, #ddd);
      border-radius: 50%;
      background: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: all 0.2s;
    `;

    const inner = checkbox.querySelector('.checkbox-inner');
    inner.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent-primary, #5B9FF5);
      opacity: 0;
      transform: scale(0);
      transition: all 0.2s;
    `;

    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Checkbox clicked for bubbleId:', bubbleId);
      toggleBubbleSelection(bubbleId, row);
    });

    // Add checkbox to row with position relative
    row.style.position = 'relative';
    row.insertBefore(checkbox, row.firstChild);

    // Also allow clicking the row itself to toggle selection
    row.addEventListener('click', (e) => {
      // Don't toggle if clicking on interactive elements
      if (e.target.closest('button, a, input, textarea, .msg-actions')) return;
      console.log('Row clicked for bubbleId:', bubbleId);
      toggleBubbleSelection(bubbleId, row);
    });
  });

  showMultiSelectBar();
}

function exitMultiSelectMode() {
  multiSelectMode = false;
  selectedMessageIds.clear();
  selectedBubbles.clear();
  messageList.classList.remove('multi-select-mode');
  document.querySelectorAll('.multi-select-checkbox').forEach(el => el.remove());
  // Reset row position
  getMessageRows().forEach(row => {
    row.style.position = '';
  });
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

function toggleBubbleSelection(bubbleId, row) {
  console.log('toggleBubbleSelection called:', { bubbleId, wasSelected: selectedBubbles.has(bubbleId) });
  if (selectedBubbles.has(bubbleId)) {
    selectedBubbles.delete(bubbleId);
  } else {
    selectedBubbles.set(bubbleId, row);
  }
  console.log('selectedBubbles size after toggle:', selectedBubbles.size);
  updateMultiSelectUI();
}

function updateMultiSelectUI() {
  document.querySelectorAll('.multi-select-checkbox').forEach(checkbox => {
    const bubbleId = checkbox.dataset.bubbleId;
    const isSelected = selectedBubbles.has(bubbleId);
    checkbox.classList.toggle('selected', isSelected);

    const inner = checkbox.querySelector('.checkbox-inner');
    if (inner) {
      inner.style.opacity = isSelected ? '1' : '0';
      inner.style.transform = isSelected ? 'scale(1)' : 'scale(0)';
    }

    if (isSelected) {
      checkbox.style.borderColor = 'var(--accent-primary, #5B9FF5)';
      checkbox.style.background = 'var(--accent-primary, #5B9FF5)';
    } else {
      checkbox.style.borderColor = 'var(--border, #ddd)';
      checkbox.style.background = 'white';
    }
  });

  const countEl = document.querySelector('.multi-select-count');
  if (countEl) countEl.textContent = `已选择 ${selectedBubbles.size} 条`;

  // Update select all button text
  const selectAllBtn = document.querySelector('#multiSelectBar button');
  if (selectAllBtn && selectAllBtn.textContent.includes('全选')) {
    const totalCount = document.querySelectorAll('.multi-select-checkbox').length;
    if (selectedBubbles.size === totalCount && totalCount > 0) {
      selectAllBtn.textContent = '取消全选';
    } else {
      selectAllBtn.textContent = '全选';
    }
  }

  const forwardBtn = document.getElementById('multiSelectForwardBtn');
  const deleteBtn = document.getElementById('multiSelectDeleteBtn');
  if (forwardBtn) forwardBtn.disabled = selectedBubbles.size === 0;
  if (deleteBtn) deleteBtn.disabled = selectedBubbles.size === 0;
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
    const allBubbleIds = [];
    document.querySelectorAll('.multi-select-checkbox').forEach(el => {
      const bubbleId = el.dataset.bubbleId;
      if (bubbleId) allBubbleIds.push(bubbleId);
    });

    if (selectedBubbles.size === allBubbleIds.length && allBubbleIds.length > 0) {
      // All selected, deselect all
      selectedBubbles.clear();
      selectAllBtn.textContent = '全选';
    } else {
      // Select all
      selectedBubbles.clear();
      allBubbleIds.forEach(bubbleId => {
        const checkbox = document.querySelector(`[data-bubble-id="${bubbleId}"]`);
        if (checkbox) {
          const row = checkbox.closest('.msg-row');
          if (row) selectedBubbles.set(bubbleId, row);
        }
      });
      selectAllBtn.textContent = '取消全选';
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
    if (selectedBubbles.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedBubbles.size} 条消息吗？`)) return;

    // Collect unique message IDs from selected bubbles
    const msgIdsToDelete = new Set();
    for (const [bubbleId, row] of selectedBubbles) {
      const msgId = row.dataset.msgId || row.dataset.bubbleSibling;
      if (msgId) msgIdsToDelete.add(msgId);
    }

    // Delete each unique message
    for (const msgId of msgIdsToDelete) {
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
    if (selectedBubbles.size === 0) return;

    // Collect unique message IDs from selected bubbles for forwarding
    const msgIdsToForward = [];
    const seenMsgIds = new Set();

    for (const [bubbleId, row] of selectedBubbles) {
      const msgId = row.dataset.msgId || row.dataset.bubbleSibling;
      if (msgId && !seenMsgIds.has(msgId)) {
        msgIdsToForward.push(msgId);
        seenMsgIds.add(msgId);
      }
    }

    exitMultiSelectMode();

    // Show forward target panel with message IDs
    if (msgIdsToForward.length > 0) {
      showForwardTargetPanel(msgIdsToForward);
    }
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

  if (isReplying) return;

  // Get effective msgId from either primary row or sibling bubble
  const effectiveMsgId = row.dataset.msgId || row.dataset.bubbleSibling;
  if (!effectiveMsgId) return;

  const idx = chatMessages.findIndex(m => m.id === effectiveMsgId);
  if (idx === -1) return;

  closeMessageActionMenu();
  chatMessages.splice(idx, 1);

  // Delete all bubbles belonging to this message:
  // 1. Primary row with this msgId
  // 2. All sibling rows pointing to this msgId
  messageList.querySelectorAll(`[data-msg-id="${effectiveMsgId}"], [data-bubble-sibling="${effectiveMsgId}"]`).forEach(r => r.remove());

  if (effectiveMsgId) await supabaseClient.from("messages").delete().eq("id", effectiveMsgId);
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

// 转发消息 - 显示目标选择面板
function showForwardTargetPanel(messageIds) {
  const overlay = document.createElement('div');
  overlay.className = 'forward-target-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 10000;
  `;

  const panel = document.createElement('div');
  panel.className = 'forward-target-panel';
  panel.style.cssText = `
    background: var(--bg);
    border-radius: 16px 16px 0 0;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
    width: 100%;
    max-width: 500px;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = '转发到';
  title.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 18px;
    color: var(--text);
    text-align: center;
  `;

  const options = document.createElement('div');
  options.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  // 转发选项
  const targets = [
    { id: 'cha-chat', label: 'Cha 聊天', icon: '💬' },
    { id: 'cha-notes', label: 'Cha Phone Notes', icon: '📝' },
    { id: 'cha-diary', label: 'Cha Phone Diary', icon: '📔' },
    { id: 'cha-photos', label: 'Cha Phone Photos', icon: '📷' }
  ];

  targets.forEach(target => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      font-size: 15px;
      text-align: left;
      transition: background 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--bg-raise)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--surface)';
    });

    const icon = document.createElement('span');
    icon.textContent = target.icon;
    icon.style.cssText = 'font-size: 24px;';

    const label = document.createElement('span');
    label.textContent = target.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      overlay.remove();
      forwardToTarget(messageIds, target.id, target.label);
    });

    options.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    margin-top: 8px;
    width: 100%;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 15px;
  `;
  cancelBtn.addEventListener('click', () => overlay.remove());

  panel.appendChild(title);
  panel.appendChild(options);
  panel.appendChild(cancelBtn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// 执行转发到目标
function forwardToTarget(messageIds, targetId, targetLabel) {
  const messages = [];
  for (const msgId of messageIds) {
    const msg = chatMessages.find(m => m.id === msgId);
    if (msg) {
      const textContent = extractTextFromMessageContent(msg.content);
      if (textContent) {
        messages.push({
          role: msg.role === 'assistant' ? 'Cha' : '你',
          content: textContent
        });
      }
    }
  }

  if (messages.length === 0) {
    if (typeof showToast === 'function') {
      showToast('没有可转发的内容');
    }
    return;
  }

  if (targetId === 'cha-chat') {
    // 转发到当前聊天输入框
    const forwardedText = messages.length === 1
      ? `转发：${messages[0].content}`
      : messages.map(m => `${m.role}: ${m.content}`).join('\n---\n');

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.value = forwardedText;
      messageInput.style.height = 'auto';
      messageInput.style.height = messageInput.scrollHeight + 'px';
      messageInput.focus();

      if (typeof showToast === 'function') {
        showToast(`已转发到输入框`);
      }
    }
  } else {
    // 转发到 Cha Phone Apps - MVP: 保存到 localStorage
    const storageKey = `cha_phone_forward_${targetId}`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
    existing.push({
      timestamp: new Date().toISOString(),
      messages: messages
    });
    localStorage.setItem(storageKey, JSON.stringify(existing));

    if (typeof showToast === 'function') {
      showToast(`已转发到 ${targetLabel}`);
    }
  }
}


// 渲染撤回消息（用于 reload 时显示已撤回的消息）
function renderRecalledMessage(message) {
  const row = document.createElement('div');
  row.className = 'msg-row recalled-message-row';
  row.dataset.msgId = message.id;
  row.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px 16px;
    margin: 8px 0;
  `;

  const recallNotice = document.createElement('div');
  recallNotice.className = 'recall-notice';
  recallNotice.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    text-align: center;
    background: var(--bg-raise, #f5f5f5);
    border-radius: 12px;
    max-width: 320px;
  `;

  const recallText = document.createElement('div');
  recallText.textContent = '你撤回了一条消息';
  recallText.style.cssText = `
    color: var(--text-muted, #999);
    font-size: 13px;
  `;

  const reEditBtn = document.createElement('button');
  reEditBtn.textContent = '重新编辑';
  reEditBtn.style.cssText = `
    padding: 6px 16px;
    border: 1px solid var(--border-soft, #ddd);
    border-radius: 8px;
    background: transparent;
    color: var(--text-main, #333);
    cursor: pointer;
    font-size: 13px;
  `;
  const originalContent = message.original_content || extractTextFromMessageContent(message.content);
  reEditBtn.addEventListener('click', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.value = originalContent;
      messageInput.focus();
      messageInput.style.height = 'auto';
      messageInput.style.height = messageInput.scrollHeight + 'px';
    }
  });

  const originalText = document.createElement('div');
  originalText.textContent = `原文：${originalContent}`;
  originalText.style.cssText = `
    color: var(--text-muted, #999);
    font-size: 12px;
    max-width: 100%;
    word-break: break-word;
    margin-top: 4px;
  `;

  recallNotice.appendChild(recallText);
  recallNotice.appendChild(reEditBtn);
  recallNotice.appendChild(originalText);
  row.appendChild(recallNotice);

  maybeAddTimeSeparator(message.created_at);
  messageList.appendChild(row);
}

// 渲染语音消息（用于 reload 时显示语音消息）
function renderVoiceMessage(message, replyTo = null) {
  if (!window.SPVoiceMessage) {
    console.warn("SPVoiceMessage module not loaded");
    return;
  }

  const voiceBubble = window.SPVoiceMessage.createVoiceMessageBubble({
    audioUrl: message.audio_url || "",
    duration: message.audio_duration || 0,
    audioType: message.audio_type || "real",
    transcribedText: message.audio_transcribed_text || "",
    role: message.role,
    msgId: message.id
  });

  // Add to message list
  const row = document.createElement("div");
  row.className = `msg-row ${message.role}`;
  row.dataset.msgId = message.id;

  const stack = document.createElement("div");
  stack.className = "msg-stack";

  // Add quote block if replying
  if (replyTo && window.makeQuoteBlock) {
    const quoteBlock = window.makeQuoteBlock(replyTo);
    stack.appendChild(quoteBlock);
  }

  stack.appendChild(voiceBubble);

  // Add read receipt for user messages
  if (message.role === "user") {
    const receipt = document.createElement("div");
    receipt.className = "read-receipt";
    receipt.textContent = message.read_by_cha_at ? "已读" : "未读";
    receipt.dataset.receiptState = message.read_by_cha_at ? "read" : "unread";
    stack.appendChild(receipt);
  }

  row.appendChild(stack);

  maybeAddTimeSeparator(message.created_at);
  messageList.appendChild(row);
}

async function recallMessage(row, msgId) {
  closeMessageActionMenu();

  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx === -1) return;

  const message = chatMessages[idx];

  // 检查时间窗口：只能撤回2分钟内的消息
  const messageTime = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000;

  if (now - messageTime > twoMinutes) {
    if (typeof showToast === 'function') {
      showToast('消息发送已超过2分钟，无法撤回');
    }
    return;
  }

  // 确认撤回
  const confirmOverlay = document.createElement('div');
  confirmOverlay.className = 'recall-confirm-overlay';
  confirmOverlay.style.cssText = `
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

  const confirmDialog = document.createElement('div');
  confirmDialog.style.cssText = `
    background: var(--surface, #fff);
    border-radius: 12px;
    padding: 20px;
    max-width: 280px;
    text-align: center;
  `;

  const confirmTitle = document.createElement('div');
  confirmTitle.textContent = '撤回该条消息?';
  confirmTitle.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: var(--text-main);
    margin-bottom: 20px;
  `;

  const confirmButtons = document.createElement('div');
  confirmButtons.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: center;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 10px 20px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: transparent;
    color: var(--text-main);
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => {
    confirmOverlay.remove();
  });

  const recallBtn = document.createElement('button');
  recallBtn.textContent = '撤回';
  recallBtn.style.cssText = `
    flex: 1;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: var(--active, #5B9FF5);
    color: #fff;
    cursor: pointer;
    font-size: 14px;
  `;
  recallBtn.addEventListener('click', async () => {
    confirmOverlay.remove();
    await performRecall(row, msgId, message);
  });

  confirmButtons.appendChild(cancelBtn);
  confirmButtons.appendChild(recallBtn);
  confirmDialog.appendChild(confirmTitle);
  confirmDialog.appendChild(confirmButtons);
  confirmOverlay.appendChild(confirmDialog);
  document.body.appendChild(confirmOverlay);

  // 点击背景关闭
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) {
      confirmOverlay.remove();
    }
  });
}

async function performRecall(row, msgId, message) {
  const originalContent = extractTextFromMessageContent(message.content);

  // 标记消息为已撤回
  message.is_recalled = true;
  message.recalled_at = new Date().toISOString();
  message.original_content = originalContent;

  // 直接更新 Supabase 表标记消息为已撤回
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from("messages")
        .update({
          is_recalled: true,
          recalled_at: new Date().toISOString(),
          original_content: originalContent
        })
        .eq("id", msgId);

      if (error) {
        throw error;
      }
    }
  } catch (error) {
    console.error('Recall message error:', error);
    if (typeof showToast === 'function') {
      showToast('撤回失败，请重试');
    }
    return;
  }

  // 替换消息行为系统消息样式
  row.classList.remove('user', 'assistant');
  row.classList.add('recalled-message-row');
  row.innerHTML = '';
  row.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px 16px;
    margin: 8px 0;
  `;

  const recallNotice = document.createElement('div');
  recallNotice.className = 'recall-notice';
  recallNotice.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    text-align: center;
    background: var(--bg-raise, #f5f5f5);
    border-radius: 12px;
    max-width: 320px;
  `;

  const recallText = document.createElement('div');
  recallText.textContent = '你撤回了一条消息';
  recallText.style.cssText = `
    color: var(--text-muted);
    font-size: 13px;
  `;

  const reEditBtn = document.createElement('button');
  reEditBtn.textContent = '重新编辑';
  reEditBtn.style.cssText = `
    padding: 6px 16px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: transparent;
    color: var(--text-main);
    cursor: pointer;
    font-size: 13px;
  `;
  reEditBtn.addEventListener('click', () => {
    // 恢复内容到输入框
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.value = originalContent;
      messageInput.focus();
      // 自动调整高度
      messageInput.style.height = 'auto';
      messageInput.style.height = messageInput.scrollHeight + 'px';
    }
  });

  const originalText = document.createElement('div');
  originalText.textContent = `原文：${originalContent}`;
  originalText.style.cssText = `
    color: var(--text-muted);
    font-size: 12px;
    max-width: 80%;
    word-break: break-word;
  `;

  recallNotice.appendChild(recallText);
  recallNotice.appendChild(reEditBtn);
  recallNotice.appendChild(originalText);
  row.appendChild(recallNotice);

  if (typeof showToast === 'function') {
    showToast('已撤回');
  }

  // 刷新消息分组样式
  if (typeof refreshGroupClasses === 'function') {
    refreshGroupClasses();
  }
}

// 删除消息（用户和助手消息都支持）
async function deleteMessage(row, msgId) {
  closeMessageActionMenu();

  // 确认删除
  if (!confirm('确定要删除这条消息吗？删除后无法恢复。')) {
    return;
  }

  // 标记消息为已删除（软删除）
  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    chatMessages[idx].is_deleted = true;
    chatMessages[idx].deleted_at = new Date().toISOString();
  }

  // 直接更新 Supabase 表（软删除）
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from("messages")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq("id", msgId);

      if (error) {
        throw error;
      }
    }
  } catch (error) {
    console.error('Delete message error:', error);
    if (typeof showToast === 'function') {
      showToast('删除失败，请重试');
    }
    return;
  }

  // 前端移除消息显示
  row.remove();

  if (typeof showToast === 'function') {
    showToast('已删除');
  }

  // 刷新消息分组样式
  if (typeof refreshGroupClasses === 'function') {
    refreshGroupClasses();
  }
}

// 收藏/取消收藏消息
async function favoriteMessage(row, msgId, shouldFavorite) {
  closeMessageActionMenu();

  // 更新消息的收藏状态
  const idx = chatMessages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    chatMessages[idx].is_favorited = shouldFavorite;
    if (shouldFavorite) {
      chatMessages[idx].favorited_at = new Date().toISOString();
    } else {
      delete chatMessages[idx].favorited_at;
    }
  }

  // 前端视觉反馈：添加/移除收藏标记
  const messageEl = row.querySelector('.message');
  if (messageEl) {
    if (shouldFavorite) {
      messageEl.classList.add('message-favorited');
      // 可选：添加收藏图标
      if (!messageEl.querySelector('.favorite-badge')) {
        const badge = document.createElement('span');
        badge.className = 'favorite-badge';
        badge.innerHTML = '★';
        badge.style.cssText = 'position: absolute; top: 4px; right: 4px; color: #FFD700; font-size: 14px;';
        messageEl.style.position = 'relative';
        messageEl.appendChild(badge);
      }
    } else {
      messageEl.classList.remove('message-favorited');
      const badge = messageEl.querySelector('.favorite-badge');
      if (badge) badge.remove();
    }
  }

  // 直接更新 Supabase 表保存收藏状态
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from("messages")
        .update({
          is_favorited: shouldFavorite,
          favorited_at: shouldFavorite ? new Date().toISOString() : null
        })
        .eq("id", msgId);

      if (error) {
        throw error;
      }
    }
  } catch (error) {
    console.error('Favorite message error:', error);
    if (typeof showToast === 'function') {
      showToast('收藏操作失败，请重试');
    }
    return;
  }

  if (typeof showToast === 'function') {
    showToast(shouldFavorite ? '已收藏' : '已取消收藏');
  }
}

// ── Favorites UI ─────────────────────────────────────────────────────────────

async function openFavoritesOverlay() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'favoritesOverlay';
  overlay.className = 'overlay';
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

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal favorites-modal';
  modal.style.cssText = `
    background: var(--bg);
    border-radius: 16px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  `;

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
  `;

  const titleSection = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = '收藏夹';
  title.style.cssText = 'margin: 0; font-size: 18px; color: var(--text);';

  const subtitle = document.createElement('p');
  subtitle.id = 'favoritesCount';
  subtitle.textContent = '加载中...';
  subtitle.style.cssText = 'margin: 4px 0 0 0; font-size: 13px; color: var(--text-muted);';

  titleSection.appendChild(title);
  titleSection.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.2s;
  `;
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'var(--surface)');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'none');
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(titleSection);
  header.appendChild(closeBtn);

  // Content area
  const content = document.createElement('div');
  content.id = 'favoritesContent';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  `;

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'favorites-loading';
  loading.textContent = '加载中...';
  loading.style.cssText = `
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
  `;
  content.appendChild(loading);

  // Assemble
  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Load favorites
  await loadFavorites();
}

async function loadFavorites() {
  const content = document.getElementById('favoritesContent');
  const countEl = document.getElementById('favoritesCount');

  if (!content) return;

  try {
    // Fetch favorited messages from database
    let favorites = [];

    if (supabaseClient && currentUserId) {
      const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('user_id', currentUserId)
        .eq('is_favorited', true)
        .order('favorited_at', { ascending: false });

      if (error) throw error;
      favorites = data || [];
    }

    // Update count
    if (countEl) {
      countEl.textContent = favorites.length === 0
        ? '暂无收藏'
        : `共 ${favorites.length} 条收藏`;
    }

    // Clear loading
    content.innerHTML = '';

    if (favorites.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'favorites-empty';
      empty.style.cssText = `
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
      `;
      empty.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">★</div>
        <p style="font-size: 15px; margin: 0;">还没有收藏任何消息</p>
        <p style="font-size: 13px; margin: 8px 0 0 0; opacity: 0.7;">长按消息选择"收藏"</p>
      `;
      content.appendChild(empty);
      return;
    }

    // Render favorites
    favorites.forEach(msg => {
      const item = createFavoriteItem(msg);
      content.appendChild(item);
    });

  } catch (err) {
    console.error('Failed to load favorites:', err);
    content.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        加载失败，请重试
      </div>
    `;
  }
}

function createFavoriteItem(msg) {
  const item = document.createElement('div');
  item.className = 'favorite-item';
  item.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  `;
  item.addEventListener('mouseenter', () => {
    item.style.background = 'var(--bg-raise)';
    item.style.transform = 'translateY(-1px)';
  });
  item.addEventListener('mouseleave', () => {
    item.style.background = 'var(--surface)';
    item.style.transform = 'none';
  });

  // Role label
  const roleLabel = document.createElement('div');
  roleLabel.style.cssText = `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 8px;
    ${msg.role === 'assistant'
      ? 'background: rgba(91, 159, 245, 0.12); color: #5B9FF5;'
      : 'background: rgba(232, 168, 124, 0.12); color: #E8A87C;'}
  `;
  roleLabel.textContent = msg.role === 'assistant' ? 'Cha' : '你';
  item.appendChild(roleLabel);

  // Message content preview
  const textContent = extractTextFromMessageContent(msg.content);
  const preview = document.createElement('div');
  preview.style.cssText = `
    font-size: 14px;
    line-height: 1.5;
    color: var(--text);
    margin-bottom: 8px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  `;
  preview.textContent = textContent || '[图片消息]';
  item.appendChild(preview);

  // Metadata footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-muted);
  `;

  const timestamp = document.createElement('span');
  timestamp.textContent = formatMessageDate(msg.favorited_at || msg.created_at);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 12px;';

  // Jump to message button
  const jumpBtn = document.createElement('button');
  jumpBtn.textContent = '跳转';
  jumpBtn.style.cssText = `
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s;
  `;
  jumpBtn.addEventListener('mouseenter', () => jumpBtn.style.background = 'rgba(91, 159, 245, 0.1)');
  jumpBtn.addEventListener('mouseleave', () => jumpBtn.style.background = 'none');
  jumpBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await jumpToMessage(msg.id, msg.conversation_id);
  });

  // Unfavorite button
  const unfavoriteBtn = document.createElement('button');
  unfavoriteBtn.textContent = '取消收藏';
  unfavoriteBtn.style.cssText = `
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
  `;
  unfavoriteBtn.addEventListener('mouseenter', () => {
    unfavoriteBtn.style.background = 'rgba(255, 68, 68, 0.1)';
    unfavoriteBtn.style.color = '#ff4444';
  });
  unfavoriteBtn.addEventListener('mouseleave', () => {
    unfavoriteBtn.style.background = 'none';
    unfavoriteBtn.style.color = 'var(--text-muted)';
  });
  unfavoriteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await unfavoriteFromList(msg.id, item);
  });

  actions.appendChild(jumpBtn);
  actions.appendChild(unfavoriteBtn);
  footer.appendChild(timestamp);
  footer.appendChild(actions);
  item.appendChild(footer);

  return item;
}

async function jumpToMessage(msgId, conversationId) {
  // Close favorites overlay
  const overlay = document.getElementById('favoritesOverlay');
  if (overlay) overlay.remove();

  // Switch to chat page
  switchMainPage('chat');

  // If different conversation, load it
  if (conversationId !== currentConversationId) {
    await loadConversation(conversationId);
  }

  // Wait a bit for rendering
  await new Promise(resolve => setTimeout(resolve, 300));

  // Find and scroll to message
  const targetRow = messageList.querySelector(`[data-msg-id="${msgId}"]`);
  if (targetRow) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight the message briefly
    const messageEl = targetRow.querySelector('.message');
    if (messageEl) {
      messageEl.style.boxShadow = '0 0 0 3px rgba(91, 159, 245, 0.3)';
      setTimeout(() => {
        messageEl.style.boxShadow = '';
      }, 2000);
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('消息不存在或已被删除');
    }
  }
}

async function unfavoriteFromList(msgId, itemEl) {
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('messages')
        .update({
          is_favorited: false,
          favorited_at: null
        })
        .eq('id', msgId);

      if (error) throw error;
    }

    // Update in-memory chatMessages if it's in current conversation
    const idx = chatMessages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      chatMessages[idx].is_favorited = false;
      delete chatMessages[idx].favorited_at;

      // Update UI in message list
      const row = messageList.querySelector(`[data-msg-id="${msgId}"]`);
      if (row) {
        const messageEl = row.querySelector('.message');
        if (messageEl) {
          messageEl.classList.remove('message-favorited');
          const badge = messageEl.querySelector('.favorite-badge');
          if (badge) badge.remove();
        }
      }
    }

    // Remove from favorites list with animation
    itemEl.style.transition = 'opacity 0.3s, transform 0.3s';
    itemEl.style.opacity = '0';
    itemEl.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      itemEl.remove();

      // Check if list is empty now
      const content = document.getElementById('favoritesContent');
      if (content && content.children.length === 0) {
        loadFavorites(); // Reload to show empty state
      } else {
        // Update count
        const countEl = document.getElementById('favoritesCount');
        const remaining = content ? content.children.length : 0;
        if (countEl) {
          countEl.textContent = remaining === 0 ? '暂无收藏' : `共 ${remaining} 条收藏`;
        }
      }
    }, 300);

    if (typeof showToast === 'function') {
      showToast('已取消收藏');
    }

  } catch (err) {
    console.error('Failed to unfavorite:', err);
    if (typeof showToast === 'function') {
      showToast('取消收藏失败，请重试');
    }
  }
}

function formatMessageDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) return '刚刚';

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} 分钟前`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} 天前`;
  }

  // Format as date
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (year === now.getFullYear()) {
    return `${month}-${day}`;
  }
  return `${year}-${month}-${day}`;
}

// Make it globally accessible
window.openFavoritesOverlay = openFavoritesOverlay;

// ─────────────────────────────────────────────────────────────────────────────

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

// ── Voice Message Helper Functions ──────────────────────────────────────────

/**
 * Show voice message transcription inline below the voice bubble
 */
function showVoiceTranscription(row, msg) {
  const transcribedText = msg?.audio_transcribed_text;
  if (!transcribedText) {
    if (typeof showToast === 'function') showToast('暂无转录文字');
    return;
  }

  // Check if transcription is already shown
  const existingTranscription = row.querySelector('.voice-transcription');
  if (existingTranscription) {
    // Toggle: remove if already shown
    existingTranscription.remove();
    return;
  }

  // Create transcription element
  const transcription = document.createElement('div');
  transcription.className = 'voice-transcription';
  transcription.textContent = transcribedText;

  // Insert after the voice message in the stack
  const stack = row.querySelector('.msg-stack');
  if (stack) {
    const voiceMessage = stack.querySelector('.message-voice');
    if (voiceMessage) {
      voiceMessage.insertAdjacentElement('afterend', transcription);
    } else {
      stack.appendChild(transcription);
    }
  }
}

/**
 * Edit voice message transcription (for KK's fake voice)
 */
function editVoiceTranscription(row, effectiveMsgId) {
  const msg = chatMessages.find(m => m.id === effectiveMsgId);
  if (!msg || !msg.audio_transcribed_text) {
    if (typeof showToast === 'function') showToast('无法编辑此语音消息');
    return;
  }

  const overlay = document.createElement('div');
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
  dialog.style.cssText = `
    background: var(--bg);
    border-radius: 12px;
    padding: 20px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = '编辑语音内容';
  title.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 16px;
    color: var(--text);
  `;

  const textarea = document.createElement('textarea');
  textarea.value = msg.audio_transcribed_text;
  textarea.style.cssText = `
    width: 100%;
    min-height: 120px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    resize: vertical;
    font-family: inherit;
    color: var(--text);
    background: var(--bg);
    margin-bottom: 16px;
  `;

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = `
    display: flex;
    gap: 8px;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => overlay.remove());

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存';
  saveBtn.style.cssText = `
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    font-size: 14px;
  `;
  saveBtn.addEventListener('click', async () => {
    const newText = textarea.value.trim();
    if (!newText) {
      if (typeof showToast === 'function') showToast('内容不能为空');
      return;
    }

    try {
      const { error } = await supabaseClient
        .from('messages')
        .update({
          audio_transcribed_text: newText,
          content: newText, // Also update content field
        })
        .eq('id', effectiveMsgId);

      if (error) throw error;

      // Update local chatMessages
      msg.audio_transcribed_text = newText;
      msg.content = newText;

      if (typeof showToast === 'function') showToast('已保存');
      overlay.remove();

      // Optionally refresh the voice bubble (not critical for MVP)
    } catch (err) {
      console.error('Edit voice transcription error:', err);
      if (typeof showToast === 'function') showToast('保存失败，请重试');
    }
  });

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(saveBtn);
  dialog.appendChild(title);
  dialog.appendChild(textarea);
  dialog.appendChild(buttonRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Focus textarea
  setTimeout(() => textarea.focus(), 100);
}

/**
 * Change voice playback speed (for Cha's real voice)
 */
function changeVoicePlaybackSpeed(row) {
  const voiceContainer = row.querySelector('.message-voice');
  if (!voiceContainer) {
    if (typeof showToast === 'function') showToast('无法找到语音消息');
    return;
  }

  // Get current speed from data attribute or default to 1.0
  const currentSpeed = parseFloat(voiceContainer.dataset.playbackSpeed || '1.0');

  const overlay = document.createElement('div');
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
  dialog.style.cssText = `
    background: var(--bg);
    border-radius: 12px;
    padding: 20px;
    max-width: 320px;
    width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = '播放速度';
  title.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 16px;
    color: var(--text);
    text-align: center;
  `;

  const speedOptions = [
    { value: 0.75, label: '0.75x' },
    { value: 1.0, label: '1.0x（正常）' },
    { value: 1.25, label: '1.25x' },
    { value: 1.5, label: '1.5x' },
    { value: 2.0, label: '2.0x' }
  ];

  const optionsContainer = document.createElement('div');
  optionsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  `;

  speedOptions.forEach(option => {
    const btn = document.createElement('button');
    btn.textContent = option.label;
    btn.style.cssText = `
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: ${option.value === currentSpeed ? 'var(--accent-primary)' : 'transparent'};
      color: ${option.value === currentSpeed ? 'white' : 'var(--text)'};
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;

    btn.addEventListener('click', () => {
      // Store speed in data attribute
      voiceContainer.dataset.playbackSpeed = option.value;

      // If audio is currently playing, update its playback rate
      if (window.SPVoiceMessage && window.SPVoiceMessage.currentAudio) {
        window.SPVoiceMessage.currentAudio.playbackRate = option.value;
      }

      if (typeof showToast === 'function') showToast(`播放速度已设置为 ${option.label}`);
      overlay.remove();
    });

    optionsContainer.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => overlay.remove());

  dialog.appendChild(title);
  dialog.appendChild(optionsContainer);
  dialog.appendChild(cancelBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showMessageActionMenu(row, x, y) {
  closeMessageActionMenu();
  const isAssistant = row.classList.contains("assistant");
  const isUser = row.classList.contains("user");
  if (!isAssistant && !isUser) return;

  const menu = document.createElement("div");
  menu.className = "message-action-menu";

  // Get msgId from either msgId or bubbleSibling (for split messages)
  const effectiveMsgId = row.dataset.msgId || row.dataset.bubbleSibling;
  const msg = effectiveMsgId ? chatMessages.find(m => m.id === effectiveMsgId) : null;
  const isFavorited = msg?.is_favorited;
  const hasImage = row.querySelector(".message-image");
  const hasVoice = row.querySelector(".message-voice");
  const hasText = row.querySelector(".message-text");

  // 判断消息类型：图片、语音、文字
  const messageType = hasImage ? 'image' : (hasVoice ? 'voice' : 'text');

  // 两横排布局
  const row1 = document.createElement("div");
  row1.className = "message-action-menu-row";
  const row2 = document.createElement("div");
  row2.className = "message-action-menu-row";

  // ============ 文字消息 ============
  if (messageType === 'text') {
    if (isUser) {
      // KK 的文字消息
      // 第一行：引用、编辑、复制、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "user");
        });
      }
      if (row === getLastMessageRow("user") && row.dataset.msgId) {
        addMessageMenuButton(row1, "编辑", () => editUserMessage(row));
      }
      addMessageMenuButton(row1, "复制", async (btn) => {
        await copyMessage(row, btn);
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "删除", () => deleteMessage(row, effectiveMsgId));
      }

      // 第二行：收藏、多选、转发、撤回
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row2, "撤回", () => recallMessage(row, effectiveMsgId));
      }
    } else {
      // Cha 的文字消息
      // 第一行：引用、复制、重新生成、朗读
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "assistant");
        });
      }
      addMessageMenuButton(row1, "复制", async (btn) => {
        await copyMessage(row, btn);
      });
      if (canRegenerateRow(row)) {
        addMessageMenuButton(row1, "重新生成", () => regenerateMessage(row));
      }
      if (effectiveMsgId && hasText && window.SPVoice) {
        addMessageMenuButton(row1, "朗读", () => {
          closeMessageActionMenu();
          const messageEl = row.querySelector(".message");
          if (messageEl) {
            window.SPVoice.speakMessage(messageEl, effectiveMsgId);
          }
        });
      }

      // 第二行：收藏、多选、转发、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row2, "删除", () => deleteMessage(row, effectiveMsgId));
      }
    }
  }
  // ============ 图片消息 ============
  else if (messageType === 'image') {
    if (isUser) {
      // KK 的图片消息
      // 第一行：引用、编辑、保存、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "user");
        });
      }
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "编辑", () => editImageDescription(row, effectiveMsgId));
      }
      addMessageMenuButton(row1, "保存", async () => {
        closeMessageActionMenu();
        const img = row.querySelector(".message-image img");
        if (img) {
          try {
            // 使用 fetch 获取图片并转换为 blob
            const response = await fetch(img.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `image-${Date.now()}.jpg`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 清理 blob URL
            setTimeout(() => URL.revokeObjectURL(url), 100);

            if (typeof showToast === 'function') {
              showToast('已保存到相册');
            }
          } catch (error) {
            console.error('Save image error:', error);
            if (typeof showToast === 'function') {
              showToast('保存失败，请重试');
            }
          }
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "删除", () => deleteMessage(row, effectiveMsgId));
      }

      // 第二行：收藏、多选、转发、撤回
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row2, "撤回", () => recallMessage(row, effectiveMsgId));
      }
    } else {
      // Cha 的图片消息
      // 第一行：引用、保存、重新生成、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "assistant");
        });
      }
      addMessageMenuButton(row1, "保存", async () => {
        closeMessageActionMenu();
        const img = row.querySelector(".message-image img");
        if (img) {
          try {
            // 使用 fetch 获取图片并转换为 blob
            const response = await fetch(img.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `image-${Date.now()}.jpg`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 清理 blob URL
            setTimeout(() => URL.revokeObjectURL(url), 100);

            if (typeof showToast === 'function') {
              showToast('已保存到相册');
            }
          } catch (error) {
            console.error('Save image error:', error);
            if (typeof showToast === 'function') {
              showToast('保存失败，请重试');
            }
          }
        }
      });
      if (canRegenerateRow(row)) {
        addMessageMenuButton(row1, "重新生成", () => regenerateMessage(row));
      }
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "删除", () => deleteMessage(row, effectiveMsgId));
      }

      // 第二行：收藏、多选、转发、查看图片描述
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      addMessageMenuButton(row2, "查看图片描述", () => {
        closeMessageActionMenu();
        const description = msg?.image_description || msg?.image_prompt;
        if (description) {
          // Create a better dialog to show description
          const overlay = document.createElement('div');
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
          dialog.style.cssText = `
            background: var(--bg);
            border-radius: 12px;
            padding: 20px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          `;

          const title = document.createElement('h3');
          title.textContent = '图片描述';
          title.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            color: var(--text);
          `;

          const content = document.createElement('div');
          content.textContent = description;
          content.style.cssText = `
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 16px;
            max-height: 300px;
            overflow-y: auto;
          `;

          const closeBtn = document.createElement('button');
          closeBtn.textContent = '关闭';
          closeBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            border: none;
            border-radius: 8px;
            background: var(--accent-primary);
            color: white;
            cursor: pointer;
            font-size: 14px;
          `;
          closeBtn.addEventListener('click', () => overlay.remove());

          dialog.appendChild(title);
          dialog.appendChild(content);
          dialog.appendChild(closeBtn);
          overlay.appendChild(dialog);
          document.body.appendChild(overlay);

          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
          });
        } else {
          if (typeof showToast === 'function') showToast('暂无图片描述');
        }
      });
    }
  }
  // ============ 语音消息 ============
  else if (messageType === 'voice') {
    if (isUser) {
      // KK 的语音消息
      // 第一行：引用、转文字、编辑、撤回
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "user");
        });
      }
      addMessageMenuButton(row1, "转文字", () => {
        closeMessageActionMenu();
        showVoiceTranscription(row, msg);
      });
      if (row === getLastMessageRow("user") && row.dataset.msgId) {
        addMessageMenuButton(row1, "编辑", () => {
          closeMessageActionMenu();
          editVoiceTranscription(row, effectiveMsgId);
        });
      }
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "撤回", () => recallMessage(row, effectiveMsgId));
      }

      // 第二行：收藏、多选、转发、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row2, "删除", () => deleteMessage(row, effectiveMsgId));
      }
    } else {
      // Cha 的语音消息
      // 第一行：引用、转文字、倍速、重新生成
      if (effectiveMsgId) {
        addMessageMenuButton(row1, "引用", () => {
          const preview = getMessageQuotePreview(row);
          closeMessageActionMenu();
          setReplyDraft(effectiveMsgId, preview, "assistant");
        });
      }
      addMessageMenuButton(row1, "转文字", () => {
        closeMessageActionMenu();
        showVoiceTranscription(row, msg);
      });
      addMessageMenuButton(row1, "倍速", () => {
        closeMessageActionMenu();
        changeVoicePlaybackSpeed(row);
      });
      if (canRegenerateRow(row)) {
        addMessageMenuButton(row1, "重新生成", () => regenerateMessage(row));
      }

      // 第二行：收藏、多选、转发、删除
      if (effectiveMsgId) {
        addMessageMenuButton(row2, isFavorited ? "取消收藏" : "收藏", () =>
          favoriteMessage(row, effectiveMsgId, !isFavorited)
        );
      }
      addMessageMenuButton(row2, "多选", () => {
        closeMessageActionMenu();
        enterMultiSelectMode();
        // Auto-select the current bubble after entering multi-select mode
        const bubbleId = row.dataset.msgId ? row.dataset.msgId : `${row.dataset.bubbleSibling}-${Array.from(messageList.children).indexOf(row)}`;
        if (bubbleId) {
          toggleBubbleSelection(bubbleId, row);
        }
      });
      addMessageMenuButton(row2, "转发", () => {
        closeMessageActionMenu();
        if (effectiveMsgId) {
          showForwardTargetPanel([effectiveMsgId]);
        }
      });
      if (effectiveMsgId) {
        addMessageMenuButton(row2, "删除", () => deleteMessage(row, effectiveMsgId));
      }
    }
  }

  menu.appendChild(row1);
  menu.appendChild(row2);

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

// ── G's Eyes v0.1 local visual context ──────────────────────────────────────
const GS_EYES_DEFAULT_SUMMARY = "G's Eyes 尚未开启，当前没有可用视觉状态。";
const GS_EYES_UNSUPPORTED_SUMMARY = "摄像头预览已开启，视觉识别未启用或当前浏览器不支持本地识别。";
const GS_EYES_SERVER_INTERVAL_MS = 12000;
const GS_EYES_SERVER_TIMEOUT_MS = 30000;
const GS_EYES_MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const GS_EYES_FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const GS_EYES_EVENT_COOLDOWNS = {
  user_smiled: 45000,
  user_returned: 30000,
  user_waved: 15000,
  user_looked_down_long: 60000,
  user_entered_frame: 30000,
  user_left_frame: 30000,
};
let gsEyesStream = null;
let gsEyesDetectTimer = null;
let gsEyesAnalyzeInFlight = false;
let gsEyesLastAnalyzeAt = 0;
let gsEyesSessionId = 0;
let gsEyesMonitorRaf = 0;
let gsEyesFaceLandmarker = null;
let gsEyesFaceReady = false;
let gsEyesLastMonitorAt = 0;
let gsEyesFpsSamples = [];
let gsEyesFacePresentSince = null;
let gsEyesSmileSince = null;
let gsEyesLookDownSince = null;
let gsEyesEventCooldowns = {};
let gsEyesPendingVisualEvent = null;
let gsEyesLastEvent = null;
let gsEyesAbsentSince = null;
let gsEyesReturnedUntil = 0;
let gsEyesLastFaceBox = null;
let gsEyesDebugOpen = false;
let gsEyesState = {
  camera_permission: "unknown",
  camera_preview: "idle",
  camera_preview_ready: false,
  detector_type: "none",
  detection_ready: false,
  vision_detection_ready: false,
  smiling_score: null,
  current_event: "none",
  last_event_at: null,
  cooldown_remaining: 0,
  local_fps: 0,
  server_snapshot_status: "idle",
  last_detection_at: null,
  error_reason: "",
  face_present: null,
  face_absent_duration: 0,
  away_returned: null,
  smiling: null,
  head_down_or_away: null,
  visual_summary: GS_EYES_DEFAULT_SUMMARY,
  recognition_supported: false,
  camera_active: false,
  updated_at: null,
};

function summarizeGsEyesState(partial = {}) {
  const state = { ...gsEyesState, ...partial };
  if (!state.camera_preview_ready) {
    return state.camera_preview === "error"
      ? "摄像头未打开，当前没有可用视觉状态。"
      : GS_EYES_DEFAULT_SUMMARY;
  }
  if (!state.detection_ready) return GS_EYES_UNSUPPORTED_SUMMARY;
  if (state.face_present === null) return "服务端视觉识别已启用，正在等待第一帧检测结果。";
  if (!state.face_present) {
    const seconds = Math.round((state.face_absent_duration || 0) / 1000);
    return seconds > 2 ? `用户离开镜头约 ${seconds} 秒。` : "暂时没有在镜头里看到用户。";
  }
  if (state.away_returned) return "用户刚刚回到镜头前，正在看向屏幕。";
  if (state.smiling) return "用户在镜头前，状态看起来更轻松，可能在微笑。";
  if (state.head_down_or_away) return "用户在镜头前，但可能低头或没有看向屏幕。";
  return "用户在镜头前，表情平静，正在看向屏幕。";
}

function setGsEyesState(partial = {}) {
  gsEyesState = {
    ...gsEyesState,
    ...partial,
    updated_at: new Date().toISOString(),
  };
  gsEyesState.vision_detection_ready = !!gsEyesState.detection_ready;
  gsEyesState.recognition_supported = !!gsEyesState.detection_ready;
  gsEyesState.visual_summary = partial.visual_summary || summarizeGsEyesState(gsEyesState);
  renderGsEyesDebug();
}

window.getGsEyesVisualContext = function () {
  if (!gsEyesState.camera_preview_ready) return null;
  if (gsEyesPendingVisualEvent) {
    const event = gsEyesPendingVisualEvent;
    gsEyesPendingVisualEvent = null;
    return [
      "[visual_event]",
      `type=${event.type}`,
      `confidence=${event.confidence.toFixed(2)}`,
      `started_at=${event.started_at}`,
      `duration_ms=${event.duration_ms}`,
      `description=${event.description}`,
      "instruction=你可以自然回应，也可以选择不回应。不要说“系统检测到”。",
    ].join("\n");
  }
  return [
    "[视觉状态，仅供回复参考，不要机械复述]",
    gsEyesState.visual_summary,
    "回复时只自然调整语气：低头/离开/沉默时少说一点、放慢一点；笑了时更轻松；刚回来时可自然接一句“回来了”。不要说“我检测到你”。",
  ].join("\n");
};

window.hasPendingGsEyesVisualEvent = function () {
  return !!gsEyesPendingVisualEvent;
};

function createGsEyesOverlay() {
  const existing = document.getElementById("gsEyesOverlay");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "gsEyesOverlay";
  overlay.className = "gs-eyes-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="gs-eyes-card">
      <header class="gs-eyes-header">
        <div><strong>G's Eyes</strong><span data-gs-field="overlay_status">摄像头预览准备中，视觉识别尚未启用</span></div>
        <button type="button" class="gs-eyes-icon-btn" id="gsEyesCloseTop" aria-label="关闭">×</button>
      </header>
      <div class="gs-eyes-video-wrap">
        <video id="gsEyesVideo" autoplay playsinline muted></video>
        <div id="gsEyesMessage" class="gs-eyes-message">正在请求摄像头权限…</div>
      </div>
      <div class="gs-eyes-privacy">视觉分析只在本地进行，不上传、不保存视频画面。关闭后会立即停止摄像头。</div>
      <details id="gsEyesDebug" class="gs-eyes-debug">
        <summary>调试状态</summary>
        <div class="gs-eyes-debug-grid">
          <span>camera_permission</span><b data-gs-field="camera_permission">unknown</b>
          <span>camera_preview</span><b data-gs-field="camera_preview">idle</b>
          <span>camera_preview_ready</span><b data-gs-field="camera_preview_ready">false</b>
          <span>detector_type</span><b data-gs-field="detector_type">none</b>
          <span>detection_ready</span><b data-gs-field="detection_ready">false</b>
          <span>vision_detection_ready</span><b data-gs-field="vision_detection_ready">false</b>
          <span>smiling_score</span><b data-gs-field="smiling_score">未检测</b>
          <span>current_event</span><b data-gs-field="current_event">none</b>
          <span>last_event_at</span><b data-gs-field="last_event_at">未触发</b>
          <span>cooldown_remaining</span><b data-gs-field="cooldown_remaining">0</b>
          <span>local_fps</span><b data-gs-field="local_fps">0</b>
          <span>server_snapshot_status</span><b data-gs-field="server_snapshot_status">idle</b>
          <span>last_detection_at</span><b data-gs-field="last_detection_at">未检测</b>
          <span>error_reason</span><b data-gs-field="error_reason">-</b>
          <span>face_present</span><b data-gs-field="face_present">未检测</b>
          <span>smiling</span><b data-gs-field="smiling">未检测</b>
          <span>head_down_or_away</span><b data-gs-field="head_down_or_away">未检测</b>
          <span>visual_summary</span><b data-gs-field="visual_summary">${GS_EYES_DEFAULT_SUMMARY}</b>
        </div>
        <button type="button" class="gs-eyes-debug-action" id="gsEyesAnalyzeNow">重新看一眼</button>
        <label class="gs-eyes-sim"><input id="gsEyesSmileSim" type="checkbox"><span>模拟微笑</span></label>
      </details>
      <footer class="gs-eyes-footer"><button type="button" id="gsEyesCloseBtn">关闭</button></footer>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#gsEyesCloseTop")?.addEventListener("click", closeGsEyesOverlay);
  overlay.querySelector("#gsEyesCloseBtn")?.addEventListener("click", closeGsEyesOverlay);
  overlay.querySelector("#gsEyesDebug")?.addEventListener("toggle", (event) => {
    gsEyesDebugOpen = event.currentTarget.open;
  });
  overlay.querySelector("#gsEyesSmileSim")?.addEventListener("change", (event) => {
    if (gsEyesState.detection_ready) setGsEyesState({ smiling: !!event.currentTarget.checked });
  });
  overlay.querySelector("#gsEyesAnalyzeNow")?.addEventListener("click", () => {
    const video = overlay.querySelector("#gsEyesVideo");
    analyzeGsEyesSnapshot(video, { force: true });
  });
  return overlay;
}

function getGsEyesUnavailableLabel() {
  if (gsEyesState.error_reason) return "识别失败 / 未检测";
  if (gsEyesState.detector_type === "server-vision") return "未检测";
  if (!gsEyesState.detection_ready) return "未启用识别";
  return "未检测";
}

function formatGsEyesDebugValue(key, value) {
  if (["face_present", "smiling", "head_down_or_away", "away_returned"].includes(key) && !gsEyesState.detection_ready) {
    return getGsEyesUnavailableLabel();
  }
  if (["face_present", "smiling", "head_down_or_away", "away_returned"].includes(key) && value === null) {
    return "未检测";
  }
  if (key === "smiling_score") return typeof value === "number" ? value.toFixed(2) : "未检测";
  if (key === "local_fps") return typeof value === "number" ? value.toFixed(1) : "0";
  if (key === "cooldown_remaining") return `${Math.ceil((Number(value) || 0) / 1000)}s`;
  if (key === "last_event_at") return value || "未触发";
  if (key === "last_detection_at") return value || "未检测";
  if (key === "error_reason") return value || "-";
  return String(value);
}

function renderGsEyesDebug() {
  const overlay = document.getElementById("gsEyesOverlay");
  if (!overlay) return;
  overlay.querySelectorAll("[data-gs-field]").forEach((node) => {
    const key = node.dataset.gsField;
    if (key === "overlay_status") {
      node.textContent = gsEyesState.camera_preview_ready
        ? "cha 正在看见你"
        : "摄像头预览准备中，视觉识别尚未启用";
      return;
    }
    node.textContent = formatGsEyesDebugValue(key, gsEyesState[key]);
  });
  const debug = overlay.querySelector("#gsEyesDebug");
  if (debug) debug.open = gsEyesDebugOpen;
}

function stopGsEyesDetection() {
  gsEyesSessionId += 1;
  if (gsEyesMonitorRaf) {
    cancelAnimationFrame(gsEyesMonitorRaf);
    gsEyesMonitorRaf = 0;
  }
  if (gsEyesDetectTimer) {
    clearInterval(gsEyesDetectTimer);
    gsEyesDetectTimer = null;
  }
  gsEyesAnalyzeInFlight = false;
  gsEyesFaceReady = false;
  if (gsEyesFaceLandmarker?.close) {
    try { gsEyesFaceLandmarker.close(); } catch (_) {}
  }
  gsEyesFaceLandmarker = null;
  gsEyesLastMonitorAt = 0;
  gsEyesFpsSamples = [];
  gsEyesFacePresentSince = null;
  gsEyesSmileSince = null;
  gsEyesLookDownSince = null;
}

function stopGsEyesCamera() {
  stopGsEyesDetection();
  if (gsEyesStream) {
    gsEyesStream.getTracks().forEach((track) => track.stop());
    gsEyesStream = null;
  }
  const video = document.getElementById("gsEyesVideo");
  if (video) video.srcObject = null;
  setGsEyesState({
    camera_active: false,
    camera_preview: "idle",
    camera_preview_ready: false,
    detector_type: "none",
    detection_ready: false,
    face_present: null,
    away_returned: null,
    smiling: null,
    head_down_or_away: null,
    last_detection_at: null,
    error_reason: "",
    smiling_score: null,
    current_event: "none",
    cooldown_remaining: 0,
    local_fps: 0,
    server_snapshot_status: "idle",
  });
}

function closeGsEyesOverlay() {
  stopGsEyesCamera();
  document.getElementById("gsEyesOverlay")?.remove();
}

function updateGsEyesFromServerResult(result = {}) {
  const now = Date.now();
  if (result.detection_ready === false) {
    setGsEyesState({
      detector_type: gsEyesFaceReady ? "mediapipe-face" : "server-vision",
      detection_ready: gsEyesFaceReady,
      face_present: gsEyesFaceReady ? gsEyesState.face_present : null,
      away_returned: gsEyesFaceReady ? gsEyesState.away_returned : null,
      smiling: gsEyesFaceReady ? gsEyesState.smiling : null,
      head_down_or_away: gsEyesFaceReady ? gsEyesState.head_down_or_away : null,
      last_detection_at: result.last_detection_at || new Date(now).toISOString(),
      error_reason: result.error_reason || "server vision unavailable",
      visual_summary: result.visual_summary || "摄像头预览已开启，但这次视觉识别失败；当前没有新的视觉状态。",
    });
    return;
  }
  const facePresent = typeof result.face_present === "boolean" ? result.face_present : null;
  if (facePresent === false) {
    if (!gsEyesAbsentSince) gsEyesAbsentSince = now;
    gsEyesLastFaceBox = null;
    setGsEyesState({
      face_present: false,
      face_absent_duration: now - gsEyesAbsentSince,
      away_returned: false,
      smiling: typeof result.smiling === "boolean" ? result.smiling : null,
      head_down_or_away: typeof result.head_down_or_away === "boolean" ? result.head_down_or_away : null,
      detector_type: gsEyesFaceReady ? "mediapipe-face" : "server-vision",
      detection_ready: true,
      last_detection_at: result.last_detection_at || new Date(now).toISOString(),
      error_reason: result.error_reason || "",
      visual_summary: result.visual_summary || "当前画面里暂时没有看到用户。",
    });
    return;
  }
  const returned = facePresent === true && !!gsEyesAbsentSince && now - gsEyesAbsentSince > 1200;
  if (returned) gsEyesReturnedUntil = now + 5000;
  if (facePresent === true) gsEyesAbsentSince = null;

  setGsEyesState({
    detector_type: gsEyesFaceReady ? "mediapipe-face" : "server-vision",
    detection_ready: true,
    face_present: facePresent,
    face_absent_duration: facePresent === true ? 0 : gsEyesState.face_absent_duration,
    away_returned: returned || now < gsEyesReturnedUntil,
    smiling: typeof result.smiling === "boolean" ? result.smiling : null,
    head_down_or_away: typeof result.head_down_or_away === "boolean" ? result.head_down_or_away : null,
    last_detection_at: result.last_detection_at || new Date(now).toISOString(),
    error_reason: result.error_reason || "",
    visual_summary: result.visual_summary || summarizeGsEyesState({ detection_ready: true, face_present: facePresent }),
  });
}

function setGsEyesDetectionUnavailable(reason) {
  stopGsEyesDetection();
  setGsEyesState({
    detector_type: "none",
    detection_ready: false,
    face_present: null,
    away_returned: null,
    smiling: null,
    head_down_or_away: null,
    last_detection_at: null,
    error_reason: reason || "local detector unavailable",
    visual_summary: GS_EYES_UNSUPPORTED_SUMMARY,
  });
}

function getGsEyesCooldownRemaining(key, now = Date.now()) {
  return Math.max(0, (gsEyesEventCooldowns[key] || 0) - now);
}

function describeGsEyesEvent(type) {
  const descriptions = {
    user_entered_frame: "kk 出现在镜头里了",
    user_left_frame: "kk 暂时离开了镜头",
    user_returned: "kk 刚刚回到镜头前",
    user_smiled: "kk 刚刚对着镜头笑了一下",
    user_waved: "kk 刚刚挥了挥手",
    user_looked_down_long: "kk 低头或没有看向屏幕有一小会儿了",
    user_looked_tired_uncertain: "kk 看起来可能有点累，但不确定",
  };
  return descriptions[type] || "kk 的视觉状态刚刚有变化";
}

function emitGsEyesVisualEvent(type, confidence, rawSnapshot = {}, options = {}) {
  const now = Date.now();
  const cooldownKey = options.cooldown_key || type;
  if (getGsEyesCooldownRemaining(cooldownKey, now) > 0) return false;
  const event = {
    type,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    started_at: new Date(options.startedAt || now).toISOString(),
    duration_ms: Math.max(0, Math.round(options.durationMs || 0)),
    cooldown_key: cooldownKey,
    raw_snapshot: rawSnapshot,
    description: options.description || describeGsEyesEvent(type),
  };
  gsEyesEventCooldowns[cooldownKey] = now + (GS_EYES_EVENT_COOLDOWNS[cooldownKey] || 30000);
  gsEyesPendingVisualEvent = event;
  gsEyesLastEvent = event;
  setGsEyesState({
    current_event: type,
    last_event_at: new Date(now).toISOString(),
    cooldown_remaining: getGsEyesCooldownRemaining(cooldownKey, now),
  });
  maybeTriggerGsEyesProactiveReply(type);
  return true;
}

function maybeTriggerGsEyesProactiveReply(type) {
  if (!["user_smiled", "user_returned", "user_waved"].includes(type)) return;
  if (!document.getElementById("gsEyesOverlay")) return;
  if (typeof triggerReply !== "function") return;
  if (isReplying || messageInput?.value?.trim() || isComposing) return;
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) return;
  setTimeout(() => {
    if (!document.getElementById("gsEyesOverlay")) return;
    if (isReplying || messageInput?.value?.trim() || isComposing) return;
    triggerReply("forced");
  }, 500 + Math.floor(Math.random() * 900));
}

function updateGsEyesCooldownDebug() {
  const now = Date.now();
  const remaining = gsEyesLastEvent ? getGsEyesCooldownRemaining(gsEyesLastEvent.cooldown_key, now) : 0;
  if (remaining !== gsEyesState.cooldown_remaining) {
    setGsEyesState({ cooldown_remaining: remaining });
  }
}

function getGsEyesBlendshapeScore(blendshapes, names) {
  const categories = blendshapes?.[0]?.categories || [];
  let best = 0;
  for (const category of categories) {
    if (names.includes(category.categoryName)) best = Math.max(best, Number(category.score) || 0);
  }
  return best;
}

function calculateGsEyesFaceSignals(result, video) {
  const landmarks = result?.faceLandmarks?.[0] || null;
  const blendshapes = result?.faceBlendshapes || [];
  if (!landmarks) {
    return {
      face_present: false,
      smiling_score: null,
      smiling: false,
      head_down_or_away: null,
      eye_open: null,
      looking_at_screen: null,
      confidence: 0.75,
    };
  }
  const leftSmile = getGsEyesBlendshapeScore(blendshapes, ["mouthSmileLeft"]);
  const rightSmile = getGsEyesBlendshapeScore(blendshapes, ["mouthSmileRight"]);
  const smilingScore = Math.max(leftSmile, rightSmile, (leftSmile + rightSmile) / 2);
  const leftBlink = getGsEyesBlendshapeScore(blendshapes, ["eyeBlinkLeft"]);
  const rightBlink = getGsEyesBlendshapeScore(blendshapes, ["eyeBlinkRight"]);
  const eyeOpen = 1 - Math.max(leftBlink, rightBlink);

  const nose = landmarks[1] || landmarks[4] || landmarks[0];
  const leftEye = landmarks[33] || landmarks[159];
  const rightEye = landmarks[263] || landmarks[386];
  const mouth = landmarks[13] || landmarks[14];
  const faceCenterX = nose?.x ?? 0.5;
  const eyeY = leftEye && rightEye ? (leftEye.y + rightEye.y) / 2 : 0.42;
  const mouthY = mouth?.y ?? 0.68;
  const noseY = nose?.y ?? 0.5;
  const verticalRatio = (noseY - eyeY) / Math.max(0.01, mouthY - eyeY);
  const horizontalAway = faceCenterX < 0.25 || faceCenterX > 0.75;
  const headDown = verticalRatio > 0.58 || noseY > 0.62;
  const headDownOrAway = horizontalAway || headDown;

  return {
    face_present: true,
    smiling_score: smilingScore,
    smiling: smilingScore >= 0.45,
    head_down_or_away: headDownOrAway,
    eye_open: eyeOpen,
    looking_at_screen: !headDownOrAway && eyeOpen > 0.35,
    confidence: 0.85,
    video_size: {
      width: video?.videoWidth || 0,
      height: video?.videoHeight || 0,
    },
  };
}

async function initGsEyesFaceLandmarker() {
  if (gsEyesFaceLandmarker) return true;
  setGsEyesState({
    detector_type: "mediapipe-face",
    detection_ready: false,
    error_reason: "",
    visual_summary: "摄像头预览已开启，正在启动本地 Monitor。",
  });
  try {
    const vision = await import(GS_EYES_MEDIAPIPE_CDN);
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
    );
    const createLandmarker = (delegate) => vision.FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: GS_EYES_FACE_LANDMARKER_MODEL,
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      gsEyesFaceLandmarker = await createLandmarker("GPU");
    } catch (gpuError) {
      console.warn("[gs-eyes] FaceLandmarker GPU init failed, retrying CPU", gpuError);
      gsEyesFaceLandmarker = await createLandmarker("CPU");
    }
    gsEyesFaceReady = true;
    setGsEyesState({
      detector_type: "mediapipe-face",
      detection_ready: true,
      error_reason: "",
      visual_summary: "cha 正在看见你。",
    });
    return true;
  } catch (error) {
    console.warn("[gs-eyes] FaceLandmarker init failed", error);
    gsEyesFaceReady = false;
    setGsEyesState({
      detector_type: "server-vision",
      detection_ready: false,
      error_reason: error?.message || "mediapipe face init failed",
      visual_summary: "本地 Monitor 暂时不可用，可以用“重新看一眼”做低频 snapshot。",
    });
    return false;
  }
}

function updateGsEyesLocalFps(now) {
  if (gsEyesLastMonitorAt) {
    const delta = now - gsEyesLastMonitorAt;
    if (delta > 0) gsEyesFpsSamples.push(1000 / delta);
    if (gsEyesFpsSamples.length > 20) gsEyesFpsSamples.shift();
  }
  gsEyesLastMonitorAt = now;
  const fps = gsEyesFpsSamples.length
    ? gsEyesFpsSamples.reduce((sum, value) => sum + value, 0) / gsEyesFpsSamples.length
    : 0;
  return fps;
}

function updateGsEyesEventsFromSignals(signals, now) {
  if (!signals.face_present) {
    if (!gsEyesAbsentSince) {
      gsEyesAbsentSince = now;
      emitGsEyesVisualEvent("user_left_frame", signals.confidence, signals, {
        startedAt: now,
        durationMs: 0,
      });
    }
    gsEyesFacePresentSince = null;
    gsEyesSmileSince = null;
    gsEyesLookDownSince = null;
    return;
  }

  if (!gsEyesFacePresentSince) {
    gsEyesFacePresentSince = now;
    emitGsEyesVisualEvent("user_entered_frame", signals.confidence, signals, {
      startedAt: now,
      durationMs: 0,
    });
  }

  if (gsEyesAbsentSince && now - gsEyesAbsentSince > 3000) {
    emitGsEyesVisualEvent("user_returned", signals.confidence, signals, {
      startedAt: now,
      durationMs: now - gsEyesAbsentSince,
      description: "kk 刚刚回到镜头前",
    });
  }
  gsEyesAbsentSince = null;

  if ((signals.smiling_score || 0) >= 0.55) {
    if (!gsEyesSmileSince) gsEyesSmileSince = now;
    const smileDuration = now - gsEyesSmileSince;
    if (smileDuration >= 650) {
      emitGsEyesVisualEvent("user_smiled", Math.min(0.98, signals.smiling_score || 0.7), signals, {
        startedAt: gsEyesSmileSince,
        durationMs: smileDuration,
        description: "kk 刚刚对着镜头笑了一下",
      });
    }
  } else {
    gsEyesSmileSince = null;
  }

  if (signals.head_down_or_away) {
    if (!gsEyesLookDownSince) gsEyesLookDownSince = now;
    const downDuration = now - gsEyesLookDownSince;
    if (downDuration >= 4000) {
      emitGsEyesVisualEvent("user_looked_down_long", signals.confidence, signals, {
        startedAt: gsEyesLookDownSince,
        durationMs: downDuration,
      });
    }
  } else {
    gsEyesLookDownSince = null;
  }
}

function updateGsEyesStateFromSignals(signals, fps, now) {
  setGsEyesState({
    detector_type: "mediapipe-face",
    detection_ready: gsEyesFaceReady,
    face_present: signals.face_present,
    smiling: signals.smiling,
    smiling_score: signals.smiling_score,
    head_down_or_away: signals.head_down_or_away,
    face_absent_duration: signals.face_present ? 0 : (gsEyesAbsentSince ? now - gsEyesAbsentSince : 0),
    last_detection_at: new Date(now).toISOString(),
    local_fps: fps,
    error_reason: "",
    visual_summary: signals.face_present
      ? (signals.smiling ? "用户在镜头前，刚刚露出笑意。" : (signals.head_down_or_away ? "用户在镜头前，但可能低头或没有看向屏幕。" : "用户在镜头前，状态看起来平静。"))
      : "镜头里暂时没有看到用户。",
  });
}

function runGsEyesMonitorFrame(video, sessionId) {
  if (sessionId !== gsEyesSessionId || !gsEyesFaceReady || !gsEyesFaceLandmarker || !video?.srcObject) return;
  const now = performance.now();
  try {
    const result = gsEyesFaceLandmarker.detectForVideo(video, now);
    const signals = calculateGsEyesFaceSignals(result, video);
    const fps = updateGsEyesLocalFps(now);
    const wallNow = Date.now();
    updateGsEyesEventsFromSignals(signals, wallNow);
    updateGsEyesCooldownDebug();
    updateGsEyesStateFromSignals(signals, fps, wallNow);
  } catch (error) {
    console.warn("[gs-eyes] monitor frame failed", error);
    setGsEyesState({
      detector_type: "mediapipe-face",
      detection_ready: false,
      error_reason: error?.message || "monitor frame failed",
    });
  }
  gsEyesMonitorRaf = requestAnimationFrame(() => runGsEyesMonitorFrame(video, sessionId));
}

async function startGsEyesLocalMonitor(video, sessionId) {
  const ready = await initGsEyesFaceLandmarker();
  if (!ready || sessionId !== gsEyesSessionId) return;
  gsEyesMonitorRaf = requestAnimationFrame(() => runGsEyesMonitorFrame(video, sessionId));
}

function getGsEyesVisionEndpoint() {
  const supabaseUrl = getConfigValue("SUPABASE_URL", "YOUR_SUPABASE_URL");
  return supabaseUrl ? `${supabaseUrl}/functions/v1/vision-analyze` : "";
}

function captureGsEyesFrame(video, { maxSide = 768, quality = 0.68 } = {}) {
  if (!video || !video.srcObject || video.readyState < 2) {
    throw new Error("camera preview is not ready");
  }
  const sourceWidth = video.videoWidth || video.clientWidth;
  const sourceHeight = video.videoHeight || video.clientHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("camera frame has no size");
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(video, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width,
    height,
  };
}

async function analyzeGsEyesSnapshot(video, { force = false, sessionId = gsEyesSessionId } = {}) {
  if (sessionId !== gsEyesSessionId) return;
  if (!gsEyesState.camera_preview_ready || !video?.srcObject) return;
  const now = Date.now();
  if (!force && now - gsEyesLastAnalyzeAt < GS_EYES_SERVER_INTERVAL_MS) return;
  if (gsEyesAnalyzeInFlight) return;
  const endpoint = getGsEyesVisionEndpoint();
  const anonKey = getConfigValue("SUPABASE_ANON_KEY", "YOUR_SUPABASE_ANON_KEY");
  if (!endpoint || !anonKey) {
    setGsEyesState({
      detector_type: gsEyesFaceReady ? "mediapipe-face" : "server-vision",
      detection_ready: gsEyesFaceReady,
      server_snapshot_status: "error",
      error_reason: "vision endpoint is not configured",
      visual_summary: "摄像头预览已开启，但服务端视觉识别未配置。",
    });
    return;
  }

  gsEyesAnalyzeInFlight = true;
  gsEyesLastAnalyzeAt = now;
  setGsEyesState({ server_snapshot_status: "analyzing", error_reason: "" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GS_EYES_SERVER_TIMEOUT_MS);
  try {
    const snapshot = captureGsEyesFrame(video);
    if (sessionId !== gsEyesSessionId) return;
    const headers = await getAuthHeaders();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": headers.Authorization || `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify({
        mode: "camera_snapshot",
        image_base64: snapshot.dataUrl,
        width: snapshot.width,
        height: snapshot.height,
        conversation_id: getActiveConversationId?.() || null,
        user_id: window.currentUserId || null,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`vision_${response.status}: ${text.slice(0, 180)}`);
    }
    const data = await response.json();
    if (sessionId !== gsEyesSessionId) return;
    setGsEyesState({ server_snapshot_status: data?.detection_ready === false ? "error" : "success" });
    updateGsEyesFromServerResult(data);
  } catch (error) {
    if (sessionId !== gsEyesSessionId) return;
    console.warn("[gs-eyes] server vision failed", error);
    const errorReason = error?.name === "AbortError" ? "server vision timeout after 30s" : (error?.message || "server vision failed");
    setGsEyesState({
      detector_type: gsEyesFaceReady ? "mediapipe-face" : "server-vision",
      detection_ready: gsEyesFaceReady,
      face_present: gsEyesFaceReady ? gsEyesState.face_present : null,
      away_returned: gsEyesFaceReady ? gsEyesState.away_returned : null,
      smiling: gsEyesFaceReady ? gsEyesState.smiling : null,
      head_down_or_away: gsEyesFaceReady ? gsEyesState.head_down_or_away : null,
      server_snapshot_status: "error",
      error_reason: errorReason,
      visual_summary: "摄像头预览已开启，但这次视觉识别失败；当前没有新的视觉状态。",
    });
  } finally {
    clearTimeout(timeout);
    gsEyesAnalyzeInFlight = false;
  }
}

function startGsEyesDetection(video) {
  stopGsEyesDetection();
  const sessionId = gsEyesSessionId;
  setGsEyesState({
    detector_type: "mediapipe-face",
    detection_ready: false,
    error_reason: "",
    last_detection_at: null,
    face_present: null,
    away_returned: null,
    smiling: null,
    head_down_or_away: null,
    server_snapshot_status: "idle",
    visual_summary: "cha 正在看见你。",
  });
  startGsEyesLocalMonitor(video, sessionId);
  setTimeout(() => analyzeGsEyesSnapshot(video, { force: true, sessionId }), 1000);
  gsEyesDetectTimer = setInterval(() => analyzeGsEyesSnapshot(video, { sessionId }), GS_EYES_SERVER_INTERVAL_MS);
}

async function openGsEyesOverlay() {
  const overlay = createGsEyesOverlay();
  const video = overlay.querySelector("#gsEyesVideo");
  const message = overlay.querySelector("#gsEyesMessage");
  overlay.classList.add("open");
  setGsEyesState({
    camera_permission: "unknown",
    camera_preview: "idle",
    camera_preview_ready: false,
    detector_type: "none",
    detection_ready: false,
    error_reason: "",
    visual_summary: GS_EYES_DEFAULT_SUMMARY,
  });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unavailable");
    gsEyesStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = gsEyesStream;
    message.textContent = "cha 正在看见你";
    message.hidden = false;
    setGsEyesState({
      camera_active: true,
      camera_permission: "granted",
      camera_preview: "ready",
      camera_preview_ready: true,
      face_present: null,
      face_absent_duration: 0,
      detector_type: "none",
      detection_ready: false,
      last_detection_at: null,
      error_reason: "",
    });
    startGsEyesDetection(video);
    message.textContent = gsEyesState.detection_ready
      ? "cha 正在看见你"
      : "cha 正在看见你";
  } catch (error) {
    console.warn("[gs-eyes] camera unavailable", error);
    message.hidden = false;
    message.textContent = "摄像头没有打开。你可以检查浏览器权限，或稍后再试。";
    setGsEyesState({
      camera_active: false,
      camera_permission: ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name) ? "denied" : "unknown",
      camera_preview: "error",
      camera_preview_ready: false,
      detector_type: "none",
      detection_ready: false,
      face_present: null,
      smiling: null,
      head_down_or_away: null,
      error_reason: error?.message || error?.name || "camera unavailable",
      visual_summary: "摄像头未打开，当前没有可用视觉状态。",
    });
  }
}

window.openGsEyesOverlay = openGsEyesOverlay;

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

// On load: show cached URL immediately, then refresh from stored path (signed URLs expire in 1h)
(async () => {
  const cachedUrl = localStorage.getItem("cha_avatar_url");
  const storedPath = localStorage.getItem("cha_avatar_path");
  if (cachedUrl) applyChaAvatar(cachedUrl);
  if (storedPath && supabaseClient) {
    const freshUrl = await getSignedImageUrl(storedPath).catch(() => null);
    if (freshUrl) {
      localStorage.setItem("cha_avatar_url", freshUrl);
      applyChaAvatar(freshUrl);
    }
  }
})();

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
      if (result.path) {
        // Store path (permanent) + signed URL (1h cache for immediate display)
        localStorage.setItem("cha_avatar_path", result.path);
        if (result.signedUrl) localStorage.setItem("cha_avatar_url", result.signedUrl);
        applyChaAvatar(result.signedUrl || "");
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
  if (pendingImages.length > 0) {
    clearAllImages();
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
    const MAX_BYTES = 1 * 1024 * 1024; // 1 MB output limit
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
        // Reduce quality until compressed size is under 1 MB
        let quality = 0.85;
        let dataUrl;
        do {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          // Approximate decoded byte size from base64 payload length
          const payloadLen = dataUrl.length - dataUrl.indexOf(",") - 1;
          if (payloadLen * 0.75 <= MAX_BYTES) break;
          quality = Math.round((quality - 0.1) * 10) / 10;
        } while (quality >= 0.3);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateAttachmentCard() {
  if (!imagePreviewBar) return;

  if (pendingImages.length === 0) {
    imagePreviewBar.classList.add("hidden");
    const listContainer = document.getElementById("imgPreviewList");
    if (listContainer) listContainer.innerHTML = '';

    // Update composer state for mic/send toggle
    if (window.updateComposerState) {
      window.updateComposerState({ hasImage: false });
    }
    return;
  }

  imagePreviewBar.classList.remove("hidden");

  const listContainer = document.getElementById("imgPreviewList");
  const counter = document.getElementById("imgPreviewCount");

  if (!listContainer) return;

  listContainer.innerHTML = '';

  pendingImages.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'img-preview-item';
    itemEl.dataset.id = item.id;

    if (item.loading) {
      itemEl.innerHTML = `<div class="img-preview-skeleton"></div>`;
    } else if (item.error) {
      itemEl.innerHTML = `
        <div class="img-preview-error" title="${item.error}">
          <span>❌</span>
        </div>
      `;
    } else if (item.dataUrl) {
      itemEl.innerHTML = `
        <img class="img-preview-thumb" src="${item.dataUrl}" alt="预览">
        <button type="button" class="img-preview-remove" data-id="${item.id}" aria-label="删除">✕</button>
      `;
    }

    listContainer.appendChild(itemEl);
  });

  // 绑定删除按钮事件
  listContainer.querySelectorAll('.img-preview-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      removeImage(id);
    });
  });

  // 更新计数
  if (counter) {
    counter.textContent = pendingImages.length;
  }

  // Update composer state for mic/send toggle
  const hasValidImages = pendingImages.some(img => img.dataUrl && !img.error);
  if (window.updateComposerState) {
    window.updateComposerState({ hasImage: hasValidImages });
  }
}

function removeImage(id) {
  pendingImages = pendingImages.filter(img => img.id !== id);
  updateAttachmentCard();
}

function clearAllImages() {
  pendingImages = [];
  updateAttachmentCard();
  if (imageInput) imageInput.value = "";
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function handleImageFile(file) {
  if (!file) return;
  // Block image attachment while in edit mode
  if (composerEditMode === "edit") return;

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    // Show error notification but don't add to pending
    if (window.showToast) {
      window.showToast(`文件 ${file.name} 格式不支持`, 'error');
    }
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    if (window.showToast) {
      window.showToast(`文件 ${file.name} 超过 20MB 限制`, 'error');
    }
    return;
  }

  // Limit to 9 images maximum
  if (pendingImages.length >= 9) {
    if (window.showToast) {
      window.showToast('最多只能选择 9 张图片', 'warning');
    }
    return;
  }

  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const imageItem = { id, dataUrl: null, loading: true, error: null, file };
  pendingImages.push(imageItem);
  updateAttachmentCard();

  try {
    const dataUrl = await compressImage(file);
    const item = pendingImages.find(img => img.id === id);
    if (item) {
      item.dataUrl = dataUrl;
      item.loading = false;
      updateAttachmentCard();
    }
  } catch (err) {
    const item = pendingImages.find(img => img.id === id);
    if (item) {
      item.error = `压缩失败`;
      item.loading = false;
      updateAttachmentCard();
    }
  }
}

// Handle multiple files
function handleMultipleImageFiles(files) {
  if (!files || files.length === 0) return;
  const fileArray = Array.from(files);

  // Check total count
  const remainingSlots = 9 - pendingImages.length;
  if (fileArray.length > remainingSlots) {
    if (window.showToast) {
      window.showToast(`只能再添加 ${remainingSlots} 张图片（最多 9 张）`, 'warning');
    }
  }

  // Process up to remaining slots
  fileArray.slice(0, remainingSlots).forEach(file => handleImageFile(file));
}

function showLightbox(src, allImages = null, currentIndex = 0) {
  let currentIdx = currentIndex;

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

  // Navigation controls (only if multiple images)
  let prevBtn, nextBtn, positionCounter;

  const updateImage = () => {
    if (!allImages || !allImages.length) return;
    img.src = allImages[currentIdx];
    if (positionCounter) {
      positionCounter.textContent = `${currentIdx + 1} / ${allImages.length}`;
    }
    if (prevBtn) prevBtn.disabled = currentIdx === 0;
    if (nextBtn) nextBtn.disabled = currentIdx === allImages.length - 1;
  };

  if (allImages && allImages.length > 1) {
    prevBtn = document.createElement("button");
    prevBtn.className = "lightbox-nav lightbox-prev";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "上一张");
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentIdx > 0) {
        currentIdx--;
        updateImage();
      }
    });

    nextBtn = document.createElement("button");
    nextBtn.className = "lightbox-nav lightbox-next";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "下一张");
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentIdx < allImages.length - 1) {
        currentIdx++;
        updateImage();
      }
    });

    positionCounter = document.createElement("div");
    positionCounter.className = "lightbox-counter";
    positionCounter.textContent = `${currentIdx + 1} / ${allImages.length}`;

    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    overlay.appendChild(positionCounter);

    updateImage();
  }

  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const onKey = (e) => {
    if (e.key === "Escape") {
      close();
    } else if (allImages && allImages.length > 1) {
      if (e.key === "ArrowLeft" && currentIdx > 0) {
        currentIdx--;
        updateImage();
      } else if (e.key === "ArrowRight" && currentIdx < allImages.length - 1) {
        currentIdx++;
        updateImage();
      }
    }
  };

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
  albumInput.multiple = true; // Enable multiple selection
  albumInput.style.display = "none";
  albumInput.addEventListener("change", () => {
    const files = albumInput.files;
    if (files && files.length > 0) {
      handleMultipleImageFiles(files);
    }
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
  const files = imageInput.files;
  imageInput.value = "";
  if (files && files.length > 0) {
    handleMultipleImageFiles(files);
  }
});

// Remove old single-image remove button (no longer in HTML)
// Keep for backward compatibility if needed
document.getElementById("imgPreviewRemove")?.addEventListener("click", () => {
  clearAllImages();
});

document.getElementById("imgPreviewRetry")?.addEventListener("click", () => {
  // Retry is now handled per-image in the new multi-image UI
  // This is kept for backward compatibility but won't be used
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

  // Capture previous content for history
  const previousContent = chatMessages[idx].content;
  const previousEditHistory = chatMessages[idx].edit_history || [];
  const previousEditCount = chatMessages[idx].edit_count || 0;

  // Build new edit history entry
  const newHistoryEntry = {
    edited_at: new Date().toISOString(),
    previous_content: previousContent
  };

  const newEditHistory = [...previousEditHistory, newHistoryEntry];
  const newEditCount = previousEditCount + 1;

  const { error: updateError } = await supabaseClient
    .from("messages")
    .update({
      content: newText,
      edited: true,
      edited_at: new Date().toISOString(),
      edit_count: newEditCount,
      edit_history: newEditHistory
    })
    .eq("id", msgId);

  if (updateError) {
    console.error("编辑消息失败：", updateError);
    setChatStatus(`编辑失败：${updateError.message}`);
    setTimeout(() => setChatStatus(""), 3000);
    return; // keep edit mode so user can retry
  }

  chatMessages[idx].content = newText;
  chatMessages[idx].edited = true;
  chatMessages[idx].edited_at = new Date().toISOString();
  chatMessages[idx].edit_count = newEditCount;
  chatMessages[idx].edit_history = newEditHistory;

  // Invalidate old render cache before re-rendering with new content
  invalidateRenderCache(msgId);

  const messageEl = row.querySelector(".message");
  setMessageContent(messageEl, newText, { messageId: String(msgId) });

  // 添加"已编辑"标记（可点击查看历史）
  let editedLabel = messageEl.querySelector(".edited-label");
  if (!editedLabel) {
    editedLabel = document.createElement("span");
    editedLabel.className = "edited-label";
    editedLabel.style.cssText = "color: var(--text-muted); font-size: 11px; margin-left: 6px; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;";
    editedLabel.textContent = `(已编辑 ${newEditCount > 1 ? newEditCount + '次' : ''})`.trim();
    editedLabel.title = "点击查看编辑历史";
    editedLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditHistory(msgId, chatMessages[idx]);
    });
    messageEl.appendChild(editedLabel);
  } else {
    editedLabel.textContent = `(已编辑 ${newEditCount > 1 ? newEditCount + '次' : ''})`.trim();
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

// ── Edit History Viewer ──────────────────────────────────────────────────────

function addEditIndicatorToMessage(msgId, editCount) {
  // Find the message row
  const row = messageList.querySelector(`[data-msg-id="${msgId}"]`);
  if (!row) return;

  const messageEl = row.querySelector('.message');
  if (!messageEl) return;

  // Don't add if already exists
  if (messageEl.querySelector('.edited-label')) return;

  // Get the full message data
  const msg = chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  const editedLabel = document.createElement('span');
  editedLabel.className = 'edited-label';
  editedLabel.style.cssText = 'color: var(--text-muted); font-size: 11px; margin-left: 6px; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;';
  editedLabel.textContent = `(已编辑 ${editCount > 1 ? editCount + '次' : ''})`.trim();
  editedLabel.title = '点击查看编辑历史';
  editedLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    showEditHistory(msgId, msg);
  });
  messageEl.appendChild(editedLabel);
}

function showEditHistory(msgId, msg) {
  if (!msg || !msg.edit_history || msg.edit_history.length === 0) {
    if (typeof showToast === 'function') {
      showToast('暂无编辑历史');
    }
    return;
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'edit-history-overlay';
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
    padding: 20px;
  `;

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'edit-history-modal';
  modal.style.cssText = `
    background: var(--bg);
    border-radius: 16px;
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
  `;

  const title = document.createElement('h2');
  title.textContent = '编辑历史';
  title.style.cssText = 'margin: 0; font-size: 18px; color: var(--text);';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.2s;
  `;
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'var(--surface)');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'none');
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `;

  // Current version
  const currentVersion = document.createElement('div');
  currentVersion.className = 'edit-history-item';
  currentVersion.style.cssText = `
    margin-bottom: 20px;
    padding: 14px;
    background: var(--surface);
    border: 2px solid var(--accent-primary);
    border-radius: 12px;
  `;

  const currentHeader = document.createElement('div');
  currentHeader.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  `;

  const currentLabel = document.createElement('div');
  currentLabel.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const currentBadge = document.createElement('span');
  currentBadge.textContent = '当前版本';
  currentBadge.style.cssText = `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(91, 159, 245, 0.12);
    color: var(--accent-primary);
  `;

  const currentTime = document.createElement('span');
  currentTime.textContent = msg.edited_at ? formatMessageDate(msg.edited_at) : '最新';
  currentTime.style.cssText = 'font-size: 12px; color: var(--text-muted);';

  currentLabel.appendChild(currentBadge);
  currentLabel.appendChild(currentTime);
  currentHeader.appendChild(currentLabel);

  const currentText = document.createElement('div');
  currentText.style.cssText = `
    font-size: 14px;
    line-height: 1.6;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  `;
  currentText.textContent = extractTextFromMessageContent(msg.content);

  currentVersion.appendChild(currentHeader);
  currentVersion.appendChild(currentText);
  content.appendChild(currentVersion);

  // Previous versions (reverse order - newest first)
  const history = [...msg.edit_history].reverse();
  history.forEach((entry, idx) => {
    const versionNum = history.length - idx;
    const item = document.createElement('div');
    item.className = 'edit-history-item';
    item.style.cssText = `
      margin-bottom: 12px;
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    `;

    const itemHeader = document.createElement('div');
    itemHeader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    `;

    const versionLabel = document.createElement('span');
    versionLabel.textContent = `版本 ${versionNum}`;
    versionLabel.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--text);';

    const timestamp = document.createElement('span');
    timestamp.textContent = formatMessageDate(entry.edited_at);
    timestamp.style.cssText = 'font-size: 12px; color: var(--text-muted);';

    itemHeader.appendChild(versionLabel);
    itemHeader.appendChild(timestamp);

    const itemText = document.createElement('div');
    itemText.style.cssText = `
      font-size: 14px;
      line-height: 1.6;
      color: var(--text);
      opacity: 0.75;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    itemText.textContent = extractTextFromMessageContent(entry.previous_content);

    item.appendChild(itemHeader);
    item.appendChild(itemText);
    content.appendChild(item);
  });

  // Assemble
  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // ── G's Eyes: reset silence timer ──────────────────────────────────────────
  if (window.GsEyes?.onUserSpeak) {
    window.GsEyes.onUserSpeak();
  }

  // ── Edit mode: save the edited message ──────────────────────────────────────
  if (composerEditMode === "edit") {
    const newText = messageInput.value.trim();
    if (!newText) return; // prevent saving empty message
    await saveEditedMessage(newText);
    return;
  }

  const text = messageInput.value.trim();
  const validImages = pendingImages.filter(img => img.dataUrl && !img.error);
  const hasValidImages = validImages.length > 0;
  const isLoadingImages = pendingImages.some(img => img.loading);

  if ((!text && !hasValidImages) || isLoadingImages) return;
  if (isReplying) {
    setChatStatus("Cha 正在回复，等他说完再发～");
    setTimeout(() => setChatStatus(""), 2000);
    return;
  }

  // ── Image Intent Detection ──────────────────────────────────────────────
  // Check if user wants to generate an image (only for text-only messages)
  console.log('[image-policy] Module loaded:', !!window.SavePrincessImagePolicy);
  console.log('[image-policy] User text:', text);

  if (text && !hasValidImages && window.SavePrincessImagePolicy) {
    const imageIntent = window.SavePrincessImagePolicy.detectImageIntent(text);
    console.log('[image-policy] Detection result:', imageIntent);

    if (imageIntent.should_generate) {
      console.log('[image-generation] Intent detected! Intercepting normal chat flow');
      console.log('[image-generation] Route:', imageIntent.route, 'Face policy:', imageIntent.face_policy);

      // Clear input and handle image generation directly
      messageInput.value = "";
      autoResizeTextarea(messageInput);

      // Reset composer state
      if (window.updateComposerState) {
        window.updateComposerState({
          hasText: false,
          hasImage: false,
          hasQuote: false,
          hasAttachment: false
        });
      }

      // Generate image and skip normal chat flow
      await handleImageGeneration(imageIntent, text);
      return;
    } else {
      console.log('[image-policy] No image intent detected, proceeding with normal chat');
    }
  } else if (!window.SavePrincessImagePolicy) {
    console.warn('[image-policy] SavePrincessImagePolicy module not loaded!');
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

  // Snapshot all valid images
  const imageSnapshots = validImages.map(img => ({ dataUrl: img.dataUrl }));

  // Clear pending images
  clearAllImages();

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
  if (imageSnapshots.length > 0) {
    content = [];
    if (text) content.push({ type: "text", text });
    imageSnapshots.forEach(snapshot => {
      content.push({ type: "image_url", image_url: { url: snapshot.dataUrl, detail: "low" } });
    });
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
  const dbContent = imageSnapshots.length > 0
    ? (text ? `[图片${imageSnapshots.length > 1 ? `×${imageSnapshots.length}` : ''}] ${text}` : `[图片${imageSnapshots.length > 1 ? `×${imageSnapshots.length}` : ''}]`)
    : text;
  chatMessages.push({ role: "user", content, created_at: now, id: null, read_by_cha_at: null, read_by_user_at: null, replyTo });
  refreshMessageActions();
  if (isFirst) updateConvTitle(getActiveConversationId(), text || `[图片${imageSnapshots.length > 1 ? `×${imageSnapshots.length}` : ''}]`);

  // 后台保存：有图时先上传 Storage，拿到 path 后再写 DB
  (async () => {
    let storagePath = null;
    if (imageSnapshots.length > 0) {
      const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
      const uid = user?.id || window.currentUserId;

      // Upload all images
      const uploadResults = [];
      for (const snapshot of imageSnapshots) {
        const uploadResult = await uploadImageToStorage(snapshot.dataUrl, uid, getActiveConversationId());
        if (uploadResult === null) {
          setChatStatus("图片上传失败，消息未发送，请重试");
          // 回滚乐观渲染，清理 temp render cache
          chatMessages.pop();
          getMsgRows().forEach(r => r.remove());
          invalidateRenderCache(tempId);
          // Restore reply state so the user doesn't lose their reply context
          if (replyId) setReplyDraft(replyId, replyPreview, replyRole);
          return;
        }
        uploadResults.push(uploadResult);
      }

      // For single image, use the old path format for backward compatibility
      if (uploadResults.length === 1) {
        storagePath = uploadResults[0].path;
      } else {
        // For multiple images, store as JSON array
        storagePath = JSON.stringify(uploadResults.map(r => r.path));
      }

      // Replace base64 in chatMessages with the signed URLs
      const entry = chatMessages.findLast?.(m => m.role === "user" && m.id === null);
      if (entry && Array.isArray(entry.content)) {
        let imageIndex = 0;
        entry.content = entry.content.map(part => {
          if (part.type === "image_url" && uploadResults[imageIndex]) {
            const result = { ...part, image_url: { ...part.image_url, url: uploadResults[imageIndex].signedUrl } };
            imageIndex++;
            return result;
          }
          return part;
        });
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

// ── Send Voice Message ───────────────────────────────────────────────────────
async function sendVoiceMessage(transcribedText, audioType = "fake", duration = 0) {
  // Stop TTS playback
  if (window.SPVoice) window.SPVoice.stopSpeaking();
  if (window.SPVoiceMessage) window.SPVoiceMessage.stopVoicePlayback();

  if (isReplying) {
    setChatStatus("Cha 正在回复，等他说完再发～");
    setTimeout(() => setChatStatus(""), 2000);
    return;
  }

  const now = new Date().toISOString();
  const isFirst = chatMessages.length === 0;

  // For "fake" voice, we generate TTS audio using the transcribed text
  // The audio will be generated on-demand during playback
  // For now, we store the transcribed text and mark it as "fake"
  const content = transcribedText;
  const numericDuration = Number(duration);
  const voiceDuration = Number.isFinite(numericDuration) && numericDuration > 0
    ? Math.ceil(numericDuration)
    : Math.max(1, Math.ceil((transcribedText || "").length / 6));

  // Optimistic update: render voice message immediately
  const tempId = `tmp-voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Create voice message bubble
  const voiceBubble = window.SPVoiceMessage.createVoiceMessageBubble({
    audioUrl: "", // Will be generated on-demand via TTS
    duration: voiceDuration,
    audioType: audioType,
    transcribedText: transcribedText,
    role: "user",
    msgId: tempId
  });

  // Add to message list
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.dataset.tempId = tempId;

  const stack = document.createElement("div");
  stack.className = "msg-stack";
  stack.appendChild(voiceBubble);

  row.appendChild(stack);

  maybeAddTimeSeparator(now);
  messageList.appendChild(row);
  messageList.scrollTop = messageList.scrollHeight;

  // Add to chatMessages
  chatMessages.push({
    role: "user",
    content: content,
    type: "voice",
    created_at: now,
    id: null,
    audio_type: audioType,
    audio_type_explicit: true,
    audio_transcribed_text: transcribedText,
    audio_url: null,
    audio_duration: voiceDuration,
  });

  refreshMessageActions();
  if (isFirst) updateConvTitle(getActiveConversationId(), "[语音消息]");

  // Save to database
  (async () => {
    const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));
    const uid = user?.id || window.currentUserId;
    const convId = getActiveConversationId();

    const { data, error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: convId,
        user_id: uid,
        role: "user",
        content: content,
        type: "voice",
        audio_type: audioType,
        audio_type_explicit: true,
        audio_transcribed_text: transcribedText,
        audio_url: null,
        audio_duration: voiceDuration,
      })
      .select()
      .single();

    if (error) {
      console.error("Save voice message error:", error);
      showToast("语音消息保存失败");
      return;
    }

    const msgId = data?.id;
    if (msgId) {
      // Update temp row with real ID
      const tempRow = messageList.querySelector(`[data-temp-id="${tempId}"]`);
      if (tempRow) {
        delete tempRow.dataset.tempId;
        tempRow.dataset.msgId = String(msgId);
        const voiceEl = tempRow.querySelector(".message-voice");
        if (voiceEl) voiceEl.dataset.msgId = String(msgId);
      }

      // Update chatMessages
      const entry = chatMessages.findLast?.((m) => m.role === "user" && m.id === null);
      if (entry) entry.id = String(msgId);

      if (autoReplyEnabled) scheduleAutoReply("[语音消息]");
    }
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

  // ── G's Eyes Status Monitor ──────────────────────────────────────────────────
  // Update Video Call status display in chat more panel every 2 seconds
  setInterval(() => {
    const valSpan = document.getElementById("cmsVideoCallVal");
    if (valSpan && window.VideoCall) {
      const isActive = window.VideoCall.isActive();
      valSpan.textContent = isActive ? "运行中" : "已关闭";
    }
  }, 2000);
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
      label: "视频聊天",
      desc: "语音+视频交互",
      icon: '<span>◉</span>',
      onClick: async () => {
        closePanel();
        setTimeout(async () => {
          if (window.VideoCall && typeof window.VideoCall.start === "function") {
            await window.VideoCall.start();
          } else {
            console.error("[app] VideoCall module not available");
            showDialog({
              title: "视频聊天不可用",
              body: "VideoCall 模块未加载",
              confirmLabel: "知道了",
            });
          }
        }, 300);
      },
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
      label: "戳一下",
      desc: "让 Cha 接话",
      icon: '<img src="assets/icons/chat/poke.svg" alt="">',
      disabled: isReplying || !chatMessages.length,
      onClick: () => triggerReply("forced"),
    });
    panel.appendChild(actions);

    // Game shortcuts intentionally live in Game Center, not the chat “+” panel.

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

// Voice input button handler - opens voice input dialog
if (voiceInputBtn) {
  voiceInputBtn.addEventListener("click", async () => {
    if (!window.SPVoiceMessage) {
      alert("语音消息模块未加载");
      return;
    }

    try {
      const result = await window.SPVoiceMessage.showVoiceInputDialog();
      // result: { text: string, audioType: "fake", duration: number }

      // Send as voice message
      await sendVoiceMessage(result.text, result.audioType, result.duration);
    } catch (err) {
      // User cancelled or error
      console.log("Voice input cancelled or failed:", err);
    }
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

// ── 全局禁用原生长按菜单 ──────────────────────────────────────────────────
// 禁用所有区域的原生 contextmenu（包括 chat、bar、其他界面）
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
}, { capture: true });

// ── Game Status Updates ────────────────────────────────────────────────────

async function updateGameStatus() {
  if (!window.supabaseClient || !window.currentUserId) return;

  try {
    // Query active game session
    const { data: sessions, error } = await window.supabaseClient
      .from("game_sessions")
      .select("*")
      .eq("user_id", window.currentUserId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[game-status] Query error:", error);
      return;
    }

    const rawSession = sessions && sessions.length > 0 ? sessions[0] : null;
    const displayName = rawSession
      ? (rawSession.game_display_name || rawSession.game_name || rawSession.game || rawSession.game_type || "")
      : "";
    const session = rawSession && displayName ? rawSession : null;
    if (rawSession && !displayName) {
      console.warn("[game-status] Ignoring active session without a game name", {
        sessionId: rawSession.id || null,
      });
    }

    // Update Home page card
    const homeCard = document.getElementById("gameStatusCard");
    if (homeCard) {
      if (session) {
        homeCard.classList.remove("hidden");
        const gameStatusText = document.getElementById("gameStatusText");
        const gameStatusTime = document.getElementById("gameStatusTime");
        
        if (gameStatusText) {
          const actionCount = session.action_count || 0;
          gameStatusText.textContent = `正在玩${displayName}，已经进行了 ${actionCount} 步`;
        }
        
        if (gameStatusTime) {
          const duration = Date.now() - new Date(session.started_at).getTime();
          gameStatusTime.textContent = formatDuration(duration);
        }
      } else {
        homeCard.classList.add("hidden");
      }
    }

    // Update Chat page status bar
    const chatStatus = document.getElementById("chaGameStatus");
    if (chatStatus) {
      if (session) {
        chatStatus.classList.remove("hidden");
        const chatStatusText = document.getElementById("chaGameStatusText");
        
        if (chatStatusText) {
          chatStatusText.textContent = `正在玩${displayName}...`;
        }
      } else {
        chatStatus.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("[game-status] Update error:", err);
  }
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
}

// Update game status periodically
setInterval(updateGameStatus, 30000); // Every 30 seconds

// Update on page visibility change
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateGameStatus();
  }
});

// Initial update
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateGameStatus);
} else {
  updateGameStatus();
}
