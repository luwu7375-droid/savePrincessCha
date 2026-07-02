"""Dual-player context reader for ChaBridge P0."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib import parse, request
import json


READ_TIMEOUT_SEC = 3


@dataclass
class PortCheck:
    host_ok: bool
    cha_ok: bool
    host_message: str
    cha_message: str


def check_ports(host_port: int = 7842, cha_port: int = 7843) -> PortCheck:
    host_status = _get_json(host_port, "/status")
    cha_status = _get_json(cha_port, "/status")
    host_ok = host_status.get("ok") is True
    cha_ok = cha_status.get("ok") is True
    return PortCheck(
        host_ok=host_ok,
        cha_ok=cha_ok,
        host_message="host 可用。" if host_ok else f"host 不可用：{host_status.get('error', '无法连接 7842')}",
        cha_message=(
            "farmhand 可用。"
            if cha_ok
            else f"farmhand 不可用：{cha_status.get('error', '需要启动联机 farmhand 并安装 NagiBridge')}"
        ),
    )


def fetch_host_context(host_port: int = 7842) -> dict[str, Any]:
    return {
        "status": _get_json(host_port, "/status"),
        "state": _get_json(host_port, "/state"),
        "alerts": _get_json(host_port, "/alerts", {"peek": "true"}),
    }


def fetch_cha_context(cha_port: int = 7843) -> dict[str, Any]:
    return {
        "status": _get_json(cha_port, "/status"),
        "state": _get_json(cha_port, "/state"),
        "surroundings": _get_json(cha_port, "/surroundings", {"radius": "8"}),
        "alerts": _get_json(cha_port, "/alerts", {"peek": "true"}),
        "menu": _get_json(cha_port, "/menu"),
    }


def build_game_context(host_port: int = 7842, cha_port: int = 7843) -> str:
    checks = check_ports(host_port, cha_port)
    host = fetch_host_context(host_port)
    cha = fetch_cha_context(cha_port)

    host_state = host.get("state") or {}
    cha_state = cha.get("state") or {}
    host_player = _player(host_state)
    cha_player = _player(cha_state)
    world = _world(cha_state) or _world(host_state)

    risks = []
    if not checks.host_ok:
        risks.append(checks.host_message)
    if not checks.cha_ok:
        risks.append("需要启动联机 farmhand 并安装 NagiBridge。")
    if _safe_get(cha_state, "player", "stamina") not in ("未知", None):
        try:
            if float(_safe_get(cha_state, "player", "stamina")) < 20:
                risks.append("cha 体力偏低，避免长任务。")
        except (TypeError, ValueError):
            pass
    if not risks:
        risks.append("host 只读；所有行动只允许发生在 cha farmhand。")

    return "\n".join(
        [
            "[KK状态]",
            f"端口：{host_port}",
            f"连接：{checks.host_message}",
            _format_player(host_player),
            "",
            "[cha状态]",
            f"端口：{cha_port}",
            f"连接：{checks.cha_message}",
            _format_player(cha_player),
            f"菜单：{_menu_status(cha.get('menu'))}",
            "",
            "[农场/世界状态]",
            f"日期：{world.get('date', '未知')}",
            f"时间：{world.get('time', '未知')}",
            f"天气：{world.get('weather', '未知')}",
            f"地点：{world.get('location', '未知')}",
            f"周围可见对象：{_surroundings_summary(cha.get('surroundings'))}",
            "",
            "[当前风险或建议]",
            "\n".join(f"- {risk}" for risk in risks),
        ]
    )


def _get_json(port: int, endpoint: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    query = "?" + parse.urlencode(params) if params else ""
    url = f"http://localhost:{port}{endpoint}{query}"
    try:
        with request.urlopen(url, timeout=READ_TIMEOUT_SEC) as response:
            body = response.read().decode("utf-8", errors="replace")
        data = json.loads(body) if body else {}
        if isinstance(data, dict):
            return {"ok": True, **data}
        return {"ok": True, "data": data}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _player(state: dict[str, Any]) -> dict[str, Any]:
    player = state.get("player") if isinstance(state, dict) else {}
    if not isinstance(player, dict):
        player = {}
    inventory = state.get("inventory") if isinstance(state, dict) else []
    if not isinstance(inventory, list):
        inventory = []
    return {
        "name": player.get("name") or "未知",
        "location": _safe_get(state, "location", "name"),
        "x": player.get("x", "未知"),
        "y": player.get("y", "未知"),
        "stamina": player.get("stamina", "未知"),
        "max_stamina": player.get("maxStamina", "未知"),
        "health": player.get("health", "未知"),
        "max_health": player.get("maxHealth", "未知"),
        "money": player.get("money", "未知"),
        "is_moving": player.get("isMoving", "未知"),
        "inventory_used": len([item for item in inventory if isinstance(item, dict) and item.get("name")]),
        "inventory_max": player.get("maxItems", "未知"),
    }


def _world(state: dict[str, Any]) -> dict[str, Any]:
    location = _safe_get(state, "location", "name")
    return {
        "date": state.get("date") or state.get("day") or "未知",
        "time": state.get("time") or state.get("timeOfDay") or "未知",
        "weather": state.get("weather") or "未知",
        "location": location,
    }


def _format_player(player: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"角色：{player.get('name', '未知')}",
            f"位置：{player.get('location', '未知')} ({player.get('x', '未知')}, {player.get('y', '未知')})",
            f"体力：{player.get('stamina', '未知')}/{player.get('max_stamina', '未知')}",
            f"生命：{player.get('health', '未知')}/{player.get('max_health', '未知')}",
            f"背包：{player.get('inventory_used', '未知')}/{player.get('inventory_max', '未知')}",
            f"移动中：{player.get('is_moving', '未知')}",
            f"金钱：{player.get('money', '未知')}",
        ]
    )


def _menu_status(menu: Any) -> str:
    if not isinstance(menu, dict) or menu.get("ok") is False:
        return "未知"
    if menu.get("open") is True:
        return str(menu.get("type") or "打开中")
    menu_type = menu.get("type")
    return "无" if menu_type in (None, "none", "") else str(menu_type)


def _surroundings_summary(data: Any) -> str:
    if not isinstance(data, dict) or data.get("ok") is False:
        return "未知"
    tiles = data.get("tiles")
    if not isinstance(tiles, list):
        return "未知"
    objects = []
    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        name = tile.get("object") or tile.get("terrain") or tile.get("npc") or tile.get("crop")
        if name:
            objects.append(str(name))
    if not objects:
        return "暂未发现特殊对象"
    return "、".join(objects[:8])


def _safe_get(obj: dict[str, Any], *keys: str) -> Any:
    cur: Any = obj
    for key in keys:
        if not isinstance(cur, dict):
            return "未知"
        cur = cur.get(key)
    return cur if cur not in (None, "") else "未知"

