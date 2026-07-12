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


@dataclass
class EndpointCheck:
    kk_ok: bool
    cha_ok: bool
    kk_message: str
    cha_message: str


def check_ports(host_port: int = 7842, cha_port: int = 7843) -> PortCheck:
    host_status = _get_json(_url_from_port(host_port), "/status")
    cha_status = _get_json(_url_from_port(cha_port), "/status")
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


def check_endpoints(kk_base_url: str | None, cha_base_url: str) -> EndpointCheck:
    kk_status = _get_json(kk_base_url, "/status") if kk_base_url else {"ok": False, "error": "未配置"}
    cha_status = _get_json(cha_base_url, "/status")
    kk_ok = kk_status.get("ok") is True
    cha_ok = cha_status.get("ok") is True
    return EndpointCheck(
        kk_ok=kk_ok,
        cha_ok=cha_ok,
        kk_message="KK endpoint 可用。" if kk_ok else f"KK endpoint 不可读：{kk_status.get('error', '未配置/不可读')}",
        cha_message=(
            "cha farmhand endpoint 可用。"
            if cha_ok
            else f"cha farmhand endpoint 不可用：{cha_status.get('error', '未检测到 cha farmhand endpoint')}"
        ),
    )


def fetch_kk_context(kk_base_url: str | None) -> dict[str, Any]:
    if not kk_base_url:
        return {
            "status": {"ok": False, "error": "未配置"},
            "state": {"ok": False, "error": "未配置/不可读"},
            "alerts": {"ok": False, "error": "未配置/不可读"},
        }
    return {
        "status": _get_json(kk_base_url, "/status"),
        "state": _get_json(kk_base_url, "/state"),
        "alerts": _get_json(kk_base_url, "/alerts", {"peek": "true"}),
    }


def fetch_host_context(host_port: int = 7842) -> dict[str, Any]:
    return fetch_kk_context(_url_from_port(host_port))


def fetch_cha_context_by_url(cha_base_url: str) -> dict[str, Any]:
    status = _get_json(cha_base_url, "/status")
    if status.get("ok") is not True:
        return {
            "status": status,
            "state": {"ok": False, "error": status.get("error", "cha farmhand 不可用")},
            "surroundings": {"ok": False, "error": "cha farmhand 未连接，暂不可读"},
            "alerts": {"ok": False, "error": status.get("error", "cha farmhand 不可用")},
            "menu": {"ok": False, "error": status.get("error", "cha farmhand 不可用")},
        }
    return {
        "status": status,
        "state": _get_json(cha_base_url, "/state"),
        "surroundings": _get_json(cha_base_url, "/surroundings", {"radius": "8"}),
        "alerts": _get_json(cha_base_url, "/alerts", {"peek": "true"}),
        "menu": _get_json(cha_base_url, "/menu"),
    }


def fetch_cha_context(cha_port: int = 7843) -> dict[str, Any]:
    return fetch_cha_context_by_url(_url_from_port(cha_port))


def build_game_context(host_port: int = 7842, cha_port: int = 7843) -> str:
    return build_game_context_from_urls(_url_from_port(cha_port), kk_base_url=_url_from_port(host_port))


def build_game_context_from_urls(cha_base_url: str, kk_base_url: str | None = None) -> str:
    checks = check_endpoints(kk_base_url, cha_base_url)
    kk = fetch_kk_context(kk_base_url)
    cha = fetch_cha_context_by_url(cha_base_url)

    kk_state = kk.get("state") or {}
    cha_state = cha.get("state") or {}
    kk_player = _player(kk_state)
    cha_player = _player(cha_state)
    world = _world(cha_state)

    risks = []
    if not checks.cha_ok:
        risks.append("未检测到 cha farmhand endpoint，不能执行动作。")
    if not checks.kk_ok:
        risks.append("KK endpoint 未配置/不可读；这不影响 cha 自己行动。")
    if kk_base_url and _same_endpoint(kk_base_url, cha_base_url):
        risks.append("kk_base_url 与 cha_base_url 相同，这不是 Mode B，会导致控制同一个角色。")
    if checks.kk_ok and checks.cha_ok:
        kk_name = _player(kk_state).get("name")
        cha_name = _player(cha_state).get("name")
        if kk_name != "未知" and cha_name != "未知" and kk_name == cha_name:
            risks.append("KK endpoint 和 cha endpoint 返回同一角色名，请确认没有接到同一个客户端。")
    if not checks.cha_ok:
        risks.append("请先让第二个 Stardew 客户端以 farmhand 身份加入农场，并确保该客户端安装并加载 NagiBridge。")
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
            "[cha / farmhand 状态]",
            f"endpoint：{cha_base_url}",
            f"连接：{checks.cha_message}",
            _format_player(cha_player),
            f"菜单：{_menu_status(cha.get('menu'))}",
            f"周围可见对象：{_surroundings_summary(cha.get('surroundings'), cha_available=checks.cha_ok)}",
            "",
            "[KK / host 状态]",
            f"endpoint：{kk_base_url or '未配置'}",
            f"连接：{checks.kk_message}",
            _format_player(kk_player),
            "",
            "[共同农场状态]",
            f"日期：{world.get('date', '未知')}",
            f"时间：{world.get('time', '未知')}",
            f"天气：{world.get('weather', '未知')}",
            f"地点：{world.get('location', '未知')}",
            "",
            "[当前风险或建议]",
            "\n".join(f"- {risk}" for risk in risks),
        ]
    )


def _get_json(base_url: str | None, endpoint: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    if not base_url:
        return {"ok": False, "error": "未配置"}
    query = "?" + parse.urlencode(params) if params else ""
    url = _join_url(base_url, endpoint, query)
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
        "name": _first_present(player.get("name"), state.get("playerName"), state.get("farmerName")),
        "location": _location_name(state),
        "x": player.get("x", "未知"),
        "y": player.get("y", "未知"),
        "stamina": _first_present(player.get("stamina"), state.get("stamina")),
        "max_stamina": _first_present(player.get("maxStamina"), state.get("maxStamina")),
        "health": _first_present(player.get("health"), state.get("health")),
        "max_health": _first_present(player.get("maxHealth"), state.get("maxHealth")),
        "money": _first_present(player.get("money"), state.get("money")),
        "is_moving": _first_present(player.get("isMoving"), state.get("isMoving")),
        "inventory_used": len([item for item in inventory if isinstance(item, dict) and item.get("name")]),
        "inventory_max": _first_present(player.get("maxItems"), state.get("maxItems")),
    }


def _world(state: dict[str, Any]) -> dict[str, Any]:
    time_block = state.get("time") if isinstance(state, dict) else {}
    if not isinstance(time_block, dict):
        time_block = {}
    season = _first_present(time_block.get("season"), state.get("season"), default=None)
    day_of_month = _first_present(time_block.get("dayOfMonth"), state.get("dayOfMonth"), state.get("day"), default=None)
    year = _first_present(time_block.get("year"), state.get("year"), default=None)
    time_of_day = _first_present(time_block.get("timeOfDay"), state.get("timeOfDay"), default=None)
    date = _format_date(year=year, season=season, day_of_month=day_of_month, fallback=state.get("date") or state.get("day"))
    time_text = _format_time(time_of_day, fallback=state.get("time") if not isinstance(state.get("time"), dict) else None)
    return {
        "date": date,
        "time": time_text,
        "weather": _weather_text(state),
        "location": _location_name(state),
    }


def _best_world_state(host_state: dict[str, Any], cha_state: dict[str, Any], cha_available: bool) -> dict[str, Any]:
    host_world = _world(host_state)
    cha_world = _world(cha_state) if cha_available else {}
    if cha_world and _known_field_count(cha_world) > _known_field_count(host_world):
        return cha_world
    return host_world


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


def _surroundings_summary(data: Any, cha_available: bool = True) -> str:
    if not cha_available:
        return "farmhand 未连接，暂不可读"
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


def _first_present(*values: Any, default: Any = "未知") -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return default


def _location_name(state: dict[str, Any]) -> Any:
    location = state.get("location") if isinstance(state, dict) else None
    if isinstance(location, dict):
        return _first_present(location.get("name"), location.get("mapName"), location.get("currentLocation"))
    if isinstance(location, str) and location:
        return location
    return _first_present(state.get("currentLocation"), state.get("mapName"))


def _format_date(year: Any, season: Any, day_of_month: Any, fallback: Any = None) -> str:
    if year is not None and season is not None and day_of_month is not None:
        return f"第{year}年 {season} 第{day_of_month}天"
    if season is not None and day_of_month is not None:
        return f"{season} 第{day_of_month}天"
    return str(fallback) if fallback not in (None, "") else "未知"


def _format_time(time_of_day: Any, fallback: Any = None) -> str:
    if time_of_day not in (None, ""):
        try:
            raw = int(time_of_day)
            hour = raw // 100
            minute = raw % 100
            return f"{hour:02d}:{minute:02d}"
        except (TypeError, ValueError):
            return str(time_of_day)
    return str(fallback) if fallback not in (None, "") else "未知"


def _weather_text(state: dict[str, Any]) -> str:
    weather = state.get("weather") if isinstance(state, dict) else None
    if weather not in (None, ""):
        return str(weather)
    if state.get("isRaining") is True:
        return "雨天"
    if state.get("isSnowing") is True:
        return "雪天"
    if state.get("isSunny") is True:
        return "晴天"
    return "未知"


def _known_field_count(world: dict[str, Any]) -> int:
    return sum(1 for value in world.values() if value not in (None, "", "未知"))


def _url_from_port(port: int) -> str:
    return f"http://localhost:{port}"


def normalize_base_url(base_url: str | None) -> str | None:
    if base_url is None:
        return None
    text = base_url.strip()
    if not text or text.lower() in {"none", "null", "off", "false"}:
        return None
    return text.rstrip("/")


def endpoint_player_name(base_url: str) -> str:
    state = _get_json(base_url, "/state")
    return str(_player(state).get("name", "未知"))


def endpoint_available(base_url: str) -> bool:
    return _get_json(base_url, "/status").get("ok") is True


def endpoint_error(base_url: str) -> str:
    return str(_get_json(base_url, "/status").get("error", "未知错误"))


def _join_url(base_url: str, endpoint: str, query: str = "") -> str:
    return f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}{query}"


def _same_endpoint(a: str | None, b: str | None) -> bool:
    aa = normalize_base_url(a)
    bb = normalize_base_url(b)
    return bool(aa and bb and aa == bb)
