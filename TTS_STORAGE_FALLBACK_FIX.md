# TTS Storage Fallback 修复说明

## 问题描述
线上出现 502 错误：
```
Failed to load resource: the server responded with a status of 502
TTS error: [STORAGE_ERROR] Storage upload failed
```

问题定位：ElevenLabs 生成音频成功，但 Supabase Storage 上传失败导致整个 TTS 请求失败。

## 修复内容

### 1. 后端 Storage 失败时的 Fallback 机制
**文件**: `supabase/functions/tts/index.ts`

**修改前**: Storage 上传失败直接返回 502 错误
**修改后**: Storage 上传失败时返回 base64 data URL 作为 fallback

新的返回格式：
```typescript
{
  ok: true,
  audio_url: "data:audio/mpeg;base64,...",
  provider,
  language,
  voice_id,
  model_id,
  cached: false,
  cache_write_failed: true,
  audio_url_type: "data_fallback"
}
```

### 2. 详细的 Storage 失败日志
Storage 上传失败时会记录完整的调试信息：
```typescript
{
  request_id,
  storage_upload_status,      // HTTP 状态码
  storage_error_text,          // 错误信息前 500 字
  storagePath,                 // 存储路径
  bucket: "message-audio",     // bucket 名称
  provider,
  language,
  model_id,
  text_hash
}
```

### 3. 部署要求文档
在代码中添加了部署检查注释：
```typescript
// DEPLOYMENT REQUIREMENT:
// - Supabase bucket "message-audio" must exist
// - If using public URLs (below), bucket must be configured as public
// - If bucket is not public, use signed URLs instead of public URL path
```

### 4. 前端错误处理优化
**文件**: `modules/voice.js`

- 当后端返回 `cache_write_failed: true` 时，不缓存 audio URL（避免缓存一次性的 data URL）
- 正常播放音频，按钮不变红
- Console 输出 warning：`"TTS generated but cache upload failed; using data URL fallback"`

## 验收标准

所有短句都能正常播放：
- ✅ "好"
- ✅ "我在"
- ✅ "嗯嗯"
- ✅ "知道了"
- ✅ "没有标点的短句"

即使 Storage 失败，也能播放一次性 data URL，按钮不会变红。

## 排查 Storage 失败原因

查看 Supabase Function 日志，搜索：
- `storage_upload_status` - 查看 HTTP 状态码
- `storage_error_text` - 查看具体错误信息
- `bucket: "message-audio"` - 确认是此 bucket 的问题

常见原因：
1. Bucket "message-audio" 不存在
2. Bucket 权限配置错误（非 public 但代码使用 public URL）
3. Storage quota 超限
4. Service role key 权限不足
