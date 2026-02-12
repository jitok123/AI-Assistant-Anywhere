// ==================== 数据模型 ====================

/** 对话会话 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** 聊天消息 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'voice' | 'image' | 'file';
  imageUri?: string;
  fileUri?: string;
  fileName?: string;
  fileMimeType?: string;
  /** Agent 工具调用记录 */
  toolCalls?: ToolCallRecord[];
  /** 搜索结果（联网搜索时） */
  searchResults?: WebSearchResult[];
  /** 生成的图片URL */
  generatedImageUrl?: string;
  createdAt: number;
}

// ==================== RAG 多层体系 ====================

/** RAG 层级类型 */
export type RagLayer = 'emotional' | 'rational' | 'historical' | 'general';

/** RAG 文本块 */
export interface RagChunk {
  id: string;
  source: 'chat' | 'upload' | 'import';
  sourceId: string;
  content: string;
  embedding: number[] | null;
  /** RAG 层级 */
  layer: RagLayer;
  createdAt: number;
}

/** RAG 搜索结果 */
export interface RagSearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  layer: RagLayer;
}

// ==================== AI Agent ====================

/** Agent 可用工具类型 */
export type AgentToolType =
  | 'web_search'
  | 'image_gen'
  | 'rag_query'
  | 'time_now'
  | 'vision_analyze';

/** 工具调用记录 */
export interface ToolCallRecord {
  tool: AgentToolType;
  input: string;
  output: string;
  timestamp: number;
}

/** Agent 函数定义（OpenAI function calling 格式） */
export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// ==================== 联网搜索 ====================

/** 网页搜索结果 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ==================== 图片生成 ====================

/** 图片生成结果 */
export interface ImageGenResult {
  url: string;
  revisedPrompt?: string;
}

// ==================== 应用设置 ====================

/** 应用设置 */
export interface AppSettings {
  // ── 🤖 对话模型配置 ──
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  temperature: number;
  maxTokens: number;
  // ── 📊 Embedding 模型配置 ──
  dashscopeApiKey: string;
  embeddingModel: string;
  // ── 📚 RAG 配置 ──
  ragTopK: number;
  chunkSize: number;
  chunkOverlap: number;
  // ── 🔍 联网搜索配置 ──
  webSearchEnabled: boolean;
  baiduQianfanApiKey: string;
  // ── 🎨 图片生成配置 ──
  imageGenEnabled: boolean;
  // ── 🧠 Agent 配置 ──
  agentEnabled: boolean;
  // ── 🎨 通用配置 ──
  theme: 'light' | 'dark' | 'auto';
  voiceEnabled: boolean;
  autoSaveToRag: boolean;
  systemPrompt: string;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
  dashscopeApiKey: '',
  embeddingModel: 'text-embedding-v3',
  ragTopK: 5,
  chunkSize: 500,
  chunkOverlap: 50,
  webSearchEnabled: true,
  baiduQianfanApiKey: '',
  imageGenEnabled: true,
  agentEnabled: true,
  theme: 'auto',
  voiceEnabled: true,
  autoSaveToRag: true,
  systemPrompt: '你是一个智能随身助手，请用中文回答用户的问题。你具有联网搜索能力（可查询实时新闻和最新信息）和图片生成能力（可根据描述创建图片）。你可以参考以下相关上下文来回答：',
};

/** 聊天模式 */
export type ChatMode = 'text' | 'voice';

/** Chat Completion 选项 */
export interface ChatCompletionOptions {
  messages: ApiMessage[];
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  onStream?: StreamCallback;
}

/** 导出数据格式 */
export interface ExportData {
  version: string;
  exportedAt: number;
  conversations: Conversation[];
  messages: Message[];
  ragChunks: RagChunk[];
  settings: Partial<AppSettings>;
}

/** DeepSeek API 消息格式 */
export interface ApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ApiMessageContent[] | null;
  /** 函数调用（assistant 角色） */
  tool_calls?: any[];
  /** 工具调用 ID（tool 角色） */
  tool_call_id?: string;
}

export interface ApiMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

/** 流式响应回调 */
export type StreamCallback = (chunk: string, done: boolean) => void;
