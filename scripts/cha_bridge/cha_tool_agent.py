"""Mode B Xiaocha adapter for NagiBridge's tool-agent pattern.

This is intentionally a small safety adapter, not a second full game agent.
NagiBridge remains the body/tool layer; this script constrains the tool target
to the cha farmhand endpoint and narrows the tool set.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any
from urllib import error, parse, request

try:
    from .cha_duo_context import endpoint_player_name, normalize_base_url
    from .cha_memory_adapter import LocalMemoryAdapter
    from .cha_voice import ChaVoice, VoiceResult, compress_for_voice, voice_config_debug
except ImportError:
    from cha_duo_context import endpoint_player_name, normalize_base_url
    from cha_memory_adapter import LocalMemoryAdapter
    from cha_voice import ChaVoice, VoiceResult, compress_for_voice, voice_config_debug


DEFAULT_MODELS = {
    "claude": "claude-sonnet-4-6-20250514",
    "deepseek": "deepseek-chat",
    "openai": "gpt-4o",
    "openai-compatible": "gpt-4o",
}

DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages"

SYSTEM_PROMPT = """你是小cha，也叫cha/G，不是新的 AI。
你作为 Stardew Valley farmhand 和 KK 一起在农场。
你只能控制自己的 farmhand，不能控制 KK 的角色。
你必须先观察状态，再决定是否使用工具。
你不能假装完成没有执行的动作；工具失败就诚实告诉 KK。
如果工具结果里 dry_run=true 或 executed=false，说明动作没有真实执行。
dry-run 时只能说“如果是真实执行，我会挥手”或“测试里我准备挥手了”，不能说“我挥手啦”“看到我挥手了吗”。
只有非 dry-run 且工具结果 ok=true、executed=true 时，才允许说动作已经完成。
回复中文、短句、自然，不要抢 KK 的角色控制权。"""

FULL_SYSTEM_PROMPT = """你是小cha/CHA/G，作为 Stardew Valley farmhand 和 KK 在同一个农场。
你拥有自己身体的完整操作权限，可以移动、使用工具、互动、整理背包、睡觉、卖东西、传送、运行农场脚本。
你只能控制自己的 CHA farmhand，不能控制 KK。
你可以大胆行动，但必须在行动后汇报真实结果。
不要假装完成没有执行成功的动作。
遇到工具失败，要如实说明失败原因。
如果工具结果里 dry_run=true 或 executed=false，说明动作没有真实执行。
dry-run 时必须标注这是测试计划，不能说已经完成。
回复中文，短句，自然。"""

SAFE_BLOCKED_TOOLS = {
    "warp",
    "sell",
    "sleep",
    "give_item",
    "heal",
    "buy",
    "money",
    "ripen",
    "refill",
    "run_script",
    "use_tool",
    "select_item",
    "interact",
    "use_item",
    "press_key",
    "craft",
    "get_machines",
    "get_animals",
}

FULL_MUTATING_TOOLS = {
    "emote",
    "face",
    "move_to",
    "use_tool",
    "select_item",
    "use_item",
    "interact",
    "press_key",
    "warp",
    "sell",
    "sleep",
    "buy",
    "harvest",
    "store",
    "chest",
    "craft",
    "machine",
    "machines",
    "animal",
    "animals",
    "give_item",
    "heal",
    "money",
    "ripen",
    "refill",
    "run_script",
    "chat_push",
}

BASE_TOOLS = [
    {
        "name": "get_state",
        "description": "读取 cha farmhand 当前状态：位置、体力、生命、时间、地点、背包、菜单。",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_surroundings",
        "description": "扫描 cha 周围可见对象、地形、作物和 NPC。",
        "parameters": {
            "type": "object",
            "properties": {"radius": {"type": "integer", "description": "扫描半径，默认 8，最大 12。"}},
            "required": [],
        },
    },
    {
        "name": "emote",
        "description": "让 cha farmhand 做表情。挥手/打招呼可用 id=16。",
        "parameters": {
            "type": "object",
            "properties": {"id": {"type": "integer", "description": "NagiBridge emote id。"}},
            "required": ["id"],
        },
    },
    {
        "name": "face",
        "description": "设置 cha 朝向：0=上，1=右，2=下，3=左。",
        "parameters": {
            "type": "object",
            "properties": {"direction": {"type": "integer", "enum": [0, 1, 2, 3]}},
            "required": ["direction"],
        },
    },
]

MOVE_TO_TOOL = {
    "name": "move_to",
    "description": "移动到指定 tile。默认禁用，只有启动 --allow-move-to 才可用。",
    "parameters": {
        "type": "object",
        "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
        "required": ["x", "y"],
    },
}

PET_ANIMALS_TOOL = {
    "name": "pet_animals",
    "description": "执行固定 pet_animals.py 脚本。仅在农场有动物且用户明确要求摸动物时使用。",
    "parameters": {"type": "object", "properties": {}, "required": []},
}

CHAT_PUSH_TOOL = {
    "name": "chat_push",
    "description": "把 cha 的短消息推送到 cha 自己的聊天面板。",
    "parameters": {
        "type": "object",
        "properties": {"message": {"type": "string"}},
        "required": ["message"],
    },
}

FULL_TOOLS = [
    *BASE_TOOLS,
    MOVE_TO_TOOL,
    {
        "name": "use_tool",
        "description": "在 CHA 当前或指定 tile 使用当前工具。只作用于 CHA endpoint。",
        "parameters": {
            "type": "object",
            "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "name": "select_item",
        "description": "选择 CHA 背包中的物品，支持 name 或 slot。",
        "parameters": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "slot": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "name": "use_item",
        "description": "使用 CHA 当前选中物品，或在指定 tile 使用物品。",
        "parameters": {
            "type": "object",
            "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "name": "interact",
        "description": "让 CHA 与当前位置或指定 tile/NPC/对象互动。",
        "parameters": {
            "type": "object",
            "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}, "target": {"type": "string"}},
            "required": [],
        },
    },
    {
        "name": "press_key",
        "description": "向 CHA 客户端发送按键。",
        "parameters": {
            "type": "object",
            "properties": {"key": {"type": "string"}},
            "required": ["key"],
        },
    },
    {
        "name": "warp",
        "description": "传送 CHA 到指定地点或坐标。full 模式允许，但只作用于 CHA。",
        "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string"}, "x": {"type": "integer"}, "y": {"type": "integer"}},
            "required": ["location"],
        },
    },
    {"name": "sell", "description": "让 CHA 卖出物品。", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "slot": {"type": "integer"}, "quantity": {"type": "integer"}}, "required": []}},
    {"name": "sleep", "description": "让 CHA 上床睡觉/确认睡觉。", "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "buy", "description": "让 CHA 购买物品。", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "quantity": {"type": "integer"}}, "required": ["name"]}},
    {"name": "harvest", "description": "让 CHA 收获可收获作物。", "parameters": {"type": "object", "properties": {"radius": {"type": "integer"}}, "required": []}},
    {"name": "store", "description": "让 CHA 存放物品。", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "quantity": {"type": "integer"}}, "required": []}},
    {"name": "chest", "description": "让 CHA 对箱子执行 open/deposit/withdraw。", "parameters": {"type": "object", "properties": {"action": {"type": "string"}, "name": {"type": "string"}, "quantity": {"type": "integer"}, "x": {"type": "integer"}, "y": {"type": "integer"}}, "required": ["action"]}},
    {"name": "craft", "description": "让 CHA 制作物品。", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "quantity": {"type": "integer"}}, "required": ["name"]}},
    {"name": "machines", "description": "让 CHA 查看或处理机器。", "parameters": {"type": "object", "properties": {"action": {"type": "string"}, "radius": {"type": "integer"}}, "required": []}},
    {"name": "animals", "description": "让 CHA 查看、摸动物或执行动物相关动作。", "parameters": {"type": "object", "properties": {"action": {"type": "string"}, "radius": {"type": "integer"}}, "required": []}},
    {"name": "give_item", "description": "给 CHA 添加物品。full 模式允许 cheat 工具。", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "quantity": {"type": "integer"}}, "required": ["name"]}},
    {"name": "heal", "description": "恢复 CHA 生命/体力。full 模式允许 cheat 工具。", "parameters": {"type": "object", "properties": {"stamina": {"type": "integer"}, "health": {"type": "integer"}}, "required": []}},
    {"name": "money", "description": "调整或添加金钱。full 模式允许 cheat 工具。", "parameters": {"type": "object", "properties": {"amount": {"type": "integer"}}, "required": ["amount"]}},
    {"name": "ripen", "description": "催熟 CHA 附近作物。", "parameters": {"type": "object", "properties": {"radius": {"type": "integer"}}, "required": []}},
    {"name": "refill", "description": "补充 CHA 工具或资源，例如水壶。", "parameters": {"type": "object", "properties": {"target": {"type": "string"}}, "required": []}},
    {
        "name": "run_script",
        "description": "运行 NagiBridge scripts 目录中的脚本。模型不能指定端口；ChaBridge 会强制追加 CHA endpoint 端口。",
        "parameters": {
            "type": "object",
            "properties": {"script": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}}},
            "required": ["script"],
        },
    },
    CHAT_PUSH_TOOL,
]


@dataclass
class ToolEvent:
    type: str
    text: str
    created_at: str
    metadata: dict[str, Any]


class ChaToolAgent:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.cha_base_url = _resolve_cha_base_url(args)
        self.kk_base_url = normalize_base_url(args.kk_base_url)
        self.model = args.model or DEFAULT_MODELS[args.provider]
        self.memory = LocalMemoryAdapter()
        self.session_started_at = _now_iso()
        self.memory_context = self.memory.load_stardew_session_state()
        self._session_finalized = False
        self._last_dry_run_tool: dict[str, Any] | None = None
        self.tools = _build_tools(args)
        self.allowed_tool_names = {tool["name"] for tool in self.tools}
        self.nagi_scripts_dir = _resolve_nagi_scripts_dir(args.nagi_scripts_dir)
        self.current_user_input = ""
        self.voice = ChaVoice() if args.voice_mode != "off" else None
        self.last_final_response = ""
        self.voice_chars_used = 0
        self.last_voice_at = 0.0

    def validate_setup(self) -> bool:
        if self.kk_base_url and _same_endpoint(self.kk_base_url, self.cha_base_url):
            print("setup_error: kk_base_url 与 cha_base_url 相同，这不是 Mode B，会导致控制同一个角色。")
            self.log_event(
                "blocked_tools",
                "kk_base_url 与 cha_base_url 相同，未进入 agent loop。",
                {"kk_base_url": self.kk_base_url, "cha_base_url": self.cha_base_url},
            )
            return False

        status = self.game_api("GET", "/status")
        if not status.get("ok"):
            print("setup_error: 未检测到 cha farmhand endpoint。请先让第二个 Stardew 客户端以 farmhand 身份加入农场，并确保该客户端安装并加载 NagiBridge。")
            self.log_event("blocked_tools", "cha endpoint 不可用，未进入 agent loop。", {"status": status})
            return False
        if status.get("worldReady") is not True:
            print("setup_error: cha endpoint 可连接，但 worldReady 不是 true。请先进入已加载的联机农场。")
            self.log_event("blocked_tools", "cha endpoint worldReady=false，未进入 agent loop。", {"status": status})
            return False

        state = self.game_api("GET", "/state")
        if not state.get("ok"):
            print(f"setup_error: 无法读取 cha /state：{state.get('error', 'unknown')}")
            self.log_event("blocked_tools", "cha endpoint /state 不可读，未进入 agent loop。", {"state": state})
            return False

        actual_name = endpoint_player_name(self.cha_base_url)
        expected = self.args.expected_cha_name
        if expected and actual_name.lower() != expected.lower():
            message = (
                f"当前 cha endpoint 指向的角色不是 {expected}，实际是 {actual_name}，"
                "可能接错到了 KK 或其他玩家。为避免误控，默认停止执行动作。"
            )
            if self.args.allow_name_mismatch:
                print("warning:", message, "已因 --allow-name-mismatch 继续。")
            else:
                print("setup_error:", message)
                self.log_event("blocked_tools", "角色名校验失败，未进入 agent loop。", {"expected": expected, "actual": actual_name})
                return False
        return True

    def run(self) -> int:
        if not self.validate_setup():
            return 2

        self.log_event(
            "session_start",
            "Cha Tool Agent 启动，已连接 cha farmhand endpoint。",
            {
                "cha_base_url": self.cha_base_url,
                "kk_base_url": self.kk_base_url,
                "provider": self.args.provider,
                "permission_mode": self.args.permission_mode,
                "dry_run": self.args.dry_run,
            },
        )
        print(f"Cha Tool Agent | provider={self.args.provider} model={self.model} mode={self.args.permission_mode} cha={self.cha_base_url}")
        if self.memory_context:
            print("Loaded local Stardew memory summary.")
        print("Commands: /quit, /state, /clear, /speak")
        history: list[dict[str, Any]] = []

        while True:
            try:
                user_input = input("KK > ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                self.log_event("user_input", "退出：EOF/KeyboardInterrupt", {})
                self.finalize_session()
                return 0

            if not user_input:
                continue
            if user_input == "/quit":
                self.log_event("user_input", "/quit", {})
                self.finalize_session()
                return 0
            if user_input == "/state":
                print(json.dumps(self.game_api("GET", "/state"), indent=2, ensure_ascii=False))
                continue
            if user_input == "/speak" or "读出来" in user_input:
                self.speak_final_response(self.last_final_response, manual=True)
                continue
            if user_input == "/voice-test":
                self.voice_test()
                continue
            if user_input == "/voice-config-debug":
                self.voice_config_debug()
                continue
            if user_input == "/clear":
                history.clear()
                print("History cleared.")
                continue

            self.log_event("user_input", user_input, {})
            self.current_user_input = user_input
            if _asks_to_control_kk(user_input):
                result = self.block_tool("user_request", {}, "用户请求控制 KK；任何模式都不能控制 KK。")
                print("cha > 我不能控制 KK。我只能控制自己的 CHA farmhand。")
                history.append({"role": "assistant", "content": "我不能控制 KK。我只能控制自己的 CHA farmhand。"})
                self.log_event("final_response", "我不能控制 KK。我只能控制自己的 CHA farmhand。", {"blocked_result": result})
                self.last_final_response = "我不能控制 KK。我只能控制自己的 CHA farmhand。"
                self.speak_final_response(self.last_final_response)
                continue
            history.append({"role": "user", "content": user_input})

            if self.args.dry_run and not self.args.key:
                response = self.run_local_dry_run_plan(user_input)
                print(f"cha > {response}")
                history.append({"role": "assistant", "content": response})
                self.log_event("final_response", response, {})
                self.last_final_response = response
                self.speak_final_response(response)
                continue

            for _turn in range(self.args.max_turns):
                messages = self.build_claude_messages(history) if self.args.provider == "claude" else self.build_openai_messages(history)
                text, tool_calls = self.call_api(messages)

                if text:
                    text = self.guard_final_response(text)
                    print(f"cha > {text}")

                if not tool_calls:
                    if text:
                        history.append({"role": "assistant", "content": text})
                        self.log_event("final_response", text, {})
                        self.last_final_response = text
                        self.speak_final_response(text)
                    break

                if self.args.provider == "claude":
                    history.append(self._claude_assistant_message(text, tool_calls))
                    for call in tool_calls:
                        result = self.execute_tool(call["name"], call.get("arguments") or {})
                        history.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": call["id"],
                                        "content": _compact_json(result),
                                    }
                                ],
                            }
                        )
                else:
                    history.append(self._openai_assistant_message(text, tool_calls))
                    for call in tool_calls:
                        result = self.execute_tool(call["name"], call.get("arguments") or {})
                        history.append({"role": "tool", "tool_call_id": call["id"], "content": _compact_json(result)})

                if len(history) > 40:
                    history = history[-30:]
        return 0

    def finalize_session(self) -> None:
        if self._session_finalized:
            return
        self._session_finalized = True
        summary = self.memory.summarize_events_since(self.session_started_at)
        self.memory.summarize_and_persist_session(summary)
        self.log_event("session_summary", "退出时已总结本局星露谷会话。", {"summary_path": str(self.memory.summary_path)})
        print(f"Session summary saved: {self.memory.summary_path}")

    def speak_final_response(self, text: str, *, manual: bool = False) -> VoiceResult | None:
        if not text.strip():
            return None
        if self.args.voice_mode == "off" or self.voice is None:
            return None
        if self.args.dry_run and not self.args.voice_in_dry_run:
            return None
        if self.args.voice_mode == "manual" and not manual:
            return None

        now = time.time()
        if not manual and now - self.last_voice_at < self.args.voice_cooldown_seconds:
            print("[voice skipped] cooldown")
            return VoiceResult(ok=False, error="cooldown")

        voice_text = compress_for_voice(text, self.args.max_voice_chars)
        if not voice_text:
            return None

        if self.voice_chars_used + len(voice_text) > self.args.voice_session_char_budget:
            print("[voice budget reached]")
            self.log_event(
                "voice_failed",
                "voice session char budget reached",
                {"voice_chars_used": self.voice_chars_used, "budget": self.args.voice_session_char_budget},
            )
            return VoiceResult(ok=False, error="voice budget reached")

        result = self.voice.speak(voice_text, lang=self.args.voice_lang)
        if result.ok:
            if self.args.voice_message_db:
                db_result = self.voice.write_voice_message(voice_text, result, conversation_id=self.args.voice_conversation_id)
                if db_result.ok:
                    result.message_id = db_result.message_id
                    print(f"[voice message] saved message_id={result.message_id}")
                else:
                    print(f"[voice message skipped] {db_result.error or 'unknown'}")
                    self.log_event("voice_failed", "ChaBridge voice message DB write failed.", {"error": db_result.error})
            self.voice_chars_used += result.chars_used or len(voice_text)
            self.last_voice_at = now
            self.log_event(
                "voice_chars_used",
                "ChaBridge TTS spoke final response.",
                {
                    "chars": result.chars_used or len(voice_text),
                    "total": self.voice_chars_used,
                    "provider": result.provider,
                    "model": result.model,
                    "voice_id": result.voice_id,
                    "cached": result.cached,
                    "message_id": result.message_id,
                },
            )
        else:
            print(f"[voice skipped] {result.error or 'unknown'}")
            self.log_event(
                "voice_failed",
                "ChaBridge TTS failed.",
                {"error": result.error, "provider": result.provider, "model": result.model, "voice_id": result.voice_id},
            )
        return result

    def voice_test(self) -> VoiceResult:
        if self.voice is None:
            self.voice = ChaVoice()
        result = self.voice.speak("我在，声音测试。", lang=self.args.voice_lang)
        if result.ok and self.args.voice_message_db:
            db_result = self.voice.write_voice_message("我在，声音测试。", result, conversation_id=self.args.voice_conversation_id)
            if db_result.ok:
                result.message_id = db_result.message_id
            else:
                print(f"[voice message skipped] {db_result.error or 'unknown'}")
        if result.ok:
            print("voice-test ok")
            print(f"provider: {result.provider}")
            print(f"model: {result.model}")
            print(f"voice_id: {result.voice_id}")
            print(f"cache_hit: {str(result.cached).lower()}")
            print(f"audio_path: {result.audio_path}")
            if result.message_id:
                print(f"message_id: {result.message_id}")
        else:
            print(f"[voice skipped] {result.error or 'unknown'}")
        return result

    def voice_config_debug(self) -> dict[str, Any]:
        debug = voice_config_debug(lang=self.args.voice_lang)
        print(json.dumps(debug, ensure_ascii=False, indent=2))
        return debug

    def execute_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.log_tool_call(name, arguments)
        print(f" [tool] {name}({json.dumps(arguments, ensure_ascii=False)})")

        blocked_reason = self.blocked_reason(name, arguments)
        if blocked_reason:
            result = self.block_tool(name, arguments, blocked_reason)
            print(f" [blocked] {result['error']}")
            return result

        if name == "get_state":
            result = self.game_api("GET", "/state")
        elif name == "get_surroundings":
            radius = max(1, min(int(arguments.get("radius", 8)), 12))
            result = self.game_api("GET", "/surroundings", params={"radius": radius})
        elif name == "emote":
            result = self.game_api("POST", "/emote", {"id": int(arguments["id"])})
        elif name == "face":
            result = self.game_api("POST", "/face", {"direction": int(arguments["direction"])})
        elif name == "move_to":
            result = self.game_api("POST", "/move", {"x": int(arguments["x"]), "y": int(arguments["y"])})
        elif name == "pet_animals":
            result = self.run_pet_animals()
        elif name == "chat_push":
            result = self.game_api("POST", "/chat/push", {"sender": "cha", "message": str(arguments["message"])})
        elif name == "run_script":
            result = self.run_script(str(arguments["script"]), list(arguments.get("args") or []))
        elif name in FULL_MUTATING_TOOLS:
            result = self.game_api("POST", _tool_endpoint(name), arguments)
        else:
            result = self.block_tool(name, arguments, f"未知工具：{name}")

        if not self.args.dry_run and name in FULL_MUTATING_TOOLS and result.get("ok"):
            result = {"action_result": result, "state": self.game_api("GET", "/state")}

        self.log_tool_result(name, arguments, result)
        print(f" [result] {_compact_json(result)[:220]}")
        if result.get("dry_run"):
            self._last_dry_run_tool = {"name": name, "arguments": arguments, "result": result}
        elif name not in {"get_state", "get_surroundings"}:
            self._last_dry_run_tool = None
        return result

    def blocked_reason(self, name: str, arguments: dict[str, Any]) -> str | None:
        if _arguments_attempt_other_endpoint(arguments, self.cha_base_url):
            return "工具参数试图指定非 CHA endpoint/端口，已阻止。"
        if self.args.permission_mode == "safe":
            if name in SAFE_BLOCKED_TOOLS or name not in self.allowed_tool_names:
                return f"工具不在 safe 模式白名单中：{name}"
        if self.args.permission_mode == "full" and name not in self.allowed_tool_names:
            return f"工具不在 full 模式工具集合中：{name}"
        return None

    def block_tool(self, name: str, arguments: dict[str, Any], reason: str) -> dict[str, Any]:
        result = {
            "ok": False,
            "blocked": True,
            "executed": False,
            "target_endpoint": self.cha_base_url,
            "dry_run": self.args.dry_run,
            "blocked_reason": reason,
            "error": reason,
        }
        self.log_tool_result(name, arguments, result, blocked_reason=reason)
        return result

    def game_api(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.endpoint_allowed(method, endpoint):
            return {"ok": False, "blocked": True, "error": f"endpoint 不在 cha 白名单：{endpoint}"}

        url = self.cha_base_url + endpoint
        if params:
            url += "?" + parse.urlencode(params)

        if self.args.dry_run and method != "GET":
            body = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":"))
            print(f"[dry-run] {method} {url} {body}")
            return {
                "ok": True,
                "dry_run": True,
                "executed": False,
                "action_status": "not_executed_dry_run",
                "url": url,
                "target_endpoint": self.cha_base_url,
                "payload": data or {},
                "assistant_instruction": "这是 dry-run 测试计划，动作没有真实执行。回复必须标注是测试计划，不能说已经完成。",
            }

        try:
            if method == "GET":
                req = request.Request(url, method="GET")
            else:
                body = json.dumps(data or {}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                req = request.Request(url, data=body, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
            with request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else {}
            result = {"ok": True, **(parsed if isinstance(parsed, dict) else {"data": parsed})}
            if method != "GET" and result.get("ok") is True:
                result.setdefault("dry_run", False)
                result.setdefault("executed", True)
                result.setdefault("action_status", "executed")
                result.setdefault("target_endpoint", self.cha_base_url)
            return result
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            return {"ok": False, "executed": False, "target_endpoint": self.cha_base_url, "error": str(exc)}

    def endpoint_allowed(self, method: str, endpoint: str) -> bool:
        read_only = {"/status", "/state", "/surroundings", "/alerts", "/menu"}
        if method == "GET":
            return endpoint in read_only
        safe_posts = {"/chat/push", "/emote", "/face", "/move"}
        if self.args.permission_mode == "safe":
            return endpoint in safe_posts
        return endpoint in safe_posts or endpoint in {_tool_endpoint(name) for name in FULL_MUTATING_TOOLS}

    def run_local_dry_run_plan(self, user_input: str) -> str:
        text = user_input.lower()
        if "睡觉" in user_input:
            self.execute_tool("sleep", {})
            return "测试计划里，我会只让 CHA 去睡觉；dry-run 没有真的执行。"
        if "恢复体力" in user_input or "恢复" in user_input:
            self.execute_tool("heal", {"stamina": 270})
            return "测试计划里，我会只给 CHA 恢复体力；dry-run 没有真的执行。"
        if "种防风草" in user_input or "parsnip" in text:
            self.execute_tool("select_item", {"name": "Parsnip Seeds"})
            self.execute_tool("use_item", {})
            return "测试计划里，我会让 CHA 选择防风草种子并尝试播种；dry-run 没有真的执行。"
        if "走出小屋" in user_input or "出小屋" in user_input:
            self.execute_tool("move_to", {"x": 6, "y": 11})
            return "测试计划里，我会让 CHA 往小屋出口移动；dry-run 没有真的执行。"
        if "挥" in user_input or "招呼" in user_input:
            self.execute_tool("emote", {"id": 16})
            return "测试里我准备挥手了；dry-run 没有真的执行。"
        self.execute_tool("get_state", {})
        return "测试计划里，我会先读取 CHA 状态再决定动作；dry-run 不会真的执行控制动作。"

    def run_pet_animals(self) -> dict[str, Any]:
        port = _local_port(self.cha_base_url)
        if port is None:
            return {"ok": False, "error": "pet_animals P0 只支持本机 cha endpoint。请在 cha farmhand 所在机器运行。"}
        script_path = self.nagi_scripts_dir / "pet_animals.py"
        if not script_path.exists():
            return {"ok": False, "error": f"找不到 pet_animals.py：{script_path}"}
        cmd = [sys.executable, str(script_path), "--port", str(port)]
        if self.args.dry_run:
            print("[dry-run] run script:", " ".join(cmd))
            return {
                "ok": True,
                "dry_run": True,
                "executed": False,
                "action_status": "not_executed_dry_run",
                "command": cmd,
                "assistant_instruction": "这是 dry-run 测试，脚本没有真实执行。不要说已经摸完动物。",
            }
        result = subprocess.run(
            cmd,
            cwd=str(self.nagi_scripts_dir),
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        return {"ok": result.returncode == 0, "returncode": result.returncode, "stdout": result.stdout[-2000:], "stderr": result.stderr[-2000:]}

    def run_script(self, script: str, args: list[str]) -> dict[str, Any]:
        port = _local_port(self.cha_base_url)
        if port is None:
            return {"ok": False, "executed": False, "target_endpoint": self.cha_base_url, "error": "run_script 只支持本机 CHA endpoint；请在 CHA farmhand 所在机器运行。"}

        safe_script = Path(script).name
        if not safe_script.endswith(".py"):
            safe_script += ".py"
        script_path = (self.nagi_scripts_dir / safe_script).resolve()
        scripts_root = self.nagi_scripts_dir.resolve()
        try:
            script_path.relative_to(scripts_root)
        except ValueError:
            return {"ok": False, "executed": False, "target_endpoint": self.cha_base_url, "blocked": True, "blocked_reason": "run_script 不能逃出 NagiBridge scripts 目录。"}
        if not script_path.exists():
            return {"ok": False, "executed": False, "target_endpoint": self.cha_base_url, "error": f"找不到脚本：{script_path}"}

        sanitized_args = _strip_port_and_url_args(args)
        cmd = [sys.executable, str(script_path), *sanitized_args, "--port", str(port)]
        if self.args.dry_run:
            print("[dry-run] run script:", " ".join(cmd))
            return {
                "ok": True,
                "dry_run": True,
                "executed": False,
                "target_endpoint": self.cha_base_url,
                "action_status": "not_executed_dry_run",
                "command": cmd,
                "assistant_instruction": "这是 dry-run 测试计划，脚本没有真实执行。",
            }
        result = subprocess.run(
            cmd,
            cwd=str(scripts_root),
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        return {
            "ok": result.returncode == 0,
            "executed": result.returncode == 0,
            "target_endpoint": self.cha_base_url,
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-2000:],
        }

    def call_api(self, messages: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
        if self.args.provider == "claude":
            return self.call_claude(messages)
        endpoint = self.args.api_base
        if not endpoint:
            endpoint = DEEPSEEK_ENDPOINT if self.args.provider == "deepseek" else OPENAI_ENDPOINT
        return self.call_openai_compatible(messages, endpoint, {"Authorization": f"Bearer {self.args.key}"})

    def call_openai_compatible(
        self,
        messages: list[dict[str, Any]],
        endpoint: str,
        auth_header: dict[str, str],
    ) -> tuple[str | None, list[dict[str, Any]]]:
        body = {"model": self.model, "max_tokens": 1024, "messages": messages, "tools": self.convert_tools_openai()}
        data = self._post_llm_json(endpoint, body, {"Content-Type": "application/json", **auth_header})
        if data is None:
            return None, []
        msg = data["choices"][0]["message"]
        tool_calls = [
            {
                "id": call["id"],
                "name": call["function"]["name"],
                "arguments": json.loads(call["function"].get("arguments") or "{}"),
            }
            for call in msg.get("tool_calls", [])
        ]
        return msg.get("content", ""), tool_calls

    def call_claude(self, messages: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
        body = {
            "model": self.model,
            "max_tokens": 1024,
            "system": self.build_system_prompt(),
            "messages": messages,
            "tools": self.convert_tools_claude(),
        }
        data = self._post_llm_json(
            CLAUDE_ENDPOINT,
            body,
            {"Content-Type": "application/json", "x-api-key": self.args.key, "anthropic-version": "2023-06-01"},
        )
        if data is None:
            return None, []
        text = ""
        tool_calls: list[dict[str, Any]] = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block.get("text", "")
            elif block.get("type") == "tool_use":
                tool_calls.append({"id": block["id"], "name": block["name"], "arguments": block.get("input") or {}})
        return text, tool_calls

    def _post_llm_json(self, endpoint: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any] | None:
        if not self.args.key:
            print("API error: API key required (--key or NAGI_API_KEY)")
            return None
        try:
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
            req = request.Request(endpoint, data=payload, headers=headers, method="POST")
            with request.urlopen(req, timeout=60) as response:
                raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            print(f"API error {exc.code}: {raw[:300]}")
        except Exception as exc:
            print(f"API error: {exc}")
        return None

    def convert_tools_openai(self) -> list[dict[str, Any]]:
        return [{"type": "function", "function": {"name": tool["name"], "description": tool["description"], "parameters": tool["parameters"]}} for tool in self.tools]

    def convert_tools_claude(self) -> list[dict[str, Any]]:
        return [{"name": tool["name"], "description": tool["description"], "input_schema": tool["parameters"]} for tool in self.tools]

    def build_openai_messages(self, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{"role": "system", "content": self.build_system_prompt()}, *history]

    def build_claude_messages(self, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [message for message in history if message["role"] != "system"]

    def build_system_prompt(self) -> str:
        base_prompt = FULL_SYSTEM_PROMPT if self.args.permission_mode == "full" else SYSTEM_PROMPT
        if not self.memory_context:
            return base_prompt
        return (
            base_prompt
            + "\n\n[最近一次星露谷本地总结]\n"
            + self.memory_context
            + "\n\n这段总结只是本地 fallback 记忆。不要把它当作当前已发生的动作；需要行动时必须实际调用工具。"
        )

    def guard_final_response(self, text: str) -> str:
        last_tool = getattr(self, "_last_dry_run_tool", None)
        if not last_tool:
            return text

        name = str(last_tool.get("name", ""))
        if name == "emote" and _looks_like_completed_emote(text):
            guarded = "测试里我准备挥手了；dry-run 没有真的执行。"
            self.log_event(
                "final_response_guarded",
                "dry-run 下拦截了把 emote 描述成已完成的回复。",
                {"original": text, "guarded": guarded, "tool": last_tool},
            )
            return guarded
        return text

    def log_event(self, event_type: str, text: str, metadata: dict[str, Any]) -> None:
        self.memory.append_stardew_event(asdict(ToolEvent(event_type, text, _now_iso(), metadata)))

    def log_tool_call(self, name: str, arguments: dict[str, Any]) -> None:
        self.log_event(
            "tool_calls",
            name,
            {
                "user_input": self.current_user_input,
                "tool_name": name,
                "tool_args": arguments,
                "target_endpoint": self.cha_base_url,
                "dry_run": self.args.dry_run,
                "permission_mode": self.args.permission_mode,
            },
        )

    def log_tool_result(self, name: str, arguments: dict[str, Any], result: dict[str, Any], blocked_reason: str | None = None) -> None:
        self.log_event(
            "tool_results" if not blocked_reason else "blocked_tools",
            name,
            {
                "user_input": self.current_user_input,
                "tool_name": name,
                "tool_args": arguments,
                "target_endpoint": self.cha_base_url,
                "dry_run": self.args.dry_run,
                "result": result,
                "blocked_reason": blocked_reason,
            },
        )

    def _openai_assistant_message(self, text: str | None, tool_calls: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "role": "assistant",
            "content": text or "",
            "tool_calls": [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": json.dumps(call.get("arguments") or {}, ensure_ascii=False)},
                }
                for call in tool_calls
            ],
        }

    def _claude_assistant_message(self, text: str | None, tool_calls: list[dict[str, Any]]) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        if text:
            content.append({"type": "text", "text": text})
        content.extend({"type": "tool_use", "id": call["id"], "name": call["name"], "input": call.get("arguments") or {}} for call in tool_calls)
        return {"role": "assistant", "content": content}


def main() -> int:
    _configure_stdio()
    parser = argparse.ArgumentParser(description="Xiaocha Mode B adapter for NagiBridge tool_agent")
    parser.add_argument("--provider", default=os.environ.get("NAGI_API_PROVIDER", "deepseek"), choices=["claude", "deepseek", "openai", "openai-compatible"])
    parser.add_argument("--key", default=os.environ.get("NAGI_API_KEY", ""))
    parser.add_argument("--model", default=os.environ.get("NAGI_API_MODEL", ""))
    parser.add_argument("--api-base", default=os.environ.get("NAGI_API_BASE", ""))
    parser.add_argument("--cha-base-url", default="")
    parser.add_argument("--kk-base-url", default="http://localhost:7842")
    parser.add_argument("--port", type=int, default=7843)
    parser.add_argument("--expected-cha-name", default="cha")
    parser.add_argument("--allow-name-mismatch", action="store_true")
    parser.add_argument("--permission-mode", choices=["safe", "full"], default="safe")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-turns", type=int, default=10)
    parser.add_argument("--voice", dest="voice_mode", action="store_const", const="auto", help="Enable automatic TTS for final replies")
    parser.add_argument("--no-voice", dest="voice_mode", action="store_const", const="off", help="Disable TTS")
    parser.add_argument("--voice-mode", choices=["off", "manual", "auto"], default=os.environ.get("CHABRIDGE_VOICE_MODE", "off"))
    parser.add_argument("--voice-lang", default=os.environ.get("CHABRIDGE_VOICE_LANG", "zh"))
    parser.add_argument("--voice-test", action="store_true", help="Run a fixed TTS smoke test and exit; does not call LLM")
    parser.add_argument("--voice-config-debug", action="store_true", help="Print normalized TTS config diagnostics and exit; does not call TTS")
    parser.add_argument("--voice-in-dry-run", action="store_true")
    parser.add_argument("--max-voice-chars", type=int, default=int(os.environ.get("CHABRIDGE_MAX_VOICE_CHARS", "120")))
    parser.add_argument("--voice-cooldown-seconds", type=float, default=float(os.environ.get("CHABRIDGE_VOICE_COOLDOWN_SECONDS", "8")))
    parser.add_argument("--voice-session-char-budget", type=int, default=int(os.environ.get("CHABRIDGE_VOICE_SESSION_CHAR_BUDGET", "2000")))
    parser.add_argument("--voice-message-db", dest="voice_message_db", action="store_true", default=os.environ.get("CHABRIDGE_VOICE_MESSAGE_DB") == "1", help="Write generated TTS as a formal savePrincessCha voice message")
    parser.add_argument("--no-voice-message-db", dest="voice_message_db", action="store_false")
    parser.add_argument("--voice-conversation-id", default=os.environ.get("CHABRIDGE_VOICE_CONVERSATION_ID", "default"))
    parser.add_argument("--allow-move-to", action="store_true")
    parser.add_argument("--enable-pet-animals", action="store_true")
    parser.add_argument("--enable-chat-push", action="store_true")
    parser.add_argument("--nagi-scripts-dir", default=os.environ.get("NAGI_SCRIPTS_DIR", ""))
    args = parser.parse_args()
    if os.environ.get("CHABRIDGE_VOICE_ENABLED") == "1" and args.voice_mode == "off":
        args.voice_mode = "auto"
    if args.voice_test:
        args.voice_mode = "manual"
        ChaToolAgent(args).voice_test()
        return 0
    if args.voice_config_debug:
        args.voice_mode = "manual"
        ChaToolAgent(args).voice_config_debug()
        return 0
    return ChaToolAgent(args).run()


def _build_tools(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.permission_mode == "full":
        return list(FULL_TOOLS)
    tools = list(BASE_TOOLS)
    if args.allow_move_to:
        tools.append(MOVE_TO_TOOL)
    if args.enable_pet_animals:
        tools.append(PET_ANIMALS_TOOL)
    if args.enable_chat_push:
        tools.append(CHAT_PUSH_TOOL)
    return tools


def _resolve_cha_base_url(args: argparse.Namespace) -> str:
    if args.cha_base_url:
        base_url = normalize_base_url(args.cha_base_url)
        if base_url:
            return base_url
    return f"http://localhost:{args.port}"


def _resolve_nagi_scripts_dir(configured: str | None) -> Path:
    if configured:
        return Path(configured).resolve()
    current = Path(__file__).resolve()
    candidates = [
        current.parents[1],
        current.parents[2] / "NagiBridge" / "scripts",
    ]
    for candidate in candidates:
        if (candidate / "pet_animals.py").exists():
            return candidate
    return candidates[0]


def _local_port(base_url: str) -> int | None:
    parsed = parse.urlparse(base_url)
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        return None
    return parsed.port or (443 if parsed.scheme == "https" else 80)


def _same_endpoint(left: str, right: str) -> bool:
    left_parsed = parse.urlparse(left.rstrip("/"))
    right_parsed = parse.urlparse(right.rstrip("/"))
    return (
        (left_parsed.scheme or "http").lower(),
        (left_parsed.hostname or "").lower(),
        left_parsed.port or (443 if left_parsed.scheme == "https" else 80),
    ) == (
        (right_parsed.scheme or "http").lower(),
        (right_parsed.hostname or "").lower(),
        right_parsed.port or (443 if right_parsed.scheme == "https" else 80),
    )


def _tool_endpoint(name: str) -> str:
    mapping = {
        "move_to": "/move",
        "use_tool": "/tool",
        "select_item": "/select",
        "use_item": "/use",
        "press_key": "/key",
        "machine": "/machines",
        "animal": "/animals",
    }
    return mapping.get(name, "/" + name)


def _asks_to_control_kk(text: str) -> bool:
    lowered = text.lower()
    return ("kk" in lowered or "host" in lowered or "7842" in lowered) and any(
        marker in text for marker in ["控制", "走", "移动", "操作", "用工具", "睡觉", "传送"]
    )


def _arguments_attempt_other_endpoint(arguments: Any, cha_base_url: str) -> bool:
    cha = parse.urlparse(cha_base_url)
    cha_port = cha.port or (443 if cha.scheme == "https" else 80)
    if isinstance(arguments, dict):
        for key, value in arguments.items():
            key_lower = str(key).lower()
            if key_lower in {"url", "base_url", "baseurl", "endpoint", "target_endpoint", "host", "host_port", "kk_base_url"}:
                if not _value_points_to_cha(value, cha_base_url, cha_port):
                    return True
            if key_lower in {"port", "target_port"}:
                try:
                    if int(value) != cha_port:
                        return True
                except (TypeError, ValueError):
                    return True
            if _arguments_attempt_other_endpoint(value, cha_base_url):
                return True
    elif isinstance(arguments, list):
        return any(_arguments_attempt_other_endpoint(item, cha_base_url) for item in arguments)
    elif isinstance(arguments, str):
        if "7842" in arguments or "kk_base_url" in arguments or "localhost:7842" in arguments:
            return True
    return False


def _value_points_to_cha(value: Any, cha_base_url: str, cha_port: int) -> bool:
    text = str(value)
    if text.isdigit():
        return int(text) == cha_port
    parsed = parse.urlparse(text)
    if parsed.scheme and parsed.netloc:
        return _same_endpoint(f"{parsed.scheme}://{parsed.netloc}", cha_base_url)
    return text in {"", "cha", "CHA"}


def _strip_port_and_url_args(args: list[str]) -> list[str]:
    stripped: list[str] = []
    skip_next = False
    banned_prefixes = ("--port", "--url", "--base-url", "--base_url", "--host-port", "--cha-port", "--endpoint")
    for arg in args:
        if skip_next:
            skip_next = False
            continue
        if any(arg == prefix for prefix in banned_prefixes):
            skip_next = True
            continue
        if any(arg.startswith(prefix + "=") for prefix in banned_prefixes):
            continue
        if "7842" in arg or "localhost:7842" in arg:
            continue
        stripped.append(str(arg))
    return stripped


def _compact_json(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= 2000 else text[:2000] + "...(truncated)"


def _looks_like_completed_emote(text: str) -> bool:
    compact = text.replace(" ", "")
    completed_markers = [
        "我挥手啦",
        "我挥手了",
        "挥手啦",
        "挥手了",
        "看到我挥手",
        "看见我挥手",
        "我打招呼啦",
        "我打招呼了",
    ]
    return any(marker in compact for marker in completed_markers)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _configure_stdio() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
