"""Safety-gated actions for ChaBridge P0."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any
from urllib import parse, request


class SafetyError(RuntimeError):
    """Raised when an action would violate the host/farmhand boundary."""


class ActionGateway:
    """Only sends control actions to cha_base_url."""

    CONTROL_ENDPOINTS = {
        "/move",
        "/tool",
        "/use",
        "/interact",
        "/queue",
        "/sleep",
        "/sell",
        "/give",
        "/money",
        "/heal",
        "/warp",
        "/emote",
        "/select",
    }
    BANNED_ENDPOINTS = {"/sell", "/sleep", "/give", "/money", "/heal", "/warp"}

    def __init__(
        self,
        cha_base_url: str = "http://localhost:7843",
        dry_run: bool = False,
        nagi_scripts_dir: str | Path | None = None,
        cha_port: int | None = None,
    ) -> None:
        if cha_port is not None:
            cha_base_url = f"http://localhost:{cha_port}"
        self.cha_base_url = cha_base_url.rstrip("/")
        self.dry_run = dry_run
        self.nagi_scripts_dir = self._resolve_nagi_scripts_dir(nagi_scripts_dir)

    def push_chat_to_cha(self, text: str) -> dict[str, Any]:
        return self._post("/chat/push", {"sender": "cha", "message": text})

    def emote(self, id: int | str) -> dict[str, Any]:
        return self._post("/emote", {"id": id})

    def wave(self) -> dict[str, Any]:
        return self.emote(16)

    def run_pet_animals(self) -> dict[str, Any]:
        script_path = self.nagi_scripts_dir / "pet_animals.py"
        port = self._local_port_for_scripts()
        if port is None:
            return {
                "ok": False,
                "error": "pet_animals.py P0 只支持本机 localhost endpoint；请在 cha farmhand 所在机器运行 ChaBridge。",
            }
        cmd = [sys.executable, str(script_path), "--port", str(port)]
        if self.dry_run:
            print("[dry-run] run script:", " ".join(cmd))
            return {"ok": True, "dry_run": True, "command": cmd, "cha_base_url": self.cha_base_url}
        if not script_path.exists():
            return {"ok": False, "error": f"找不到 pet_animals.py：{script_path}"}
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "NAGI_URL": self.cha_base_url}
        result = subprocess.run(cmd, cwd=str(self.nagi_scripts_dir), env=env, capture_output=True, text=True, timeout=300)
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-2000:],
        }

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._assert_safe_post(endpoint)
        url = f"{self.cha_base_url}{endpoint}"
        if self.dry_run:
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

    def _assert_safe_post(self, endpoint: str) -> None:
        if endpoint in self.BANNED_ENDPOINTS:
            raise SafetyError(f"禁止的动作端点：{endpoint}")
        if endpoint not in {"/chat/push", "/emote", "/interact", "/select", "/tool", "/use", "/move"}:
            raise SafetyError(f"未在 P0 白名单中的动作端点：{endpoint}")

    def _resolve_nagi_scripts_dir(self, configured: str | Path | None) -> Path:
        if configured:
            return Path(configured).expanduser().resolve()
        env_dir = os.environ.get("NAGI_SCRIPTS_DIR")
        if env_dir:
            return Path(env_dir).expanduser().resolve()
        here = Path(__file__).resolve()
        candidates = [
            here.parents[1],
            here.parents[2] / "NagiBridge" / "scripts",
            Path(os.environ.get("TEMP", "")) / "NagiBridge" / "scripts",
            Path.home() / "source" / "NagiBridge" / "scripts",
        ]
        for candidate in candidates:
            if (candidate / "pet_animals.py").exists():
                return candidate.resolve()
        return candidates[0].resolve()

    def _local_port_for_scripts(self) -> int | None:
        parsed = parse.urlparse(self.cha_base_url)
        host = (parsed.hostname or "").lower()
        if host not in {"localhost", "127.0.0.1", "::1"}:
            return None
        if parsed.port:
            return parsed.port
        if parsed.scheme == "http":
            return 80
        if parsed.scheme == "https":
            return 443
        return None
