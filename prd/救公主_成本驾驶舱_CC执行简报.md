# 救公主 · 成本驾驶舱（PWA Settings 新页）— CC 执行简报

一个给开发者（KK）自己看的**成本面板**，挂在 PWA 手机版 Settings 里。注意：这是成本/元数据视图，**跟 cha 的拟生命状态栏是两个面，别串味、别共用组件**。

---

## 本期 scope（只做这些）

一个新的 Settings 子页：顶部数字卡 + 最近调用列表 + 几张图 + 充值提醒。数据来源是**你自己的调用层**，不去扒任何上游站后台。

## 明确不做

- 不抓各站后台 / 不依赖站点余额 API（余额手填，见下）
- 不显示消息正文（隐私，只放成本和元数据）
- 不碰拟生命状态栏

---

## 一、数据从哪来

每次任意 API 调用（前台 55api / 芙卡 / 后台 DS / 语音 EL），在你自己的 call 层落一行日志。这是唯一能把多钱包合并成一个视图、且能正确处理「按量 / 按次 / 字符」三种计费的地方。

每行字段：

- `ts`：时间（本地时区）
- `tier`：instant / general / advance / 后台 / 语音
- `site`：55api / fuka / deepseek / openrouter / elevenlabs
- `raw_model`：站子返回的原始名（如 `[加菲]claude-opus-4-6`）
- `endpoint_type`：anthropic / openai / gemini（如果拿得到）
- `in_tokens` / `out_tokens` / `cache_read_tokens` / `cache_write_tokens`（文字模型）
- `chars`（语音 / 字数统计用）
- `cost_cny`：**落库时就按 price config 算好的人民币**，面板只读这个值
- `is_fallback`：bool，主线失败落备线时为 true
- `fallback_reason`：timeout / error / abort（仅 fallback 时）

## 二、配置文件（price + 别名 + 汇率，合成一个）

单一配置文件，改价/改名只动这一处。结构示意：

```
usd_to_cny = 7.2   # 写死，充值后或汇率大变时手改

aliases = {
  "[加菲]claude-opus-4-6":   { display: "opus",   site: "55api", note: "真实 opus，加菲档" },
  "[K-按量]claude-sonnet-4-6": { display: "sonnet", site: "55api", note: "K 组按量" },
  // …站子怪名 → 人话 + 推测档位，批量备注
}

prices = {
  // 55api 按量：¥ / 1M token
  "55api/sonnet": { in: 0.9, out: 4.5, cache_read: 0.09, cache_write: 1.125 },
  "55api/opus":   { in: 1.5, out: 7.5, cache_read: 0.15, cache_write: 1.875 },
  "55api/gpt-5.5":{ in: 0.4, out: 2.4, cache_read: 0.04 },
  "55api/gemini-3.5-flash": { in: 0.45, out: 2.7, cache_read: 0.045, cache_write: 0.48 },
  // 芙卡按次：¥ / 次（1 点 = ¥0.0286）
  "fuka/instant": { per_call: 0.029 },
  "fuka/general": { per_call: 0.029 },
  "fuka/advance": { per_call: 0.057 },
  // DeepSeek、ElevenLabs（$ / credit，字符）等按各自单位，结算时 × usd_to_cny
}
```

别名映射：面板只显示人话（opus / 55api），原始怪名放 tooltip。

## 三、顶部数字卡

- 收到的消息字数（**按字符**，这是关系彩蛋，别混进成本）
- 消耗 token 总数（累计）
- 今天消耗 token 数（**今天 = 本地 23:59 重置**）
- 总花费金额（**全部折算人民币单一总额**；EL 的 $/credit、OpenRouter 的 $ 都 × 7.2 进总）
- fallback 次数（主线失败落备线的计数）

## 四、最近调用列表

每行显示：时间 · 模型（人话名）· 站点 · in/out token · ¥花费。原始名 tooltip 里给。fallback 的行打个标。

## 五、充值提醒（半自动）

- 余额：**手动填**。每次充值后 KK 自己更新这个数（多数站没余额 API，接受半自动）。
- 燃速：用**真实近 7 天**的 ¥/天均速算（不要用任何预设的使用强度假设）。
- 剩余天数 = 手填余额 ÷ 近 7 天均速。
- 文案："按近 7 天均速，约可用 **N 天**，建议第 **(N−3)** 天充值"（留 3 天 buffer）。
- 边界：均速为 0 或极低 → 显示"充足"，不要除零报错；余额未填 → 只显示"近 7 天均速 + 已花"，隐藏剩余天数。

## 六、图表

- 每日花费趋势（抓暴涨）
- 最常用模型 / 档位分布（钱花在哪）
- 按站点拆分花费（多钱包必须看到 split）
- **缓存命中**：fresh input vs cached input token + 估算省下的 ¥（这是抓「prompt cache 偷偷失效」的关键指标，最该盯）
- 最常使用时段（低优先，偏"我们几点聊"的彩蛋，可后做）

## 七、约束与提醒

- 多币种统一：所有非 ¥ 花费一律 × `usd_to_cny`(默认 7.2) 进总额，别留多币种混算。
- 时区：「今天」「近 7 天」都按 KK 本地时区，23:59 切日。
- 隐私：只存成本 + 元数据，**绝不显示消息正文**。
- 别名表是推测：站子可能换上游，备注写"推测档位"，别当成铁证。

## 审查协议

- 动手前列要改 / 新建的文件清单。
- commit 前 `show diff`，人工 review 通过再提交。
- 严格按本 scope，不要扩到拟生命状态栏或上游抓取。
