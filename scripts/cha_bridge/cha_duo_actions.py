"""Safety-gated actions for ChaBridge P0."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any
from urllib import request


class SafetyError(RuntimeError):
    """Raised when an action would violate the host/farmhand boundary."""


class ActionGateway:
    """Only sends control actions to cha_port, never host_port."""

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
        host_port: int = 7842,
        cha_port: int = 7843,
        dry_run: bool = False,
        nagi_scripts_dir: str | Path | None = None,
    ) -> None:
        self.host_port = host_port
        self.cha_port = cha_port
        self.dry_run = dry_run
        self.nagi_scripts_dir = self._resolve_nagi_scripts_dir(nagi_scripts_dir)

    def push_chat_to_kk(self, text: str) -> dict[str, Any]:
        return self._post(self.host_port, "/chat/push", {"sender": "cha", "message": text}, allow_host=True)

    def push_chat_to_cha(self, text: str) -> dict[str, Any]:
        return self._post(self.cha_port, "/chat/push", {"sender": "cha", "message": text})

    def emote(self, id: int | str) -> dict[str, Any]:
        return self._post(self.cha_port, "/emote", {"id": id})

    def run_pet_animals(self) -> dict[str, Any]:
        script_path = self.nagi_scripts_dir / "pet_animals.py"
        cmd = [sys.executable, str(script_path), "--port", str(self.cha_port)]
        if self.dry_run:
            print("[dry-run] run script:", " ".join(cmd))
            return {"ok": True, "dry_run": True, "command": cmd}
        if not script_path.exists():
            return {"ok": False, "error": f"找不到 pet_animals.py：{script_path}"}
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "NAGI_URL": f"http://localhost:{self.cha_port}"}
        result = subprocess.run(cmd, cwd=str(self.nagi_scripts_dir), env=env, capture_output=True, text=True, timeout=300)
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-2000:],
        }

    def _post(self, port: int, endpoint: str, payload: dict[str, Any], allow_host: bool = False) -> dict[str, Any]:
        self._assert_safe_post(port, endpoint, allow_host=allow_host)
        url = f"http://localhost:{port}{endpoint}"
        if self.dry_run:
            print(f"[dry-run] POST {url} {json.dumps(payload, ensure_ascii=False)}")
            return {"ok": True, "dry_run": True, "url": url, "payload": payload}
        try:
            body = json.dumps(payload).encode("utf-8")
            req = request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with request.urlopen(req, timeout=10) as response:
                raw = response.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else {}
            return {"ok": True, **(parsed if isinstance(parsed, dict) else {"data": parsed})}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _assert_safe_post(self, port: int, endpoint: str, allow_host: bool = False) -> None:
        if endpoint in self.BANNED_ENDPOINTS:
            raise SafetyError(f"禁止的动作端点：{endpoint}")
        if port == self.host_port and not (allow_host and endpoint == "/chat/push"):
            if endpoint in self.CONTROL_ENDPOINTS or endpoint != "/chat/push":
                raise SafetyError(f"禁止向 host_port={self.host_port} 发送控制 POST：{endpoint}")
        if port != self.cha_port and not (allow_host and endpoint == "/chat/push" and port == self.host_port):
            raise SafetyError(f"控制动作只能发往 cha_port={self.cha_port}，实际端口：{port}")

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

