# Memory Pipeline Audit — 2026-06-13

审计范围：自动记忆链路（P1 候选提取 + P2 promotion）、toast 触发逻辑、Memory Center UI 缺口、提取口径问题。
**不改核心逻辑。结论 + 下一步建议。**

---

## 1. auto_memory_vault 调用链是否存活

### 结论：**P1 + P2 链路已完全断链。**

**调用路径原设计（已失效）：**

```
index.ts → afterChatPersonality() [DISABLED block] → afterChat() in personality_system.ts
                                                        → runAutoMemoryVault()   (P1)
                                                        → promoteAutoMemoryCandidates()  (P2)
```

**当前实际路径：**

`index.ts` 中 `afterChatPersonality` 的调用已被 `/* DISABLED ... */` 注释块整体注掉（index.ts ~2253–2270 行）。注释块内的 `tee()` + `afterChatPersonality(...)` 均未执行。

```typescript
/* DISABLED: afterChatPersonality tee + background extraction
const [clientBody, extractBody] = result.response.body.tee();
responseBody = clientBody;
afterChatPersonality({ ... }).catch(...);
*/
responseBody = result.response.body;   // ← 直接透传，无背景提取
```

同时，`personality_system.ts` 的 import 也在 index.ts 第 3 行被注释：

```typescript
// import { compilePersonalityLayerContext, fetchLayer1Features, fetchLayer2Features,
//          afterChat as afterChatPersonality } from "./personality_system.ts";
```

**结果：**

- `runAutoMemoryVault` 永远不被调用。
- `promoteAutoMemoryCandidates` 永远不被调用。
- `auto_memory_candidates` 表今天零新增（除非有手动触发或其他入口，但代码中不存在其他入口）。
- `memories` 表今��零自动写入。

**注意：** `personality_system.ts` 文件头标注"已退役，禁止 import"，但它内部仍保有 `runAutoMemoryVault` + `promoteAutoMemoryCandidates` 的完整调用逻辑，只是入口已封死。

---

## 2. 自动记忆链路各阶段状态

| 阶段 | 状态 | 原因 |
|------|------|------|
| P1 候选生成（LLM 提取） | **不运行** | afterChat 调用断链 |
| auto_memory_candidates 新记录 | **无新增** | P1 不运行 |
| recommended_action 分布 | 无法判断（今天） | 同上 |
| status 分布 | 无法判断（今天） | 同上 |
| P2 promotion | **不运行** | 依赖 afterChat，同上 |
| x-memory-promoted header | **永远为空** | 候选池无新增，promoted_at 查询返回 0 |

**P2 promotion 的额外问题（即使链路恢复后仍需注意）：**

promotion 查询在 `index.ts` 中跑在**当前请求**的响应返回前（同步等待，3s timeout），但 P1 提取和 P2 promotion 原设计是 fire-and-forget 挂在 afterChat，两者异步并行。因此：

- 当前轮请求的 `x-memory-promoted` 反映的是**上一轮**（或更早）的 promotion 结果（last 60s 窗口）。
- 设计意图正确，但如果 P2 promotion 耗时超过 60s 才落库，header 仍会为空。

---

## 3. 今天没有"记忆已更新"的根因树

```
没有出现 toast
  └── x-memory-promoted header 为 0
        └── recentPromotedCount = 0
              └── DB 查询：auto_memory_candidates WHERE status=promoted AND promoted_at >= now-60s
                    └── 返回空
                          └── P2 promotion 从未运行
                                └── afterChat 从未运行
                                      └── afterChatPersonality 调用被 DISABLED 注释块封死
                                            └── personality_system.ts import 被注释

  └── 前端 poller 也无结果
        └── startMemoryPromotionPoller 同样查 status=promoted，同样返回空
```

**结论：不是前端 bug，不是 header 解析问题，不是 poller 问题。根因是 P1+P2 入口在 index.ts 已被注释掉。**

---

## 4. 提取口径问题

### 当前 VAULT_EXTRACTION_SYSTEM_PROMPT 口径

- 只从**用户消息**提取用户（kk）的事实。
- G 的回复仅作上下文参考，不作提取源。
- 4 种候选类型：`fact / preference / relationship / project`，全部是**用户侧事实**。

### 为什么不会生成非用户视角记忆

以下内容在当前口径下**结构性缺失**，不是偶发现象：

| 缺失内容 | 原因 |
|----------|------|
| 「小钗学到了什么」| 需从 G 的回复提取，当前禁止 |
| 「我们今天定了什么」| 属于双方协商结果，当前口径不处理 |
| 「关系进展」| relationship 类型存在，但仍要求用户消息作证，G 侧感知缺失 |
| 「小钗对某件事的判断」| self_narrative 式，已被设计排除（正确） |

### 建议：新增 candidate_type `relationship_journal_event`（不在本次改动范围内）

设计思路（仅供记录，不在本次 PR 范围）：

- **独立 prompt**，单独调用，不修改 VAULT_EXTRACTION_SYSTEM_PROMPT。
- 从对话双方提取"发生了什么"，不记录"小钗是谁"。
- 示例输出：`"kk 和小钗今天第一次讨论了记忆架构的设计原则"`。
- 不映射到 `memories.category` 中的 persona 类，映射到新类 `relationship_journal`（需新增 migration）。
- 置信度规则与当前相同；sensitivity >= 0.70 仍强制 quarantine。
- `recommended_action` 初期一律 `pending`，不走 auto_accept，需用户确认。

这样既能捕获关系/系统事件，又不会触发 self_narrative 问题。

---

## 5. Memory Center UI 审计

### 当前能显示的内容

| 内容 | 支持 | 说明 |
|------|------|------|
| 已写入 memories（最近 3 条） | ✅ | `?type=recent` 优先返回 memories 表 |
| candidates（最近 3 条，memories 为空时 fallback） | 部分 ✅ | 仅在 memories 为空时显示 |
| promoted 状态标签 | ✅ | LABEL_MAP 中有 `promoted: "候选已记忆"` |
| pending 状态标签 | ✅ | LABEL_MAP 中有 `pending: "待处理"` |
| new 状态标签 | ✅ | LABEL_MAP 中有 `new: "候选记忆"` |
| confidence / sensitivity 显示 | ✅ | buildRecentMemoryItem 展开面板中显示 |
| source_preview（原始用户消息预览）| ✅ | fetchSourcePreview 拼接 |

### 当前不能显示的内容（缺口）

| 缺口 | 说明 |
|------|------|
| **候选池总览**（候选总数、各 status 分布） | `?type=recent` 只返回最近 3 条，无分页，无统计 |
| **quarantine 队列** | 没有专门展示 quarantined 候选的 UI 区域 |
| **未写入原因**（rejection reason / skip reason） | `reason` 字段存在于 DB，但 UI 不显示 |
| **promotion_error** | P2 promotion 失败时写入 `promotion_error` 字段，UI 完全不读取 |
| **已注入 memories 的完整列表** | Memory Center 显示的是最近 3 条，不是全量 |
| **pending 候选的用户确认 UI** | 目前无法对 pending 候选点「接受/拒绝」 |
| **忽略原因**（ignored + promotion_error="duplicate: ..."）| UI 不显示 ignored 状态的候选 |
| **P1 vs P2 状态区分** | UI 不区分"候选已生成但未 promote"和"已 promote 写入 memories" |

### UI 目标 vs 现状 gap 总结

当前 UI 只是"最近更新"的滚动展示，不是完整的"候选池状态"视图。

理想的 Memory Center 应包含四个区段：

```
[候选池] new + pending + quarantine  ← 目前缺失
[待确认] pending（用户操作）         ← 目前缺失
[已写入] promoted → memories         ← 仅最近 3 条
[被跳过] rejected + ignored + error  ← 目前缺失
```

---

## 6. 下一步建议（优先级排序）

### P0：恢复 P1+P2 链路入口

**问题：** `afterChatPersonality` 调用在 index.ts 中被完整注释掉，导致零提取。

**选项 A（最小改动）：** 在 index.ts 的 DISABLED 块之外，直接 import `runAutoMemoryVault` + `promoteAutoMemoryCandidates` 并在同位置 fire-and-forget 调用，绕过 personality_system.ts 的 retired 状态。

```typescript
// index.ts 顶部
import { runAutoMemoryVault, promoteAutoMemoryCandidates } from "./auto_memory_vault.ts";

// 在 DISABLED 块之后（约 2270 行），替代 afterChatPersonality
if (!disableAfterChat && afterChatUserId !== "anon" && AUTO_MEMORY_VAULT_ENABLED) {
  const [clientBody, vaultBody] = result.response.body.tee();
  responseBody = clientBody;
  drainAndRunVault(vaultBody, { ... }).catch(...);
}
```

需要在 index.ts 中内联实现 `drainSSEStream` 或单独抽取为 util，不依赖 personality_system.ts。

**选项 B：** 将 `afterChat` 中的 vault 调用逻辑从 personality_system.ts 剥离出来，写成独立 `vault_runner.ts`，index.ts 直接 import。

**建议选 B**，personality_system.ts 计划 2026-07-12 删除，提前解耦更干净。

---

### P1：x-memory-promoted header 时序问题

链路恢复后，仍有一个设计层面的问题需确认：

- P1（提取）和 P2（promotion）都是 fire-and-forget。
- `x-memory-promoted` 在**当前请求返回时**查询（last 60s），此时当前轮 P2 很可能还没跑完。
- 实际上 header 反映的是**上一轮**的 promotion 结果。

这是可接受的 UX（延迟一轮提示），但需要：
1. 确保 P2 耗时在 60s 内（当前 10 条 limit，应该远低于 60s）。
2. 或者将 promotion 查询窗口从 60s 扩展到 120s，降低漏报率。

前端 poller（8s，1s 间隔）作为 backup 机制，可以捕获当前轮的 promotion，但前提是 P2 能在 8s 内完成。

---

### P2：Memory Center UI 候选池视图

最小可行方案：在现有 `?type=recent` 接口之外，新增 `?type=candidates` 接口，返回：

```
{
  "new": [...],       // status=new，最近 20 条
  "pending": [...],   // status=pending，最近 20 条
  "quarantine": [...],// status=quarantined，最近 10 条
  "ignored": [...],   // status=ignored，最近 10 条，含 promotion_error
}
```

Memory Center 新增"候选池"折叠区段，与"最近更新"并列展示。pending 候选加「接受」/「忽略」按钮，写 PATCH `status=promoted` 或 `status=ignored`。

---

### P3：relationship_journal_event 候选类型

见第 4 节设计思路，待 P0 链路恢复并跑通后再做，不宜同步开展。

---

## 附：文件位置索引

| 问题 | 文件 | 关键行 |
|------|------|--------|
| afterChatPersonality 调用被注��� | `supabase/functions/chat/index.ts` | ~2253–2270 |
| personality_system import 被注释 | `supabase/functions/chat/index.ts` | 3 |
| runAutoMemoryVault 实现 | `supabase/functions/chat/auto_memory_vault.ts` | ~310–430 |
| promoteAutoMemoryCandidates 实现 | `supabase/functions/chat/auto_memory_vault.ts` | ~490–730 |
| VAULT_EXTRACTION_SYSTEM_PROMPT | `supabase/functions/chat/auto_memory_vault.ts` | ~63–110 |
| x-memory-promoted header 查询 | `supabase/functions/chat/index.ts` | ~2207–2240 |
| x-memory-promoted header 注入 | `supabase/functions/chat/index.ts` | ~2296 |
| 前端 header 读取 | `app.js` | ~1338–1343 |
| 前端 poller | `app.js` | ~4039–4080 |
| toast 实现 | `app.js` | ~4087–4125 |
| Memory Center recent fetch | `app.js` | ~3760–3835 |
| memories ?type=recent 接口 | `supabase/functions/memories/index.ts` | 37–97 |
