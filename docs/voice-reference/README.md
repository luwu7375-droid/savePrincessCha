# Voice Reference — G 声音方向

## 声音定版

| 场景 | Voice ID 变量 | 备注 |
|------|--------------|------|
| 中文主体 / 混杂 / 默认 | `VOICE_ID_G_ZH` | G2zh |
| 纯英文 | `VOICE_ID_G_EN` | G1 |

Frederick 禁用，不作为 fallback。

## Voice Settings（第一版）

```json
{
  "stability": 0.44,
  "similarity_boost": 0.78,
  "style": 0.32,
  "use_speaker_boost": true,
  "speed": 1.0
}
```

Model: `eleven_v3`

## voice_text 规则

- `display_text`（聊天正文）保持干净，不出现表情标签
- `voice_text` 仅用于 TTS，每条最多 1–2 个标签
- 长消息只取前 2 段（`\n\n` 分隔）
- 可用标签：`[softly]` `[pause]` `[quiet laugh]` `[low voice]` `[dryly]`
- 禁用默认标签：`[whining]` `[seductive]` `[crying]` `[excited]`

## 语言检测逻辑

含任意 CJK 字符 → G2zh；纯英文文本 → G1；判断不清默认 G2zh。

## 存储

- 生成的 mp3 存入 Supabase Storage bucket `message-audio`（public read）
- URL 缓存于 `message_audio` 表，刷新后直接复用，不重复生成
- mp3 文件不进 git 仓库
