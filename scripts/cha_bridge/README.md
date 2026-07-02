# ChaBridge P0

ChaBridge is a small external runtime that lets the same Xiaocha/cha enter Stardew Valley as a multiplayer farmhand through NagiBridge.

This is not a general game assistant and not a host-controller. NagiBridge is the body, the existing Xiaocha memory system is the soul, and ChaBridge is the runtime layer between them. P0 only implements local fallback memory and fixed intent matching.

## Port Rules

- `7842` is KK / host.
- `7843` is cha / farmhand.
- Host is read-only except `POST /chat/push`, which is allowed so cha's text can appear in KK's chat panel.
- All control actions must target `7843`.
- P0 blocks dangerous actions such as sell, sleep, give, money, heal, and warp.

## Files

- `cha_duo_context.py` reads host and farmhand context.
- `cha_duo_actions.py` exposes a safety-gated `ActionGateway`.
- `cha_memory_adapter.py` stores local events and session summaries.
- `cha_duo_companion.py` is the P0 entrypoint.
- `cha_voice.py` is mock TTS/STT only.

Local fallback files are written under:

- `scripts/cha_bridge/data/stardew_events.jsonl`
- `scripts/cha_bridge/data/stardew_session_summary.md`

## Windows UTF-8 Viewing

The local files are written as UTF-8. If Windows PowerShell displays Chinese as mojibake, read them with Python instead of relying on the console default encoding:

```bash
python -X utf8 -c "from pathlib import Path; print(Path('scripts/cha_bridge/data/stardew_session_summary.md').read_text(encoding='utf-8'))"
```

You can also run the UTF-8 self-check:

```bash
python -X utf8 scripts/cha_bridge/cha_encoding_check.py
```

## Dry-Run Test

From the repository root:

```bash
python scripts/cha_bridge/cha_duo_companion.py --host-port 7842 --cha-port 7843 --dry-run --mock-llm
```

Then try:

```text
/context
今天我们干嘛
你去摸动物
/summary
/quit
```

Dry-run prints the `POST /chat/push` and `pet_animals.py --port 7843` actions without sending requests or controlling the game.

## Testing pet_animals For Real

1. Start Stardew Valley through SMAPI.
2. Load the host save as KK.
3. Join the same farm with a farmhand character for cha.
4. Ensure NagiBridge is installed for both instances.
5. Confirm host responds on `http://localhost:7842/status`.
6. Confirm farmhand responds on `http://localhost:7843/status`.
7. Ensure `pet_animals.py` exists in your NagiBridge `scripts` directory.
8. If ChaBridge cannot find it, set:

```bash
set NAGI_SCRIPTS_DIR=C:\path\to\NagiBridge\scripts
```

Then run without `--dry-run`:

```bash
python scripts/cha_bridge/cha_duo_companion.py --host-port 7842 --cha-port 7843 --mock-llm
```

## Current Limits

- No real LLM call yet.
- No autonomous tool calling.
- No real TTS or STT.
- No UI.
- No Supabase reads or writes.
- Only the fixed `pet_animals.py` action is wired in P0.
- Context fields depend on what NagiBridge returns; missing fields are shown as `未知`.

## Next Steps

- Add a real LLM provider while keeping `ActionGateway` as the only tool execution path.
- Add mock-to-real TTS/STT adapters.
- Add `SupabaseMemoryAdapter` for `stardew_companion` memory and shared-activity diary entries.
- Expand the safe action whitelist gradually.
- Add richer context for crops, machines, animals, weather, and farm goals.
