/**
 * 全局状态管理 (Zustand) · V2.0
 *
 * 消息处理流程：
 *   用户输入 → 多模态处理 → RAG 专员检索 → AI Agent/LLM → 流式输出
 *                                                  ├─ 联网搜索
 *                                                  ├─ 图片生成
 *                                                  └─ 直接回复
 *   输出后 → 异步更新多层 RAG（感性/理性/历史/通用）
 */
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { AppState as RNAppState } from 'react-native';
import type {
  Conversation,
  Message,
  MessageAttachment,
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
  deleteConversations as dbDeleteConversations,
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
import { agentProcess, detectWebSearchIntent } from '../services/agent';
import { searchAndExtract, qwenSearchChat } from '../services/webSearch';
import {
  multiLayerSearch,
  buildRagContext,
  postConversationUpdate,
} from '../services/ragSpecialist';
import { addChatToRag } from '../services/rag';
import { imageToBase64 } from '../utils/fileUtils';
import { buildTimeContextLine } from '../utils/time';
import { getDashScopeCompatibleBaseUrl } from '../config/api';
import { reportError, toUserFriendlyMessage } from '../services/errorHandler';
import type { ExportData } from '../types';

type SendAttachment = {
  kind: 'image' | 'file';
  uri: string;
  name: string;
  mimeType?: string;
  textContent?: string;
};

let postProcessTimer: any = null;
let appLifecycleState = RNAppState.currentState;
RNAppState.addEventListener('change', (nextState) => {
  appLifecycleState = nextState;
});

function shouldDescribePreviousGeneratedImage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /刚才|上一张|上一个|前一张|刚生成|那张/.test(t)
    && /图|图片|照片|画/.test(t)
    && /描述|讲讲|分析|看看|解读|说说/.test(t);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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
  deleteConversations: (ids: string[]) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  // 消息
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  streamingMessageId: string | null;
  sendMessage: (
    content: string,
    type?: 'text' | 'voice' | 'image' | 'file',
    imageUri?: string,
    fileAttachment?: {
      uri: string;
      name: string;
      mimeType?: string;
      textContent?: string;
    },
    attachments?: SendAttachment[],
  ) => Promise<void>;
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
  streamingMessageId: null,
  chatMode: 'text',
  ragStats: { totalChunks: 0, embeddedChunks: 0, chatChunks: 0, uploadChunks: 0 },
  _abortController: null,

  /** 初始化应用 */
  init: async () => {
    try {
      console.log('[App] 开始初始化...');
      
      console.log('[App] 初始化数据库...');
      await initDatabase();
      
      console.log('[App] 加载设置...');
      await get().loadSettings();
      
      console.log('[App] 加载对话列表...');
      await get().loadConversations();
      
      console.log('[App] 刷新RAG统计...');
      await get().refreshRagStats();
      
      console.log('[App] 初始化完成');
      set({ initialized: true });
    } catch (error) {
      console.error('[App] 初始化失败:', error);
      // 即使出错也要让应用继续，避免卡在启动画面
      set({ initialized: true });
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
    // 迁移：旧版默认关闭了 Agent 功能，新版默认开启
    const migrated = stored['_agentMigrationV1'];
    if (!migrated) {
      settings.agentEnabled = true;
      settings.webSearchEnabled = true;
      settings.imageGenEnabled = true;
      await setSetting('agentEnabled', 'true');
      await setSetting('webSearchEnabled', 'true');
      await setSetting('imageGenEnabled', 'true');
      await setSetting('_agentMigrationV1', 'done');
    }

    // 迁移：RAG 双路 embedding 模型默认值
    if (!settings.ragTextEmbeddingModel) {
      settings.ragTextEmbeddingModel = settings.embeddingModel || 'text-embedding-v3';
      await setSetting('ragTextEmbeddingModel', settings.ragTextEmbeddingModel);
    }
    if (!settings.ragNonTextEmbeddingModel) {
      settings.ragNonTextEmbeddingModel = 'qwen3-vl-embedding';
      await setSetting('ragNonTextEmbeddingModel', settings.ragNonTextEmbeddingModel);
    }
    if (!settings.visionModel) {
      settings.visionModel = 'qwen-vl-max';
      await setSetting('visionModel', settings.visionModel);
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
      streamingMessageId: null,
    }));
    return id;
  },

  /** 选择对话 */
  selectConversation: async (id: string) => {
    set({ currentConversationId: id, streamingContent: '', streamingMessageId: null });
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
      updates.streamingMessageId = null;
    }
    set(updates as any);
  },

  /** 批量删除对话 */
  deleteConversations: async (ids: string[]) => {
    if (!ids.length) return;
    await dbDeleteConversations(ids);
    const state = get();
    const idSet = new Set(ids);
    const newConversations = state.conversations.filter((c) => !idSet.has(c.id));
    const updates: Partial<AppState> = { conversations: newConversations };

    if (state.currentConversationId && idSet.has(state.currentConversationId)) {
      updates.currentConversationId = null;
      updates.messages = [];
      updates.streamingMessageId = null;
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
  sendMessage: async (
    content: string,
    type: 'text' | 'voice' | 'image' | 'file' = 'text',
    imageUri?: string,
    fileAttachment?: {
      uri: string;
      name: string;
      mimeType?: string;
      textContent?: string;
    },
    attachments?: SendAttachment[],
  ) => {
    const state = get();
    const { settings } = state;

    if (!settings.deepseekApiKey) {
      throw new Error('请先在设置中配置 API Key');
    }

    // 确保有对话
    let convId = state.currentConversationId;
    if (!convId) {
      convId = await get().newConversation();
    }

    const normalizedAttachments: SendAttachment[] = attachments?.length
      ? attachments
      : [
          ...(imageUri ? [{ kind: 'image' as const, uri: imageUri, name: '图片' }] : []),
          ...(fileAttachment ? [{ kind: 'file' as const, ...fileAttachment }] : []),
        ];
    const imageAttachments = normalizedAttachments.filter((a) => a.kind === 'image');
    const fileAttachments = normalizedAttachments.filter((a) => a.kind === 'file');

    // 创建用户消息
    const messageAttachments: MessageAttachment[] | undefined = normalizedAttachments.length
      ? normalizedAttachments.map((a) => ({
          kind: a.kind,
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType,
        }))
      : undefined;

    const userMsg: Message = {
      id: Crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content:
        content
        || (fileAttachments.length ? `请分析文件：${fileAttachments[0]?.name || '附件'}` : '')
        || (imageAttachments.length ? '请描述这些图片' : ''),
      type: fileAttachments.length ? 'file' : imageAttachments.length ? 'image' : type,
      imageUri: imageAttachments[0]?.uri,
      fileUri: fileAttachments[0]?.uri,
      fileName: fileAttachments[0]?.name,
      fileMimeType: fileAttachments[0]?.mimeType,
      attachments: messageAttachments,
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
      streamingMessageId: aiMsg.id,
    }));

    const abortController = new AbortController();
    set({ _abortController: abortController } as any);

    // ⏰ 安全超时：前台 120s 后强制清除 loading（防止永久卡住）
    //   若应用在后台，延后检查，避免后台阶段被误判中断。
    let safetyTimeout: any = null;
    let streamFlushTimer: any = null;
    const scheduleSafetyCheck = (delayMs: number) => {
      safetyTimeout = setTimeout(() => {
        if (!get().isLoading) return;
        if (appLifecycleState !== 'active') {
          console.log('[Store] 当前处于后台，延后进行 loading 安全检查');
          scheduleSafetyCheck(60000);
          return;
        }
        console.warn('[Store] 安全超时触发，强制清除 loading');
        set({ isLoading: false, streamingContent: '', streamingMessageId: null });
      }, delayMs);
    };
    scheduleSafetyCheck(120000);

    try {
      // ── 步骤1：RAG 专员检索（多层记忆） ──
      let ragContext = '';
      if (settings.dashscopeApiKey) {
        const ragResults = await multiLayerSearch(
          content,
          settings,
          settings.ragTopK
        );
        if (ragResults.length > 0) {
          ragContext = buildRagContext(ragResults);
        }
      }

      // ── 步骤2：构建消息上下文 ──
      const recentMessages = await getRecentMessages(convId, 10);

      const apiMessages: ApiMessage[] = [];

      // 系统提示（含多层 RAG 上下文）
      let systemPrompt = `${settings.systemPrompt}\n\n${buildTimeContextLine()}`;
      
      // 强制注入富文本格式要求，防止模型输出完整的 LaTeX 文档导致渲染失败
      if (!systemPrompt.includes('$$')) {
        systemPrompt += `\n\n【格式要求】\n1. 数学公式必须使用 Markdown 语法：行内公式用 $...$，独立公式块用 $$...$$。绝对不要输出完整的 LaTeX 文档代码（如 \\begin{document} 等）。\n2. 图表请使用 Markdown 的 mermaid 代码块。`;
      }
      if (ragContext) {
        systemPrompt += `\n\n以下是从多层记忆系统中检索到的相关内容：\n${ragContext}`;
      }
      apiMessages.push({ role: 'system', content: systemPrompt });

      // 历史消息（排除当前轮）
      for (const msg of recentMessages.slice(0, -1)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }

      // 当前用户消息
      let imagePartsForCurrentTurn: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
      const shouldUsePreviousGeneratedImage =
        type === 'text'
        && !imageAttachments.length
        && !fileAttachments.length
        && shouldDescribePreviousGeneratedImage(content);
      const latestGeneratedImage = shouldUsePreviousGeneratedImage
        ? [...get().messages].reverse().find((m) => m.role === 'assistant' && !!m.generatedImageUrl)?.generatedImageUrl
        : undefined;

      if (imageAttachments.length || latestGeneratedImage) {
        const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
        for (const img of imageAttachments.slice(0, 2)) {
          const b64 = await imageToBase64(img.uri);
          imageParts.push({ type: 'image_url', image_url: { url: b64 } });
        }
        if (!imageParts.length && latestGeneratedImage) {
          imageParts.push({ type: 'image_url', image_url: { url: latestGeneratedImage } });
        }
        imagePartsForCurrentTurn = imageParts;

        const textPrefix = fileAttachments.length
          ? fileAttachments.map((f, idx) => {
              const header = [
                `附件${idx + 1} 文件名：${f.name}`,
                f.mimeType ? `类型：${f.mimeType}` : '',
              ].filter(Boolean).join('\n');
              const body = f.textContent
                ? `\n【内容节选】\n${f.textContent}`
                : '\n【说明】该文件不是纯文本，当前无法直接读取正文。';
              return `${header}${body}`;
            }).join('\n\n')
          : '';

        apiMessages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `${content || (latestGeneratedImage ? '请描述刚才生成的图片' : '请描述这些图片')}`
                + (textPrefix ? `\n\n【附件信息】\n${textPrefix}` : ''),
            },
            ...imageParts,
          ],
        });
      } else if (fileAttachments.length) {
        const mergedFileText = fileAttachments.map((f, idx) => {
          const fileHeader = [
            `文件${idx + 1}名：${f.name}`,
            f.mimeType ? `文件类型：${f.mimeType}` : '',
          ].filter(Boolean).join('\n');

          const fileBody = f.textContent
            ? `\n【文件内容节选】\n${f.textContent}`
            : '\n【说明】该文件不是纯文本，当前无法直接读取正文。';
          return `${fileHeader}${fileBody}`;
        }).join('\n\n');

        const mergedText = `${content || `请帮我处理这些文件`}\n\n【附件信息】\n${mergedFileText}`;
        apiMessages.push({ role: 'user', content: mergedText });
      } else {
        apiMessages.push({ role: 'user', content });
      }

      // ── 步骤3：AI Agent 处理（含工具调用决策） ──
      let agentResult;
      let latestStreamChunk = '';
      let lastStreamFlushAt = 0;

      const flushStreamToUi = (force = false) => {
        if (!latestStreamChunk && !force) return;
        if (streamFlushTimer) {
          clearTimeout(streamFlushTimer);
          streamFlushTimer = null;
        }
        lastStreamFlushAt = Date.now();
        const chunkToRender = latestStreamChunk;
        set({ streamingContent: chunkToRender });
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? { ...m, content: chunkToRender } : m
          ),
        }));
      };

      // 流式回调：更新消息内容，done=true 时立即清除 loading 状态
      const streamCallback = (chunk: string, done: boolean) => {
        latestStreamChunk = chunk;

        const now = Date.now();
        const shouldFlushNow = done || now - lastStreamFlushAt >= 66;

        if (shouldFlushNow) {
          flushStreamToUi(true);
        } else if (!streamFlushTimer) {
          streamFlushTimer = setTimeout(() => {
            flushStreamToUi(true);
          }, 66);
        }

        // ⚡ 关键修复：流完成信号到达时立即清除 loading
        //    防止 XHR promise 未正确 resolve 导致 isLoading 卡住
        if (done) {
          console.log('[Store] 流式完成信号到达，清除 loading');
          set({ isLoading: false, streamingContent: '', streamingMessageId: null });
        }
      };

      if ((imageAttachments.length || latestGeneratedImage) && settings.dashscopeApiKey) {
        const imageQuestion =
          content
          || (imagePartsForCurrentTurn.length > 1 ? '请分别描述这些图片' : '请描述这张图片');
        const shouldSearchAfterVision =
          settings.agentEnabled
          && settings.webSearchEnabled
          && detectWebSearchIntent(imageQuestion);

        set({ streamingContent: '🖼️ 正在识别图片内容...' });
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === aiMsg.id ? { ...m, content: '🖼️ 正在识别图片内容...' } : m
          ),
        }));

        const visionOnlyMessages: ApiMessage[] = [
          {
            role: 'system',
            content:
              '你是专业图像分析助手。请先客观描述图片中可见信息，再回答用户问题。'
              + '禁止臆测无法从图片直接确认的细节。',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: imageQuestion },
              ...imagePartsForCurrentTurn,
            ],
          },
        ];

        const visionModel = settings.visionModel || 'qwen-vl-max';
        const visionContent = await withTimeout(
          chatCompletion(
            visionOnlyMessages,
            settings.dashscopeApiKey,
            getDashScopeCompatibleBaseUrl(),
            visionModel,
            undefined,
            0.3,
            settings.maxTokens,
          ),
          70000,
          '图片识别超时，请重试'
        );

        const toolCalls: any[] = [
          {
            tool: 'vision_analyze',
            input: imageQuestion,
            output: visionContent.slice(0, 800),
            timestamp: Date.now(),
          },
        ];

        if (shouldSearchAfterVision) {
          set({ streamingContent: '🔍 已识别图片，正在联网补充信息...' });
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === aiMsg.id ? { ...m, content: '🔍 已识别图片，正在联网补充信息...' } : m
            ),
          }));

          let searchFacts = await searchAndExtract(
            `${imageQuestion}\n\n【图片识别要点】\n${visionContent}`,
            settings.dashscopeApiKey,
          );

          if (!searchFacts) {
            searchFacts = await qwenSearchChat(
              [
                {
                  role: 'system',
                  content:
                    '请基于联网检索结果，给出与用户问题及图片内容强相关的最新事实摘要。'
                    + '要求：中文、客观、尽量包含时间与来源线索。',
                },
                {
                  role: 'user',
                  content: `${imageQuestion}\n\n图片识别结果：${visionContent}`,
                },
              ],
              settings.dashscopeApiKey,
              undefined,
              0.3,
            );
          }

          if (searchFacts) {
            toolCalls.push({
              tool: 'web_search',
              input: imageQuestion,
              output: searchFacts.slice(0, 800),
              timestamp: Date.now(),
            });
          }

          const enhancedMessages: ApiMessage[] = [];
          for (const m of apiMessages) {
            if (m.role === 'user' && Array.isArray(m.content)) {
              const textPart = (m.content as any[])
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '')
                .join('\n')
                .trim();
              enhancedMessages.push({ role: 'user', content: textPart || imageQuestion });
            } else {
              enhancedMessages.push(m);
            }
          }

          const sysIdx = enhancedMessages.findIndex((m) => m.role === 'system');
          const injectedContext =
            `\n\n【图片识别结果】\n${visionContent}`
            + (searchFacts ? `\n\n【联网搜索结果】\n${searchFacts}` : '')
            + '\n\n请严格基于上述材料回答，若证据不足请明确说明不确定。';

          if (sysIdx >= 0 && typeof enhancedMessages[sysIdx].content === 'string') {
            enhancedMessages[sysIdx] = {
              ...enhancedMessages[sysIdx],
              content: (enhancedMessages[sysIdx].content as string) + injectedContext,
            };
          } else {
            enhancedMessages.unshift({ role: 'system', content: `你是一个严谨的中文助手。${injectedContext}` });
          }

          const finalContent = await withTimeout(
            chatCompletion(
              enhancedMessages,
              settings.deepseekApiKey,
              settings.deepseekBaseUrl,
              settings.deepseekModel,
              streamCallback,
              settings.temperature,
              settings.maxTokens,
            ),
            90000,
            '模型响应超时，请稍后重试'
          );

          agentResult = { content: finalContent, toolCalls };
        } else {
          streamCallback(visionContent, true);
          agentResult = { content: visionContent, toolCalls };
        }
      } else {
        agentResult = await withTimeout(
          agentProcess(
            apiMessages,
            settings,
            streamCallback,
          ),
          90000,
          '模型响应超时，请稍后重试'
        );
      }

      // ── 步骤4：保存结果 ──
      aiMsg.content = agentResult.content;
      aiMsg.toolCalls = agentResult.toolCalls.length > 0 ? agentResult.toolCalls : undefined;
      aiMsg.searchResults = agentResult.searchResults;
      aiMsg.generatedImageUrl = agentResult.generatedImageUrl;
      aiMsg.createdAt = Date.now();
      await addMessage(aiMsg);

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, ...aiMsg } : m
        ),
        isLoading: false,
        streamingContent: '',
        streamingMessageId: null,
      }));

      // 清除流式状态（确保 UI 更新）
      set({ isLoading: false, streamingContent: '', streamingMessageId: null });

      // 自动生成标题（完全后台，不影响UI）
      const currentMessages = get().messages;
      if (currentMessages.filter((m) => m.role === 'user').length === 1) {
        generateTitle(
          content,
          settings.deepseekApiKey,
          settings.deepseekBaseUrl,
          settings.deepseekModel
        ).then((title) => {
          get().renameConversation(convId!, title).catch(() => {});
        }).catch((err) => {
          console.warn('[Store] 生成标题失败:', err?.message);
        });
      }

      // ── 步骤5：后处理 - 更新多层 RAG（完全后台，不影响UI） ──
      try {
        if (settings.autoSaveToRag && settings.dashscopeApiKey) {
          // 传统 RAG 保存（通用层）
          addChatToRag(
            [userMsg, aiMsg],
            settings.dashscopeApiKey,
            settings.embeddingModel
          ).catch((err) => console.warn('[RAG] 保存失败:', err?.message));

          // 多层 RAG 后处理（感性/理性/历史层更新）
          if (postProcessTimer) clearTimeout(postProcessTimer);
          postProcessTimer = setTimeout(() => {
            getMessages(convId).then((allMessages) => {
              postConversationUpdate(allMessages.slice(-12), settings)
                .catch((err) => console.warn('[RAG] 多层更新失败:', err?.message));
            }).catch((err) => console.warn('[RAG] 获取消息失败:', err?.message));
          }, 1200);
        }

        get().refreshRagStats().catch(() => {});
      } catch (ragErr) {
        console.warn('[RAG] 后处理异常:', ragErr);
      }
    } catch (error: any) {
      reportError(error, {
        module: 'store',
        action: 'sendMessage',
        extra: { type, hasImage: !!imageUri, hasFile: !!fileAttachment },
      });
      if (error.name === 'AbortError') {
        set({ isLoading: false, streamingContent: '', streamingMessageId: null });
        return;
      }

      const errorContent = toUserFriendlyMessage(error);

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: errorContent } : m
        ),
        isLoading: false,
        streamingContent: '',
        streamingMessageId: null,
      }));
    } finally {
      // 🔒 终极保险：无论如何都清除 loading 状态
      clearTimeout(safetyTimeout);
      if (streamFlushTimer) clearTimeout(streamFlushTimer);
      console.log('[Store] finally 块执行，清除 loading');
      set({ _abortController: null, isLoading: false, streamingContent: '', streamingMessageId: null } as any);
    }
  },

  /** 停止生成 */
  stopGeneration: () => {
    const ctrl = get()._abortController;
    if (ctrl) {
      ctrl.abort();
      set({ isLoading: false, streamingContent: '', streamingMessageId: null, _abortController: null } as any);
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
