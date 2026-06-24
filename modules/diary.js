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
  async function fetchDiaryEntryById(supabaseClient, entryId) {
    try {
      const { data, error } = await supabaseClient
        .from('xiaocha_diary_entries')
        .select('*')
        .eq('id', entryId)
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

    try {
      const response = await fetch(`${supabaseClient.supabaseUrl}/functions/v1/diary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseClient.supabaseKey}`
        },
        body: JSON.stringify({
          userId,
          conversationId,
          source_events: sourceEvents,
          scene_context: sceneContext,
          cha_status: chaStatus,
          diary_length: diaryLength,
          debug
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
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
    const diaryNote = diaryCard.querySelector('.diary-note');

    // Update kicker with relative time
    const relativeTime = formatRelativeTime(entry.created_at);
    if (kicker) {
      const span = kicker.querySelector('span');
      if (span) span.textContent = relativeTime;
    }

    // Update content (truncate private_body to 2-4 lines, ~80-160 chars)
    if (contentP) {
      const truncated = truncateText(entry.private_body, 120);
      contentP.textContent = truncated;
    }

    // Update want_to_share if present
    if (diaryNote && entry.want_to_share) {
      const wantToShareHTML = `<span style="opacity: 0.6; font-size: 0.9em;">想说：${escapeHtml(entry.want_to_share)}</span>`;
      diaryNote.innerHTML = wantToShareHTML + '<span>翻开日记 →</span>';
    }

    // Store entry ID for navigation
    diaryCard.dataset.diaryId = entry.id;
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
    `;

    scroll.appendChild(header);

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

    // Main body
    const body = document.createElement('article');
    body.className = 'diary-detail-body soft-card';

    const privateBody = document.createElement('div');
    privateBody.className = 'diary-private-body';
    privateBody.textContent = entry.private_body;

    body.appendChild(privateBody);

    // Want to share section
    if (entry.want_to_share) {
      const wantToShare = document.createElement('div');
      wantToShare.className = 'diary-want-to-share';
      wantToShare.innerHTML = `
        <p class="diary-section-label">明天也许想说</p>
        <p>${escapeHtml(entry.want_to_share)}</p>
      `;
      body.appendChild(wantToShare);
    }

    scroll.appendChild(body);

    // Reflection fields (collapsed/light cards)
    const reflectionFields = [];
    if (entry.felt_sense) reflectionFields.push({ label: '感受', content: entry.felt_sense });
    if (entry.stuck_point) reflectionFields.push({ label: '卡住的地方', content: entry.stuck_point });
    if (entry.insight) reflectionFields.push({ label: '隐约理解到', content: entry.insight });
    if (entry.changed) reflectionFields.push({ label: '会怎么不同', content: entry.changed });

    if (reflectionFields.length > 0) {
      const reflectionContainer = document.createElement('div');
      reflectionContainer.className = 'diary-reflection-fields';

      reflectionFields.forEach(field => {
        const fieldCard = document.createElement('div');
        fieldCard.className = 'diary-reflection-card soft-card';
        fieldCard.innerHTML = `
          <p class="diary-section-label">${field.label}</p>
          <p>${escapeHtml(field.content)}</p>
        `;
        reflectionContainer.appendChild(fieldCard);
      });

      scroll.appendChild(reflectionContainer);
    }

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
    const sc = window.supabaseClient;
    if (!sc) return;
    const overlay = _getDiaryOverlay();
    overlay.innerHTML = '<div class="v2-scroll diary-overlay-scroll"><p style="padding:2rem;opacity:.5">加载中…</p></div>';
    overlay.classList.remove('hidden');

    fetchDiaryEntries(sc, window.currentUserId || 'default')
      .then(({ entries, total }) => {
        const page = renderDiaryListPage(entries, total);
        page.classList.add('v2-active');
        overlay.innerHTML = '';
        overlay.appendChild(page);
        overlay.querySelector('#diaryListCloseBtn')?.addEventListener('click', () => {
          overlay.classList.add('hidden');
        });
      })
      .catch(err => console.error('Failed to load diary list:', err));
  }

  function navigateToDiaryDetail(entryId) {
    const sc = window.supabaseClient;
    if (!sc) return;
    const overlay = _getDiaryOverlay();

    fetchDiaryEntryById(sc, entryId)
      .then(entry => {
        if (!entry) return;
        const page = renderDiaryDetailPage(entry);
        page.classList.add('v2-active');
        overlay.innerHTML = '';
        overlay.appendChild(page);
        overlay.querySelector('#diaryBackBtn')?.addEventListener('click', navigateToDiaryList);
      })
      .catch(err => console.error('Failed to load diary detail:', err));
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

  // ── Export ─────────────────────────────────────────────────────────────────

  window.SPDiary = {
    fetchLatestDiaryEntry,
    fetchDiaryEntries,
    fetchDiaryEntryById,
    generateDiary,
    updateHomeDiaryCard,
    navigateToDiaryList,
    navigateToDiaryDetail
  };

})(window);
