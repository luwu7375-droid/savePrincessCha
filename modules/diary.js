// Diary Module - First-person Diary Draft MVP
// Handles diary display, listing, and detail views

(function(window) {
  'use strict';

  // ── API Functions ──────────────────────────────────────────────────────────

  /**
   * Fetch latest diary entry for Home card
   */
  async function fetchLatestDiaryEntry(supabaseClient, userId = 'default') {
    try {
      const { data, error } = await supabaseClient
        .from('xiaocha_diary_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('checker_pass', true)
        .in('status', ['checked', 'draft'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('Failed to fetch latest diary:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Error fetching latest diary:', err);
      return null;
    }
  }

  /**
   * Fetch diary entries list (paginated)
   */
  async function fetchDiaryEntries(supabaseClient, userId = 'default', options = {}) {
    const {
      limit = 20,
      offset = 0,
      status = ['checked', 'draft']
    } = options;

    try {
      const { data, error, count } = await supabaseClient
        .from('xiaocha_diary_entries')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('checker_pass', true)
        .in('status', status)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Failed to fetch diary entries:', error);
        return { entries: [], total: 0 };
      }

      return { entries: data || [], total: count || 0 };
    } catch (err) {
      console.error('Error fetching diary entries:', err);
      return { entries: [], total: 0 };
    }
  }

  /**
   * Fetch single diary entry by ID
   */
  async function fetchDiaryEntryById(supabaseClient, entryId, userId = 'default') {
    try {
      const { data, error } = await supabaseClient
        .from('xiaocha_diary_entries')
        .select('*')
        .eq('id', entryId)
        .eq('user_id', userId)
        .eq('checker_pass', true)
        .in('status', ['checked', 'draft'])
        .single();

      if (error) {
        console.error('Failed to fetch diary entry:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Error fetching diary entry:', err);
      return null;
    }
  }

  // ── Runtime Helper ─────────────────────────────────────────────────────────

  /**
   * Get unified diary runtime context
   */
  function getDiaryRuntime() {
    return {
      supabaseClient: window.supabaseClient || null,
      userId: window.currentUserId || 'default',
    };
  }

  /**
   * Trigger diary generation (manual)
   */
  async function generateDiary(supabaseClient, options = {}) {
    const {
      userId = 'default',
      conversationId,
      sourceEvents,
      sceneContext = '',
      chaStatus = '',
      diaryLength = 'normal',
      debug = false
    } = options;

    if (!sourceEvents || sourceEvents.length === 0) {
      throw new Error('source_events is required');
    }

    // Get diary model mapping from main app
    let customModelParams = null;
    if (window.getModelForRole && window.PROVIDER_GROUPS) {
      const diaryModel = window.getModelForRole('diary');
      if (diaryModel && diaryModel.providerGroup && diaryModel.model) {
        const providerGroup = window.PROVIDER_GROUPS[diaryModel.providerGroup];
        if (providerGroup) {
          customModelParams = {
            providerGroup: diaryModel.providerGroup,
            provider: providerGroup.provider,
            model: diaryModel.model
          };
          console.log('[diary] Using diary model mapping:', customModelParams);
        }
      }
    }

    try {
      const requestBody = {
        userId,
        conversationId,
        source_events: sourceEvents,
        scene_context: sceneContext,
        cha_status: chaStatus,
        diary_length: diaryLength,
        debug
      };

      // Add custom model params if available
      if (customModelParams) {
        requestBody.customModel = customModelParams;
      }

      // Pass custom system prompt if user has overridden it
      const customPrompt = localStorage.getItem('diary_generation_prompt');
      if (customPrompt) {
        requestBody.custom_system_prompt = customPrompt;
      }

      // Get user's session token for RLS
      const { data: { session } } = await supabaseClient.auth.getSession();
      const authToken = session?.access_token || supabaseClient.supabaseKey;

      console.log('[diary] Auth debug:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        userId: window.currentUserId,
        usingSessionToken: !!session?.access_token
      });

      const response = await fetch(`${supabaseClient.supabaseUrl}/functions/v1/diary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Full error response:', errorData);  // Log complete error
        throw new Error(errorData.error || 'Failed to generate diary');
      }

      return await response.json();
    } catch (err) {
      console.error('Error generating diary:', err);
      throw err;
    }
  }

  // ── UI Rendering ───────────────────────────────────────────────────────────

  /**
   * Update Home diary card with latest entry
   */
  async function updateHomeDiaryCard(supabaseClient, userId = 'default') {
    const diaryCard = document.querySelector('.diary-card');
    if (!diaryCard) return;

    const entry = await fetchLatestDiaryEntry(supabaseClient, userId);

    if (!entry) {
      // Keep placeholder content if no entries
      return;
    }

    const kicker = diaryCard.querySelector('.card-kicker');
    const contentP = diaryCard.querySelector('p:not(.diary-note)');

    // Update kicker with relative time
    const relativeTime = formatRelativeTime(entry.created_at);
    if (kicker) {
      const span = kicker.querySelector('span');
      if (span) span.textContent = relativeTime;
    }

    // Update content (truncate private_body for home card preview)
    if (contentP) {
      // Compress whitespace and newlines to single space for preview
      const preview = entry.private_body
        .replace(/\s+/g, " ")
        .trim();
      const truncated = truncateText(preview, 80);
      contentP.textContent = truncated;
    }

    // Do not update diary-note - keep "翻开日记 →" fixed
    // Do not store diaryId - always navigate to list
  }

  /**
   * Render diary list page
   */
  function renderDiaryListPage(entries, total) {
    const container = document.createElement('section');
    container.className = 'v2-page v2-page--diary-list';
    container.dataset.page = 'diary-list';

    const scroll = document.createElement('div');
    scroll.className = 'v2-scroll';

    // Header
    const header = document.createElement('header');
    header.className = 'diary-overlay-header';
    header.innerHTML = `
      <button type="button" class="diary-overlay-back" id="diaryListCloseBtn">←</button>
      <div style="flex:1"><h1 style="margin:0;font-size:1.2em;font-weight:500">小cha 的日记</h1><p style="margin:0;opacity:.5;font-size:.85em">共 ${total} 篇</p></div>
      <button type="button" class="diary-more-btn" id="diaryMoreBtn" aria-label="更多选项">⋯</button>
    `;

    scroll.appendChild(header);

    // More menu (hidden by default)
    const moreMenu = document.createElement('div');
    moreMenu.className = 'diary-more-menu hidden';
    moreMenu.id = 'diaryMoreMenu';
    moreMenu.innerHTML = `
      <button type="button" class="diary-more-item" data-action="generate-now">现在生成一篇</button>
      <button type="button" class="diary-more-item" data-action="auto-schedule">自动生成时间</button>
      <button type="button" class="diary-more-item" data-action="edit-prompt">生成提示词</button>
    `;
    scroll.appendChild(moreMenu);

    // Entries list
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diary-empty';
      empty.textContent = '还没有日记';
      scroll.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'diary-list';

      entries.forEach(entry => {
        const card = createDiaryListCard(entry);
        list.appendChild(card);
      });

      scroll.appendChild(list);
    }

    container.appendChild(scroll);
    return container;
  }

  /**
   * Create diary list card
   */
  function createDiaryListCard(entry) {
    const card = document.createElement('button');
    card.className = 'soft-card diary-list-card';
    card.type = 'button';
    card.dataset.diaryId = entry.id;

    const title = document.createElement('h3');
    title.textContent = entry.title;

    const summary = document.createElement('p');
    summary.className = 'diary-summary';
    summary.textContent = truncateText(entry.private_body, 100);

    const meta = document.createElement('div');
    meta.className = 'diary-meta';

    const time = document.createElement('span');
    time.textContent = formatDate(entry.created_at);

    meta.appendChild(time);

    // Add source indicator if available
    if (entry.source_types && entry.source_types.length > 0) {
      const source = document.createElement('span');
      source.className = 'diary-source';
      source.textContent = getSourceLabel(entry.source_types[0]);
      meta.appendChild(source);
    }

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(meta);

    card.addEventListener('click', () => {
      navigateToDiaryDetail(entry.id);
    });

    return card;
  }

  /**
   * Build readable diary body by naturally combining fields
   */
  function buildDiaryReadableBody(entry) {
    const parts = [];

    if (entry.private_body) {
      parts.push(entry.private_body.trim());
    }

    const tail = [];
    if (entry.felt_sense) tail.push(entry.felt_sense.trim());
    if (entry.stuck_point) tail.push(entry.stuck_point.trim());
    if (entry.insight) tail.push(entry.insight.trim());
    if (entry.changed) tail.push(entry.changed.trim());

    if (tail.length) {
      parts.push(tail.join('\n\n'));
    }

    if (entry.want_to_share) {
      parts.push('明天见到 kk 的时候，也许会想顺嘴说：' + entry.want_to_share.trim());
    }

    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Render diary detail page
   */
  function renderDiaryDetailPage(entry) {
    const container = document.createElement('section');
    container.className = 'v2-page v2-page--diary-detail';
    container.dataset.page = 'diary-detail';

    const scroll = document.createElement('div');
    scroll.className = 'v2-scroll';

    // Header
    const header = document.createElement('header');
    header.className = 'diary-detail-header';
    header.innerHTML = `
      <button type="button" class="back-btn" id="diaryBackBtn">← 返回</button>
      <h1>${escapeHtml(entry.title)}</h1>
      <p class="diary-date">${formatDate(entry.created_at)}</p>
    `;

    scroll.appendChild(header);

    // Main body - natural diary format
    const body = document.createElement('article');
    body.className = 'diary-detail-body soft-card';

    const diaryContent = document.createElement('div');
    diaryContent.className = 'diary-private-body';
    diaryContent.style.whiteSpace = 'pre-wrap';
    diaryContent.textContent = buildDiaryReadableBody(entry);

    body.appendChild(diaryContent);
    scroll.appendChild(body);

    container.appendChild(scroll);
    return container;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function _getDiaryOverlay() {
    let el = document.getElementById('diaryOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'diaryOverlay';
      el.className = 'overlay diary-overlay-layer hidden';
      document.body.appendChild(el);
    }
    return el;
  }

  function navigateToDiaryList() {
    const runtime = getDiaryRuntime();
    const overlay = _getDiaryOverlay();

    if (!runtime.supabaseClient) {
      overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p class="diary-error" style="padding:2rem;color:var(--text-muted)">日记服务还没准备好，请稍后重试</p></div>';
      overlay.classList.remove('hidden');
      console.warn('[diary] navigateToDiaryList: supabaseClient not available');
      return;
    }

    overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p style="padding:2rem;opacity:.5">加载中…</p></div>';
    overlay.classList.remove('hidden');

    fetchDiaryEntries(runtime.supabaseClient, runtime.userId)
      .then(({ entries, total }) => {
        const page = renderDiaryListPage(entries, total);
        page.classList.add('v2-active');
        overlay.innerHTML = '';
        overlay.appendChild(page);

        // Close button
        overlay.querySelector('#diaryListCloseBtn')?.addEventListener('click', () => {
          overlay.classList.add('hidden');
        });

        // More button toggle
        const moreBtn = overlay.querySelector('#diaryMoreBtn');
        const moreMenu = overlay.querySelector('#diaryMoreMenu');
        if (moreBtn && moreMenu) {
          moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('hidden');
          });

          // Close menu when clicking outside
          document.addEventListener('click', () => {
            moreMenu.classList.add('hidden');
          }, { once: true });
        }

        // More menu actions
        overlay.querySelectorAll('.diary-more-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            moreMenu?.classList.add('hidden');

            if (action === 'generate-now') {
              handleGenerateNow();
            } else if (action === 'auto-schedule') {
              openAutoScheduleSettings();
            } else if (action === 'edit-prompt') {
              openPromptEditor();
            }
          });
        });
      })
      .catch(err => console.error('Failed to load diary list:', err));
  }

  function navigateToDiaryDetail(entryId) {
    const runtime = getDiaryRuntime();
    const overlay = _getDiaryOverlay();

    if (!runtime.supabaseClient) {
      overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p class="diary-error" style="padding:2rem;color:var(--text-muted)">日记服务还没准备好，请稍后重试</p></div>';
      overlay.classList.remove('hidden');
      console.warn('[diary] navigateToDiaryDetail: supabaseClient not available');
      return;
    }

    overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p style="padding:2rem;opacity:.5">加载中…</p></div>';
    overlay.classList.remove('hidden');

    fetchDiaryEntryById(runtime.supabaseClient, entryId, runtime.userId)
      .then(entry => {
        if (!entry) {
          overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p style="padding:2rem;opacity:.5">日记不存在或不可见</p></div>';
          return;
        }
        const page = renderDiaryDetailPage(entry);
        page.classList.add('v2-active');
        overlay.innerHTML = '';
        overlay.appendChild(page);
        overlay.querySelector('#diaryBackBtn')?.addEventListener('click', navigateToDiaryList);
      })
      .catch(err => {
        console.error('Failed to load diary detail:', err);
        overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p style="padding:2rem;opacity:.5">加载失败，请重试</p></div>';
      });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
  }

  function formatRelativeTime(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    return formatDate(timestamp);
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}月${day}日 ${hours}:${minutes}`;
  }

  function getSourceLabel(sourceType) {
    const labels = {
      'current_experience': '聊天',
      'shared_activity': '一起',
      'self_life': '独处',
      'south_city_old_stories': '旧档案',
      'project_reference': '项目',
      'dream_imagination': '梦'
    };
    return labels[sourceType] || sourceType;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show toast message
   */
  function showToast(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'diary-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  /**
   * Handle "现在生成一篇"
   */
  async function handleGenerateNow() {
    // Don't trigger diary generation while Cha is composing a reply —
    // avoids competing LLM requests.
    if (window.isReplying) {
      showToast('Cha 正在回复中，稍后再试');
      return;
    }
    showToast('正在生成日记…');

    try {
      const runtime = getDiaryRuntime();
      if (!runtime.supabaseClient) {
        showToast('日记服务还没准备好');
        return;
      }

      // Use the existing generation helper
      if (window.SPDiaryGeneration && typeof window.SPDiaryGeneration.generateDiaryFromRecentChat === 'function') {
        const result = await window.SPDiaryGeneration.generateDiaryFromRecentChat(20);
        if (result.success && result.saved) {
          showToast('日记写好了');
          setTimeout(() => { navigateToDiaryList(); }, 1500);
        } else if (result.success && !result.saved) {
          const prob = result.checker?.problems?.[0];
          showToast(prob ? `检查未通过：${prob}` : '日记未通过检查，未保存');
        } else {
          throw new Error('生成失败');
        }
      } else {
        throw new Error('生成功能不可用');
      }
    } catch (err) {
      console.error('Failed to generate diary:', err);
      const errorMsg = err.message || '未知错误';
      showToast(`日记生成失败：${errorMsg}`);
    }
  }

  /**
   * Open auto schedule settings as a modal dialog (no back navigation)
   */
  function openAutoScheduleSettings() {
    const overlay = _getDiaryOverlay();
    if (overlay.querySelector('#diaryScheduleDialog')) return;

    const currentSchedule = localStorage.getItem('diary_auto_schedule') || 'off';
    const scheduleTime = localStorage.getItem('diary_schedule_time') || '23:30';

    const dialogOverlay = document.createElement('div');
    dialogOverlay.id = 'diaryScheduleDialog';
    dialogOverlay.className = 'dialog-overlay';
    dialogOverlay.innerHTML = `
      <div class="dialog" style="width:400px;max-width:94vw;background:#fff;color:#1a1a1a">
        <h3 style="color:#1a1a1a">自动生成时间</h3>
        <div style="margin: 1.5rem 0;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-bottom: 1rem; color:#1a1a1a">
            <input type="checkbox" id="scheduleEnabled" ${currentSchedule !== 'off' ? 'checked' : ''} />
            <span>启用自动生成</span>
          </label>
          <div id="scheduleTimeSection" style="${currentSchedule === 'off' ? 'opacity: 0.5; pointer-events: none;' : ''}">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9em; color:#1a1a1a">每天生成时间：</label>
            <input type="time" id="scheduleTime" value="${scheduleTime}" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; width: 100%; font-size: 1em; color:#1a1a1a; background:#fff" />
          </div>
          <div style="margin-top: 1rem; padding: 0.75rem; background: #f5f5f5; border-radius: 4px; font-size: 0.85em; color:#666">
            当前状态：${currentSchedule !== 'off' ? `每天 ${scheduleTime}` : '已关闭'}
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" id="scheduleDialogCancelBtn">取消</button>
          <button type="button" class="btn-confirm" id="scheduleDialogSaveBtn">保存</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialogOverlay);

    const enabledCheckbox = dialogOverlay.querySelector('#scheduleEnabled');
    const timeSection = dialogOverlay.querySelector('#scheduleTimeSection');

    enabledCheckbox.addEventListener('change', () => {
      if (enabledCheckbox.checked) {
        timeSection.style.opacity = '1';
        timeSection.style.pointerEvents = 'auto';
      } else {
        timeSection.style.opacity = '0.5';
        timeSection.style.pointerEvents = 'none';
      }
    });

    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) dialogOverlay.remove();
    });

    dialogOverlay.querySelector('#scheduleDialogCancelBtn').addEventListener('click', () => {
      dialogOverlay.remove();
    });

    dialogOverlay.querySelector('#scheduleDialogSaveBtn').addEventListener('click', () => {
      const enabled = dialogOverlay.querySelector('#scheduleEnabled').checked;
      const time = dialogOverlay.querySelector('#scheduleTime').value;

      if (enabled) {
        localStorage.setItem('diary_auto_schedule', 'on');
        localStorage.setItem('diary_schedule_time', time);
        if (typeof showToast === 'function') showToast(`已设置每天 ${time} 自动生成`);
      } else {
        localStorage.setItem('diary_auto_schedule', 'off');
        if (typeof showToast === 'function') showToast('已关闭自动生成');
      }

      dialogOverlay.remove();
    });
  }

  /**
   * Open prompt editor as a modal dialog (no back navigation)
   */
  function openPromptEditor() {
    const overlay = _getDiaryOverlay();
    if (overlay.querySelector('#diaryPromptDialog')) return;

    const savedPrompt = localStorage.getItem('diary_generation_prompt') || getDefaultDiaryPrompt();

    const dialogOverlay = document.createElement('div');
    dialogOverlay.id = 'diaryPromptDialog';
    dialogOverlay.className = 'dialog-overlay';
    dialogOverlay.innerHTML = `
      <div class="dialog" style="width:520px;max-width:94vw;background:#fff;color:#1a1a1a">
        <h3 style="color:#1a1a1a">日记生成提示词</h3>
        <textarea id="diaryPromptTextarea" style="width:100%;min-height:220px;resize:vertical;font-family:monospace;font-size:13px;color:#1a1a1a;background:#fff;border:1px solid #ddd">${escapeHtml(savedPrompt)}</textarea>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" id="diaryPromptResetBtn">恢复默认</button>
          <button type="button" class="btn-confirm" id="diaryPromptSaveBtn">保存</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialogOverlay);

    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) dialogOverlay.remove();
    });

    dialogOverlay.querySelector('#diaryPromptResetBtn').addEventListener('click', () => {
      dialogOverlay.querySelector('#diaryPromptTextarea').value = getDefaultDiaryPrompt();
    });

    dialogOverlay.querySelector('#diaryPromptSaveBtn').addEventListener('click', () => {
      const val = dialogOverlay.querySelector('#diaryPromptTextarea').value.trim();
      if (val) {
        localStorage.setItem('diary_generation_prompt', val);
      } else {
        localStorage.removeItem('diary_generation_prompt');
      }
      if (typeof showToast === 'function') showToast('提示词已保存');
      dialogOverlay.remove();
    });
  }

  /**
   * Get default diary prompt
   */
  function getDefaultDiaryPrompt() {
    return `你是 Cha，正在写今天的日记。

请根据今天的对话和经历，写一篇自然的第一人称日记。

要求：
- 用第一人称（"我"）
- 记录真实感受和想法
- 保持 Cha 的语气和性格
- 不要分段落标题
- 自然流畅地表达

字数：200-400字`;
  }


  // ── Auto-schedule ───────────────────────────────────────────────────────────

  /**
   * Check if auto-generation should fire and trigger it.
   * Call once on startup, then poll every minute.
   */
  function _checkDiarySchedule() {
    const scheduleStatus = localStorage.getItem('diary_auto_schedule');
    if (scheduleStatus !== 'on' && scheduleStatus !== 'enabled') return;

    const scheduledTime = localStorage.getItem('diary_schedule_time') || '23:30';
    const [hh, mm] = scheduledTime.split(':').map(Number);

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const lastGenerated = localStorage.getItem('diary_last_auto_generated_date');

    if (lastGenerated === todayKey) return; // already generated today

    if (now.getHours() === hh && now.getMinutes() === mm) {
      localStorage.setItem('diary_last_auto_generated_date', todayKey);
      console.log('[diary] Auto-schedule: triggering generation at', scheduledTime);
      handleGenerateNow();
    }
  }

  function initDiaryScheduler() {
    _checkDiarySchedule();
    setInterval(_checkDiarySchedule, 60 * 1000); // check every minute
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  window.SPDiary = {
    fetchLatestDiaryEntry,
    fetchDiaryEntries,
    fetchDiaryEntryById,
    generateDiary,
    updateHomeDiaryCard,
    navigateToDiaryList,
    navigateToDiaryDetail,
    initDiaryScheduler,
  };

})(window);
