// Debug Overlay for mobile debugging
(function() {
  'use strict';
  
  let debugPanel = null;
  let isVisible = false;
  
  function createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debugOverlay';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 320px;
      max-height: 80vh;
      background: rgba(0, 0, 0, 0.9);
      color: #0f0;
      font-family: monospace;
      font-size: 11px;
      padding: 10px;
      border-radius: 8px;
      z-index: 10000;
      overflow-y: auto;
      display: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    const content = document.createElement('div');
    content.id = 'debugContent';
    panel.appendChild(content);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: #f00;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      cursor: pointer;
    `;
    closeBtn.onclick = hideDebug;
    panel.appendChild(closeBtn);
    
    document.body.appendChild(panel);
    return panel;
  }
  
  function updateDebugInfo() {
    if (!debugPanel || !isVisible) return;
    
    const root = document.documentElement;
    const messageList = document.querySelector('.message-list');
    const inputBar = document.querySelector('.input-bar');
    const layout = document.querySelector('.layout');
    const content = document.getElementById('debugContent');
    
    if (!messageList || !inputBar) {
      content.innerHTML = '<div style="color: #f00;">Elements not found!</div>';
      return;
    }
    
    const vars = {
      chatInputHeight: getComputedStyle(root).getPropertyValue('--chat-input-height').trim(),
      bottomNavHeight: getComputedStyle(root).getPropertyValue('--bottom-nav-height').trim(),
      dockGap: getComputedStyle(root).getPropertyValue('--dock-gap').trim(),
      kb: getComputedStyle(root).getPropertyValue('--kb').trim(),
    };
    
    const msgListStyles = getComputedStyle(messageList);
    const inputBarStyles = getComputedStyle(inputBar);
    
    const scrollInfo = {
      scrollHeight: messageList.scrollHeight,
      clientHeight: messageList.clientHeight,
      scrollTop: messageList.scrollTop,
      maxScroll: messageList.scrollHeight - messageList.clientHeight,
      currentGap: (messageList.scrollHeight - messageList.clientHeight) - messageList.scrollTop,
    };
    
    const html = `
      <div style="color: #ff0; font-weight: bold; margin-bottom: 8px;">
        === CHAT DEBUG ===
      </div>
      
      <div style="color: #0ff; margin-top: 8px;">CSS Variables:</div>
      <div>--chat-input-height: <span style="color: #fff;">${vars.chatInputHeight}</span></div>
      <div>--bottom-nav-height: <span style="color: #fff;">${vars.bottomNavHeight}</span></div>
      <div>--dock-gap: <span style="color: #fff;">${vars.dockGap}</span></div>
      <div>--kb: <span style="color: #fff;">${vars.kb}</span></div>
      
      <div style="color: #0ff; margin-top: 8px;">Message List:</div>
      <div>padding-bottom: <span style="color: #fff;">${msgListStyles.paddingBottom}</span></div>
      <div>scrollHeight: <span style="color: #fff;">${scrollInfo.scrollHeight}px</span></div>
      <div>clientHeight: <span style="color: #fff;">${scrollInfo.clientHeight}px</span></div>
      <div>scrollTop: <span style="color: #fff;">${scrollInfo.scrollTop}px</span></div>
      <div>maxScroll: <span style="color: #fff;">${scrollInfo.maxScroll}px</span></div>
      <div style="color: ${scrollInfo.currentGap > 10 ? '#f00' : '#0f0'};">
        GAP: <span style="font-weight: bold;">${scrollInfo.currentGap.toFixed(1)}px</span>
      </div>
      
      <div style="color: #0ff; margin-top: 8px;">Input Bar:</div>
      <div>margin-bottom: <span style="color: #fff;">${inputBarStyles.marginBottom}</span></div>
      <div>height: <span style="color: #fff;">${inputBar.offsetHeight}px</span></div>
      
      <div style="color: #0ff; margin-top: 8px;">Layout:</div>
      <div>keyboard-open: <span style="color: ${layout.classList.contains('keyboard-open') ? '#0f0' : '#f00'};">
        ${layout.classList.contains('keyboard-open')}
      </span></div>
      
      <button onclick="window.debugScrollToBottom()" style="
        margin-top: 10px;
        width: 100%;
        padding: 8px;
        background: #0a0;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      ">Scroll To Bottom</button>
      
      <div style="color: #888; margin-top: 10px; font-size: 10px;">
        Updated: ${new Date().toLocaleTimeString()}
      </div>
    `;
    
    content.innerHTML = html;
  }
  
  function showDebug() {
    if (!debugPanel) {
      debugPanel = createDebugPanel();
    }
    isVisible = true;
    debugPanel.style.display = 'block';
    updateDebugInfo();
    // Auto-refresh every 500ms
    if (window._debugInterval) clearInterval(window._debugInterval);
    window._debugInterval = setInterval(updateDebugInfo, 500);
  }
  
  function hideDebug() {
    if (debugPanel) {
      debugPanel.style.display = 'none';
    }
    isVisible = false;
    if (window._debugInterval) {
      clearInterval(window._debugInterval);
      window._debugInterval = null;
    }
  }
  
  function toggleDebug() {
    if (isVisible) {
      hideDebug();
    } else {
      showDebug();
    }
  }
  
  // Expose global functions
  window.showDebug = showDebug;
  window.hideDebug = hideDebug;
  window.toggleDebug = toggleDebug;
  window.debugScrollToBottom = function() {
    const messageList = document.querySelector('.message-list');
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
      setTimeout(updateDebugInfo, 100);
    }
  };
  
  // Add toggle button - triple tap on top-right corner
  let tapCount = 0;
  let tapTimer = null;
  document.addEventListener('touchstart', function(e) {
    const touch = e.touches[0];
    if (touch.clientX > window.innerWidth - 100 && touch.clientY < 100) {
      tapCount++;
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 500);
      if (tapCount === 3) {
        toggleDebug();
        tapCount = 0;
      }
    }
  });
  
  console.log('Debug overlay loaded. Triple-tap top-right corner or call window.toggleDebug()');
})();
