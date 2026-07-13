# 模型配置问题诊断与修复指南

## 问题描述

对话模型、日记模型、联网工具模型都用不了了。

## 问题根源

这个项目使用**前端 localStorage 配置系统**来管理模型，而不是后端环境变量。配置存储在：
- `custom_providers` - 通道（API 端点、密钥、可用模型）
- `spc_model_role_mapping_v1` - 模型角色映射（哪个角色用哪个通道的哪个模型）

如果这些配置丢失或损坏，所有模型功能都会失效。

## 三个关键模型角色

根据 `app.js` 中的定义：

```javascript
const MODEL_ROLES = {
  chat: { label: "对话模型", description: "主聊天回复" },
  diary: { label: "日记模型", description: "自动写日记、手动生成日记" },
  webReader: { label: "联网工具读取模型", description: "读取网页、搜索结果总结" },
  utility: { label: "脏活/后台任务模型", description: "摘要、分类、标签提取等低成本任务" },
  imageGeneration: { label: "图片生成模型", description: "Cha 生成图片时使用" }
};
```

## 诊断步骤

### 1. 检查浏览器 localStorage 配置

打开应用 (https://saveprincesscha.pages.dev)，按 F12 打开开发者工具，在 Console 中运行：

```javascript
// 查看通道配置
console.log('通道配置:', JSON.parse(localStorage.getItem('custom_providers') || '{}'));

// 查看模型角色映射
console.log('角色映射:', JSON.parse(localStorage.getItem('spc_model_role_mapping_v1') || '{}'));

// 检查是否为空对象
const providers = JSON.parse(localStorage.getItem('custom_providers') || '{}');
const mapping = JSON.parse(localStorage.getItem('spc_model_role_mapping_v1') || '{}');

if (Object.keys(providers).length === 0) {
  console.error('❌ 通道配置为空！需要重新配置');
}

if (!mapping.chat || !mapping.diary || !mapping.webReader) {
  console.error('❌ 缺少必要的模型角色映射！');
  console.log('缺少的角色:', {
    chat: !mapping.chat,
    diary: !mapping.diary,
    webReader: !mapping.webReader
  });
}
```

### 2. 检查后端环境变量（用于 fallback）

虽然主要使用前端配置，但后端 Edge Functions 仍然支持环境变量作为 fallback：

```bash
cd /Users/weidian/savePrincessCha
supabase secrets list | grep "MODEL_\|FIFTYFIVE_\|FUKA_"
```

## 修复步骤

### 方案 1：通过前端设置界面重新配置（推荐）

1. **打开设置页面**
   - 访问应用 → 点击右上角设置图标
   - 进入 "API 设置" 子页面

2. **添加通道**
   - 点击 "通道管理" 下的 **+ 添加通道** 按钮
   - 填写以下信息：
     * **通道名称**：例如 "我的 OpenAI" 或 "Fuka 通道"
     * **API 端点**：
       - OpenAI: `https://api.openai.com/v1`
       - 55api: `https://api.55api.com/v1`（或你的实际端点）
       - Fuka: `https://api.fuka.win/v1`
     * **API Key**：粘贴你的 API 密钥
   - 点击 **获取模型** 按钮，自动获取可用模型列表
   - 点击 **保存**

3. **配置模型角色映射**

   在 "用途模型" 部分，为每个角色选择：

   | 角色 | 建议配置 |
   |------|----------|
   | **对话模型** | 选择性能较好的模型（如 GPT-4、Claude-3.5-Sonnet） |
   | **日记模型** | 可以使用中等性能模型（如 GPT-3.5-turbo、Gemini-1.5-flash） |
   | **联网工具读取模型** | 使用快速且便宜的模型（如 GPT-3.5-turbo） |
   | **脏活/后台任务模型** | 使用最便宜的模型 |
   | **图片生成模型** | 配置 DALL-E 或其他图片生成 API |

4. **保存并测试**
   - 点击 **保存设置** 按钮
   - 点击 **测试当前配置** 按钮，验证每个模型是否能正常连接
   - 对于单个角色，可以点击其右侧的 **单独测试** 按钮

### 方案 2：通过 Console 手动配置（快速修复）

如果设置界面有问题，可以直接在浏览器 Console 中运行以下代码：

```javascript
// 示例：添加一个 OpenAI 通道
const customProviders = {
  'openai': {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'sk-YOUR_API_KEY_HERE',  // 替换为你的实际 API Key
    models: ['gpt-4', 'gpt-3.5-turbo'],
    description: '自定义配置'
  }
};
localStorage.setItem('custom_providers', JSON.stringify(customProviders));

// 配置模型角色映射
const modelRoleMapping = {
  chat: {
    providerGroup: 'openai',
    model: 'gpt-4'
  },
  diary: {
    providerGroup: 'openai',
    model: 'gpt-3.5-turbo'
  },
  webReader: {
    providerGroup: 'openai',
    model: 'gpt-3.5-turbo'
  },
  updatedAt: new Date().toISOString()
};
localStorage.setItem('spc_model_role_mapping_v1', JSON.stringify(modelRoleMapping));

console.log('✅ 配置已保存，请刷新页面');
```

### 方案 3：检查后端 Edge Functions 配置

如果前端配置正确但仍然不工作，检查后端是否正确读取了前端配置：

1. **Chat Function** (`supabase/functions/chat/index.ts`)
   - 支持 `customModel` 参数
   - 前端应该传递：`{ customModel: { providerGroup, model, endpoint, apiKey } }`

2. **Diary Function** (`supabase/functions/diary/index.ts`)
   - 支持 `customModel` 参数
   - 使用方式相同

3. **Web Function** (`supabase/functions/web/index.ts`)
   - 目前使用环境变量：`FIFTYFIVE_API_KEY_GPT`, `MODEL_GENERAL_PRIMARY`
   - **需要修改以支持前端配置**

## 前端调用逻辑说明

### 图片生成示例（app.js:1354-1400）

```javascript
const modelMapping = getModelRoleMapping();
const imageGenConfig = modelMapping?.imageGeneration;

// 检查配置
if (!imageGenConfig?.providerGroup || !imageGenConfig?.model) {
  return { success: false, error: '请先配置图片生成模型' };
}

// 获取通道配置
const customProviders = JSON.parse(localStorage.getItem('custom_providers') || '{}');
const provider = customProviders[imageGenConfig.providerGroup];

// 调用 Edge Function
await fetch(`${supabaseUrl}/functions/v1/image-generation`, {
  method: "POST",
  headers: { ... },
  body: JSON.stringify({
    provider_config: {
      endpoint: provider.endpoint,
      api_key: provider.apiKey,
      model: imageGenConfig.model
    },
    ...
  })
});
```

**Chat 和 Diary 应该使用相同的模式！**

## 验证修复

### 1. 测试对话模型
- 在聊天界面发送一条消息
- 如果失败，打开 Console 查看错误信息

### 2. 测试日记模型
- 尝试生成一条日记
- 检查是否能成功调用模型

### 3. 测试联网工具
- 尝试使用联网功能读取一个网页
- 检查摘要是否正常生成

## 常见错误及解决

### 错误 1: "请先在设置中配置XXX模型"
- **原因**：`spc_model_role_mapping_v1` 中缺少对应角色的配置
- **解决**：按照上述步骤重新配置模型角色映射

### 错误 2: "通道配置不存在"
- **原因**：`custom_providers` 为空或不包含映射中引用的通道
- **解决**：添加通道配置

### 错误 3: "获取模型列表失败"
- **原因**：API 端点或密钥错误，或网络问题
- **解决**：
  1. 检查 API 端点格式（需要完整的 URL，如 `https://api.openai.com/v1`）
  2. 验证 API Key 是否正确且有效
  3. 检查网络连接

### 错误 4: 模型调用失败（HTTP 401/403）
- **原因**：API Key 无效或权限不足
- **解决**：更新有效的 API Key

### 错误 5: 模型调用超时
- **原因**：网络不稳定或模型响应慢
- **解决**：检查网络，或在 model-client.ts 中调整超时设置

## 代码修改建议（如需修改后端）

如果需要让 Web Function 也支持前端自定义配置，参考 Chat 和 Diary 的实现：

```typescript
// supabase/functions/web/index.ts
type CustomModelConfig = {
  providerGroup: string;
  model: string;
  endpoint: string;
  apiKey: string;
};

// 在 summarizeUrl 函数中接受 customModel 参数
async function summarizeUrl(
  readResult: ReadResult,
  question: string | null,
  customModel?: CustomModelConfig
): Promise<string> {
  // 优先使用 customModel，否则回退到环境变量
  const baseUrl = customModel?.endpoint ||
    Deno.env.get("FIFTYFIVE_BASE_URL") ||
    Deno.env.get("OPENROUTER_BASE_URL") || "";
  const apiKey = customModel?.apiKey ||
    Deno.env.get("FIFTYFIVE_API_KEY_GPT") ||
    Deno.env.get("FIFTYFIVE_API_KEY") || "";
  const model = customModel?.model ||
    Deno.env.get("MODEL_GENERAL_PRIMARY") || "";

  // ... rest of the function
}
```

## 需要进一步帮助？

如果以上步骤都无法解决问题，请提供以下信息：

1. Console 中 `custom_providers` 和 `spc_model_role_mapping_v1` 的内容
2. 测试配置时的错误信息（包括 HTTP 状态码和响应内容）
3. 浏览器 Network 面板中失败请求的详细信息
