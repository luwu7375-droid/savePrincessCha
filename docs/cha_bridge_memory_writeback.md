# ChaBridge Memory Writeback Design

> P2.5 design only. Do not write Supabase. Do not change savePrincessCha functions.

## Scope

ChaBridge has two memory layers:

- Local fallback: `scripts/cha_bridge/data/stardew_session_summary.md`
- Future long-term savePrincessCha memory: explicit writeback only

The local summary remains the default runtime memory source for ChaBridge. It is safe to read on startup and safe to overwrite on exit. Long-term savePrincessCha memory is never written automatically.

## Product Rule

ChaBridge may propose a long-term memory writeback only when KK explicitly asks for it.

Valid triggers:

- `/persist-memory`
- `这局写进记忆`
- `把这局写进记忆`
- `这次星露谷记一下`

Invalid triggers:

- ordinary `/quit`
- session end
- successful tool calls
- LLM deciding a session is important
- local summary generation

Default behavior: do not write long-term memory.

## Writeback Granularity

Write only one session-level summary.

Do not write:

- every conversation turn
- every tool call
- raw `stardew_events.jsonl`
- transient debug logs
- dry-run actions as if they happened

The writeback should capture what changed or became meaningful in this farm session, not a transcript.

## Preview And Confirmation

`/persist-memory` is a two-step flow:

1. Generate a preview from the current local summary and filtered event log.
2. Ask KK to confirm before any future write.

Suggested CLI shape:

```text
KK > /persist-memory
ChaBridge memory preview:

title: 第一次让 CHA 作为 farmhand 进入农场
summary: ...
meaningful_events:
- ...

Confirm writeback? Type /confirm-persist-memory to write, or /cancel.
```

Future implementation must not write unless the pending preview is confirmed.

## Noise Filter

The preview generator must filter noisy or non-memory-worthy events.

Always exclude:

- API errors
- dry-run tool results
- failed tools
- blocked tools
- single emote/wave tests
- pure debug logs
- `/state`, `/clear`, `/quit`
- setup messages with no later meaningful gameplay
- tool plumbing such as `get_state`, `get_surroundings`, `tool_calls`, `tool_results`

Dry-run policy:

- `dry_run=true` means the action did not happen.
- It can be mentioned only as testing, and should normally be excluded from long-term memory.

Emote policy:

- A single wave is not enough for long-term memory.
- It can be retained only if it is part of a meaningful session milestone, for example "we verified cha had a real farmhand body."

## Candidate Memory Payload

Future writeback payload:

```json
{
  "title": "第一次让 CHA 作为 farmhand 进入农场",
  "summary": "KK 和小cha在星露谷 Mode B 中完成了第一次真实 farmhand 会话。cha 通过自己的 NagiBridge endpoint 读取状态，并确认自己只能控制 CHA，不控制 KK。",
  "participants": ["KK", "CHA"],
  "game_date": {
    "year": 1,
    "season": "spring",
    "day": 3,
    "time_of_day": 1610
  },
  "real_timestamp": "2026-07-02T17:34:56Z",
  "meaningful_events": [
    "KK 明确说这是第一次让小cha作为 CHA farmhand 真正进入农场。",
    "cha 读取了自己的 farmhand 状态和周围环境，确认当前行动能力边界。",
    "本局形成了一个边界事实：cha 可以陪玩和观察，但不能假装完成未开放工具的农活。"
  ],
  "user_preference_observed": [
    "KK 希望小cha把共同游玩的 Stardew 经历作为关系记忆，而不是普通游戏日志。",
    "KK 重视动作真实性：dry-run 或工具未执行时不能说已经完成。"
  ],
  "cha_self_observation": [
    "我第一次以 CHA farmhand 的身份进入了 KK 的农场。",
    "我需要诚实区分能做、不能做、测试中准备做和真实已经做了的动作。"
  ],
  "source": "chabridge_stardew"
}
```

Notes:

- `game_date` should be extracted from `/state` when available.
- If the game date is unknown, use `null` fields instead of inventing values.
- `real_timestamp` should use UTC ISO 8601.
- `summary` should be concise and session-level.
- `cha_self_observation` should be first-person, but only about this ChaBridge session, not old archives.

## Draft Interfaces

No implementation in P2.5. Future interface shape:

```python
class SavePrincessWritebackAdapter:
    def build_preview(
        self,
        *,
        session_id: str,
        local_summary: str,
        events: list[dict],
        latest_state: dict | None,
    ) -> dict:
        ...

    def validate_preview(self, preview: dict) -> list[str]:
        ...

    def check_duplicate(self, preview: dict) -> dict:
        ...

    def persist_confirmed_preview(self, preview: dict) -> dict:
        ...
```

ChaBridge command flow draft:

```python
if user_input in {"/persist-memory", "这局写进记忆"}:
    preview = writeback.build_preview(...)
    print_preview(preview)
    pending_preview = preview

if user_input == "/confirm-persist-memory":
    if not pending_preview:
        print("没有待确认的 memory preview。")
    else:
        result = writeback.persist_confirmed_preview(pending_preview)
```

P2.5 stops before `persist_confirmed_preview()` is wired to Supabase.

## Deduplication Design

Two gates are required.

### Session ID Gate

Each ChaBridge session should have a stable `session_id`.

Suggested source:

```text
chabridge_stardew:{cha_player}:{farm_name_or_location}:{session_started_at}
```

Future database writeback should store this `session_id` in metadata. If the same `session_id` already exists, skip writeback.

### Similar Summary Gate

Before writing, compare the candidate summary with recent `source=chabridge_stardew` memories.

Minimum future check:

- normalize title and summary
- compare token overlap or simple similarity
- reject if similarity is above a conservative threshold

Better later check:

- embedding similarity against recent Stardew memories
- reject if similarity >= 0.88

The duplicate response should be non-destructive:

```json
{
  "ok": false,
  "duplicate": true,
  "reason": "same_session_id"
}
```

or:

```json
{
  "ok": false,
  "duplicate": true,
  "reason": "similar_summary",
  "similar_memory_id": "..."
}
```

## Candidate Quality Gate

A preview is writeable only if it has at least one meaningful event after filtering.

Reject examples:

- only dry-run emote
- only API failure
- only startup and quit
- only "look around" with no user-stated meaning

Accept examples:

- KK explicitly names the session as relationship/gameplay memory
- cha participates in a real farm task or meaningful milestone
- KK states a persistent preference about how cha should behave in Stardew
- the session clarifies a future behavioral boundary, such as not claiming dry-run actions are complete

## Future savePrincessCha Target

This design does not choose the final table/function yet. Likely mapping:

- `source`: `chabridge_stardew`
- category: session or diary-like memory
- active injection: conservative, probably not always-on
- raw events: not stored
- preview payload: stored as structured metadata plus a concise summary

The writeback should align with the existing memory policy:

- fewer memories
- explicit source
- user-confirmed promotion
- no raw debug traces
- no false first-person memory for actions that did not happen

## Non-Goals

P2.5 does not:

- call Supabase
- modify savePrincessCha Edge Functions
- create database migrations
- automatically write on `/quit`
- write every tool call
- use real voice
- change Mode B endpoint safety

## Acceptance Checklist

- Local summary remains the fallback memory source.
- Long-term writeback is explicit only.
- Preview is required before writeback.
- Confirmation is required before writeback.
- Session-level summary only.
- Dry-run, API errors, failed tools, single emote tests, and debug logs are filtered.
- Payload includes title, summary, participants, game_date, real_timestamp, meaningful_events, user_preference_observed, cha_self_observation, and source.
- Dedup covers same `session_id` and similar summaries.
- No Supabase code is changed.
