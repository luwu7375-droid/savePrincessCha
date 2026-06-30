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

    const userId = window.currentUserId || 'default';
    const conversationId = typeof getActiveConversationId === 'function'
      ? getActiveConversationId()
      : (window.currentConversationId || 'default');

    // Fetch recent messages
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(messageCount);

    if (error) {
      console.error('Failed to fetch messages:', error);
      throw new Error('Failed to fetch recent messages');
    }

    if (!messages || messages.length === 0) {
      throw new Error('No messages found in current conversation');
    }

    // Convert messages to source_events format
    const sourceEvents = messages.reverse().map(msg => ({
      id: `msg_${msg.id}`,
      source_type: 'chat',
      source_boundary: 'current_experience',
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
      with_kk: msg.role === 'user' || msg.role === 'assistant',
      reliability: 'experienced'
    }));

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
