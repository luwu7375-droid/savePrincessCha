(function () {
  "use strict";

  let mountEl = null;
  let connections = [];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  async function request(body) {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase 未初始化");
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("请先登录");
    const base = client.supabaseUrl || window.SUPABASE_URL;
    const response = await fetch(`${base}/functions/v1/mcp-host`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function toolRows(connection) {
    if (!connection.tools?.length) {
      return '<div class="settings-card-row"><small>尚未发现工具。先点“连接并刷新”。</small></div>';
    }
    return connection.tools.map((tool) => `
      <div class="settings-card-row settings-card-row--stacked" data-mcp-tool-row>
        <div style="display:flex;gap:8px;align-items:center;width:100%">
          <div style="flex:1;min-width:0"><strong>${escapeHtml(tool.remote_name)}</strong><small>${escapeHtml(tool.description || "无描述")}</small></div>
          <label class="settings-toggle"><input type="checkbox" data-mcp-toggle-tool="${escapeHtml(tool.remote_name)}" data-connection-id="${connection.id}" ${tool.enabled ? "checked" : ""}><span class="settings-toggle-slider"></span></label>
        </div>
        <div style="display:flex;gap:8px;width:100%;align-items:center">
          <select class="settings-select" data-mcp-risk="${escapeHtml(tool.remote_name)}" data-connection-id="${connection.id}" style="flex:1">
            <option value="read" ${tool.risk_level === "read" ? "selected" : ""}>只读，可自动执行</option>
            <option value="write" ${tool.risk_level === "write" ? "selected" : ""}>写入，调用前确认</option>
            <option value="high_risk" ${tool.risk_level === "high_risk" ? "selected" : ""}>高风险，调用前确认</option>
          </select>
          <button class="settings-row-action-btn settings-row-action-btn--sm" data-mcp-test-tool="${escapeHtml(tool.remote_name)}" data-connection-id="${connection.id}">测试</button>
        </div>
      </div>`).join("");
  }

  function render() {
    if (!mountEl) return;
    mountEl.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-label">远程 MCP</div>
        <div class="settings-card">
          ${connections.length ? connections.map((connection) => `
            <div class="settings-card-row settings-card-row--stacked">
              <div style="display:flex;align-items:center;gap:8px;width:100%">
                <div style="flex:1;min-width:0"><strong>${escapeHtml(connection.name)}</strong><small>${escapeHtml(connection.server_name || connection.endpoint)} · ${escapeHtml(connection.status)}</small></div>
                <button class="settings-row-action-btn settings-row-action-btn--sm" data-mcp-discover="${connection.id}">连接并刷新</button>
                <button class="settings-row-action-btn settings-row-action-btn--sm" data-mcp-edit="${connection.id}">编辑</button>
              </div>
              ${connection.last_error ? `<small style="color:#b64b4b">${escapeHtml(connection.last_error)}</small>` : ""}
            </div>
            ${toolRows(connection)}
          `).join("") : '<div class="settings-card-row"><small>还没有连接。成熟 MCP 和自建 MCP 都从这里添加。</small></div>'}
          <div class="settings-card-row"><button class="settings-row-action-btn" id="mcpAddConnection">+ 添加远程 MCP</button></div>
        </div>
      </div>
      <div class="settings-notice">当前支持 Streamable HTTP。凭证只由后端保存，页面只显示 Header 名称。新发现的工具默认关闭，写入工具不会自动执行。</div>`;
    bind();
  }

  async function load() {
    try {
      const result = await request({ action: "list" });
      connections = result.connections || [];
      render();
    } catch (error) {
      mountEl.innerHTML = `<div class="settings-empty-state"><strong>读取失败</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function showDialog(existing) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.style.cssText = "z-index:120;background:rgba(0,0,0,.4)";
    overlay.innerHTML = `<div class="modal" style="max-width:440px;background:#fff;color:#202020">
      <div class="modal-header"><span>${existing ? "编辑" : "添加"} MCP</span><button data-close>✕</button></div>
      <div style="padding:14px 18px 18px;display:flex;flex-direction:column;gap:10px">
        <input class="settings-text-input" id="mcpName" placeholder="名称，例如 Context7" value="${escapeHtml(existing?.name || "")}">
        <input class="settings-text-input" id="mcpEndpoint" placeholder="https://example.com/mcp" value="${escapeHtml(existing?.endpoint || "")}">
        <select class="settings-select" id="mcpTransport"><option value="streamable_http">Streamable HTTP</option></select>
        <textarea class="settings-text-input" id="mcpHeaders" rows="5" placeholder='可选 Header JSON，例如 {"Authorization":"Bearer ..."}'></textarea>
        ${existing?.header_names?.length ? `<small>已保存：${escapeHtml(existing.header_names.join(", "))}。留空将保留原值。</small>` : ""}
        <div id="mcpDialogError" style="font-size:12px;color:#b64b4b"></div>
        <div style="display:flex;gap:8px"><button class="settings-row-action-btn" data-close>取消</button><button class="settings-row-action-btn" id="mcpSave" style="flex:1">保存</button>${existing ? '<button class="settings-row-action-btn" id="mcpDelete">删除</button>' : ""}</div>
      </div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => overlay.remove()));
    overlay.querySelector("#mcpSave").addEventListener("click", async () => {
      const errorEl = overlay.querySelector("#mcpDialogError");
      try {
        const rawHeaders = overlay.querySelector("#mcpHeaders").value.trim();
        const headers = rawHeaders ? JSON.parse(rawHeaders) : undefined;
        await request({ action: "save", id: existing?.id, name: overlay.querySelector("#mcpName").value.trim(), endpoint: overlay.querySelector("#mcpEndpoint").value.trim(), transport: "streamable_http", headers });
        overlay.remove(); await load();
      } catch (error) { errorEl.textContent = error.message; }
    });
    overlay.querySelector("#mcpDelete")?.addEventListener("click", async () => {
      if (!confirm(`删除 MCP 连接“${existing.name}”？`)) return;
      await request({ action: "delete", id: existing.id }); overlay.remove(); await load();
    });
  }

  async function testTool(connectionId, toolName) {
    const raw = prompt(`测试 ${toolName}\n输入 JSON 参数`, "{}");
    if (raw == null) return;
    try {
      const result = await request({ action: "test_tool", id: connectionId, toolName, arguments: JSON.parse(raw) });
      alert(JSON.stringify(result.result, null, 2).slice(0, 8000));
    } catch (error) { alert(`测试失败：${error.message}`); }
  }

  function bind() {
    mountEl.querySelector("#mcpAddConnection")?.addEventListener("click", () => showDialog(null));
    mountEl.querySelectorAll("[data-mcp-edit]").forEach((button) => button.addEventListener("click", () => showDialog(connections.find((item) => item.id === button.dataset.mcpEdit))));
    mountEl.querySelectorAll("[data-mcp-discover]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true; button.textContent = "连接中…";
      try { await request({ action: "discover", id: button.dataset.mcpDiscover }); await load(); }
      catch (error) { alert(`连接失败：${error.message}`); button.disabled = false; button.textContent = "连接并刷新"; }
    }));
    mountEl.querySelectorAll("[data-mcp-toggle-tool]").forEach((input) => input.addEventListener("change", async () => {
      const risk = mountEl.querySelector(`[data-mcp-risk="${CSS.escape(input.dataset.mcpToggleTool)}"]`)?.value || "write";
      await request({ action: "set_tool", id: input.dataset.connectionId, toolName: input.dataset.mcpToggleTool, enabled: input.checked, riskLevel: risk });
    }));
    mountEl.querySelectorAll("[data-mcp-risk]").forEach((select) => select.addEventListener("change", async () => {
      const toggle = mountEl.querySelector(`[data-mcp-toggle-tool="${CSS.escape(select.dataset.mcpRisk)}"]`);
      await request({ action: "set_tool", id: select.dataset.connectionId, toolName: select.dataset.mcpRisk, enabled: !!toggle?.checked, riskLevel: select.value });
    }));
    mountEl.querySelectorAll("[data-mcp-test-tool]").forEach((button) => button.addEventListener("click", () => testTool(button.dataset.connectionId, button.dataset.mcpTestTool)));
  }

  window.SPMcpManager = { mount(element) { mountEl = element; if (mountEl) load(); } };
})();
