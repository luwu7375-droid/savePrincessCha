# Voice Input Button 双重绑定修复

**修复日期**: 2026-07-01
**问题**: voiceInputBtn 存在双重绑定，导致冲突

---

## 修复内容

### 1. 移除 voice.js 中的语音识别绑定

**文件**: `modules/voice.js`

**修改**:
- 删除了 `Voice Input State` 相关变量 (recognition, isRecording, recognitionSupported)
- 简化了 `initVoice()` 函数，只保留 TTS 初始化
- 删除了 `toggleVoiceInput()` 和 `updateVoiceInputButton()` 函数
- 删除了 `voiceInputBtn` 的事件监听器绑定

**职责划分**:
- `voice.js` 现在只负责 **TTS/朗读** 功能
- 不再处理 `voiceInputBtn` 的语音识别功能

### 2. 保留 app.js 中的语音输入入口

**文件**: `app.js` (行 9478-9490)

**保留原因**:
- `app.js` 中的 `voiceInputBtn` 点击事件调用 `SPVoiceMessage.showVoiceInputDialog()`
- 这是语音输入的**唯一入口**
- 提供完整的语音识别对话框，包括录音、编辑和发送功能

### 3. 改进 SpeechRecognition 错误处理

**文件**: `modules/voice-message.js` (行 535-556)

**修改**:
- 将 `aborted` 错误识别为"录音已取消或被中断"
- 重构错误处理逻辑，使用 `errorMessages` 对象映射
- 所有错误消息都使用友好的中文提示，不再有裸 toast

**错误类型映射**:
```javascript
const errorMessages = {
  'not-allowed': '需要麦克风权限，请在设置中允许',
  'no-speech': '未检测到语音，请再试一次',
  'network': '网络错误，请直接输入文字发送',
  'aborted': '录音已取消或被中断',
  'audio-capture': '无法访问麦克风，请检查设备设置',
  'service-not-allowed': '语音服务不可用，请直接输入文字发送'
};
```

### 4. 数据库迁移 - 语音消息字段状态

**已存在的迁移**:
- `supabase/migrations/20260629120000_add_voice_message_fields.sql` ✅ 已应用

**字段**:
- `audio_url` (text): 语音文件的 URL
- `audio_duration` (integer): 语音时长（秒）
- `audio_type` (text): 语音类型 ('real' 或 'fake')
- `audio_transcribed_text` (text): 语音转录文本

**约束**:
- `audio_type` 只能是 'real' (录音) 或 'fake' (TTS)

**索引**:
- `idx_messages_audio_url`: 优化语音消息查询
- `idx_messages_audio_type`: 优化按类型筛选

**文件更新**:
- `sql/messages.sql`: 已更新，包含语音消息字段的 `ALTER TABLE` 语句

---

## 迁移状态

✅ **本地数据库**: 迁移已应用（通过 `supabase db reset` 时自动应用）
⚠️ **生产环境**: 需要确认是否已应用 `20260629120000_add_voice_message_fields.sql`

### 生产环境迁移
如果生产环境尚未应用，在 Supabase Dashboard 中执行：
```sql
-- 来自 supabase/migrations/20260629120000_add_voice_message_fields.sql
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration integer,
  ADD COLUMN IF NOT EXISTS audio_type text CHECK (audio_type IN ('real', 'fake')),
  ADD COLUMN IF NOT EXISTS audio_transcribed_text text;

CREATE INDEX IF NOT EXISTS idx_messages_audio_url ON public.messages(audio_url) WHERE audio_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_audio_type ON public.messages(audio_type) WHERE audio_type IS NOT NULL;
```

---

## 测试检查项

- [ ] 点击输入框麦克风按钮，确认只打开 `SPVoiceMessage.showVoiceInputDialog()`
- [ ] 录音功能正常，能够识别语音
- [ ] 录音中断时显示"录音已取消或被中断"
- [ ] 所有错误都显示友好的中文提示
- [ ] Cha 的语音消息能够正常保存到数据库
- [ ] TTS/朗读功能不受影响

---

## 架构总结

```
┌─────────────────────────────────────────┐
│           voiceInputBtn 点击             │
└────────────────┬────────────────────────┘
                 │
                 v
         app.js (唯一入口)
                 │
                 v
   SPVoiceMessage.showVoiceInputDialog()
                 │
                 ├─> 录音识别
                 ├─> 文本编辑
                 └─> 发送语音消息
                       │
                       v
              保存到数据库 (含 audio_* 字段)

┌─────────────────────────────────────────┐
│        SPVoice (TTS/朗读模块)            │
├─────────────────────────────────────────┤
│  - initVoice(): 初始化 TTS               │
│  - speakText(): 朗读文本                 │
│  - createSpeakerButton(): 创建朗读按钮    │
│  - 不处理 voiceInputBtn                  │
└─────────────────────────────────────────┘
```
