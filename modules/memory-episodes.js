// ── memory-episodes.js ────────────────────────────────────────────────────────
//
// Memory Episodes (城南旧事) - UI module for displaying narrative episodes

/**
 * Fetch narrative episodes from backend
 */
async function fetchNarrativeEpisodes(userId, limit = 10) {
  const endpoint = `${window.MEMORIES_API_ENDPOINT || '/api/memories'}?type=episodes&userId=${userId}&limit=${limit}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${window.SUPABASE_ANON_KEY || ''}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch episodes: ${response.status}`);
    }

    const data = await response.json();
    return data.episodes || [];
  } catch (error) {
    console.error('fetchNarrativeEpisodes error:', error);
    return [];
  }
}

/**
 * Render a single episode card
 */
function renderEpisodeCard(episode) {
  const card = document.createElement('div');
  card.className = 'memory-episode-card';
  card.dataset.episodeId = episode.id;

  // Format date
  const date = new Date(episode.created_at);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Episode type label
  const typeLabels = {
    fact: '事实',
    preference: '偏好',
    relationship_event: '关系事件',
    unfinished_thread: '未完成',
    shared_experience: '共同经历',
    cha_reflection: 'Cha的感受',
  };
  const typeLabel = typeLabels[episode.episode_type] || episode.episode_type;

  // Build card HTML
  card.innerHTML = `
    <div class="episode-header">
      <div class="episode-meta">
        <span class="episode-type episode-type-${episode.episode_type}">${typeLabel}</span>
        <span class="episode-date">${dateStr}</span>
        ${episode.user_favorited ? '<span class="episode-favorited">★</span>' : ''}
      </div>
      <h3 class="episode-title">${escapeHtml(episode.title)}</h3>
    </div>

    <div class="episode-content">
      <p class="episode-narrative">${escapeHtml(episode.narrative_content)}</p>

      ${episode.cha_feeling ? `
        <div class="episode-feeling">
          <strong>小cha的感受：</strong>
          <p>${escapeHtml(episode.cha_feeling)}</p>
        </div>
      ` : ''}

      ${episode.themes && episode.themes.length > 0 ? `
        <div class="episode-themes">
          ${episode.themes.map(theme => `<span class="episode-theme">${escapeHtml(theme)}</span>`).join('')}
        </div>
      ` : ''}
    </div>

    <div class="episode-footer">
      <button class="episode-expand-btn" data-expanded="false">
        查看原始对话 ▼
      </button>
      <div class="episode-sources" style="display: none;">
        <p class="sources-loading">加载中...</p>
      </div>
    </div>
  `;

  // Add expand/collapse handler
  const expandBtn = card.querySelector('.episode-expand-btn');
  const sourcesDiv = card.querySelector('.episode-sources');

  expandBtn.addEventListener('click', async () => {
    const isExpanded = expandBtn.dataset.expanded === 'true';

    if (!isExpanded) {
      // Expand - load sources
      sourcesDiv.style.display = 'block';
      expandBtn.textContent = '收起 ▲';
      expandBtn.dataset.expanded = 'true';

      // Load source messages
      await loadEpisodeSources(episode, sourcesDiv);
    } else {
      // Collapse
      sourcesDiv.style.display = 'none';
      expandBtn.textContent = '查看原始对话 ▼';
      expandBtn.dataset.expanded = 'false';
    }
  });

  return card;
}

/**
 * Load and display episode source messages
 */
async function loadEpisodeSources(episode, container) {
  if (!episode.source_msg_ids || episode.source_msg_ids.length === 0) {
    container.innerHTML = '<p class="no-sources">暂无原始对话记录</p>';
    return;
  }

  try {
    // Fetch messages by IDs
    const endpoint = `${window.SUPABASE_URL || ''}/rest/v1/messages`;
    const ids = episode.source_msg_ids.slice(0, 10); // Limit to first 10
    const query = `id=in.(${ids.join(',')})&order=created_at.asc&select=id,role,content,created_at`;

    const response = await fetch(`${endpoint}?${query}`, {
      headers: {
        'Authorization': `Bearer ${window.SUPABASE_ANON_KEY || ''}`,
        'apikey': window.SUPABASE_ANON_KEY || '',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.status}`);
    }

    const messages = await response.json();

    if (!messages || messages.length === 0) {
      container.innerHTML = '<p class="no-sources">原始对话不可用</p>';
      return;
    }

    // Render messages
    const messagesHtml = messages.map(msg => {
      const date = new Date(msg.created_at);
      const timeStr = date.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const roleLabel = msg.role === 'user' ? 'kk' : '小cha';
      const content = msg.content.length > 200
        ? msg.content.slice(0, 200) + '...'
        : msg.content;

      return `
        <div class="source-message source-${msg.role}">
          <div class="source-meta">
            <span class="source-role">${roleLabel}</span>
            <span class="source-time">${timeStr}</span>
          </div>
          <div class="source-content">${escapeHtml(content)}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="sources-header">原始对话片段</div>
      <div class="sources-list">
        ${messagesHtml}
      </div>
    `;
  } catch (error) {
    console.error('loadEpisodeSources error:', error);
    container.innerHTML = '<p class="sources-error">加载失败，请稍后重试</p>';
  }
}

/**
 * Render episodes list in a container
 */
function renderEpisodesList(episodes, container) {
  if (!episodes || episodes.length === 0) {
    container.innerHTML = '<div class="no-episodes">暂无记忆片段</div>';
    return;
  }

  container.innerHTML = '';
  episodes.forEach(episode => {
    const card = renderEpisodeCard(episode);
    container.appendChild(card);
  });
}

/**
 * Initialize Memory Episodes UI
 */
async function initMemoryEpisodesUI(containerId, userId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Memory episodes container not found:', containerId);
    return;
  }

  // Show loading
  container.innerHTML = '<div class="episodes-loading">加载中...</div>';

  // Fetch episodes
  const episodes = await fetchNarrativeEpisodes(userId);

  // Render
  renderEpisodesList(episodes, container);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchNarrativeEpisodes,
    renderEpisodeCard,
    renderEpisodesList,
    initMemoryEpisodesUI,
  };
}
