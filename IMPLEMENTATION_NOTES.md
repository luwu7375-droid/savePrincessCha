# P0 Image Auto-Generation Implementation

## Overview
Implemented automatic image generation based on user intent detection. When users send messages with specific image-related keywords, the system automatically generates images without entering the normal chat flow.

## Files Modified

### 1. New Files Created
- `modules/image-policy.js` - Intent detection, Character Bible, and prompt builder

### 2. Modified Files
- `index.html` - Added script tag to load image-policy.js module
- `app.js` - Integrated intent detection into handleSubmit() and added helper functions
- `supabase/functions/image-generation/index.ts` - Enhanced to support both legacy prompt and future tool calling paths

## Key Features

### Character Bible
Cha is defined as:
- **Gender**: Male (年轻成年男性)
- **Visual Style**: Photorealistic, natural life photo feeling (NOT illustration style)
- **Appearance**: Dark natural short hair, soft features, gentle eyes, clean temperament
- **Wardrobe**: Simple, low-saturation, comfortable daily clothes (knitwear, shirts, T-shirts, cardigans)
- **Common Scenes**: Home, kitchen, desk, by window, night, rainy day, walking
- **Atmosphere**: Life feeling, companionship, warmth, quiet, real

### Intent Detection Routes

1. **Portrait** (`must_show_face`)
   - Triggers: "我想看你", "给我你的照片", "你的脸", "你长什么样", "自拍", "头像"
   - Generates: Portrait photos showing face clearly

2. **Slice of Life** (`may_hide_face`)
   - Triggers: "你在干嘛" + visual words ("发图", "给我看看", "拍张照片")
   - Requires BOTH: status question + visual request word
   - Generates: First-person or daily life scenes

3. **Together** (`prefer_no_face`)
   - Triggers: "画我们", "我们一起", "陪我", "合照"
   - Generates: Two-person companionship scenes (user face hidden/silhouette)

4. **Mood** (`not_applicable`)
   - Triggers: "把感觉画出来", "画心情", "现在的心情像"
   - Generates: Atmospheric mood images

### Cost Control
- "你在干嘛" alone does NOT trigger (avoids false positives)
- Requires explicit visual words: "图", "照片", "看看", "拍", "给我看"

## Testing

### Browser Console Tests

```javascript
// Test intent detection
SavePrincessImagePolicy.detectImageIntent("给我画一张你的肖像")
// Expected: { should_generate: true, route: "portrait", face_policy: "must_show_face", reason: "用户明确要看 cha 外观" }

SavePrincessImagePolicy.detectImageIntent("你在干嘛，发张图看看")
// Expected: { should_generate: true, route: "slice_of_life", face_policy: "may_hide_face", reason: "用户要求看当前状态 + 视觉词触发" }

SavePrincessImagePolicy.detectImageIntent("你在干嘛")
// Expected: { should_generate: false, ... } (no visual word)

SavePrincessImagePolicy.detectImageIntent("画一张我们一起喝咖啡")
// Expected: { should_generate: true, route: "together", face_policy: "prefer_no_face", reason: "用户要求陪伴场景" }

SavePrincessImagePolicy.detectImageIntent("把今天累但被陪着的感觉画出来")
// Expected: { should_generate: true, route: "mood", face_policy: "not_applicable", reason: "用户要求情绪氛围表达" }

// Test prompt builder
SavePrincessImagePolicy.buildImagePrompt("portrait", "坐在窗边，柔和光线")
// Should include: BASE_PROMPT_FOUNDATION + CHA_DESCRIPTION + portrait instructions
```

### Integration Tests

| Test Case | User Input | Expected Behavior |
|-----------|-----------|-------------------|
| Portrait | "给我画一张你的肖像" | Auto-generate portrait, skip normal chat |
| Slice of life | "你在干嘛，发张图看看" | Auto-generate slice_of_life |
| No trigger | "你在干嘛" | Normal chat response (no visual word) |
| Together | "画个我们在咖啡厅" | Auto-generate together scene |
| Mood | "把这种累的感觉画出来" | Auto-generate mood image |
| Normal chat | "你好" | Normal text response |

### End-to-End Verification

1. Configure image generation model in Settings > API Settings > Model Role Mapping
2. Test: "给我画一张你的肖像" → Loading indicator → Portrait appears → No text response
3. Test: "你在干嘛，发张图看看" → Slice of life image appears
4. Test: "你在干嘛" → Normal text response (no image)
5. Test: "画一张我们一起做饭" → Together scene appears
6. Test: "把今天这种累但被陪着的感觉画出来" → Mood image appears
7. Verify all images show **male character** with **photography style**
8. Verify normal chat messages still work correctly

## Debug Logs

### Frontend Console
```
[image-policy] { should_generate: true, route: "portrait", face_policy: "must_show_face", reason: "..." }
[image-generation] Auto-generating: route=portrait, face_policy=must_show_face, reason=...
[image-generation] finalPrompt: photorealistic slice-of-life image, natural daily-life atmosphere...
[image-generation] params: { size: "1024x1024", quality: "standard", style: "natural" }
[image-generation] Success: https://...
```

### Backend Logs
```
[image-generation] Legacy mode: prompt provided directly
[image-generation] Generating image: { finalPrompt: "...", provider: "dall-e-3" }
[image-generation] API response: { data: [{ url: "..." }] }
[image-generation] Image generated: https://...
```

## Architecture

### P0 Flow (Current Implementation)
```
User submits message
  ↓
handleSubmit() in app.js
  ↓
detectImageIntent(userText)
  ↓
├─ should_generate = false → Normal chat streaming
└─ should_generate = true
      ↓
   buildImagePrompt(route, userText)
      ↓
   callImageGenerationDirect() → image-generation function
      ↓
   reloadHistory() → Image bubble displayed
      ↓
   No normal chat streaming
```

### Key Design Decisions

1. **Frontend Intent Detection**: Avoids backend changes, faster iteration
2. **Direct Image Call**: Bypasses streaming to avoid breaking existing chat flow
3. **Visual Word Requirement**: "你在干嘛" alone doesn't trigger to control costs
4. **Photography Style**: Based on reference image, not illustration
5. **Male Character**: Cha is young adult male per reference
6. **Legacy Compatibility**: Keep existing `generateChaImage()` working
7. **No UI Controls**: No size/quality/style selectors (fixed params)

## Future Work (Not P0)

### P1: Streaming Tool Calling
- Modify `_shared/model-client.ts` to accept `extraPayload`
- Add tools parameter to `callModel()`
- Modify frontend streaming parser to handle `tool_calls`
- Implement tool execution and continuation

### P2: Reference Image Upload
- Add image-to-image or reference-guided generation
- Upload reference images to storage
- Pass reference URLs to image generation API
- Ensure consistent visual identity across all generations

## Deployment

To deploy the backend changes:
```bash
cd /Users/weidian/savePrincessCha
supabase functions deploy image-generation
```

Frontend changes are automatically picked up on page reload (no deployment needed for local dev).

## Notes

- P0 focuses on **working end-to-end flow** without streaming complexity
- All Chinese text preserved for natural UX
- Photography style enforced via prompt templates
- Reference image visual specs integrated into Character Bible
- Cost control via visual word requirement
- No breaking changes to existing chat functionality
