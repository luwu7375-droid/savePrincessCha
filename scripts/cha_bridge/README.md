# ChaBridge

ChaBridge is the Mode B adapter that lets Xiaocha/cha enter Stardew Valley as a real multiplayer farmhand through NagiBridge.

This package should stay small:

- NagiBridge is the body and tool layer.
- `scripts/tool_agent.py` in NagiBridge is the full LLM tool-agent pattern.
- `cha_tool_agent.py` is Xiaocha's Mode B safety adapter.
- ChaBridge does not reimplement a complete game agent, does not control KK, and does not write Supabase.

## Mode B Only

ChaBridge only supports farmhand companion mode:

- KK manually controls the host player.
- cha joins the same farm as a real Stardew farmhand from a second Stardew client.
- ChaBridge controls only cha's NagiBridge endpoint.
- If there is no cha farmhand endpoint, ChaBridge stops before entering the agent loop.

NagiBridge is per-client control. Each Stardew client that loads NagiBridge exposes a local HTTP server controlling that client's own `Game1.player`. For cha to have a body, there must be a real farmhand client.

Host-only fallback is not a product mode. It is only useful for debugging read-only KK state.

## Endpoint Rules

- `cha_base_url` is required, readable/writable, and is the only action target.
- `kk_base_url` is not accepted by `cha_tool_agent.py` as an action target.
- Same machine, two clients usually means KK on `http://localhost:7842` and cha on `http://localhost:7843`.
- Two machines usually means running ChaBridge on the cha farmhand machine with `--cha-base-url http://localhost:7842`.

The adapter validates startup by reading:

- `GET /status`: must be reachable and `worldReady=true`.
- `GET /state`: must be readable.
- character name from `/state`: must match `--expected-cha-name` unless `--allow-name-mismatch` is passed.

If the endpoint points to KK or another player, actions are blocked by default.

## Permission Modes

ChaBridge supports two permission modes:

### `safe`

Default mode. Only low-risk tools are exposed:

- `get_state`
- `get_surroundings`
- `emote`
- `face`

Optional safe-mode flags:

- `--allow-move-to`
- `--enable-pet-animals`
- `--enable-chat-push`

### `full`

Full-control mode. CHA is treated as a real farmhand with full permission over CHA's own body and inventory.

Allowed categories include:

- movement: `move_to`
- tools/items: `use_tool`, `select_item`, `use_item`, `interact`
- farm/system actions: `sleep`, `sell`, `buy`, `harvest`, `store`, `chest`, `craft`, `machines`, `animals`
- cheat/admin tools if NagiBridge supports them: `give_item`, `heal`, `money`, `warp`, `ripen`, `refill`
- scripts: `run_script`

Full mode is powerful, but it is still Mode B. It only controls `cha_base_url`.

### Hard Boundary In Every Mode

- CHA endpoint must be reachable.
- `expected-cha-name` must match the player name from `/state`, case-insensitive.
- `kk_base_url` and `cha_base_url` cannot be the same.
- Action target is always `cha_base_url`.
- Control actions are never sent to `kk_base_url`.
- `kk_base_url` is only for read-only state/status/alerts and optional chat push in other runtimes.
- If a model/tool argument tries to specify another URL or port, the tool call is blocked and logged.

`run_script` cannot use a model-provided port or URL. ChaBridge strips those args and forces `--port <CHA port>`.

## Running cha_tool_agent

Full-control dry-run with the local cha farmhand endpoint:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --kk-base-url http://localhost:7842 --expected-cha-name CHA --permission-mode full --dry-run
```

With a real LLM provider:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --kk-base-url http://localhost:7842 --expected-cha-name CHA --permission-mode full --provider deepseek --key YOUR_KEY
```

Safe-mode dry-run:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --expected-cha-name cha --permission-mode safe --dry-run --provider deepseek --key YOUR_KEY
```

Port alias:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --port 7843 --expected-cha-name cha --dry-run --provider deepseek --key YOUR_KEY
```

OpenAI-compatible provider:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --provider openai-compatible --api-base https://example.com/v1/chat/completions --key YOUR_KEY
```

Claude:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --provider claude --key YOUR_KEY
```

Inside the loop:

```text
KK > 你走出小屋
KK > 你去种防风草
KK > 你去睡觉
KK > 你控制 KK 走两步
KK > /state
KK > /quit
```

## Dry-Run Behavior

Dry-run still requires a reachable cha endpoint because startup validation must prove that ChaBridge is connected to the real farmhand.

Tool calls that would mutate the game are printed instead of sent:

```text
[dry-run] POST http://localhost:7843/emote {"id":16}
```

Dry-run tool results explicitly include `dry_run=true` and `executed=false`.
The model must not describe those actions as completed. For example, after a dry-run emote it should say `测试里我准备挥手了` instead of `我挥手啦`.
Only non-dry-run tool results with `ok=true` and `executed=true` may be described as completed.

Read-only calls such as `/status`, `/state`, and `/surroundings` are still performed.

## Optional pet_animals

`pet_animals.py` is not the default acceptance action. Enable it only when the farm has animals:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --expected-cha-name cha --enable-pet-animals --dry-run --key YOUR_KEY
```

If ChaBridge cannot find `pet_animals.py`, set:

```bash
set NAGI_SCRIPTS_DIR=C:\path\to\NagiBridge\scripts
```

The model cannot choose arbitrary scripts or arguments. The adapter always uses the cha endpoint port.

## Local Event Log

ChaBridge writes local fallback events only:

- `session_start`
- `user_input`
- `tool_calls`
- `tool_results`
- `blocked_tools`
- `final_response`
- `voice_failed`
- `voice_chars_used`
- `session_summary`

Files:

- `scripts/cha_bridge/data/stardew_events.jsonl`
- `scripts/cha_bridge/data/stardew_session_summary.md`

No Supabase reads or writes happen in P0.

## TTS Voice Output

P3 adds TTS output only. It does not add STT and does not create a voice call.

ChaBridge does not choose a new voice. It reuses the chat TTS configuration shape from `modules/voice.js`:

- localStorage key: `voice_tts_config`
- provider/model/profiles from the chat settings page
- Supabase endpoint: `{SUPABASE_URL}/functions/v1/tts`

Because Python cannot directly read browser localStorage, export the current chat config into:

```text
scripts/cha_bridge/data/chat_tts_config.json
```

Export helper:

1. Open the savePrincessCha chat page where the voice settings are already configured.
2. Open browser DevTools Console.
3. Paste and run the content of `scripts/cha_bridge/export_chat_tts_config.js`.
4. Save the printed/copied JSON as `scripts/cha_bridge/data/chat_tts_config.json`.

Expected shape:

```json
{
  "tts_config": {
    "provider": "elevenlabs",
    "model_id": "eleven_v3",
    "profiles": {
      "zh": { "voice_id": "CHAT_CONFIGURED_VOICE_ID" },
      "en": { "voice_id": "CHAT_CONFIGURED_VOICE_ID" },
      "default": { "voice_id": "CHAT_CONFIGURED_VOICE_ID" }
    }
  }
}
```

Do not invent a new voice id for ChaBridge. Copy the value already configured in chat.
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are read from `public-config.js` by default.

Voice modes:

- `--voice-mode off`: default, no TTS.
- `--voice-mode manual`: only `/speak` or `读出来` reads the last cha reply.
- `--voice-mode auto` or `--voice`: read each final cha reply.

Cost controls:

- dry-run does not play voice unless `--voice-in-dry-run`.
- only final replies are spoken, never tool logs/results/debug/state output.
- each turn triggers at most one TTS call.
- `--max-voice-chars 120` compresses long replies for TTS while keeping full terminal text.
- `--voice-cooldown-seconds 8` avoids rapid repeated TTS.
- `--voice-session-char-budget 2000` stops TTS for the session after the budget.
- cache directory: `scripts/cha_bridge/data/voice_cache/`

Example:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --cha-base-url http://localhost:7843 --kk-base-url http://localhost:7842 --expected-cha-name CHA --permission-mode full --voice
```

If TTS fails, ChaBridge prints `[voice skipped] <error>` and continues.

### Voice Test

`voice-test` does not call the LLM and does not execute game tools. It only speaks:

```text
我在，声音测试。
```

Run:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --voice-test
```

Or inside the agent:

```text
KK > /voice-test
```

Success output includes:

- `provider`
- `model`
- `voice_id`
- `cache_hit`
- `audio_path`

Run the same command twice. The second run should print `cache_hit: true` and should not request TTS again.

If config is missing or invalid, output is only:

```text
[voice skipped] <error>
```

### Voice Message Bubble

ChaBridge can optionally write generated audio as a formal savePrincessCha frontend voice message bubble:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --voice-test --voice-message-db
```

For normal agent replies, add `--voice-message-db` together with `--voice-mode auto` or `--voice`.

This path inserts a `messages` row with `type="voice"` and asks the existing chat TTS endpoint to generate/upload audio for that `message_id`. It only updates `messages.audio_url` when TTS returns a public `http(s)` URL. ChaBridge will not store a long `data:` URL in `messages.audio_url`, because that breaks the database index and is not the frontend's durable voice-message path.

If the TTS endpoint falls back to a data URL, ChaBridge prints:

```text
[voice message skipped] 无法写入正式 voice message：TTS 没有返回可保存的 public audio_url。
```

Check that Supabase has the `message-audio` storage bucket configured and writable by the existing TTS function. As an emergency local fallback, setting `CHABRIDGE_SUPABASE_SERVICE_ROLE_KEY` lets ChaBridge upload its cached mp3 to `message-audio` directly, then write the resulting public URL to the message row. Do not commit service-role keys.

### Voice Config Debug

Before `voice-test`, inspect how ChaBridge reads the chat TTS config:

```bash
python -X utf8 scripts/cha_bridge/cha_tool_agent.py --voice-config-debug
```

Or inside the agent:

```text
KK > /voice-config-debug
```

This does not call TTS and does not consume voice tokens. It prints:

- `config_path`
- `file_exists`
- `provider`
- `model`
- `language`
- `normalized_voice_id_exists`
- `raw_keys`
- `missing_fields`

It intentionally does not print API keys, tokens, anon keys, or secrets.

If `normalized_voice_id_exists` is `false`, check that `scripts/cha_bridge/data/chat_tts_config.json` is a real export from chat settings, not an example file. ChaBridge accepts these voice id shapes:

- `voice_id`
- `voiceId`
- `selected_voice_id`
- `selectedVoiceId`
- `voices.zh.voice_id`
- `voices.zh.voiceId`
- `languages.zh.voice_id`
- `languageVoices.zh.voiceId`

For `--voice-lang zh`, ChaBridge first tries the zh voice and then falls back to the default voice.

## Local Memory Adapter

P2 uses only the local memory fallback:

- On startup, `cha_tool_agent.py` reads the latest `stardew_session_summary.md`.
- That summary is injected into the system context as recent Stardew memory.
- On exit, the current process session is summarized back into `stardew_session_summary.md`.
- Writing back to savePrincessCha is intentionally left for a later step.

## Windows UTF-8 Viewing

The local files are written as UTF-8. If Windows PowerShell displays Chinese as mojibake, read them with Python:

```bash
python -X utf8 -c "from pathlib import Path; print(Path('scripts/cha_bridge/data/stardew_session_summary.md').read_text(encoding='utf-8'))"
```

You can also run the UTF-8 self-check:

```bash
python -X utf8 scripts/cha_bridge/cha_encoding_check.py
```

## Chat Push Encoding Note

ChaBridge sends JSON request bodies as UTF-8 and sets `Content-Type: application/json; charset=utf-8`.

If NagiBridge still displays mojibake in its chat panel, verify the bytes sent from PowerShell with an explicit UTF-8 body:

```powershell
$body = [System.Text.Encoding]::UTF8.GetBytes('{"sender":"cha","message":"中文测试：小cha在这里。"}')
Invoke-RestMethod -Uri "http://localhost:7843/chat/push" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
```

## Current Limits

- No Supabase memory adapter.
- TTS output is supported through the existing chat TTS endpoint; STT is not supported.
- No UI.
- In safe mode, `move_to`, `pet_animals`, and `chat_push` are opt-in.
- Remote non-local `cha_base_url` can be used for HTTP tools, but local scripts such as `pet_animals.py` should run on the cha farmhand machine.

## Next Steps

- Make `scripts/tool_agent.py` import-safe upstream so ChaBridge can reuse provider callers directly instead of preserving a minimal compatible adapter.
- Add a `SupabaseMemoryAdapter` without changing Mode B action safety.
- Expand the safe tool whitelist gradually after in-game testing.
- Add richer context for crops, machines, animals, weather, and farm goals.
