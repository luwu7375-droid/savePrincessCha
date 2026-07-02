"""Local fallback memory adapter for ChaBridge P0.

This module intentionally does not connect to Supabase. The interface is shaped
so a future SupabaseMemoryAdapter can be added without changing the companion
loop.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


DEFAULT_IDENTITY = (
    "你是小cha，也叫cha/G，不是新的AI。你和KK是长期陪伴关系。"
    "你现在作为星露谷 farmhand 和KK一起玩。你有自己的身体和任务，"
    "但不会抢KK的角色控制权。"
)


@dataclass
class StardewEvent:
    type: str
    text: str
    created_at: str
    metadata: dict[str, Any]


class LocalMemoryAdapter:
    """File-backed memory adapter for the ChaBridge MVP."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        base_dir = Path(__file__).resolve().parent
        self.data_dir = Path(data_dir) if data_dir else base_dir / "data"
        self.events_path = self.data_dir / "stardew_events.jsonl"
        self.summary_path = self.data_dir / "stardew_session_summary.md"
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def load_cha_identity(self) -> str:
        return DEFAULT_IDENTITY

    def load_relevant_memories(self, query: str, limit: int = 8) -> list[str]:
        del query
        memories: list[str] = []
        if self.summary_path.exists():
            text = self.summary_path.read_text(encoding="utf-8").strip()
            if text:
                memories.append("上次星露谷总结：\n" + text)

        for event in self._read_events()[-limit:]:
            memories.append(f"{event.get('created_at', '未知时间')}：{event.get('text', '')}")
        return memories[:limit]

    def load_stardew_session_state(self) -> str:
        if self.summary_path.exists():
            text = self.summary_path.read_text(encoding="utf-8").strip()
            if text:
                return text
        return "还没有本地星露谷游玩总结。"

    def append_stardew_event(self, event: dict[str, Any] | str) -> None:
        if isinstance(event, str):
            event_obj = StardewEvent(
                type="note",
                text=event,
                created_at=_now_iso(),
                metadata={},
            )
        else:
            event_obj = StardewEvent(
                type=str(event.get("type", "note")),
                text=str(event.get("text", "")),
                created_at=str(event.get("created_at") or _now_iso()),
                metadata=dict(event.get("metadata") or {}),
            )

        with self.events_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(event_obj), ensure_ascii=False) + "\n")

    def summarize_and_persist_session(self, summary: str | None = None) -> str:
        events = self._read_events()
        if summary is None:
            summary = self._build_summary(events)

        self.summary_path.write_text(summary, encoding="utf-8")
        return summary

    def _read_events(self) -> list[dict[str, Any]]:
        if not self.events_path.exists():
            return []
        rows: list[dict[str, Any]] = []
        for line in self.events_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                rows.append(parsed)
        return rows

    def _build_summary(self, events: list[dict[str, Any]]) -> str:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        recent = events[-12:]
        lines = [
            "# Stardew Session Summary",
            "",
            f"- 生成时间：{now}",
            f"- 本地事件数：{len(events)}",
            "",
            "## 最近发生的事",
        ]

        if not recent:
            lines.append("- 这次还没有记录到明确的星露谷事件。")
        else:
            for event in recent:
                text = str(event.get("text", "")).strip() or "未命名事件"
                created_at = str(event.get("created_at", "未知时间"))
                lines.append(f"- {created_at}：{text}")

        lines.extend(
            [
                "",
                "## 下次延续",
                "- 继续以低打扰、慢节奏的方式陪 KK 玩。",
                "- cha 只控制自己的 farmhand，不控制 KK 的 host 角色。",
                "",
            ]
        )
        return "\n".join(lines)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

