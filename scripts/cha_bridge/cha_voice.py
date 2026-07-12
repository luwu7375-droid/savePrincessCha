"""ChaBridge TTS adapter.

ChaBridge does not choose a new voice. It reuses the chat TTS configuration
shape from modules/voice.js (`voice_tts_config`) and calls the existing
Supabase `functions/v1/tts` endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass
import base64
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from urllib import error, request


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "data" / "chat_tts_config.json"
VOICE_CACHE_DIR = Path(__file__).resolve().parent / "data" / "voice_cache"


@dataclass
class VoiceResult:
    ok: bool
    provider: str = "chat_default"
    model: str = ""
    voice_id: str = ""
    audio_path: str | None = None
    audio_url: str | None = None
    cached: bool = False
    chars_used: int = 0
    error: str | None = None
    message_id: str | None = None


class ChaVoice:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = normalize_voice_config(config or load_voice_config())
        self.cache_dir = Path(self.config.get("cache_dir") or VOICE_CACHE_DIR)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def speak(self, text: str, *, lang: str = "zh") -> VoiceResult:
        cleaned = clean_text_for_tts(text)
        if not cleaned:
            return VoiceResult(ok=False, error="empty speakable text")

        self.config = normalize_voice_config(self.config, lang=lang)
        tts_config = self.config.get("tts_config") or {}
        provider = str(tts_config.get("provider") or self.config.get("provider") or "elevenlabs")
        profiles = tts_config.get("profiles") or {}
        profile = profiles.get(lang) or profiles.get("default") or profiles.get("en") or {}
        fallback_en = profiles.get("en") or {}
        fallback_default = profiles.get("default") or {}
        voice_id = str(profile.get("voice_id") or fallback_en.get("voice_id") or fallback_default.get("voice_id") or "")
        model_id = str(tts_config.get("model_id") or profile.get("model_id") or self.config.get("model_id") or "eleven_v3")

        if not voice_id:
            return VoiceResult(
                ok=False,
                provider=provider,
                model=model_id,
                error="未从 chat_tts_config.json 中解析到 voice_id，请从 chat 设置导出真实 voice_tts_config，而不是示例配置。",
            )

        cache_path = self._cache_path(provider, voice_id, model_id, lang, cleaned)
        if cache_path.exists():
            self._play_audio(cache_path)
            return VoiceResult(
                ok=True,
                provider=provider,
                model=model_id,
                voice_id=voice_id,
                audio_path=str(cache_path),
                audio_url=_audio_file_to_data_url(cache_path),
                cached=True,
                chars_used=len(cleaned),
            )

        endpoint = self._tts_endpoint()
        anon_key = str(self.config.get("supabase_anon_key") or os.environ.get("SUPABASE_ANON_KEY") or "")
        if not endpoint or not anon_key:
            return VoiceResult(ok=False, provider=provider, model=model_id, voice_id=voice_id, error="chat TTS endpoint or anon key is not configured")

        payload = {
            "message_id": None,
            "text": cleaned,
            "language_hint": lang,
            "provider": provider,
            "voice_profile": {
                "voice_id": voice_id,
                "model_id": model_id,
                "settings": profile.get("settings"),
            },
        }

        try:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            req = request.Request(
                endpoint,
                data=body,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "Authorization": f"Bearer {anon_key}",
                    "apikey": anon_key,
                },
                method="POST",
            )
            with request.urlopen(req, timeout=60) as response:
                raw = response.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            if not data.get("ok"):
                return VoiceResult(ok=False, provider=provider, model=model_id, voice_id=voice_id, error=str(data.get("message") or data.get("error") or data))
            audio_url = str(data.get("audio_url") or data.get("url") or "")
            if not audio_url:
                return VoiceResult(ok=False, provider=provider, model=model_id, voice_id=voice_id, error="TTS returned no audio_url")
            self._write_audio(audio_url, cache_path)
            self._play_audio(cache_path)
            return VoiceResult(ok=True, provider=provider, model=model_id, voice_id=voice_id, audio_path=str(cache_path), audio_url=audio_url, cached=False, chars_used=len(cleaned))
        except Exception as exc:
            return VoiceResult(ok=False, provider=provider, model=model_id, voice_id=voice_id, error=str(exc))

    def _tts_endpoint(self) -> str:
        explicit = self.config.get("tts_endpoint") or os.environ.get("CHABRIDGE_TTS_ENDPOINT")
        if explicit:
            return str(explicit)
        supabase_url = self.config.get("supabase_url") or os.environ.get("SUPABASE_URL")
        if supabase_url:
            return str(supabase_url).rstrip("/") + "/functions/v1/tts"
        return ""

    def _cache_path(self, provider: str, voice_id: str, model_id: str, lang: str, text: str) -> Path:
        key = "|".join([provider, voice_id, model_id, lang, text])
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
        safe_voice = re.sub(r"[^A-Za-z0-9_.-]+", "_", voice_id[:24]) or "voice"
        return self.cache_dir / f"{provider}_{safe_voice}_{digest}.mp3"

    def _write_audio(self, audio_url: str, path: Path) -> None:
        if audio_url.startswith("data:"):
            header, b64 = audio_url.split(",", 1)
            del header
            path.write_bytes(base64.b64decode(b64))
            return
        with request.urlopen(audio_url, timeout=60) as response:
            path.write_bytes(response.read())

    def _play_audio(self, path: Path) -> None:
        if os.environ.get("CHABRIDGE_VOICE_NO_PLAY") == "1":
            return
        try:
            if sys.platform.startswith("win"):
                os.startfile(str(path))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            # Playback failure should not make TTS generation fail.
            pass

    def write_voice_message(self, text: str, result: VoiceResult, *, conversation_id: str = "default") -> VoiceResult:
        if not result.ok:
            return result
        supabase_url = str(self.config.get("supabase_url") or os.environ.get("SUPABASE_URL") or "").rstrip("/")
        anon_key = str(self.config.get("supabase_anon_key") or os.environ.get("SUPABASE_ANON_KEY") or "")
        bearer = os.environ.get("CHABRIDGE_SUPABASE_ACCESS_TOKEN") or anon_key
        if not supabase_url or not anon_key:
            return VoiceResult(ok=False, provider=result.provider, model=result.model, voice_id=result.voice_id, audio_path=result.audio_path, audio_url=result.audio_url, error="Supabase URL or anon key is not configured")

        cleaned = clean_text_for_tts(text)
        message_id: str | None = None
        row: dict[str, Any] = {
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": cleaned or "[语音]",
            "type": "voice",
            "audio_type": "real",
            "audio_type_explicit": True,
            "audio_transcribed_text": cleaned,
        }
        user_id = os.environ.get("CHABRIDGE_SUPABASE_USER_ID")
        if user_id:
            row["user_id"] = user_id

        try:
            data = _insert_message_row_with_schema_fallback(supabase_url, anon_key, bearer, row)
            message_id = str(data[0].get("id")) if isinstance(data, list) and data else None
            if not message_id:
                return VoiceResult(ok=False, provider=result.provider, model=result.model, voice_id=result.voice_id, audio_path=result.audio_path, error="voice message insert returned no id")

            tts_data = self._request_tts(cleaned, lang="zh", message_id=int(message_id))
            audio_url = str(tts_data.get("audio_url") or tts_data.get("url") or "")
            if not audio_url:
                _delete_message_row(supabase_url, anon_key, bearer, message_id)
                return VoiceResult(ok=False, provider=result.provider, model=result.model, voice_id=result.voice_id, audio_path=result.audio_path, message_id=message_id, error="TTS returned no audio_url for message write")
            if not _is_public_audio_url(audio_url):
                uploaded_url = self._upload_cached_audio_with_service_role(supabase_url, message_id, result)
                if uploaded_url:
                    audio_url = uploaded_url
                else:
                    _delete_message_row(supabase_url, anon_key, bearer, message_id)
                    reason = str(tts_data.get("error_message") or "TTS endpoint returned a data URL fallback instead of a public storage URL")
                    return VoiceResult(
                        ok=False,
                        provider=result.provider,
                        model=result.model,
                        voice_id=result.voice_id,
                        audio_path=result.audio_path,
                        message_id=message_id,
                        error=(
                            "无法写入正式 voice message：TTS 没有返回可保存的 public audio_url。"
                            "请确认 Supabase storage bucket message-audio 可写，或设置 "
                            "CHABRIDGE_SUPABASE_SERVICE_ROLE_KEY 允许 ChaBridge 上传缓存音频。"
                            f" 原因：{reason}"
                        ),
                    )

            update_row = {
                "audio_url": audio_url,
                "audio_duration": estimate_audio_duration(cleaned),
                "audio_type": "real",
                "audio_type_explicit": True,
                "audio_transcribed_text": cleaned,
            }
            _update_message_row_with_schema_fallback(supabase_url, anon_key, bearer, message_id, update_row)
            result.message_id = message_id
            result.audio_url = audio_url
            return result
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            return VoiceResult(
                ok=False,
                provider=result.provider,
                model=result.model,
                voice_id=result.voice_id,
                audio_path=result.audio_path,
                audio_url=result.audio_url,
                cached=result.cached,
                chars_used=result.chars_used,
                error=f"voice message DB insert failed: HTTP {exc.code}: {detail[:500]}",
            )
        except Exception as exc:
            return VoiceResult(
                ok=False,
                provider=result.provider,
                model=result.model,
                voice_id=result.voice_id,
                audio_path=result.audio_path,
                audio_url=result.audio_url,
                cached=result.cached,
                chars_used=result.chars_used,
                error=f"voice message DB insert failed: {exc}",
            )

    def _upload_cached_audio_with_service_role(self, supabase_url: str, message_id: str, result: VoiceResult) -> str:
        service_key = os.environ.get("CHABRIDGE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key or not result.audio_path:
            return ""
        audio_path = Path(result.audio_path)
        if not audio_path.exists():
            return ""
        digest = hashlib.sha256(audio_path.read_bytes()).hexdigest()[:16]
        storage_path = f"chabridge/{message_id}-{digest}.mp3"
        req = request.Request(
            f"{supabase_url}/storage/v1/object/message-audio/{storage_path}",
            data=audio_path.read_bytes(),
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "audio/mpeg",
                "x-upsert": "true",
            },
            method="POST",
        )
        with request.urlopen(req, timeout=60):
            pass
        return f"{supabase_url}/storage/v1/object/public/message-audio/{storage_path}"

    def _request_tts(self, text: str, *, lang: str, message_id: int | None) -> dict[str, Any]:
        normalized = normalize_voice_config(self.config, lang=lang)
        tts_config = normalized.get("tts_config") or {}
        provider = str(tts_config.get("provider") or "elevenlabs")
        profiles = tts_config.get("profiles") or {}
        profile = profiles.get(lang) or profiles.get("default") or profiles.get("en") or {}
        voice_id = str(profile.get("voice_id") or "")
        model_id = str(tts_config.get("model_id") or profile.get("model_id") or "eleven_v3")
        endpoint = self._tts_endpoint()
        anon_key = str(self.config.get("supabase_anon_key") or os.environ.get("SUPABASE_ANON_KEY") or "")
        payload = {
            "message_id": message_id,
            "text": text,
            "language_hint": lang,
            "provider": provider,
            "voice_profile": {"voice_id": voice_id, "model_id": model_id, "settings": profile.get("settings")},
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8", "Authorization": f"Bearer {anon_key}", "apikey": anon_key},
            method="POST",
        )
        with request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8", errors="replace"))
        if not data.get("ok"):
            raise RuntimeError(str(data.get("message") or data.get("error") or data))
        return data


def load_voice_config(config_path: str | Path | None = None) -> dict[str, Any]:
    if os.environ.get("CHABRIDGE_TTS_CONFIG_JSON"):
        return json.loads(os.environ["CHABRIDGE_TTS_CONFIG_JSON"])

    path = Path(config_path or os.environ.get("CHABRIDGE_TTS_CONFIG_PATH") or DEFAULT_CONFIG_PATH)
    config: dict[str, Any] = {}
    if path.exists():
        config = json.loads(path.read_text(encoding="utf-8"))

    public_config = _load_public_config()
    config.setdefault("supabase_url", public_config.get("SUPABASE_URL") or os.environ.get("SUPABASE_URL", ""))
    config.setdefault("supabase_anon_key", public_config.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY", ""))

    if "tts_config" not in config and "voice_tts_config" in config:
        config["tts_config"] = config["voice_tts_config"]
    return config


def normalize_voice_config(config: dict[str, Any], *, lang: str = "zh") -> dict[str, Any]:
    normalized = dict(config or {})
    tts_config = normalized.get("tts_config") or normalized.get("voice_tts_config") or {}
    if not isinstance(tts_config, dict):
        tts_config = {}
    tts_config = dict(tts_config)

    provider = _first_text(tts_config, normalized, keys=("provider", "tts_provider", "engine", "ttsEngine")) or "elevenlabs"
    model_id = _first_text(tts_config, normalized, keys=("model_id", "modelId", "selected_model_id", "selectedModelId", "model")) or "eleven_v3"

    profiles = tts_config.get("profiles") if isinstance(tts_config.get("profiles"), dict) else {}
    profiles = {str(key): dict(value) for key, value in profiles.items() if isinstance(value, dict)}

    lang_voice_id = (
        _voice_for_lang(profiles, lang)
        or _voice_for_lang(tts_config.get("voices"), lang)
        or _voice_for_lang(normalized.get("voices"), lang)
        or _voice_for_lang(tts_config.get("languages"), lang)
        or _voice_for_lang(normalized.get("languages"), lang)
        or _voice_for_lang(tts_config.get("languageVoices"), lang)
        or _voice_for_lang(normalized.get("languageVoices"), lang)
        or _voice_for_lang(tts_config.get("language_voices"), lang)
        or _voice_for_lang(normalized.get("language_voices"), lang)
    )
    default_voice_id = (
        _voice_for_lang(profiles, "default")
        or _voice_for_lang(tts_config.get("voices"), "default")
        or _voice_for_lang(normalized.get("voices"), "default")
        or _voice_for_lang(tts_config.get("languages"), "default")
        or _voice_for_lang(normalized.get("languages"), "default")
        or _voice_for_lang(tts_config.get("languageVoices"), "default")
        or _voice_for_lang(normalized.get("languageVoices"), "default")
        or _first_text(
            tts_config,
            normalized,
            keys=("voice_id", "voiceId", "selected_voice_id", "selectedVoiceId", "voice_id_zh", "voiceIdZh"),
        )
    )
    voice_id = lang_voice_id or default_voice_id or ""

    profiles.setdefault("default", {})
    profiles.setdefault(lang, {})
    if voice_id and not profiles[lang].get("voice_id"):
        profiles[lang]["voice_id"] = voice_id
    if default_voice_id and not profiles["default"].get("voice_id"):
        profiles["default"]["voice_id"] = default_voice_id

    tts_config["provider"] = provider
    tts_config["model_id"] = model_id
    tts_config["profiles"] = profiles
    normalized["tts_config"] = tts_config
    normalized["_normalized_voice"] = {
        "provider": provider,
        "model": model_id,
        "language": lang,
        "voice_id": voice_id,
        "has_voice_id": bool(voice_id),
    }
    return normalized


def voice_config_debug(config_path: str | Path | None = None, *, lang: str = "zh") -> dict[str, Any]:
    path = Path(config_path or os.environ.get("CHABRIDGE_TTS_CONFIG_PATH") or DEFAULT_CONFIG_PATH)
    file_exists = path.exists() or bool(os.environ.get("CHABRIDGE_TTS_CONFIG_JSON"))
    raw_config = load_voice_config(path)
    normalized = normalize_voice_config(raw_config, lang=lang)
    voice = normalized.get("_normalized_voice") or {}
    missing_fields: list[str] = []
    if not file_exists:
        missing_fields.append("config_file")
    if not voice.get("provider"):
        missing_fields.append("provider")
    if not voice.get("model"):
        missing_fields.append("model")
    if not voice.get("has_voice_id"):
        missing_fields.append("voice_id")

    return {
        "config_path": str(path),
        "file_exists": file_exists,
        "provider": voice.get("provider") or "",
        "model": voice.get("model") or "",
        "language": lang,
        "normalized_voice_id_exists": bool(voice.get("has_voice_id")),
        "raw_keys": sorted(_safe_public_keys(raw_config)),
        "missing_fields": missing_fields,
    }


def _first_text(*sources: dict[str, Any], keys: tuple[str, ...]) -> str:
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in keys:
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _voice_for_lang(source: Any, lang: str) -> str:
    if not isinstance(source, dict):
        return ""
    entry = source.get(lang) or source.get(lang.lower()) or source.get(lang.upper())
    if isinstance(entry, str):
        return entry.strip()
    if isinstance(entry, dict):
        return _first_text(entry, keys=("voice_id", "voiceId", "selected_voice_id", "selectedVoiceId"))
    return ""


def _safe_public_keys(value: Any, prefix: str = "") -> set[str]:
    secret_markers = ("key", "token", "secret", "anon", "authorization", "password")
    keys: set[str] = set()
    if not isinstance(value, dict):
        return keys
    for key, child in value.items():
        key_text = str(key)
        if any(marker in key_text.lower() for marker in secret_markers):
            continue
        full = f"{prefix}.{key_text}" if prefix else key_text
        keys.add(full)
        if isinstance(child, dict):
            keys.update(_safe_public_keys(child, full))
    return keys


def _load_public_config() -> dict[str, str]:
    root = Path(__file__).resolve().parents[2]
    path = root / "public-config.js"
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8", errors="replace")
    result: dict[str, str] = {}
    for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY"):
        match = re.search(rf'{key}\s*:\s*"([^"]+)"', text)
        if match:
            result[key] = match.group(1)
    return result


def clean_text_for_tts(text: str) -> str:
    cleaned = re.sub(r"```[\s\S]*?```", "", text)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"^[#>\-*+\s]+", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.replace("**", "").replace("__", "").replace("~~", "")
    cleaned = re.sub(r"^\s*\[[^\]]*(tool|result|debug|voice skipped)[^\]]*\].*$", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def compress_for_voice(text: str, max_chars: int = 120) -> str:
    cleaned = clean_text_for_tts(text)
    if len(cleaned) <= max_chars:
        return cleaned
    parts = re.split(r"(?<=[。！？!?])\s*", cleaned)
    for part in parts:
        if 0 < len(part) <= max_chars:
            return part
    return cleaned[: max_chars - 1].rstrip() + "…"


def estimate_audio_duration(text: str, lang: str = "zh") -> int:
    chars_per_minute = 150 if lang == "zh" else 180
    return max(1, int((max(len(text), 1) / chars_per_minute) * 60 + 0.999))


def _audio_file_to_data_url(path: Path) -> str:
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return "data:audio/mpeg;base64," + data


def _is_public_audio_url(audio_url: str) -> bool:
    return audio_url.startswith("http://") or audio_url.startswith("https://")


def _insert_message_row(supabase_url: str, anon_key: str, bearer: str, row: dict[str, Any]) -> Any:
    body = json.dumps(row, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        supabase_url + "/rest/v1/messages?select=id",
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {bearer}",
            "apikey": anon_key,
            "Prefer": "return=representation",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _insert_message_row_with_schema_fallback(supabase_url: str, anon_key: str, bearer: str, row: dict[str, Any]) -> Any:
    try:
        return _insert_message_row(supabase_url, anon_key, bearer, row)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if "audio_type_explicit" not in detail:
            raise
        fallback = dict(row)
        fallback.pop("audio_type_explicit", None)
        return _insert_message_row(supabase_url, anon_key, bearer, fallback)


def _update_message_row_with_schema_fallback(supabase_url: str, anon_key: str, bearer: str, message_id: str, row: dict[str, Any]) -> None:
    try:
        _update_message_row(supabase_url, anon_key, bearer, message_id, row)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if "audio_type_explicit" not in detail:
            raise
        fallback = dict(row)
        fallback.pop("audio_type_explicit", None)
        _update_message_row(supabase_url, anon_key, bearer, message_id, fallback)


def _update_message_row(supabase_url: str, anon_key: str, bearer: str, message_id: str, row: dict[str, Any]) -> None:
    body = json.dumps(row, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        supabase_url + f"/rest/v1/messages?id=eq.{message_id}",
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {bearer}",
            "apikey": anon_key,
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    with request.urlopen(req, timeout=30):
        return


def _delete_message_row(supabase_url: str, anon_key: str, bearer: str, message_id: str) -> None:
    try:
        req = request.Request(
            supabase_url + f"/rest/v1/messages?id=eq.{message_id}",
            headers={
                "Authorization": f"Bearer {bearer}",
                "apikey": anon_key,
                "Prefer": "return=minimal",
            },
            method="DELETE",
        )
        with request.urlopen(req, timeout=30):
            return
    except Exception:
        return


def speak(text: str) -> None:
    """Backward-compatible mock-ish TTS entrypoint."""
    result = ChaVoice().speak(text)
    if not result.ok:
        print("[voice skipped] " + (result.error or "unknown"))


def listen_once() -> str:
    """Read one line of user input."""
    return input("> ")


def main() -> int:
    parser = argparse.ArgumentParser(description="ChaBridge TTS helper")
    parser.add_argument("--config-debug", action="store_true")
    parser.add_argument("--lang", default=os.environ.get("CHABRIDGE_VOICE_LANG", "zh"))
    args = parser.parse_args()
    if args.config_debug:
        print(json.dumps(voice_config_debug(lang=args.lang), ensure_ascii=False, indent=2))
        return 0

    result = ChaVoice().speak("我在，声音测试。", lang=args.lang)
    if result.ok:
        print("voice-test ok")
        print(f"provider: {result.provider}")
        print(f"model: {result.model}")
        print(f"voice_id: {result.voice_id}")
        print(f"cache_hit: {str(result.cached).lower()}")
        print(f"audio_path: {result.audio_path}")
    else:
        print(f"[voice skipped] {result.error or 'unknown'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
