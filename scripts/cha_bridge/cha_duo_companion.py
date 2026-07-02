"""ChaBridge P0 companion loop.

P0 intentionally uses fixed intent matching instead of autonomous tool calling.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import sys
from typing import Any

try:
    from .cha_duo_actions import ActionGateway
    from .cha_duo_context import build_game_context, check_ports
    from .cha_memory_adapter import LocalMemoryAdapter
    from .cha_voice import listen_once, speak
except ImportError:
    from cha_duo_actions import ActionGateway
    from cha_duo_context import build_game_context, check_ports
    from cha_memory_adapter import LocalMemoryAdapter
    from cha_voice import listen_once, speak


def main() -> int:
    _configure_stdio()
    parser = argparse.ArgumentParser(description="ChaBridge MVP companion runtime")
    parser.add_argument("--host-port", type=int, default=7842)
    parser.add_argument("--cha-port", type=int, default=7843)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mock-llm", action="store_true")
    parser.add_argument("--provider", default="mock", help="Reserved for future real LLM providers")
    args = parser.parse_args()

    memory = LocalMemoryAdapter()
    actions = ActionGateway(args.host_port, args.cha_port, dry_run=args.dry_run)

    checks = check_ports(args.host_port, args.cha_port)
    print(checks.host_message)
    print(checks.cha_message)
    if not checks.cha_ok:
        print("提示：需要启动联机 farmhand 并安装 NagiBridge。dry-run 下仍可继续测试流程。")
    if not args.mock_llm:
        print("P0 目前只支持 --mock-llm；本次将使用 mock 意图回复。")

    memory.append_stardew_event(
        {
            "type": "session_start",
            "text": "ChaBridge P0 启动，准备作为 farmhand 陪 KK 玩星露谷。",
            "metadata": {"host_port": args.host_port, "cha_port": args.cha_port, "dry_run": args.dry_run},
        }
    )

    print("ChaBridge 已启动。输入 /context、/summary、/quit，或说：今天我们干嘛 / 你去摸动物。")
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
                print(build_game_context(args.host_port, args.cha_port))
                continue
            if user_text == "/summary":
                print(_write_summary(memory))
                continue

            if _is_plan_intent(user_text):
                reply = _mock_plan_reply(args.host_port, args.cha_port, memory)
                _deliver_reply(actions, reply)
                memory.append_stardew_event(
                    {
                        "type": "chat",
                        "text": f"KK 问今天安排，cha 结合上下文回复：{reply}",
                        "metadata": {"user_text": user_text},
                    }
                )
                continue

            if _is_pet_animals_intent(user_text):
                reply = "我去摸动物，摸完回来告诉你。"
                _deliver_reply(actions, reply)
                memory.append_stardew_event(
                    {
                        "type": "action_plan",
                        "text": "KK 让 cha 去摸动物，cha 准备只操作自己的 farmhand。",
                        "metadata": {"user_text": user_text, "target_port": args.cha_port},
                    }
                )
                result = actions.run_pet_animals()
                done_text = "我摸动物这件事跑完了。" if result.get("ok") else f"摸动物没有成功：{result.get('error', '未知错误')}"
                print(done_text)
                memory.append_stardew_event(
                    {
                        "type": "action_result",
                        "text": done_text,
                        "metadata": {"result": result, "target_port": args.cha_port},
                    }
                )
                continue

            reply = "我在。P0 现在先会看状态、聊今天安排，和去摸动物。"
            _deliver_reply(actions, reply)
            memory.append_stardew_event({"type": "chat", "text": f"cha 回复了一句 P0 兜底：{reply}", "metadata": {"user_text": user_text}})
    except KeyboardInterrupt:
        _write_summary(memory)
        print("\n已收到中断，summary 已写入。")
        return 0


def _mock_plan_reply(host_port: int, cha_port: int, memory: LocalMemoryAdapter) -> str:
    context = build_game_context(host_port, cha_port)
    session_state = memory.load_stardew_session_state()
    if "雨" in context:
        return "今天像是不用急着浇水。我先看动物和农场杂事，你想慢慢逛也可以。"
    if "farmhand 不可用" in context or "需要启动联机 farmhand" in context:
        return "我现在还没进 farmhand。你先把联机角色拉进来，我就用自己的身体陪你玩。"
    if "还没有本地星露谷游玩总结" not in session_state:
        return "我们可以接着上次的节奏来。我先做轻一点的农场活，你不用被任务赶着走。"
    return "今天先慢慢来。我可以去摸动物、看看农场，你想下矿或钓鱼都行。"


def _deliver_reply(actions: ActionGateway, text: str) -> None:
    speak(text)
    kk_result = actions.push_chat_to_kk(text)
    cha_result = actions.push_chat_to_cha(text)
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


def _is_plan_intent(text: str) -> bool:
    return "今天" in text and ("干嘛" in text or "做什么" in text or "安排" in text)


def _is_pet_animals_intent(text: str) -> bool:
    return "摸动物" in text or "撸动物" in text or "pet animals" in text.lower()


def _configure_stdio() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
