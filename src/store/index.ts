/**
 * 全局状态管理 (Zustand)
 */
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type {
  Conversation,
  Message,
  AppSettings,
  ChatMode,
  ApiMessage,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import {
  initDatabase,
  createConversation,
  getAllConversations,
  deleteConversation as dbDeleteConversation,
  updateConversationTitle,
  addMessage,
  updateMessageContent,
  getMessages,
  getRecentMessages,
  getAllSettings,
  setSetting,
  exportAllData,
  importAllData,
  getRagStats,
} from '../services/database';
import { chatCompletion, generateTitle } from '../services/deepseek';
import { searchRag, addChatToRag } from '../services/rag';
import type { ExportData } from '../types';

interface AppState {
  // 初始化
  initialized: boolean;
  init: () => Promise<void>;

  // 设置
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  loadSettings: () => Promise<void>;

  // 对话列表
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  // 消息
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  sendMessage: (content: string, type?: 'text' | 'voice' | 'image', imageUri?: string) => Promise<void>;
  stopGeneration: () => void;

  // 聊天模式
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;

  // RAG 状态
  ragStats: { totalChunks: number; embeddedChunks: number; chatChunks: number; uploadChunks: number };
  refreshRagStats: () => Promise<void>;

  // 导入导出
  getExportData: () => Promise<ExportData>;
  importData: (data: ExportData) => Promise<void>;

  // 内部
  _abortController: AbortController | null;
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  settings: { ...DEFAULT_SETTINGS },
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  streamingContent: '',
  chatMode: 'text',
  ragStats: { totalChunks: 0, embeddedChunks: 0, chatChunks: 0, uploadChunks: 0 },
  _abortController: null,

  /** 初始化应用 */
  init: async () => {
    try {
      await initDatabase();
      await get().loadSettings();
      await get().loadConversations();
      await get().refreshRagStats();
      set({ initialized: true });
    } catch (error) {
      console.error('初始化失败:', error);
    }
  },

  /** 加载设置 */
  loadSettings: async () => {
    const stored = await getAllSettings();
    const settings = { ...DEFAULT_SETTINGS };
    for (const [key, value] of Object.entries(stored)) {
      if (key in settings) {
        const typedKey = key as keyof AppSettings;
        if (typeof settings[typedKey] === 'number') {
          (settings as any)[typedKey] = Number(value);
        } else if (typeof settings[typedKey] === 'boolean') {
          (settings as any)[typedKey] = value === 'true';
        } else {
          (settings as any)[typedKey] = value;
        }
      }
    }
    set({ settings });
  },

  /** 更新设置 */
  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    for (const [key, value] of Object.entries(partial)) {
      await setSetting(key, String(value));
    }
  },

  /** 加载对话列表 */
  loadConversations: async () => {
    const conversations = await getAllConversations();
    set({ conversations });
  },

  /** 新建对话 */
  newConversation: async () => {
    const id = Crypto.randomUUID();
    const conv = await createConversation(id, '新对话');
    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConversationId: id,
      messages: [],
      streamingContent: '',
    }));
    return id;
  },

  /** 选择对话 */
  selectConversation: async (id: string) => {
    set({ currentConversationId: id, streamingContent: '' });
    const messages = await getMessages(id);
    set({ messages });
  },

  /** 删除对话 */
  deleteConversation: async (id: string) => {
    await dbDeleteConversation(id);
    const state = get();
    const newConversations = state.conversations.filter((c) => c.id !== id);
    const updates: Partial<AppState> = { conversations: newConversations };
    if (state.currentConversationId === id) {
      updates.currentConversationId = null;
      updates.messages = [];
    }
    set(updates as any);
  },

  /** 重命名对话 */
  renameConversation: async (id: string, title: string) => {
    await updateConversationTitle(id, title);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  /** 发送消息并获取 AI 回复 */
  sendMessage: async (content: string, type = 'text', imageUri?: string) => {
    const state = get();
    const { settings } = state;

    if (!settings.deepseekApiKey) {
      throw new Error('请先在设置中配置 DeepSeek API Key');
    }

    // 确保有对话
    let convId = state.currentConversationId;
    if (!convId) {
      convId = await get().newConversation();
    }

    // 创建用户消息
    const userMsg: Message = {
      id: Crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content,
      type,
      imageUri,
      createdAt: Date.now(),
    };
    await addMessage(userMsg);

    // 创建 AI 消息占位
    const aiMsg: Message = {
      id: Crypto.randomUUID(),
      conversationId: convId,
      role: 'assistant',
      content: '',
      type: 'text',
      createdAt: Date.now(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg, aiMsg],
      isLoading: true,
      streamingContent: '',
    }));

    const abortController = new AbortController();
    set({ _abortController: abortController } as any);

    try {
      // RAG 检索相关上下文
      let ragContext = '';
      if (settings.dashscopeApiKey) {
        const ragResults = await searchRag(
          content,
          settings.dashscopeApiKey,
          settings.embeddingModel,
          settings.ragTopK
        );
        if (ragResults.length > 0) {
          ragContext = ragResults
            .map((r, i) => `[参考${i + 1}] ${r.content}`)
            .join('\n\n');
        }
      }

      // 获取最近消息作为上下文
      const recentMessages = await getRecentMessages(convId, 10);

      // 构建 API 消息
      const apiMessages: ApiMessage[] = [];

      // 系统提示
      let systemPrompt = settings.systemPrompt;
      if (ragContext) {
        systemPrompt += `\n\n以下是从知识库中检索到的相关内容：\n${ragContext}`;
      }
      apiMessages.push({ role: 'system', content: systemPrompt });

      // 历史消息（排除最后两条，即当前轮）
      for (const msg of recentMessages.slice(0, -1)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }

      // 当前用户消息
      if (imageUri) {
        // 多模态输入
        const { imageToBase64 } = require('../utils/fileUtils');
        const base64 = await imageToBase64(imageUri);
        apiMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: content || '请描述这张图片' },
            { type: 'image_url', image_url: { url: base64 } },
          ],
        });
      } else {
        apiMessages.push({ role: 'user', content });
      }

      // 🤖 流式请求 AI 模型（模型配置来自设置页，预设见 config/models.ts）
      const fullContent = await chatCompletion(
        apiMessages,
        settings.deepseekApiKey,
        settings.deepseekBaseUrl,
        settings.deepseekModel,
        (chunk: string, done: boolean) => {
          set({ streamingContent: chunk });
          // 更新消息列表中 AI 消息的内容
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === aiMsg.id ? { ...m, content: chunk } : m
            ),
          }));
        },
        settings.temperature,
        settings.maxTokens
      );

      // 保存 AI 回复
      aiMsg.content = fullContent;
      aiMsg.createdAt = Date.now();
      await addMessage(aiMsg);

      // 更新消息列表
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: fullContent } : m
        ),
        isLoading: false,
        streamingContent: '',
      }));

      // 如果是第一条消息，自动生成标题
      const currentMessages = get().messages;
      if (currentMessages.filter((m) => m.role === 'user').length === 1) {
        generateTitle(
          content,
          settings.deepseekApiKey,
          settings.deepseekBaseUrl,
          settings.deepseekModel
        ).then((title) => {
          get().renameConversation(convId!, title);
        });
      }

      // 自动保存到 RAG
      if (settings.autoSaveToRag && settings.dashscopeApiKey) {
        addChatToRag(
          [userMsg, aiMsg],
          settings.dashscopeApiKey,
          settings.embeddingModel
        ).catch((err) => console.error('RAG 保存失败:', err));
      }

      await get().refreshRagStats();
    } catch (error: any) {
      if (error.name === 'AbortError') return;

      const errorContent = `抱歉，发生了错误：${error.message || '未知错误'}`;
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: errorContent } : m
        ),
        isLoading: false,
        streamingContent: '',
      }));
    } finally {
      set({ _abortController: null, isLoading: false } as any);
    }
  },

  /** 停止生成 */
  stopGeneration: () => {
    const ctrl = get()._abortController;
    if (ctrl) {
      ctrl.abort();
      set({ isLoading: false, _abortController: null } as any);
    }
  },

  /** 设置聊天模式 */
  setChatMode: (mode: ChatMode) => set({ chatMode: mode }),

  /** 刷新 RAG 统计 */
  refreshRagStats: async () => {
    const stats = await getRagStats();
    set({ ragStats: stats });
  },

  /** 获取导出数据 */
  getExportData: async () => {
    const data = await exportAllData();
    const settings = get().settings;
    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      ...data,
      settings: {
        systemPrompt: settings.systemPrompt,
        ragTopK: settings.ragTopK,
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
        theme: settings.theme,
      },
    };
  },

  /** 导入数据 */
  importData: async (data: ExportData) => {
    await importAllData({
      conversations: data.conversations,
      messages: data.messages,
      ragChunks: data.ragChunks,
    });
    if (data.settings) {
      await get().updateSettings(data.settings);
    }
    await get().loadConversations();
    await get().refreshRagStats();
  },
}));
