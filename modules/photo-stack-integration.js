// ============================================================================
// Photo Stack Integration Module - WeChat-style Stacked Photo Card
// ============================================================================
// Integrates PhotoStack component for multi-image message display
// Based on: Wren036/PhotoStack - https://github.com/Wren036/PhotoStack

(function() {
  "use strict";

  // ── PhotoStack Core (embedded) ──────────────────────────────────────────
  const DEFAULTS = {
    width: 220,        // 适配 savePrincessCha 的图片显示尺寸
    height: 280,
    peek: 15,
    peekStep: 12,
    rotStep: 2.2,
    scaleStep: 0.06,
    flingVel: 0.4,
    counter: true,     // 显示 n/N 角标
    onTap: null,
    onChange: null
  };

  class PhotoStack {
    constructor(container, images, options) {
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      this.images = images.slice();
      this.opt = Object.assign({}, DEFAULTS, options || {});
      this.cur = 0;
      this._anim = null;
      this._animDir = 0;
      this._build();
      this._bindGesture();
      this._apply();
    }

    _build() {
      const o = this.opt;
      this.stage = document.createElement('div');
      this.stage.className = 'pstack-stage';
      this.stage.style.width = o.width + 'px';
      this.stage.style.height = o.height + 'px';
      this.cards = this.images.map((src, i) => {
        const c = document.createElement('div');
        c.className = 'pstack-card';
        c.dataset.i = i;
        const im = document.createElement('img');
        im.src = src;
        im.draggable = false;
        im.setAttribute("loading", "lazy");
        c.appendChild(im);
        this.stage.appendChild(c);
        return c;
      });
      if (o.counter && this.images.length > 1) {
        this.badge = document.createElement('span');
        this.badge.className = 'pstack-badge';
        this.stage.appendChild(this.badge);
      }
      this.el.appendChild(this.stage);
    }

    _lr(cur) {
      const n = this.cards.length;
      const la = cur, ra = n - 1 - cur;
      let L = Math.min(la, 1), R = Math.min(ra, 1);
      if (L + R < 2) { L = Math.min(la, 2 - R); R = Math.min(ra, 2 - L); }
      return [L, R];
    }

    _apply() {
      const o = this.opt, cur = this.cur;
      const [L, R] = this._lr(cur);
      this.cards.forEach((c, i) => {
        let t, z, op = 1;
        if (i < cur) {
          const d = cur - i;
          t = `translateX(${-o.peek - (d - 1) * o.peekStep}px) rotate(${-o.rotStep * d}deg) scale(${1 - o.scaleStep * d})`;
          z = 40 - d; op = d > L ? 0 : 1;
        } else if (i === cur) {
          t = 'translateX(0)'; z = 100;
        } else {
          const d = i - cur;
          t = `translateX(${o.peek + (d - 1) * o.peekStep}px) rotate(${o.rotStep * d}deg) scale(${1 - o.scaleStep * d})`;
          z = 100 - d; op = d > R ? 0 : 1;
        }
        c.style.transform = t; c.style.zIndex = z; c.style.opacity = op;
      });
      if (this.badge) this.badge.textContent = (cur + 1) + '/' + this.cards.length;
    }

    _progress(dx, D) { return Math.min(1, Math.abs(dx) / Math.max(120, D || 240)); }

    _scrub(dir, p) {
      const o = this.opt, cards = this.cards, cur = this.cur;
      const w = this.stage.offsetWidth || o.width;
      const maxX = w * 0.52;
      cards.forEach(c => { c.style.transition = 'none'; });
      this._apply();

      if ((dir < 0 && cur >= cards.length - 1) || (dir > 0 && cur <= 0)) {
        cards[cur].style.transform = `translateX(${dir * 24 * p}px) rotate(${dir * 2.5 * p}deg)`;
        cards[cur].style.zIndex = 110;
        const n1 = cards[cur + dir], n2 = cards[cur + dir * 2];
        if (n1) n1.style.transform = `translateX(${dir * (o.peek + 8 * p)}px) rotate(${dir * o.rotStep}deg) scale(${1 - o.scaleStep})`;
        if (n2) n2.style.transform = `translateX(${dir * (o.peek + o.peekStep + 5 * p)}px) rotate(${dir * o.rotStep * 2}deg) scale(${1 - o.scaleStep * 2})`;
        return;
      }

      let cx, rot, sc;
      if (p <= 0.5) { const q = p / 0.5; cx = dir * maxX * q; rot = dir * 8 * q; sc = 1; }
      else { const q = (p - 0.5) / 0.5; cx = dir * (maxX - (maxX - o.peek) * q); rot = dir * (8 - (8 - o.rotStep) * q); sc = 1 - o.scaleStep * q; }
      cards[cur].style.transform = `translateX(${cx}px) rotate(${rot}deg) scale(${sc})`;
      cards[cur].style.zIndex = p < 0.5 ? 110 : 102;

      const nt = cards[cur - dir];
      nt.style.transform = `translateX(${-dir * o.peek * (1 - p)}px) rotate(${-dir * o.rotStep * (1 - p)}deg) scale(${1 - o.scaleStep + o.scaleStep * p})`;
      nt.style.opacity = 1; nt.style.zIndex = 105;

      const nn = cards[cur - dir * 2];
      if (nn) {
        nn.style.transform = `translateX(${-dir * (o.peek + o.peekStep - 12 * p)}px) rotate(${-dir * (o.rotStep * 2 - o.rotStep * p)}deg) scale(${1 - o.scaleStep * 2 + o.scaleStep * p})`;
        nn.style.opacity = String(Math.max(parseFloat(nn.style.opacity) || 0, Math.max(0, (p - 0.45) / 0.55)));
        nn.style.zIndex = dir < 0 ? 98 : 38;
      }

      const old2 = cards[cur + dir];
      if (old2) {
        const newCur = dir < 0 ? Math.min(cur + 1, cards.length - 1) : Math.max(cur - 1, 0);
        const [L2, R2] = this._lr(newCur);
        const oi = cur + dir;
        const stays = oi < newCur ? (newCur - oi) <= L2 : (oi - newCur) <= R2;
        if (!stays) {
          old2.style.opacity = String(Math.max(0, 1 - p / 0.55));
        } else {
          old2.style.transform = `translateX(${dir * (o.peek + o.peekStep * p)}px) rotate(${dir * (o.rotStep + o.rotStep * p)}deg) scale(${1 - o.scaleStep - o.scaleStep * p})`;
        }
      }
    }

    _finish(dir, fromP) {
      if (this._anim) cancelAnimationFrame(this._anim);
      this._animDir = dir;
      const dur = Math.max(140, (1 - fromP) * 340);
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        this._scrub(dir, fromP + (1 - fromP) * (1 - Math.pow(1 - k, 2)));
        if (k < 1) { this._anim = requestAnimationFrame(step); return; }
        this._anim = null; this._animDir = 0;
        const n = this.cards.length;
        this.cur = dir < 0 ? Math.min(this.cur + 1, n - 1) : Math.max(this.cur - 1, 0);
        this.cards.forEach(c => { c.style.transition = ''; });
        this._apply();
        if (this.opt.onChange) this.opt.onChange(this.cur);
      };
      this._anim = requestAnimationFrame(step);
    }

    _release(dx, D, vel) {
      const dir = dx < 0 ? -1 : 1;
      const p = this._progress(dx, D);
      const can = dir < 0 ? this.cur < this.cards.length - 1 : this.cur > 0;
      const fling = Math.abs(vel || 0) > this.opt.flingVel && Math.sign(vel || 0) === Math.sign(dx) && p > 0.04;
      if (can && (p > 0.5 || fling)) { this._finish(dir, p); return; }
      this.cards.forEach(c => { c.style.transition = ''; });
      this._apply();
    }

    _bindGesture() {
      const st = this.stage;
      let sx = null, sy = 0, dragging = false, swiped = false, lastX = 0, lastT = 0, vel = 0;
      st.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY;
        lastX = sx; lastT = e.timeStamp; vel = 0;
        dragging = false; swiped = false;
        st.setPointerCapture(e.pointerId);
      });
      st.addEventListener('pointermove', (e) => {
        if (sx === null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (e.timeStamp > lastT) vel = 0.7 * ((e.clientX - lastX) / (e.timeStamp - lastT)) + 0.3 * vel;
        lastX = e.clientX; lastT = e.timeStamp;
        if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) dragging = true;
        if (dragging) {
          e.preventDefault();
          if (this._anim) {
            cancelAnimationFrame(this._anim); this._anim = null;
            if (this._animDir) {
              const n = this.cards.length;
              this.cur = this._animDir < 0 ? Math.min(this.cur + 1, n - 1) : Math.max(this.cur - 1, 0);
              this._animDir = 0;
            }
          }
          this._scrub(dx < 0 ? -1 : 1, this._progress(dx, sx));
        }
      });
      const up = (e) => {
        if (sx === null) return;
        const dx = e.clientX - sx, D = sx;
        sx = null;
        if (dragging) { swiped = true; this._release(dx, D, vel); dragging = false; }
      };
      st.addEventListener('pointerup', up);
      st.addEventListener('pointercancel', () => {
        if (dragging) { this._release(0); dragging = false; }
        sx = null;
      });
      st.addEventListener('click', () => {
        if (swiped) { swiped = false; return; }
        if (this.opt.onTap) this.opt.onTap(this.cur);
      });
      st.style.touchAction = 'pan-y';
    }

    get index() { return this.cur; }
    goto(i) {
      i = Math.max(0, Math.min(this.cards.length - 1, i));
      if (i === this.cur) return;
      this._finish(i > this.cur ? -1 : 1, 0);
      if (Math.abs(i - this.cur) > 1) {
        cancelAnimationFrame(this._anim); this._anim = null; this._animDir = 0;
        this.cur = i;
        this.cards.forEach(c => { c.style.transition = ''; });
        this._apply();
        if (this.opt.onChange) this.opt.onChange(this.cur);
      }
    }
    next() { if (this.cur < this.cards.length - 1) this._finish(-1, 0); }
    prev() { if (this.cur > 0) this._finish(1, 0); }
    destroy() {
      if (this._anim) cancelAnimationFrame(this._anim);
      this.stage.remove();
    }
  }

  // ── Integration API ────────────────────────────────────────────────────

  /**
   * 检测连续的图片消息组，返回需要合并的图片组
   * @param {Array} imageParts - 图片部分数组
   * @returns {boolean} 是否应该使用 PhotoStack
   */
  function shouldUsePhotoStack(imageParts) {
    // 2张或以上的图片才使用 PhotoStack
    return imageParts && imageParts.length >= 2;
  }

  /**
   * 创建 PhotoStack 消息
   * @param {Array} imageParts - 图片部分数组
   * @param {string} role - 消息角色
   * @param {Object} options - 选项
   * @returns {HTMLElement} 创建的消息元素
   */
  function createPhotoStackMessage(imageParts, role, options = {}) {
    const imageUrls = imageParts.map(p => p.image_url.url);

    const container = document.createElement('div');
    container.className = `message ${role} ${role === "assistant" ? "cha-message" : "user-message"} message-photostack`;

    // 如果有引用回复，添加引用块
    if (options.replyTo && window.makeQuoteBlock) {
      container.appendChild(window.makeQuoteBlock(options.replyTo));
    }

    const stackWrapper = document.createElement('div');
    stackWrapper.className = 'photostack-wrapper';
    container.appendChild(stackWrapper);

    // 创建 PhotoStack 实例
    const stack = new PhotoStack(stackWrapper, imageUrls, {
      width: 220,
      height: 280,
      counter: true,
      onTap: (index) => {
        // 点击时打开图片查看器
        if (window.showLightbox) {
          window.showLightbox(imageUrls[index], imageUrls, index);
        }
      },
      onChange: (index) => {
        // 翻页回调，可以用于统计等
        console.log('Current photo:', index);
      }
    });

    // 存储实例以便后续访问
    container._photoStackInstance = stack;

    return container;
  }

  /**
   * 增强的 addMessage 函数，支持 PhotoStack
   * 这个函数会检查是否应该使用 PhotoStack，并相应地渲染
   */
  function addMessageWithPhotoStack(text, role, createdAt = new Date().toISOString(), options = {}, msgId = null) {
    // 检测是否有多张图片
    const isArray = Array.isArray(text);
    const imageParts = isArray ? text.filter(p => p.type === "image_url" && p.image_url?.url) : [];
    const textParts = isArray ? text.filter(p => p.type === "text" && p.text) : [];
    const hasImages = imageParts.length > 0;
    const hasText = textParts.length > 0 || (!isArray && text);

    // 如果有多张图片，使用 PhotoStack
    if (shouldUsePhotoStack(imageParts)) {
      if (!options.skipTimeSeparator && window.maybeAddTimeSeparator) {
        window.maybeAddTimeSeparator(createdAt);
      }

      const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const readByChaAt = options.readByChaAt ?? null;

      function makeRow(id) {
        const row = document.createElement("div");
        row.className = `msg-row ${role}`;
        if (id) row.dataset.msgId = id;
        row.dataset.groupId = groupId;
        if (role === "assistant") {
          const avatar = document.createElement("div");
          avatar.className = "avatar";
          avatar.title = "Cha";
          row.appendChild(avatar);
        }
        return row;
      }

      function makeReceipt(isChaRead) {
        const el = document.createElement("div");
        el.className = "read-receipt";
        el.textContent = isChaRead ? "已读" : "未读";
        el.dataset.receiptState = isChaRead ? "read" : "unread";
        return el;
      }

      let firstEl = null;

      // 如果有文字，先渲染文字气泡
      if (hasText) {
        const el = document.createElement("div");
        el.className = `message ${role} ${role === "assistant" ? "cha-message" : "user-message"} message-text`;
        const cacheIdStr = msgId != null ? String(msgId) : (options.tempId || undefined);
        if (window.setMessageContent) {
          window.setMessageContent(el, isArray ? textParts.map(p => p.text).join("") : (text || ""), { messageId: cacheIdStr });
        } else {
          el.textContent = isArray ? textParts.map(p => p.text).join("") : (text || "");
        }

        if (options.replyTo && window.makeQuoteBlock) {
          el.prepend(window.makeQuoteBlock(options.replyTo));
        }

        const stack = document.createElement("div");
        stack.className = "msg-stack";
        stack.appendChild(el);

        if (role === "assistant" && window.SPVoice) {
          const speakerBtn = window.SPVoice.createSpeakerButton(el, msgId);
          stack.appendChild(speakerBtn);
          window.SPVoice.attachVoicePlayback(el, speakerBtn, msgId);
        }

        const row = makeRow(null);
        row.appendChild(stack);
        if (window.messageList) window.messageList.appendChild(row);
        if (!firstEl) firstEl = el;
      }

      // 渲染 PhotoStack
      const photoStackEl = createPhotoStackMessage(imageParts, role, {
        replyTo: (!hasText && options.replyTo) ? options.replyTo : null
      });

      const stack = document.createElement("div");
      stack.className = "msg-stack";
      stack.appendChild(photoStackEl);

      if (role === "user") stack.appendChild(makeReceipt(!!readByChaAt));

      const row = makeRow(msgId);
      if (hasText) row.classList.add("msg-group-row");
      row.appendChild(stack);

      if (window.messageList) {
        window.messageList.appendChild(row);
        window.messageList.scrollTop = window.messageList.scrollHeight;
      }

      return firstEl || photoStackEl;
    }

    // 否则使用原始的 addMessage 函数
    if (window.SavePrincessMessageRenderer && window.SavePrincessMessageRenderer.addMessage) {
      return window.SavePrincessMessageRenderer.addMessage(text, role, createdAt, options, msgId);
    }

    return null;
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.PhotoStackIntegration = {
    PhotoStack,
    shouldUsePhotoStack,
    createPhotoStackMessage,
    addMessageWithPhotoStack
  };

})();
