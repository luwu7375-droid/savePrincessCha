// modules/cost-dashboard.js
// 成本驾驶舱 — renders the cost subpage inside Settings.
// Depends on: window.SPCostConfig (cost-config.js), Chart.js 4.x global, window._supabase

(function () {
  "use strict";

  // -- helpers ----------------------------------------------------------------

  function fmtCny(n, precision) {
    if (n == null) return "—";
    // For recent calls table, show 6 decimals for better precision
    if (precision === "detailed") {
      return "¥" + n.toFixed(6);
    }
    // For summary cards, keep readable format
    if (n < 0.001) return "< ¥0.001";
    return "¥" + n.toFixed(n >= 10 ? 2 : 4);
  }

  function fmtNum(n) {
    if (n == null) return "—";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return String(n);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
  }

  function getSupabase() {
    return window.supabaseClient || window._supabase || null;
  }

  // -- Balance localStorage keys ----------------------------------------------

  var BALANCE_KEY = "cost_dashboard_balance_cny";
  var TOPUP_KEY   = "cost_dashboard_topup_cny";

  function readBalance() { return parseFloat(localStorage.getItem(BALANCE_KEY) || "") || null; }
  function readTopup()   { return parseFloat(localStorage.getItem(TOPUP_KEY)   || "") || null; }

  // -- Chart.js instance store (to destroy before re-render) -----------------

  var _charts = {};

  function destroyCharts() {
    Object.values(_charts).forEach(function (c) { try { c.destroy(); } catch (_) {} });
    _charts = {};
  }

  // -- Data fetching ----------------------------------------------------------

  async function fetchAggregates(supabase) {
    // Total stats
    const { data: totals, error } = await supabase
      .from("cost_log")
      .select("cost_cny, in_tokens, out_tokens, cache_read_tokens, is_fallback")
      .limit(10000);

    // Table may not exist yet or RLS blocks; return zeros
    if (!totals || error) return { totalCny: 0, totalIn: 0, totalOut: 0, totalCacheRead: 0, fallbacks: 0, todayCny: 0, todayTokens: 0, totalRows: 0 };

    let totalCny = 0, totalIn = 0, totalOut = 0, totalCacheRead = 0, fallbacks = 0;
    totals.forEach(function (r) {
      totalCny      += Number(r.cost_cny)          || 0;
      totalIn       += Number(r.in_tokens)         || 0;
      totalOut      += Number(r.out_tokens)        || 0;
      totalCacheRead += Number(r.cache_read_tokens) || 0;
      if (r.is_fallback) fallbacks++;
    });

    // Today stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayRows } = await supabase
      .from("cost_log")
      .select("cost_cny, in_tokens, out_tokens")
      .gte("ts", todayStart.toISOString());

    let todayCny = 0, todayTokens = 0;
    (todayRows || []).forEach(function (r) {
      todayCny    += Number(r.cost_cny)  || 0;
      todayTokens += (Number(r.in_tokens) || 0) + (Number(r.out_tokens) || 0);
    });

    return { totalCny, totalIn, totalOut, totalCacheRead, fallbacks, todayCny, todayTokens, totalRows: totals.length };
  }

  async function fetchRecentCalls(supabase, limit) {
    const { data } = await supabase
      .from("cost_log")
      .select("ts, tier, site, raw_model, in_tokens, out_tokens, cache_read_tokens, cost_cny, is_fallback, usage_source, cost_source, cost_precision")
      .order("ts", { ascending: false })
      .limit(limit || 50);
    return data || [];
  }

  async function fetchDailyBreakdown(supabase, days) {
    const since = new Date(Date.now() - (days || 30) * 86400000).toISOString();
    const { data } = await supabase
      .from("cost_log")
      .select("ts, cost_cny, site, raw_model, in_tokens, cache_read_tokens")
      .gte("ts", since)
      .order("ts", { ascending: true });
    return data || [];
  }

  async function fetchWordCount(supabase) {
    // count chars of assistant messages as a fun stat
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("role", "assistant");
    return count || 0;
  }

  async function fetchWeeklyBurnRate(supabase) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await supabase
      .from("cost_log")
      .select("cost_cny")
      .gte("ts", since);
    if (!data || !data.length) return 0;
    const sum = data.reduce(function (a, r) { return a + (Number(r.cost_cny) || 0); }, 0);
    return sum / 7; // ¥/day
  }

  // -- Build chart data -------------------------------------------------------

  function buildDailyData(rows, days) {
    const buckets = {};
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = (d.getMonth() + 1) + "/" + d.getDate();
      buckets[key] = 0;
    }
    rows.forEach(function (r) {
      const d = new Date(r.ts);
      const key = (d.getMonth() + 1) + "/" + d.getDate();
      if (key in buckets) buckets[key] += Number(r.cost_cny) || 0;
    });
    return { labels: Object.keys(buckets), values: Object.values(buckets) };
  }

  function buildSiteData(rows) {
    const map = {};
    rows.forEach(function (r) {
      const s = r.site || "unknown";
      map[s] = (map[s] || 0) + (Number(r.cost_cny) || 0);
    });
    return map;
  }

  function buildModelData(rows) {
    const map = {};
    rows.forEach(function (r) {
      const alias = (window.SPCostConfig && window.SPCostConfig.getAlias(r.raw_model));
      const label = alias ? alias.display : (r.raw_model || "unknown");
      map[label] = (map[label] || 0) + (Number(r.cost_cny) || 0);
    });
    return map;
  }

  function buildCacheData(rows) {
    let fresh = 0, cached = 0;
    rows.forEach(function (r) {
      const cr = Number(r.cache_read_tokens) || 0;
      const total = Number(r.in_tokens) || 0;
      cached += cr;
      fresh  += (total - cr);
    });
    return { fresh: Math.max(0, fresh), cached };
  }

  // -- Chart rendering --------------------------------------------------------

  var CHART_COLORS = ["#5B8DEE", "#EE7C5B", "#5BEEAD", "#EEB85B", "#B85BEE", "#5BEEE0", "#EE5B8D"];

  function renderDailyChart(canvas, labels, values) {
    var ctx = canvas.getContext("2d");
    _charts.daily = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "每日花费 ¥",
          data: values,
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0] + "33",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function (v) { return "¥" + v.toFixed(3); } } },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        },
      },
    });
  }

  function renderSiteChart(canvas, siteMap) {
    var labels = Object.keys(siteMap);
    var values = Object.values(siteMap);
    var ctx = canvas.getContext("2d");
    _charts.site = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "花费 ¥",
          data: values,
          backgroundColor: labels.map(function (_, i) { return CHART_COLORS[i % CHART_COLORS.length]; }),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
        indexAxis: "y",
      },
    });
  }

  function renderModelChart(canvas, modelMap) {
    var entries = Object.entries(modelMap).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var labels = entries.map(function (e) { return e[0]; });
    var values = entries.map(function (e) { return e[1]; });
    var ctx = canvas.getContext("2d");
    _charts.model = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: function (ctx) { return ctx.label + ": " + fmtCny(ctx.raw); } } },
        },
      },
    });
  }

  function renderCacheChart(canvas, fresh, cached) {
    var total = fresh + cached;
    var pct = total > 0 ? Math.round(cached / total * 100) : 0;
    var ctx = canvas.getContext("2d");
    _charts.cache = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Cache 命中 (" + pct + "%)", "新鲜输入"],
        datasets: [{
          data: [cached, fresh],
          backgroundColor: [CHART_COLORS[2], CHART_COLORS[0] + "88"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }

  // -- HTML builders ----------------------------------------------------------

  function renderStatCards(agg, msgCount) {
    var cacheHitPct = (agg.totalIn + agg.totalCacheRead) > 0
      ? Math.round(agg.totalCacheRead / (agg.totalIn + agg.totalCacheRead) * 100)
      : 0;
    return `
      <div class="cost-cards">
        <div class="cost-card">
          <div class="cost-card__value">${fmtCny(agg.totalCny)}</div>
          <div class="cost-card__label">累计花费</div>
        </div>
        <div class="cost-card">
          <div class="cost-card__value">${fmtCny(agg.todayCny)}</div>
          <div class="cost-card__label">今日花费</div>
        </div>
        <div class="cost-card">
          <div class="cost-card__value">${fmtNum(agg.totalIn + agg.totalOut)}</div>
          <div class="cost-card__label">总 Token</div>
        </div>
        <div class="cost-card">
          <div class="cost-card__value">${cacheHitPct}%</div>
          <div class="cost-card__label">缓存命中率</div>
        </div>
        <div class="cost-card">
          <div class="cost-card__value">${agg.fallbacks}</div>
          <div class="cost-card__label">Fallback 次数</div>
        </div>
        <div class="cost-card">
          <div class="cost-card__value">${fmtNum(msgCount)}</div>
          <div class="cost-card__label">Cha 回复数</div>
        </div>
      </div>`;
  }

  function renderBalanceSection(burnRatePerDay) {
    var balance  = readBalance();
    var topup    = readTopup();
    var daysLeft = (balance != null && burnRatePerDay > 0)
      ? Math.floor(balance / burnRatePerDay)
      : null;
    return `
      <div class="settings-section">
        <div class="settings-section-label">余额与燃速</div>
        <div class="settings-card" style="padding:14px">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <label style="flex:1;min-width:130px">
              <span style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">当前余额 ¥</span>
              <input id="cdBalanceInput" type="number" step="0.01" placeholder="手动填入"
                value="${balance != null ? balance : ""}"
                style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border-soft,#ddd);border-radius:6px;font-size:14px;background:var(--bg-input,#fff);color:var(--text-main)">
            </label>
            <label style="flex:1;min-width:130px">
              <span style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">充值金额 ¥</span>
              <input id="cdTopupInput" type="number" step="0.01" placeholder="可选"
                value="${topup != null ? topup : ""}"
                style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border-soft,#ddd);border-radius:6px;font-size:14px;background:var(--bg-input,#fff);color:var(--text-main)">
            </label>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="cdBalanceSave" style="padding:6px 14px;border-radius:6px;border:none;background:var(--accent,#5B8DEE);color:#fff;font-size:13px;cursor:pointer">保存</button>
            <span style="font-size:13px;color:var(--text-muted)">
              近 7 天均速：${fmtCny(burnRatePerDay)}/天
              ${daysLeft != null ? " · 剩余约 <strong>" + daysLeft + "</strong> 天" : ""}
            </span>
          </div>
        </div>
      </div>`;
  }

  function renderRecentTable(rows) {
    if (!rows.length) {
      return `<div style="color:var(--text-muted);font-size:13px;padding:12px">暂无调用记录</div>`;
    }
    var html = `<div style="overflow-x:auto"><table class="cost-table" style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th>时间</th><th>层级</th><th>站点</th><th>模型</th><th>in</th><th>out</th><th>cache</th><th>花费</th>
      </tr></thead><tbody>`;
    rows.forEach(function (r) {
      var alias = (window.SPCostConfig && window.SPCostConfig.getAlias(r.raw_model));
      var modelLabel = alias ? alias.display : (r.raw_model || "—");
      html += `<tr ${r.is_fallback ? 'style="opacity:0.6"' : ""}>
        <td>${fmtDate(r.ts)}</td>
        <td>${r.tier || "—"}</td>
        <td>${r.site || "—"}</td>
        <td title="${r.raw_model || ""}">${modelLabel}</td>
        <td>${fmtNum(r.in_tokens)}</td>
        <td>${fmtNum(r.out_tokens)}</td>
        <td>${fmtNum(r.cache_read_tokens)}</td>
        <td>${fmtCny(r.cost_cny)}</td>
      </tr>`;
    });
    html += "</tbody></table></div>";
    return html;
  }

  // -- Main render ------------------------------------------------------------

  async function renderCostPage(container) {
    if (!container) return;
    destroyCharts();

    container.innerHTML = `<div style="padding:16px;color:var(--text-muted);font-size:13px">加载中…</div>`;

    var supabase = getSupabase();
    if (!supabase) {
      container.innerHTML = `<div style="padding:16px;color:var(--error,#e57373)">Supabase 客户端未就绪</div>`;
      return;
    }

    var agg, recentRows, dailyRows, msgCount, burnRate;
    try {
      [agg, recentRows, dailyRows, msgCount, burnRate] = await Promise.all([
        fetchAggregates(supabase),
        fetchRecentCalls(supabase, 50),
        fetchDailyBreakdown(supabase, 30),
        fetchWordCount(supabase),
        fetchWeeklyBurnRate(supabase),
      ]);
    } catch (e) {
      agg = { totalCny: 0, totalIn: 0, totalOut: 0, totalCacheRead: 0, fallbacks: 0, todayCny: 0, todayTokens: 0, totalRows: 0 };
      recentRows = []; dailyRows = []; msgCount = 0; burnRate = 0;
    }

    if (!agg.totalRows && !recentRows.length) {
      // No data yet - show dashboard with zeros (table may not exist or no calls logged)
    }

    var dailyData  = buildDailyData(dailyRows, 14);
    var siteData   = buildSiteData(dailyRows);
    var modelData  = buildModelData(dailyRows);
    var cacheData  = buildCacheData(dailyRows);
    var hasChart   = typeof Chart !== "undefined";
    var chartNote  = !hasChart ? `<p style="color:var(--text-muted);font-size:12px">Chart.js 未加载，图表不可用</p>` : "";

    container.innerHTML = `
      <div class="cost-dashboard">

        ${renderStatCards(agg, msgCount)}

        ${renderBalanceSection(burnRate)}

        ${hasChart ? `
        <div class="settings-section">
          <div class="settings-section-label">每日花费（近 14 天）</div>
          <div class="settings-card" style="padding:14px">
            <div style="height:160px;position:relative"><canvas id="cdDailyChart"></canvas></div>
          </div>
        </div>

        <div class="settings-section" style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div class="settings-section-label">站点分布</div>
            <div class="settings-card" style="padding:14px">
              <div style="height:140px;position:relative"><canvas id="cdSiteChart"></canvas></div>
            </div>
          </div>
          <div style="flex:1;min-width:160px">
            <div class="settings-section-label">模型分布</div>
            <div class="settings-card" style="padding:14px">
              <div style="height:140px;position:relative"><canvas id="cdModelChart"></canvas></div>
            </div>
          </div>
          <div style="flex:1;min-width:160px">
            <div class="settings-section-label">缓存命中</div>
            <div class="settings-card" style="padding:14px">
              <div style="height:140px;position:relative"><canvas id="cdCacheChart"></canvas></div>
            </div>
          </div>
        </div>` : chartNote}

        <div class="settings-section">
          <div class="settings-section-label">最近 50 次调用</div>
          <div class="settings-card" style="padding:0 0 4px">
            ${renderRecentTable(recentRows)}
          </div>
        </div>

      </div>`;

    // bind balance save
    var balInput  = container.querySelector("#cdBalanceInput");
    var topupInput = container.querySelector("#cdTopupInput");
    var saveBtn   = container.querySelector("#cdBalanceSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var b = parseFloat(balInput.value);
        var t = parseFloat(topupInput.value);
        if (!isNaN(b)) localStorage.setItem(BALANCE_KEY, String(b));
        else localStorage.removeItem(BALANCE_KEY);
        if (!isNaN(t)) localStorage.setItem(TOPUP_KEY, String(t));
        else localStorage.removeItem(TOPUP_KEY);
        saveBtn.textContent = "已保存";
        setTimeout(function () { saveBtn.textContent = "保存"; }, 1500);
      });
    }

    // draw charts
    if (hasChart) {
      var d = container.querySelector("#cdDailyChart");
      var s = container.querySelector("#cdSiteChart");
      var m = container.querySelector("#cdModelChart");
      var c = container.querySelector("#cdCacheChart");
      if (d) renderDailyChart(d, dailyData.labels, dailyData.values);
      if (s && Object.keys(siteData).length) renderSiteChart(s, siteData);
      if (m && Object.keys(modelData).length) renderModelChart(m, modelData);
      if (c) renderCacheChart(c, cacheData.fresh, cacheData.cached);
    }
  }

  // -- Public API -------------------------------------------------------------
  window.SPCostDashboard = {
    renderCostPage: renderCostPage,
    destroyCharts: destroyCharts,
  };
})();
