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
  type: 'text' | 'voice' | 'image';
  imageUri?: string;
  createdAt: number;
}

/** RAG 文本块 */
export interface RagChunk {
  id: string;
  source: 'chat' | 'upload' | 'import';
  sourceId: string;
  content: string;
  embedding: number[] | null;
  createdAt: number;
}

/** 应用设置 */
export interface AppSettings {
  // ── 🤖 对话模型配置（详见 config/models.ts）──
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
  theme: 'auto',
  voiceEnabled: true,
  autoSaveToRag: true,
  systemPrompt: '你是一个智能随身助手，请用中文回答用户的问题。你可以参考以下相关上下文来回答：',
};

/** 聊天模式 */
export type ChatMode = 'text' | 'voice';

/** RAG 搜索结果 */
export interface RagSearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
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
  role: 'user' | 'assistant' | 'system';
  content: string | ApiMessageContent[];
}

export interface ApiMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

/** 流式响应回调 */
export type StreamCallback = (chunk: string, done: boolean) => void;
