/**
 * ============================================================
 *  🤖 AI 模型配置中心
 * ============================================================
 *
 *  本文件集中管理所有 AI 模型的预设配置。
 *  你可以在这里：
 *    1. 添加/删除预设模型
 *    2. 修改默认选用的模型
 *    3. 自定义 API 地址和参数
 *
 *  项目中使用 AI 模型的位置总览：
 *  ┌───────────────────┬─────────────────────────────┬──────────────┐
 *  │ 功能              │ 调用文件                     │ 使用的模型    │
 *  ├───────────────────┼─────────────────────────────┼──────────────┤
 *  │ AI 对话           │ services/deepseek.ts        │ 对话模型      │
 *  │ 自动生成标题       │ services/deepseek.ts        │ 对话模型      │
 *  │ 文本向量化(RAG)   │ services/embedding.ts       │ Embedding模型 │
 *  │ 语音识别(ASR)     │ services/voice.ts           │ 阿里云ASR     │
 *  │ 语音合成(TTS)     │ services/voice.ts           │ 本地TTS       │
 *  └───────────────────┴─────────────────────────────┴──────────────┘
 *
 *  修改指南：
 *  - 想换对话模型？ → 修改 CHAT_MODEL_PRESETS 中的选项
 *  - 想换 Embedding？ → 修改 EMBEDDING_MODEL_PRESETS 中的选项
 *  - 想用 OpenAI/通义千问/Kimi/其他？ → 在 CHAT_MODEL_PRESETS 添加预设
 *  - 只要 API 兼容 OpenAI 格式，都可以直接使用！
 *
 * ============================================================
 */

// ==================== 📝 对话模型预设 ====================
// 所有兼容 OpenAI Chat Completions API 格式的模型都可以添加到这里

export interface ChatModelPreset {
  /** 显示名称 */
  name: string;
  /** 模型 ID（发送给 API 的值） */
  model: string;
  /** API Base URL */
  baseUrl: string;
  /** 说明 */
  description: string;
  /** 是否支持流式输出 */
  supportsStream: boolean;
  /** 是否支持多模态（图片输入） */
  supportsVision: boolean;
  /** 推荐的 temperature */
  temperature: number;
  /** 推荐的 max_tokens */
  maxTokens: number;
}

export const CHAT_MODEL_PRESETS: ChatModelPreset[] = [
  // ─── DeepSeek 系列 ───
  {
    name: 'DeepSeek Chat',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    description: '⭐ DeepSeek V3 通用对话模型，性价比极高',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: 'DeepSeek Reasoner',
    model: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com',
    description: 'DeepSeek R1 深度推理模型，适合复杂问题',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 8192,
  },

  // ─── 通义千问 系列（阿里云 DashScope 兼容 OpenAI 格式）───
  {
    name: '通义千问 Max',
    model: 'qwen-max',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '通义千问旗舰模型，综合能力最强',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: '通义千问 Plus',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '通义千问增强模型，性价比高',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: '通义千问 Turbo',
    model: 'qwen-turbo',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '通义千问极速模型，响应最快',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: '通义千问 VL Max',
    model: 'qwen-vl-max',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '通义千问视觉模型，支持图片理解',
    supportsStream: true,
    supportsVision: true,
    temperature: 0.7,
    maxTokens: 4096,
  },

  // ─── Kimi（月之暗面）───
  {
    name: 'Kimi (Moonshot)',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://api.moonshot.cn/v1',
    description: 'Kimi 8K 上下文模型',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: 'Kimi 128K',
    model: 'moonshot-v1-128k',
    baseUrl: 'https://api.moonshot.cn/v1',
    description: 'Kimi 128K 长上下文模型',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },

  // ─── 智谱 GLM ───
  {
    name: 'GLM-4',
    model: 'glm-4',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱GLM-4，中文能力强',
    supportsStream: true,
    supportsVision: false,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: 'GLM-4V',
    model: 'glm-4v',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱GLM-4V，支持图片理解',
    supportsStream: true,
    supportsVision: true,
    temperature: 0.7,
    maxTokens: 4096,
  },

  // ─── OpenAI 系列（需能访问）───
  {
    name: 'GPT-4o',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI GPT-4o 多模态模型',
    supportsStream: true,
    supportsVision: true,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    name: 'GPT-4o Mini',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI GPT-4o Mini 轻量版',
    supportsStream: true,
    supportsVision: true,
    temperature: 0.7,
    maxTokens: 4096,
  },
];

// ==================== 📊 Embedding 模型预设 ====================
// 用于 RAG 知识库的文本向量化

export interface EmbeddingModelPreset {
  /** 显示名称 */
  name: string;
  /** 模型 ID */
  model: string;
  /** API 服务商 */
  provider: 'dashscope' | 'openai' | 'local';
  /** 说明 */
  description: string;
  /** 向量维度 */
  dimensions: number;
}

export const EMBEDDING_MODEL_PRESETS: EmbeddingModelPreset[] = [
  {
    name: '通义 VL-Embedding',
    model: 'qwen3-vl-embedding',
    provider: 'dashscope',
    description: '阿里云视觉文字嵌入模型，支持图文混合',
    dimensions: 1024,
  },
  {
    name: '通义 Text-Embedding V3',
    model: 'text-embedding-v3',
    provider: 'dashscope',
    description: '阿里云嵌入模型 V3',
    dimensions: 1024,
  },
  
];

// ==================== 🎙️ 语音识别模型说明 ====================
// 语音识别使用阿里云 DashScope Paraformer ASR 服务
// API 端点：https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription
// 需要 DashScope API Key（和 Embedding 共用同一个 Key）
// 详见: services/voice.ts → recognizeSpeech()

// ==================== 🔊 语音合成（TTS）说明 ====================
// 语音合成使用本地 expo-speech（无需 API Key，完全离线）
// 如需更高质量 TTS，可替换为阿里云 CosyVoice 等
// 详见: services/voice.ts → speak()
