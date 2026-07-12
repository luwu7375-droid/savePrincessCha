// Diary Generation Helper - Manual Trigger
// This file provides helper functions to trigger diary generation manually

(function(window) {
  'use strict';

  /**
   * Generate diary from recent chat messages
   * @param {number} messageCount - Number of recent messages to include (default: 20)
   */
  async function generateDiaryFromRecentChat(messageCount = 20) {
    const supabaseClient = window.supabaseClient;
    if (!supabaseClient) {
      throw new Error('Supabase client not available');
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id || window.currentUserId;
    if (!userId) throw new Error('User session is required for diary generation');
    const conversationId = typeof getActiveConversationId === 'function'
      ? getActiveConversationId()
      : (window.currentConversationId || 'default');

    // A diary day is always a Shanghai civil day, independent of the device or
    // server timezone. Convert its [00:00, next 00:00) boundary to UTC.
    const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
    const now = new Date();
    const shanghaiNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
    const diaryDate = [
      shanghaiNow.getUTCFullYear(),
      String(shanghaiNow.getUTCMonth() + 1).padStart(2, '0'),
      String(shanghaiNow.getUTCDate()).padStart(2, '0')
    ].join('-');
    const startUtc = new Date(`${diaryDate}T00:00:00+08:00`);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

    // Fetch every message from this Shanghai day across all conversations.
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('Failed to fetch messages:', error);
      throw new Error('Failed to fetch recent messages');
    }

    // Convert messages to source_events format
    const messageEvents = (messages || []).map(msg => ({
      id: `msg_${msg.id}`,
      source_type: msg.system_action === 'game_played' ? 'game' : 'chat',
      source_boundary: msg.system_action === 'game_played' ? 'shared_activity' : 'current_experience',
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
      with_kk: msg.role === 'user' || msg.role === 'assistant',
      reliability: 'experienced'
    }));

    // Merge Cha/Playground activity recorded by web reads, phone actions and
    // future Playground modules. Preserve timestamps and source boundaries.
    const { data: activities, error: activityError } = await supabaseClient
      .from('cha_activity_log')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .order('created_at', { ascending: true })
      .limit(1000);
    if (activityError) console.warn('[diary] Failed to fetch activity sources:', activityError);

    const activityEvents = (activities || [])
      .filter(activity => activity.status !== 'error' && activity.status !== 'timeout')
      .map(activity => ({
        id: `activity_${activity.id}`,
        source_type: activity.action_type || 'activity',
        source_boundary: activity.source_type === 'shared_activity' ? 'shared_activity' : 'self_life',
        content: activity.summary || activity.excerpt || activity.title || activity.query || activity.url || activity.action_type,
        created_at: activity.created_at,
        with_kk: activity.source_type === 'shared_activity',
        reliability: 'experienced'
      }));

    const sourceEvents = [...messageEvents, ...activityEvents]
      .filter(event => event.content)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (sourceEvents.length === 0) throw new Error(`No diary sources found for ${diaryDate} (Asia/Shanghai)`);

    // Scene context — diary generation does not use worldbooks
    // (worldbooks are chat-only; injected by supabase/functions/chat/index.ts)
    const sceneContext = '聊天结束后';

    // Generate diary
    const result = await window.SPDiary.generateDiary(supabaseClient, {
      userId,
      conversationId,
      sourceEvents,
      sceneContext,
      chaStatus: '独处',
      diaryLength: 'normal',
      diaryDate,
      timezone: 'Asia/Shanghai',
      debug: true  // Enable debug mode to see raw responses
    });

    return result;
  }

  /**
   * Show diary generation UI (button handler)
   */
  async function showDiaryGenerationUI() {
    const btn = document.getElementById('diaryGenerateBtn');
    if (!btn) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '生成中...';

    try {
      const result = await generateDiaryFromRecentChat(20);

      if (result.success && result.saved) {
        btn.textContent = '生成成功 ✓';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;

          // Refresh diary list
          if (window.SPDiary) {
            window.SPDiary.navigateToDiaryList();
          }
        }, 1500);
      } else {
        throw new Error(result.checker ? result.checker.problems.join(', ') : 'Generation failed');
      }
    } catch (err) {
      console.error('Diary generation failed:', err);
      btn.textContent = '生成失败';
      if (typeof showToast === 'function') showToast(`日记生成失败：${err.message}`);
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }

  // Export
  window.SPDiaryGeneration = {
    generateDiaryFromRecentChat,
    showDiaryGenerationUI
  };

  // Setup event delegation for dynamically created diary generate button
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'diaryGenerateBtn') {
      showDiaryGenerationUI();
    }
  });

})(window);
