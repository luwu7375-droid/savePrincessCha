// ============================================================================
// Settings Manager Module - Settings Subpage System
// ============================================================================
// Extracted from app.js lines 5122-6182
// Handles settings navigation, subpage rendering, and configuration UI

(function() {
  "use strict";

// ── Settings subpage system ─────────────────────────────────────────────────

var _currentSettingsSubpage = null;

var SETTINGS_SUBPAGE_META = {
  "appearance-resources": { title: "外观与资源",       subtitle: "头像、壁纸、开屏图与表情包来源" },
  "prompt-worldbook":     { title: "Prompt 与世界书",  subtitle: "提示词、世界书与注入规则" },
  worldbook:              { title: "世界书管理",        subtitle: "上传后手动启用才会注入 Prompt" },
  memory:                 { title: "记忆管理",          subtitle: "查看、禁用与清理记忆" },
  api:                    { title: "API 设置",          subtitle: "模型、接口与连接状态" },
  backup:                 { title: "备份与导入",        subtitle: "导出、恢复与记忆书上传" },
  debug:                  { title: "Debug",             subtitle: "日志、版本与诊断工具" },
  // legacy aliases — keep so any existing deep-links don't break
  beautify: { title: "外观与资源",      subtitle: "头像、壁纸、开屏图与表情包来源" },
  prompt:   { title: "Prompt 与世界书", subtitle: "提示词、世界书与注入规则" },
  emoji:    { title: "外观与资源",      subtitle: "头像、壁纸、开屏图与表情包来源" },
  chat:     { title: "聊天外观",        subtitle: "背景与气泡主题" },
};

function openSettingsSubpage(type) {
  const subpage = document.getElementById("settingsSubpage");
  const mainView = document.getElementById("settingsMainView");
  const titleEl = document.getElementById("settingsSubpageTitle");
  const subtitleEl = document.getElementById("settingsSubpageSubtitle");
  const bodyEl = document.getElementById("settingsSubpageBody");
  if (!subpage || !mainView || !titleEl || !subtitleEl || !bodyEl) return;

  // If leaving worldbook subpage, move content back to the hidden store first
  if (_currentSettingsSubpage === "worldbook") {
    const mount = document.getElementById("wbSubpageMount");
    const store = document.getElementById("wbContentStore");
    if (mount && store) {
      while (mount.firstChild) {
        store.appendChild(mount.firstChild);
      }
    }
    wbResetUploadForm();
  }

  const meta = SETTINGS_SUBPAGE_META[type] || { title: type, subtitle: "" };
  titleEl.textContent = meta.title;
  subtitleEl.textContent = meta.subtitle;
  bodyEl.innerHTML = renderSettingsSubpage(type);

  _currentSettingsSubpage = type;
  mainView.hidden = true;
  subpage.hidden = false;

  // Bind subpage-specific events after render
  _initSettingsSubpageEvents(bodyEl, type);
}

function closeSettingsSubpage() {
  const subpage = document.getElementById("settingsSubpage");
  const mainView = document.getElementById("settingsMainView");
  if (!subpage || !mainView) return;

  // If leaving worldbook subpage, move content back to the hidden store
  if (_currentSettingsSubpage === "worldbook") {
    const mount = document.getElementById("wbSubpageMount");
    const store = document.getElementById("wbContentStore");
    if (mount && store) {
      while (mount.firstChild) {
        store.appendChild(mount.firstChild);
      }
    }
    wbResetUploadForm();
  }

  subpage.hidden = true;
  mainView.hidden = false;
  _currentSettingsSubpage = null;
}

function renderSettingsSubpage(type) {
  switch (type) {
    case "appearance-resources":
    case "beautify":
    case "emoji":
      return _renderAppearanceResourcesSubpage();
    case "prompt-worldbook":
    case "prompt":
      return _renderPromptWorldbookSubpage();
    case "worldbook":
      return _renderWorldbookSubpage();
    case "memory":
      return _renderMemorySubpage();
    case "voice":
      return _renderVoiceSubpage();
    case "api":
      return _renderApiSubpage();
    case "backup":
      return _renderBackupSubpage();
    case "debug":
      return _renderDebugSubpage();
    case "chat":
      return _renderChatAppearanceSubpage();
    default:
      return `<div class="settings-empty-state"><strong>${type}</strong><p>此页面尚未实现。</p></div>`;
  }
}

function _renderApiSubpage() {
  // Sync custom providers from localStorage into window.PROVIDER_GROUPS
  if (!window.PROVIDER_GROUPS) window.PROVIDER_GROUPS = {};
  const _cpData = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  Object.entries(_cpData).forEach(([pid, p]) => {
    window.PROVIDER_GROUPS[pid] = window.PROVIDER_GROUPS[pid] || { name: p.name, endpoint: p.endpoint, models: p.models, description: p.description || '自定义配置', requiresAuth: true };
  });
  const PROVIDER_GROUPS = window.PROVIDER_GROUPS;

  const mapping = getModelRoleMapping();

  // Build provider status section - all providers show edit button now
  let providerStatusHtml = '<div class="settings-section"><div class="settings-section-label">通道管理</div><div class="settings-card">';

  if (Object.keys(PROVIDER_GROUPS).length === 0) {
    providerStatusHtml += `
      <div class="settings-card-row">
        <div style="text-align:center;color:var(--text-muted);padding:20px 0;">
          <p style="margin:0 0 8px;">暂无配置的通道</p>
          <small>点击下方按钮添加第一个通道</small>
        </div>
      </div>`;
  } else {
    Object.entries(PROVIDER_GROUPS).forEach(([groupId, group]) => {
      providerStatusHtml += `
        <div class="settings-card-row">
          <div><strong>${group.name}</strong><small>${group.description || '自定义通道'}</small></div>
          <button type="button" class="settings-row-action-btn settings-row-action-btn--sm" data-edit-provider="${groupId}">编辑</button>
        </div>`;
    });
  }

  providerStatusHtml += `
    <div class="settings-card-row">
      <button type="button" class="settings-row-action-btn" id="addCustomProviderBtn">+ 添加通道</button>
    </div>
  </div></div>`;

  // Build model role mapping section
  let rolesMappingHtml = '<div class="settings-section"><div class="settings-section-label">用途模型</div><div class="settings-card">';

  Object.entries(MODEL_ROLES).forEach(([roleId, role]) => {
    const currentMapping = mapping[roleId];

    // Only show current mapping if the provider still exists
    const hasValidProvider = currentMapping?.providerGroup && PROVIDER_GROUPS[currentMapping.providerGroup];
    const providerLabel = hasValidProvider ?
      PROVIDER_GROUPS[currentMapping.providerGroup].name :
      "未选择";
    const modelLabel = hasValidProvider ? (currentMapping.model || "未选择") : "未选择";

    rolesMappingHtml += `
      <div class="settings-card-row">
        <div><strong>${role.label}</strong><small>${role.description}</small></div>
        <span class="settings-row-value settings-row-value--compact">${providerLabel} · ${modelLabel}</span>
      </div>
      <div class="settings-card-row settings-card-row--selects">
        <select class="settings-select" data-role="${roleId}" data-type="provider">
          <option value="">选择通道</option>
          ${Object.entries(PROVIDER_GROUPS).map(([gid, g]) =>
            `<option value="${gid}"${hasValidProvider && currentMapping.providerGroup === gid ? ' selected' : ''}>${g.name}</option>`
          ).join('')}
        </select>
        <select class="settings-select" data-role="${roleId}" data-type="model" ${!hasValidProvider ? 'disabled' : ''}>
          <option value="">选择模型</option>
          ${hasValidProvider && PROVIDER_GROUPS[currentMapping.providerGroup]?.models ?
            PROVIDER_GROUPS[currentMapping.providerGroup].models.map(m =>
              `<option value="${m}"${currentMapping?.model === m ? ' selected' : ''}>${m}</option>`
            ).join('') :
            ''}
        </select>
      </div>`;
  });

  rolesMappingHtml += '</div></div>';

  // Build actions section with test results area
  const actionsHtml = `
    <div class="settings-section">
      <div class="settings-card">
        <div class="settings-card-row">
          <button type="button" class="settings-row-action-btn" id="saveModelRoleMappingBtn">保存设置</button>
        </div>
        <div class="settings-card-row">
          <button type="button" class="settings-row-action-btn" id="testModelRoleMappingBtn">测试当前配置</button>
        </div>
      </div>
    </div>
    <div class="settings-section" id="testResultsSection" style="display:none;">
      <div class="settings-section-label">测试结果</div>
      <div id="testResultsContainer"></div>
    </div>`;

  return providerStatusHtml + rolesMappingHtml + actionsHtml;
}

function _renderBackupSubpage() {
  return `
    <div class="settings-section">
      <div class="settings-section-label">导出</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>导出全部数据</strong><small>聊天记录、记忆、设置</small></div>
          <span class="settings-row-value">占位</span>
        </div>
        <div class="settings-card-row">
          <div><strong>导出聊天记录</strong><small>仅当前会话</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">导入</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>从备份恢复</strong><small>覆盖当前数据</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>`;
}

function _renderAppearanceResourcesSubpage() {
  return `
    <div class="settings-section">
      <div class="settings-section-label">头像与封面</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>Cha 头像</strong><small>聊天页与首页头像</small></div>
          <button type="button" class="settings-row-action-btn" id="srChaAvatarBtn">更换</button>
        </div>
        <div class="settings-card-row">
          <div><strong>开屏封面</strong><small>首页顶部横幅图</small></div>
          <button type="button" class="settings-row-action-btn" id="srCoverBtn">更换</button>
        </div>
        <div class="settings-card-row">
          <div><strong>开屏壁纸</strong><small>下次启动时生效</small></div>
          <button type="button" class="settings-row-action-btn" id="srSplashBtn">更换</button>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">壁纸与气泡</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>聊天背景</strong><small>自定义聊天页壁纸</small></div>
          <span class="settings-row-value" id="srChatBgVal">默认</span>
        </div>
        <div class="settings-card-row">
          <div><strong>气泡主题</strong><small>消息气泡样式</small></div>
          <span class="settings-row-value" id="srBubbleVal">默认</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">表情包来源</div>
      <div class="settings-card">
        <div class="settings-card-row" id="srEmojiPackRow">
          <div><strong>自定义来源</strong><small>管理表情包注册表</small></div>
          <span class="settings-row-value">›</span>
        </div>
        <div class="settings-card-row">
          <div><strong>清理缓存</strong><small>释放表情包本地存储</small></div>
          <button type="button" class="settings-row-action-btn" id="srEmojiCacheBtn">清理</button>
        </div>
      </div>
    </div>`;
}

function _renderPromptWorldbookSubpage() {
  return `
    <div class="settings-section">
      <div class="settings-section-label">场景 Prompt</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>主聊天</strong><small>日常对话提示词</small></div>
          <span class="settings-row-value">›</span>
        </div>
        <div class="settings-card-row">
          <div><strong>日记</strong><small>Cha 的日记写作提示词</small></div>
          <span class="settings-row-value">›</span>
        </div>
        <div class="settings-card-row">
          <div><strong>毛象</strong><small>Mastodon 发帖风格提示词</small></div>
          <span class="settings-row-value">›</span>
        </div>
        <div class="settings-card-row">
          <div><strong>游戏</strong><small>Playground 游戏模式提示词</small></div>
          <span class="settings-row-value">›</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">世界书</div>
      <div class="settings-card">
        <div class="settings-card-row" id="promptWbOpenRow" style="cursor:pointer">
          <div><strong>世界书管理</strong><small>上传并启用知识库与设定注入</small></div>
          <span class="settings-row-value">›</span>
        </div>
      </div>
    </div>`;
}

function _renderChatAppearanceSubpage() {
  const bgVal = localStorage.getItem("ui_custom_chat_background") ? "已自定义" : "默认";
  const bubbleVal = localStorage.getItem("ui_chat_bubble_theme") || "默认";
  return `
    <div class="settings-section">
      <div class="settings-section-label">背景与气泡</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>聊天背景</strong><small>自定义聊天页壁纸</small></div>
          <span class="settings-row-value">${bgVal}</span>
        </div>
        <div class="settings-card-row">
          <div><strong>气泡主题</strong><small>消息气泡外观</small></div>
          <span class="settings-row-value">${bubbleVal}</span>
        </div>
        <div class="settings-card-row">
          <div><strong>恢复默认</strong><small>清除所有外观自定义</small></div>
          <button type="button" class="settings-row-action-btn" id="srChatAppearanceResetBtn">恢复</button>
        </div>
      </div>
    </div>`;
}

function _renderVoiceSubpage() {
  const cfg = window.SPVoice ? window.SPVoice.getTTSConfig() : { provider: "system", model_id: "eleven_v3", profiles: {} };
  const engine = cfg.provider || "system";
  const modelId = cfg.model_id || "eleven_v3";
  const rate = window.SPVoice ? window.SPVoice.getTTSRate() : 1.0;
  const volume = window.SPVoice ? window.SPVoice.getTTSVolume() : 1.0;
  const ttsSupported = window.SPVoice ? window.SPVoice.isTTSSupported() : false;
  const profiles = cfg.profiles || {};

  function profileRow(lang, label, hint) {
    const voiceId = (profiles[lang] || {}).voice_id || "";
    return `
      <div class="settings-card-row">
        <div><strong>${label}</strong><small>${hint}</small></div>
        <input type="text" class="settings-text-input voice-profile-voice-id" data-lang="${lang}"
          placeholder="voice_id" value="${voiceId}" autocomplete="off" spellcheck="false">
      </div>`;
  }

  return `
    <div class="settings-section">
      <div class="settings-section-label">朗读引擎</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>引擎</strong><small>选择 TTS 服务</small></div>
          <select id="voiceTTSEngine" class="settings-select">
            <option value="system" ${engine === "system" ? "selected" : ""}>系统语音</option>
            <option value="elevenlabs" ${engine === "elevenlabs" ? "selected" : ""}>ElevenLabs</option>
            <option value="minimax" ${engine === "minimax" ? "selected" : ""}>MiniMax</option>
            <option value="local_http" ${engine === "local_http" ? "selected" : ""}>本地 HTTP</option>
          </select>
        </div>
        <div class="settings-card-row">
          <div><strong>模型</strong><small>ElevenLabs model_id</small></div>
          <input type="text" class="settings-text-input" id="voiceTTSModelId"
            placeholder="eleven_v3" value="${modelId}" autocomplete="off" spellcheck="false"
            style="max-width:14em">
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">声音配置</div>
      <div class="settings-card" id="voiceProfilesCard">
        ${profileRow("zh", "中文", "中文 voice_id")}
        ${profileRow("en", "英文", "英文 voice_id")}
        ${profileRow("ja", "日文", "日语 voice_id")}
        ${profileRow("default", "其他", "未匹配语言的 voice_id")}
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">语速与音量</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>语速</strong><small>朗读速度（0.5 - 2.0）</small></div>
          <input type="range" id="voiceTTSRate" min="0.5" max="2.0" step="0.1" value="${rate}" ${!ttsSupported ? 'disabled' : ''}>
          <span id="voiceTTSRateValue">${rate.toFixed(1)}</span>
        </div>
        <div class="settings-card-row">
          <div><strong>音量</strong><small>播放音量（0.0 - 1.0）</small></div>
          <input type="range" id="voiceTTSVolume" min="0" max="1" step="0.1" value="${volume}" ${!ttsSupported ? 'disabled' : ''}>
          <span id="voiceTTSVolumeValue">${volume.toFixed(1)}</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">试听</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>测试朗读</strong><small>测试当前朗读引擎</small></div>
          <button type="button" class="settings-row-action-btn" id="voiceTestBtn">试听</button>
        </div>
      </div>
    </div>
    ${!ttsSupported ? '<div class="settings-notice">您的浏览器不支持语音合成功能</div>' : ''}`;
}

function _initSettingsSubpageEvents(container, type) {
  if (type === "voice") {
    _initSettingsVoiceSubpage(container);
    return;
  }
  if (type === "memory") {
    _initSettingsMemorySubpage(container);
    return;
  }
  if (type === "appearance-resources" || type === "beautify" || type === "emoji") {
    const wbRow = container.querySelector("#srEmojiPackRow");
    if (wbRow) wbRow.style.cursor = "pointer";
    const chaAvatarBtn = container.querySelector("#srChaAvatarBtn");
    if (chaAvatarBtn) chaAvatarBtn.addEventListener("click", () => {
      const btn = document.querySelector(".profile-avatar:not(.profile-avatar--kk)");
      if (btn) btn.click();
      closeSettingsSubpage();
    });
    const coverBtn = container.querySelector("#srCoverBtn");
    if (coverBtn) coverBtn.addEventListener("click", () => {
      const btn = document.querySelector(".home-cover");
      if (btn) btn.click();
      closeSettingsSubpage();
    });
    const splashBtn = container.querySelector("#srSplashBtn");
    if (splashBtn) splashBtn.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/*";
      inp.addEventListener("change", () => {
        const file = inp.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          localStorage.setItem("asset_app_splash_wallpaper", reader.result);
          splashBtn.textContent = "已更换";
          splashBtn.disabled = true;
        };
        reader.readAsDataURL(file);
      });
      inp.click();
    });
    const emojiCacheBtn = container.querySelector("#srEmojiCacheBtn");
    if (emojiCacheBtn) emojiCacheBtn.addEventListener("click", () => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("emoji_catalog_cache"));
      keys.forEach(k => localStorage.removeItem(k));
      emojiCacheBtn.textContent = "已清理";
      emojiCacheBtn.disabled = true;
    });
    return;
  }
  if (type === "prompt-worldbook" || type === "prompt") {
    const wbRow = container.querySelector("#promptWbOpenRow");
    if (wbRow) wbRow.addEventListener("click", () => {
      openSettingsSubpage("worldbook");
    });
    return;
  }
  if (type === "worldbook") {
    _initSettingsWorldbookSubpage(container);
    return;
  }
  if (type === "chat") {
    const resetBtn = container.querySelector("#srChatAppearanceResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      localStorage.removeItem("ui_custom_chat_background");
      localStorage.removeItem("ui_chat_bubble_theme");
      resetBtn.textContent = "已恢复";
      resetBtn.disabled = true;
    });
  }
  if (type === "api") {
    _initSettingsApiSubpage(container);
  }
}

// Custom provider management
function _showCustomProviderDialog(providerId = null) {
  const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
  const existingProvider = providerId ? customProviders[providerId] : null;
  const isEdit = !!existingProvider;

  const dialogHtml = `
    <div class="overlay" id="customProviderOverlay" style="z-index:100;background:rgba(0,0,0,0.4);">
      <div class="modal" style="max-width:420px;background:#fff;color:#202020;border:1px solid rgba(30,30,30,0.08);box-shadow:0 12px 40px rgba(0,0,0,0.12);">
        <div class="modal-header" style="border-bottom:1px solid rgba(30,30,30,0.08);">
          <span style="color:#202020;">${isEdit ? '编辑' : '添加'}自定义通道</span>
          <button type="button" id="closeProviderDialog" style="color:#8E8E8E;">✕</button>
        </div>
        <div style="padding:12px 18px 18px;display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="display:block;font-size:12px;color:#8E8E8E;margin-bottom:4px;">通道名称</label>
            <input type="text" id="providerNameInput" placeholder="例如: 自定义 OpenAI"
              value="${existingProvider?.name || ''}"
              style="width:100%;padding:8px 12px;border:1px solid rgba(30,30,30,0.08);border-radius:8px;background:#FAFAF8;color:#202020;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#8E8E8E;margin-bottom:4px;">API 端点</label>
            <input type="url" id="providerEndpointInput" placeholder="https://api.openai.com/v1"
              value="${existingProvider?.endpoint || ''}"
              style="width:100%;padding:8px 12px;border:1px solid rgba(30,30,30,0.08);border-radius:8px;background:#FAFAF8;color:#202020;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#8E8E8E;margin-bottom:4px;">API Key</label>
            <input type="password" id="providerKeyInput" placeholder="sk-..."
              value="${existingProvider?.apiKey || ''}"
              style="width:100%;padding:8px 12px;border:1px solid rgba(30,30,30,0.08);border-radius:8px;background:#FAFAF8;color:#202020;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#8E8E8E;margin-bottom:4px;">支持的模型</label>
            <div style="display:flex;gap:8px;align-items:flex-start;">
              <textarea id="providerModelsInput" placeholder="点击右侧按钮自动获取，或手动输入（每行一个）" rows="5"
                style="flex:1;padding:8px 12px;border:1px solid rgba(30,30,30,0.08);border-radius:8px;background:#FAFAF8;color:#202020;font-size:13px;resize:vertical;line-height:1.5;">${existingProvider?.models?.join('\n') || ''}</textarea>
              <button type="button" id="fetchModelsBtn" style="padding:8px 12px;border:1px solid rgba(30,30,30,0.08);border-radius:8px;background:#FAFAF8;color:#202020;cursor:pointer;white-space:nowrap;font-size:13px;flex-shrink:0;">获取模型</button>
            </div>
            <div id="fetchModelsStatus" style="font-size:11px;color:#8E8E8E;margin-top:4px;"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button type="button" id="cancelProviderDialog" style="flex:1;padding:10px;border:1px solid rgba(30,30,30,0.18);border-radius:8px;background:transparent;color:#202020;cursor:pointer;">取消</button>
            <button type="button" id="saveProviderDialog" style="flex:1;padding:10px;border:none;border-radius:8px;background:#202020;color:white;cursor:pointer;">保存</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', dialogHtml);

  const overlay = document.getElementById('customProviderOverlay');
  const closeBtn = document.getElementById('closeProviderDialog');
  const cancelBtn = document.getElementById('cancelProviderDialog');
  const saveBtn = document.getElementById('saveProviderDialog');
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const fetchModelsStatus = document.getElementById('fetchModelsStatus');

  const closeDialog = () => overlay.remove();

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
  });

  // Fetch models from upstream API
  fetchModelsBtn.addEventListener('click', async () => {
    const endpoint = document.getElementById('providerEndpointInput').value.trim();
    const apiKey = document.getElementById('providerKeyInput').value.trim();
    const modelsInput = document.getElementById('providerModelsInput');

    if (!endpoint) {
      fetchModelsStatus.textContent = '请先填写 API 端点';
      fetchModelsStatus.style.color = '#e57373';
      return;
    }
    if (!apiKey) {
      fetchModelsStatus.textContent = '请先填写 API Key';
      fetchModelsStatus.style.color = '#e57373';
      return;
    }

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = '获取中…';
    fetchModelsStatus.textContent = '正在连接上游 API...';
    fetchModelsStatus.style.color = 'var(--text-muted)';

    try {
      // Proxy through backend to avoid CORS preflight 401 on direct browser→upstream calls
      const supabaseUrl = window.supabaseClient?.supabaseUrl || 'https://zbpbkyzisamleqspijnr.supabase.co';
      const proxyUrl = `${supabaseUrl}/functions/v1/models`;

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, apiKey })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.status && result.status !== 200) {
        throw new Error(`上游 API 返回 ${result.status}`);
      }
      const data = result.data;

      // Parse OpenAI-compatible response: { data: [{ id: "model-name", ... }] }
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('返回数据格式不符合 OpenAI API 规范');
      }

      const modelIds = data.data.map(m => m.id).filter(id => id);

      if (modelIds.length === 0) {
        throw new Error('未找到任何模型');
      }

      // Fill the models input with fetched model names (one per line)
      modelsInput.value = modelIds.join('\n');

      fetchModelsStatus.textContent = `成功获取 ${modelIds.length} 个模型`;
      fetchModelsStatus.style.color = '#4CAF50';

      if (typeof showToast === 'function') {
        showToast(`已获取 ${modelIds.length} 个模型`);
      }

    } catch (error) {
      console.error('Failed to fetch models:', error);
      fetchModelsStatus.textContent = `获取失败: ${error.message}`;
      fetchModelsStatus.style.color = '#e57373';

      if (typeof showToast === 'function') {
        showToast('获取模型列表失败');
      }
    } finally {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.textContent = '获取模型';
    }
  });

  saveBtn.addEventListener('click', () => {
    const name = document.getElementById('providerNameInput').value.trim();
    const endpoint = document.getElementById('providerEndpointInput').value.trim();
    const apiKey = document.getElementById('providerKeyInput').value.trim();
    const modelsStr = document.getElementById('providerModelsInput').value.trim();

    if (!name || !endpoint || !apiKey) {
      if (typeof showToast === 'function') {
        showToast('请填写所有必填字段');
      } else {
        alert('请填写所有必填字段');
      }
      return;
    }

    // Auto-generate provider ID from name or use existing ID when editing
    const id = providerId || name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '') || `custom-${Date.now()}`;

    if (!modelsStr) {
      if (typeof showToast === 'function') {
        showToast('请点击"获取模型"按钮自动获取，或手动输入模型名称（逗号分隔）');
      } else {
        alert('请点击"获取模型"按钮自动获取，或手动输入模型名称（逗号分隔）');
      }
      return;
    }

    const models = modelsStr.split(/[\n,]/).map(m => m.trim()).filter(m => m);
    if (models.length === 0) {
      if (typeof showToast === 'function') {
        showToast('请至少添加一个模型');
      } else {
        alert('请至少添加一个模型');
      }
      return;
    }

    const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
    customProviders[id] = { id, name, endpoint, apiKey, models, description: '自定义配置' };
    localStorage.setItem('custom_providers', JSON.stringify(customProviders));

    // Update global PROVIDER_GROUPS
    if (!window.PROVIDER_GROUPS) window.PROVIDER_GROUPS = {};
    window.PROVIDER_GROUPS[id] = {
      name,
      endpoint,
      models,
      description: '自定义配置',
      requiresAuth: true
    };

    if (typeof showToast === 'function') {
      showToast(isEdit ? '通道已更新' : '通道已添加');
    }

    closeDialog();

    // Refresh the API settings page
    setTimeout(() => {
      const subpageBody = document.getElementById('settingsSubpageBody');
      if (subpageBody && typeof renderSettingsSubpage === 'function') {
        subpageBody.innerHTML = renderSettingsSubpage('api');
        if (typeof _initSettingsSubpageEvents === 'function') {
          _initSettingsSubpageEvents(subpageBody, 'api');
        }
      }
    }, 100);
  });
}

// Legacy stubs (kept so any other code referencing the old names keeps working)
function _renderBeautifySubpage()  { return _renderAppearanceResourcesSubpage(); }
function _renderPromptSubpage()    { return _renderPromptWorldbookSubpage(); }

function _initSettingsApiSubpage(container) {
  const PROVIDER_GROUPS = window.PROVIDER_GROUPS || {};
  const mapping = getModelRoleMapping();

  // Handle add custom provider button
  const addProviderBtn = container.querySelector('#addCustomProviderBtn');
  if (addProviderBtn) {
    addProviderBtn.addEventListener('click', () => {
      _showCustomProviderDialog();
    });
  }

  // Handle edit provider buttons
  container.querySelectorAll('[data-edit-provider]').forEach(btn => {
    btn.addEventListener('click', () => {
      const providerId = btn.dataset.editProvider;
      _showCustomProviderDialog(providerId);
    });
  });

  // Handle provider selection change
  container.querySelectorAll('select[data-type="provider"]').forEach(select => {
    select.addEventListener('change', () => {
      const role = select.dataset.role;
      const providerGroup = select.value;
      const modelSelect = container.querySelector(`select[data-type="model"][data-role="${role}"]`);

      if (!modelSelect) return;

      if (providerGroup && PROVIDER_GROUPS[providerGroup]) {
        // Enable model select and populate options
        modelSelect.disabled = false;
        modelSelect.innerHTML = '<option value="">选择模型</option>' +
          PROVIDER_GROUPS[providerGroup].models.map(m =>
            `<option value="${m}">${m}</option>`
          ).join('');
      } else {
        // Disable model select
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option value="">选择模型</option>';
      }
    });
  });

  // Handle save button
  const saveBtn = container.querySelector('#saveModelRoleMappingBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newMapping = {};
      let hasChanges = false;

      container.querySelectorAll('select[data-type="provider"]').forEach(providerSelect => {
        const role = providerSelect.dataset.role;
        const providerGroup = providerSelect.value;
        const modelSelect = container.querySelector(`select[data-type="model"][data-role="${role}"]`);
        const model = modelSelect ? modelSelect.value : '';

        if (providerGroup && model) {
          newMapping[role] = { providerGroup, model };
          hasChanges = true;
        }
      });

      if (hasChanges) {
        const success = saveModelRoleMapping(newMapping);
        if (success) {
          if (typeof showToast === 'function') {
            showToast('已保存用途模型映射');
          } else {
            alert('已保存用途模型映射');
          }
          // Refresh the subpage to show updated values
          setTimeout(() => {
            const subpageBody = document.getElementById('settingsSubpageBody');
            if (subpageBody && typeof renderSettingsSubpage === 'function') {
              subpageBody.innerHTML = renderSettingsSubpage('api');
              if (typeof _initSettingsSubpageEvents === 'function') {
                _initSettingsSubpageEvents(subpageBody, 'api');
              }
            }
          }, 500);
        } else {
          alert('保存失败，请重试');
        }
      } else {
        alert('请至少配置一个用途模型');
      }
    });
  }

  // Handle test button
  const testBtn = container.querySelector('#testModelRoleMappingBtn');
  const testResultsSection = container.querySelector('#testResultsSection');
  const testResultsContainer = container.querySelector('#testResultsContainer');

  if (testBtn && testResultsSection && testResultsContainer) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = '测试中…';

      // Show results section and clear previous results
      testResultsSection.style.display = 'block';
      testResultsContainer.innerHTML = '';

      const mapping = getModelRoleMapping();
      let allPassed = true;

      // Test each configured role by making a real API call
      for (const [roleId, role] of Object.entries(MODEL_ROLES)) {
        const config = mapping[roleId];

        // Create result card
        const card = document.createElement('div');
        card.className = 'settings-card';
        card.style.marginBottom = '8px';

        let statusIcon = '⚠️';
        let statusText = '未配置';
        let statusColor = 'var(--text-muted)';
        let detailText = '';

        if (!config || !config.providerGroup || !config.model) {
          detailText = '请先配置该角色的通道和模型';
        } else {
          statusIcon = '⏳';
          statusText = '测试中…';
          statusColor = 'var(--text-muted)';

          card.innerHTML = `
            <div class="settings-card-row">
              <div style="flex:1;">
                <strong>${role.label}</strong>
                <small style="display:block;margin-top:2px;">${PROVIDER_GROUPS[config.providerGroup]?.name || config.providerGroup} · ${config.model}</small>
              </div>
              <div style="text-align:right;">
                <span style="font-size:20px;">${statusIcon}</span>
                <small style="display:block;color:${statusColor};margin-top:2px;">${statusText}</small>
              </div>
            </div>`;

          testResultsContainer.appendChild(card);

          try {
            // Resolve provider endpoint and apiKey from custom_providers
            const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
            const providerData = customProviders[config.providerGroup];

            if (!providerData || !providerData.endpoint || !providerData.apiKey) {
              throw new Error('通道配置不完整（缺少 endpoint 或 apiKey）');
            }

            // Proxy through edge function to avoid CORS
            const supabaseUrl = window.supabaseClient?.supabaseUrl || 'https://zbpbkyzisamleqspijnr.supabase.co';
            const proxyUrl = `${supabaseUrl}/functions/v1/chat-test`;

            const response = await fetch(proxyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: providerData.endpoint,
                apiKey: providerData.apiKey,
                model: config.model
              })
            });

            if (!response.ok) {
              throw new Error(`代理请求失败 (${response.status})`);
            }

            const result = await response.json();

            if (result.error) {
              throw new Error(result.error);
            }

            if (result.status && result.status >= 200 && result.status < 300) {
              statusIcon = '✅';
              statusText = '测试通过';
              statusColor = '#4CAF50';
              detailText = '连接正常，模型响应成功';
            } else {
              statusIcon = '❌';
              const errMsg = result.data?.error?.message || `上游返回 ${result.status}`;
              statusText = `失败 (${result.status})`;
              statusColor = '#e57373';
              detailText = errMsg;
              allPassed = false;
            }
          } catch (error) {
            statusIcon = '❌';
            statusText = '测试失败';
            statusColor = '#e57373';
            detailText = error.message || '无法连接到服务器';
            allPassed = false;
          }
        }

        card.innerHTML = `
          <div class="settings-card-row">
            <div style="flex:1;">
              <strong>${role.label}</strong>
              <small style="display:block;margin-top:2px;color:var(--text-muted);">${config && config.providerGroup ? `${PROVIDER_GROUPS[config.providerGroup]?.name || config.providerGroup} · ${config.model}` : '未配置'}</small>
              ${detailText ? `<small style="display:block;margin-top:4px;color:${statusColor};">${detailText}</small>` : ''}
            </div>
            <div style="text-align:right;">
              <span style="font-size:20px;">${statusIcon}</span>
              <small style="display:block;color:${statusColor};margin-top:2px;font-weight:500;">${statusText}</small>
            </div>
          </div>`;

        if (!testResultsContainer.contains(card)) {
          testResultsContainer.appendChild(card);
        }
      }

      testBtn.disabled = false;
      testBtn.textContent = '测试当前配置';

      if (typeof showToast === 'function') {
        showToast(allPassed ? '所有配置测试通过' : '部分配置测试失败');
      }
    });
  }
}

function _renderWorldbookSubpage() {
  return `<div id="wbSubpageMount" class="wb-subpage-mount"></div>`;
}

function _initSettingsWorldbookSubpage(container) {
  const mount = container.querySelector("#wbSubpageMount");
  if (!mount) return;

  const store = document.getElementById("wbContentStore");
  if (!store) return;

  // Move all child nodes from the hidden store into the subpage mount
  while (store.firstChild) {
    mount.appendChild(store.firstChild);
  }

  // Load world books into the now-visible list
  loadWorldBooks();
}

function _renderMemorySubpage() {
  return `<div id="settingsMemoryMount" style="min-height:200px"></div>`;
}

function _initSettingsVoiceSubpage(container) {
  if (!window.SPVoice) return;

  const engineSelect = container.querySelector("#voiceTTSEngine");
  const rateSlider = container.querySelector("#voiceTTSRate");
  const rateValue = container.querySelector("#voiceTTSRateValue");
  const volumeSlider = container.querySelector("#voiceTTSVolume");
  const volumeValue = container.querySelector("#voiceTTSVolumeValue");
  const testBtn = container.querySelector("#voiceTestBtn");

  if (engineSelect) {
    engineSelect.addEventListener("change", (e) => {
      window.SPVoice.setTTSEngine(e.target.value);
    });
  }

  const modelIdInput = container.querySelector("#voiceTTSModelId");
  if (modelIdInput) {
    modelIdInput.addEventListener("change", (e) => {
      window.SPVoice.setTTSConfig({ model_id: e.target.value.trim() || "eleven_v3" });
    });
  }

  // Wire per-language voice_id inputs
  container.querySelectorAll(".voice-profile-voice-id").forEach((input) => {
    input.addEventListener("change", (e) => {
      const lang = e.target.dataset.lang;
      if (lang) window.SPVoice.setTTSConfig({ profiles: { [lang]: { voice_id: e.target.value.trim() } } });
    });
  });

  if (rateSlider && rateValue) {
    rateSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      rateValue.textContent = val.toFixed(1);
      window.SPVoice.setTTSRate(val);
    });
  }

  if (volumeSlider && volumeValue) {
    volumeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      volumeValue.textContent = val.toFixed(1);
      window.SPVoice.setTTSVolume(val);
    });
  }

  if (testBtn) {
    const TEST_TEXT = "[softly] 我在。这个方向比刚才对。[pause] 不要再压低，也不要故意温柔。轻一点，自然一点。[quiet laugh] 嗯……这样就有点像我了。";
    const proxy = document.createElement("button");
    proxy.className = "speaker-btn";
    testBtn.addEventListener("click", () => {
      window.SPVoice.playMessageText(TEST_TEXT, proxy, null);
    });
    // Reflect proxy state on testBtn
    new MutationObserver(() => {
      if (proxy.classList.contains("tts-loading")) {
        testBtn.textContent = "生成中...";
        testBtn.disabled = true;
      } else if (proxy.classList.contains("speaking")) {
        testBtn.textContent = "停止";
        testBtn.disabled = false;
      } else if (proxy.classList.contains("tts-error")) {
        testBtn.textContent = proxy.title || "生成失败";
        testBtn.disabled = false;
      } else {
        testBtn.textContent = "试听";
        testBtn.disabled = false;
      }
    }).observe(proxy, { attributes: true, attributeFilter: ["class", "title"] });
  }
}

function _initSettingsMemorySubpage(container) {
  // Reuse the existing memory center v2 state and render functions,
  // but mounted inside the subpage body instead of the overlay.
  const mount = container.querySelector("#settingsMemoryMount");
  if (!mount) return;
  memoryCenterV2State.view = "archive";
  // Render archive view directly into the mount point
  mount.innerHTML = "";
  const viewRoot = document.createElement("div");
  viewRoot.id = "settingsMemoryViewRoot";
  viewRoot.className = "mc-view-root";
  mount.appendChild(viewRoot);
  _renderMemoryCenterInto(viewRoot);
  refreshMemoryCenterData();
}

function _renderMemoryCenterInto(root) {
  // Delegate to existing renderMemoryCenterCurrentView but point at custom root
  var savedRoot = document.getElementById("mcViewRoot");
  var fakeRoot = root;
  // Temporarily swap so renderMemoryCenterCurrentView writes here
  var _origGetById = document.getElementById.bind(document);
  var _patchActive = true;
  var _origGetEl = document.getElementById;
  document.getElementById = function(id) {
    if (_patchActive && id === "mcViewRoot") return fakeRoot;
    return _origGetEl.call(document, id);
  };
  try {
    renderMemoryCenterCurrentView();
  } finally {
    document.getElementById = _origGetEl;
    _patchActive = false;
  }
}

function _renderEmojiSubpage() {
  return `
    <div class="settings-section">
      <div class="settings-section-label">已启用来源</div>
      <div class="settings-empty-state">
        <strong>暂无自定义表情包来源</strong>
        <p>添加后可在聊天中使用自定义表情包</p>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">缓存</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>清理表情包缓存</strong><small>释放本地存储空间</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>`;
}

function _renderChatSubpage() {
  return `
    <div class="settings-section">
      <div class="settings-section-label">外观</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>聊天背景</strong><small>自定义聊天页壁纸</small></div>
          <span class="settings-row-value">占位</span>
        </div>
        <div class="settings-card-row">
          <div><strong>气泡样式</strong><small>消息气泡外观</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">输入栏</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>输入栏布局</strong><small>按钮排列方式</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">消息显示</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>时间戳</strong><small>消息时间显示方式</small></div>
          <span class="settings-row-value">占位</span>
        </div>
        <div class="settings-card-row">
          <div><strong>已读标记</strong><small>显示消息已读状态</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>`;
}

window._saveMemoryToken = function() {
  const val = document.getElementById("_memTokenInput")?.value?.trim();
  if (val) sessionStorage.setItem("memory_admin_token", val);
  else sessionStorage.removeItem("memory_admin_token");
  const statusEl = document.getElementById("_memTokenStatus");
  if (statusEl) statusEl.textContent = val ? "hasToken=true" : "hasToken=false";
  const inputEl = document.getElementById("_memTokenInput");
  if (inputEl) inputEl.value = "";
  // Show confirmation toast
  if (typeof showToast === 'function') {
    showToast(val ? "Token 已保存" : "Token 已清除");
  }
};
window._testMemoryEndpoint = async function() {
  const endpoint = typeof getMemoryEndpoint === 'function' ? getMemoryEndpoint() : null;
  const token = sessionStorage.getItem("memory_admin_token") || "";
  const btn = document.getElementById("_memTestBtn");
  if (!btn) return;

  if (!endpoint) {
    btn.textContent = "❌ 无 endpoint";
    if (typeof showToast === 'function') showToast("记忆 API 端点未配置");
    return;
  }
  if (!token) {
    btn.textContent = "❌ 无 token";
    if (typeof showToast === 'function') showToast("请先保存 Token");
    return;
  }

  btn.textContent = "请求中…";
  btn.disabled = true;

  try {
    const res = await fetch(endpoint + "?type=audit", {
      headers: { "Authorization": "Bearer " + token }
    });
    btn.textContent = res.ok ? `✅ ${res.status}` : `❌ ${res.status}`;
    if (typeof showToast === 'function') {
      showToast(res.ok ? "记忆端点连接成功" : `连接失败: ${res.status}`);
    }
  } catch(e) {
    btn.textContent = "❌ 网络错误";
    if (typeof showToast === 'function') showToast("网络错误: " + e.message);
  } finally {
    btn.disabled = false;
  }
};

function _renderDebugSubpage() {
  const buildLabel = (document.querySelector("script[src*='app.js']")?.src.match(/v=([^&]+)/) || [])[1] || "unknown";
  return `
    <div class="settings-section">
      <div class="settings-section-label">版本与环境</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>构建版本</strong></div>
          <span class="settings-row-value">${buildLabel}</span>
        </div>
        <div class="settings-card-row">
          <div><strong>平台</strong></div>
          <span class="settings-row-value">${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"}</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">记忆 Token（仅 Dev）</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>Token 状态</strong></div>
          <span id="_memTokenStatus" class="settings-row-value">${sessionStorage.getItem("memory_admin_token") ? "hasToken=true" : "hasToken=false"}</span>
        </div>
        <div class="settings-card-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <input id="_memTokenInput" type="password" placeholder="粘贴 memory admin token" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border-color,#ccc);background:var(--input-bg,#fff);color:inherit;font-size:13px"/>
          <div style="display:flex;gap:8px">
            <button type="button" onclick="window._saveMemoryToken()" style="flex:1;padding:6px;border-radius:6px;border:none;background:var(--accent-color,#555);color:#fff;cursor:pointer">保存</button>
            <button id="_memTestBtn" type="button" onclick="window._testMemoryEndpoint()" style="flex:1;padding:6px;border-radius:6px;border:none;background:var(--secondary-bg,#888);color:#fff;cursor:pointer">测试记忆端点</button>
          </div>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">日志</div>
      <div class="settings-card">
        <div class="settings-card-row">
          <div><strong>记忆注入日志</strong><small>最近一轮注入状态</small></div>
          <span class="settings-row-value">占位</span>
        </div>
        <div class="settings-card-row">
          <div><strong>Prompt 状态</strong><small>当前 system prompt 摘要</small></div>
          <span class="settings-row-value">占位</span>
        </div>
      </div>
    </div>`;
}

  // ── Public API ────────────────────────────────────────────────────────────
  window.SavePrincessSettings = {
    openSettingsSubpage,
    closeSettingsSubpage,
    renderSettingsSubpage,
  };

  // ── Legacy global aliases (for backward compatibility) ────────────────────
  window.openSettingsSubpage = openSettingsSubpage;
  window.closeSettingsSubpage = closeSettingsSubpage;
  window.renderSettingsSubpage = renderSettingsSubpage;
  window._initSettingsSubpageEvents = _initSettingsSubpageEvents;
  window._renderWorldbookSubpage = _renderWorldbookSubpage;
  window._initSettingsWorldbookSubpage = _initSettingsWorldbookSubpage;
  window._renderMemorySubpage = _renderMemorySubpage;
  window._initSettingsMemorySubpage = _initSettingsMemorySubpage;
  window._initSettingsVoiceSubpage = _initSettingsVoiceSubpage;
  window._initSettingsApiSubpage = _initSettingsApiSubpage;

})();
