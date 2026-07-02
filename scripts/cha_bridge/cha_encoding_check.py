"""UTF-8 self-check for ChaBridge local memory files."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

try:
    from .cha_memory_adapter import LocalMemoryAdapter
except ImportError:
    from cha_memory_adapter import LocalMemoryAdapter


TEST_EVENT_TEXT = "ChaBridge P0 启动：小cha和KK一起玩星露谷。"
TEST_SUMMARY_TEXT = "# 编码自检\n\n- 小cha记得：今天和KK一起测试中文。"


def main() -> int:
    _configure_stdout()
    with tempfile.TemporaryDirectory(prefix="chabridge-encoding-") as tmp:
        adapter = LocalMemoryAdapter(data_dir=tmp)
        adapter.append_stardew_event(
            {
                "type": "encoding_check",
                "text": TEST_EVENT_TEXT,
                "metadata": {"purpose": "utf-8 self-check"},
            }
        )
        adapter.summarize_and_persist_session(TEST_SUMMARY_TEXT)

        events_text = adapter.events_path.read_text(encoding="utf-8")
        summary_text = adapter.summary_path.read_text(encoding="utf-8")

        if TEST_EVENT_TEXT not in events_text:
            print("[encoding-check] FAIL: JSONL UTF-8 readback did not match.")
            print(f"events_path={adapter.events_path}")
            return 1
        if TEST_SUMMARY_TEXT not in summary_text:
            print("[encoding-check] FAIL: markdown UTF-8 readback did not match.")
            print(f"summary_path={adapter.summary_path}")
            return 1

    print("[encoding-check] OK: UTF-8 JSONL and markdown readback matched.")
    print(f"[encoding-check] sample event: {TEST_EVENT_TEXT}")
    return 0


def _configure_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())

