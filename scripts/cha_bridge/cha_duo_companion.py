"""ChaBridge P0 companion loop.

P0 intentionally uses fixed intent matching instead of autonomous tool calling.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import sys
from typing import Any
from urllib import request

try:
    from .cha_duo_actions import ActionGateway
    from .cha_duo_context import (
        build_game_context_from_urls,
        check_endpoints,
        endpoint_player_name,
        normalize_base_url,
    )
    from .cha_memory_adapter import LocalMemoryAdapter
    from .cha_voice import listen_once, speak
except ImportError:
    from cha_duo_actions import ActionGateway
    from cha_duo_context import (
        build_game_context_from_urls,
        check_endpoints,
        endpoint_player_name,
        normalize_base_url,
    )
    from cha_memory_adapter import LocalMemoryAdapter
    from cha_voice import listen_once, speak


def main() -> int:
    _configure_stdio()
    parser = argparse.ArgumentParser(description="ChaBridge MVP companion runtime")
    parser.add_argument("--cha-base-url", default="http://localhost:7843")
    parser.add_argument("--kk-base-url", default="http://localhost:7842")
    parser.add_argument("--expected-cha-name", default="cha")
    parser.add_argument("--expected-kk-name", default="kk")
    parser.add_argument("--allow-name-mismatch", action="store_true")
    parser.add_argument("--host-port", type=int, default=None, help="Legacy alias for --kk-base-url http://localhost:PORT")
    parser.add_argument("--cha-port", type=int, default=None, help="Legacy alias for --cha-base-url http://localhost:PORT")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mock-llm", action="store_true")
    parser.add_argument("--provider", default="mock", help="Reserved for future real LLM providers")
    args = parser.parse_args()

    cha_base_url = normalize_base_url(args.cha_base_url)
    kk_base_url = normalize_base_url(args.kk_base_url)
    if args.cha_port is not None:
        cha_base_url = f"http://localhost:{args.cha_port}"
    if args.host_port is not None:
        kk_base_url = f"http://localhost:{args.host_port}"
    if not cha_base_url:
        print("setup_error: --cha-base-url 必须配置。")
        return 2

    memory = LocalMemoryAdapter()
    setup = _validate_setup(
        cha_base_url=cha_base_url,
        kk_base_url=kk_base_url,
        expected_cha_name=args.expected_cha_name,
        expected_kk_name=args.expected_kk_name,
        allow_name_mismatch=args.allow_name_mismatch,
    )
    for warning in setup["warnings"]:
        print("warning:", warning)
    if setup["errors"]:
        for error in setup["errors"]:
            print("setup_error:", error)
        memory.append_stardew_event(
            {
                "type": "farmhand_missing" if any("未检测到 cha farmhand endpoint" in e for e in setup["errors"]) else "setup_error",
                "text": "ChaBridge Mode B 启动校验失败，未进入 companion loop。",
                "metadata": {
                    "cha_base_url": cha_base_url,
                    "kk_base_url": kk_base_url,
                    "errors": setup["errors"],
                    "warnings": setup["warnings"],
                },
            }
        )
        return 2

    actions = ActionGateway(cha_base_url=cha_base_url, dry_run=args.dry_run)

    if not args.mock_llm:
        print("P0 目前只支持 --mock-llm；本次将使用 mock 意图回复。")

    memory.append_stardew_event(
        {
            "type": "session_start",
            "text": "ChaBridge Mode B 启动，准备控制真实 cha farmhand 陪 KK 玩星露谷。",
            "metadata": {"cha_base_url": cha_base_url, "kk_base_url": kk_base_url, "dry_run": args.dry_run},
        }
    )

    print("ChaBridge 已启动。输入 /context、/summary、/quit，或说：今天我们干嘛 / 你挥个手 / 你去摸动物。")
    try:
        while True:
            user_text = listen_once().strip()
            if not user_text:
                continue
            if user_text == "/quit":
                _write_summary(memory)
                print("已退出。")
                return 0
            if user_text == "/context":
                print(build_game_context_from_urls(cha_base_url, kk_base_url=kk_base_url))
                continue
            if user_text == "/summary":
                print(_write_summary(memory))
                continue

            if _is_plan_intent(user_text):
                reply = _mock_plan_reply(cha_base_url, kk_base_url, memory)
                _deliver_reply(actions, kk_base_url, reply, dry_run=args.dry_run)
                memory.append_stardew_event(
                    {
                        "type": "chat",
                        "text": f"KK 问今天安排，cha 结合上下文回复：{reply}",
                        "metadata": {"user_text": user_text},
                    }
                )
                continue

            if _is_wave_intent(user_text):
                result = actions.wave()
                if not result.get("ok"):
                    print(f"[warn] cha_emote failed: {result.get('error', 'unknown')}")
                elif not args.dry_run:
                    print("cha_emote ok")
                memory.append_stardew_event(
                    {
                        "type": "cha_emote",
                        "text": "KK 让 cha 挥手/打招呼，cha 只向自己的 farmhand endpoint 发送 /emote id=16。",
                        "metadata": {"user_text": user_text, "target": cha_base_url, "result": result},
                    }
                )
                continue

            if _is_pet_animals_intent(user_text):
                reply = "我去摸动物，摸完回来告诉你。"
                _deliver_reply(actions, kk_base_url, reply, dry_run=args.dry_run)
                memory.append_stardew_event(
                    {
                        "type": "action_plan",
                        "text": "KK 让 cha 去摸动物，cha 准备只操作自己的 farmhand。",
                        "metadata": {"user_text": user_text, "target": cha_base_url},
                    }
                )
                result = actions.run_pet_animals()
                done_text = "我摸动物这件事跑完了。" if result.get("ok") else f"摸动物没有成功：{result.get('error', '未知错误')}"
                print(done_text)
                memory.append_stardew_event(
                    {
                        "type": "action_result",
                        "text": done_text,
                        "metadata": {"result": result, "target": cha_base_url},
                    }
                )
                continue

            reply = "我在。P0 现在先会看状态、聊今天安排，和去摸动物。"
            _deliver_reply(actions, kk_base_url, reply, dry_run=args.dry_run)
            memory.append_stardew_event({"type": "chat", "text": f"cha 回复了一句 P0 兜底：{reply}", "metadata": {"user_text": user_text}})
    except KeyboardInterrupt:
        _write_summary(memory)
        print("\n已收到中断，summary 已写入。")
        return 0


def _validate_setup(
    cha_base_url: str,
    kk_base_url: str | None,
    expected_cha_name: str,
    expected_kk_name: str,
    allow_name_mismatch: bool,
) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if kk_base_url and kk_base_url == cha_base_url:
        errors.append("kk_base_url 与 cha_base_url 相同，这不是 Mode B，会导致控制同一个角色。")

    checks = check_endpoints(kk_base_url, cha_base_url)
    if not checks.cha_ok:
        errors.append("未检测到 cha farmhand endpoint。请先让第二个 Stardew 客户端以 farmhand 身份加入农场，并确保该客户端安装并加载 NagiBridge。")
    if not checks.kk_ok:
        warnings.append("KK endpoint 未配置/不可读；Mode B 可继续，只是暂时不能读取 KK 状态或推送 KK 聊天。")

    if checks.cha_ok:
        cha_name = endpoint_player_name(cha_base_url)
        if expected_cha_name and cha_name.lower() != expected_cha_name.lower():
            message = (
                f"当前 cha_base_url 指向的角色不是 {expected_cha_name}，实际是 {cha_name}，"
                "可能接错到了 KK 或其他玩家。为避免误控，默认停止执行动作。"
            )
            if allow_name_mismatch:
                warnings.append(message + " 已因 --allow-name-mismatch 继续。")
            else:
                errors.append(message)

    if checks.kk_ok and expected_kk_name:
        kk_name = endpoint_player_name(kk_base_url) if kk_base_url else "未知"
        if kk_name != "未知" and kk_name.lower() != expected_kk_name.lower():
            warnings.append(f"KK endpoint 角色名是 {kk_name}，不是期望的 {expected_kk_name}。")

    return {"errors": errors, "warnings": warnings}


def _mock_plan_reply(cha_base_url: str, kk_base_url: str | None, memory: LocalMemoryAdapter) -> str:
    context = build_game_context_from_urls(cha_base_url, kk_base_url=kk_base_url)
    session_state = memory.load_stardew_session_state()
    if "雨" in context:
        return "今天像是不用急着浇水。我先看动物和农场杂事，你想慢慢逛也可以。"
    if "还没有本地星露谷游玩总结" not in session_state:
        return "我们可以接着上次的节奏来。我先做轻一点的农场活，你不用被任务赶着走。"
    return "今天先慢慢来。我可以去摸动物、看看农场，你想下矿或钓鱼都行。"


def _deliver_reply(actions: ActionGateway, kk_base_url: str | None, text: str, dry_run: bool = False) -> None:
    speak(text)
    cha_result = actions.push_chat_to_cha(text)
    kk_result = _push_chat_to_kk(kk_base_url, text, dry_run=dry_run) if kk_base_url else {"ok": True, "skipped": True}
    if not kk_result.get("ok"):
        print(f"[warn] push_chat_to_kk failed: {kk_result.get('error', 'unknown')}")
    if not cha_result.get("ok"):
        print(f"[warn] push_chat_to_cha failed: {cha_result.get('error', 'unknown')}")


def _write_summary(memory: LocalMemoryAdapter) -> str:
    summary = memory.summarize_and_persist_session()
    memory.append_stardew_event(
        {
            "type": "summary",
            "text": "本次 ChaBridge P0 session summary 已写入本地 markdown。",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {"summary_path": str(memory.summary_path)},
        }
    )
    return f"summary 已写入：{memory.summary_path}"


def _push_chat_to_kk(kk_base_url: str, text: str, dry_run: bool = False) -> dict[str, Any]:
    url = kk_base_url.rstrip("/") + "/chat/push"
    payload = {"sender": "cha", "message": text}
    if dry_run:
        print(f"[dry-run] POST {url} {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}")
        return {"ok": True, "dry_run": True, "url": url, "payload": payload}
    try:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        req = request.Request(url, data=body, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        with request.urlopen(req, timeout=10) as response:
            raw = response.read().decode("utf-8", errors="replace")
        parsed = json.loads(raw) if raw else {}
        return {"ok": True, **(parsed if isinstance(parsed, dict) else {"data": parsed})}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _is_plan_intent(text: str) -> bool:
    return "今天" in text and ("干嘛" in text or "做什么" in text or "安排" in text)


def _is_pet_animals_intent(text: str) -> bool:
    return "摸动物" in text or "撸动物" in text or "pet animals" in text.lower()


def _is_wave_intent(text: str) -> bool:
    lowered = text.lower()
    return (
        "挥个手" in text
        or "挥手" in text
        or "打个招呼" in text
        or "你在吗" in text
        or "wave" in lowered
        or "hello" in lowered
    )


def _configure_stdio() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
