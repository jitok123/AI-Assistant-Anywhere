/**
 * AI Agent 服务
 * 
 * 核心决策引擎，负责：
 * 1. 接收用户输入和 RAG 上下文
 * 2. 决定是否需要调用工具（联网搜索、图片生成）
 * 3. 使用 Function Calling 机制调度工具
 * 4. 整合工具结果并生成最终回复
 * 
 * 架构：
 *   用户输入 + RAG上下文 → AI Agent (DeepSeek)
 *                            ├─→ web_search (百度千帆)
 *                            ├─→ image_gen (qwen-image-max)
 *                            └─→ 直接回复
 */
import { chatCompletion, chatCompletionRaw } from './deepseek';
import { webSearch, formatSearchResults } from './webSearch';
import { generateImage } from './imageGen';
import type {
  ApiMessage,
  AppSettings,
  StreamCallback,
  ToolCallRecord,
  WebSearchResult,
  AgentToolDefinition,
} from '../types';

// ==================== 工具定义 ====================

/** Agent 可用工具列表（OpenAI Function Calling 格式） */
const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '联网搜索最新信息。当用户询问实时新闻、最新数据、你不确定的事实、或需要网络上的信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，应简洁精准',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'image_gen',
      description: '生成图片。当用户明确要求画图、生成图片、创建图像时使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '详细的图片描述提示词，建议使用英文以获得更好效果',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

// ==================== Agent 主流程 ====================

export interface AgentResult {
  content: string;
  toolCalls: ToolCallRecord[];
  searchResults?: WebSearchResult[];
  generatedImageUrl?: string;
}

/**
 * 🧠 AI Agent 完整处理流程
 * 
 * 1. 首次调用 AI（带工具定义）
 * 2. 如果 AI 返回 tool_calls，执行对应工具
 * 3. 将工具结果回传给 AI
 * 4. AI 生成最终回复（流式）
 */
export async function agentProcess(
  messages: ApiMessage[],
  settings: AppSettings,
  onStream?: StreamCallback,
): Promise<AgentResult> {
  const toolCalls: ToolCallRecord[] = [];
  let searchResults: WebSearchResult[] | undefined;
  let generatedImageUrl: string | undefined;

  // 确定可用工具
  const availableTools: AgentToolDefinition[] = [];
  if (settings.webSearchEnabled && settings.baiduQianfanApiKey) {
    availableTools.push(AGENT_TOOLS[0]); // web_search
  }
  if (settings.imageGenEnabled && settings.dashscopeApiKey) {
    availableTools.push(AGENT_TOOLS[1]); // image_gen
  }

  // 如果没有可用工具或未启用 Agent，直接流式对话
  if (!settings.agentEnabled || availableTools.length === 0) {
    const content = await chatCompletion(
      messages,
      settings.deepseekApiKey,
      settings.deepseekBaseUrl,
      settings.deepseekModel,
      onStream,
      settings.temperature,
      settings.maxTokens,
    );
    return { content, toolCalls };
  }

  // ── 第一轮：Agent 决策（非流式，需要检查 tool_calls） ──
  const firstResponse = await chatCompletionRaw(
    messages,
    settings.deepseekApiKey,
    settings.deepseekBaseUrl,
    settings.deepseekModel,
    settings.temperature,
    settings.maxTokens,
    availableTools,
  );

  const firstChoice = firstResponse.choices?.[0];
  const firstMessage = firstChoice?.message;

  // 如果 AI 没有调用工具，直接以其内容作为回复
  if (!firstMessage?.tool_calls || firstMessage.tool_calls.length === 0) {
    const content = firstMessage?.content || '';
    if (onStream) {
      onStream(content, true);
    }
    return { content, toolCalls };
  }

  // ── 执行工具调用 ──
  const toolMessages: ApiMessage[] = [
    ...messages,
    {
      role: 'assistant',
      content: firstMessage.content || null,
      tool_calls: firstMessage.tool_calls,
    },
  ];

  for (const call of firstMessage.tool_calls) {
    const funcName = call.function?.name;
    const funcArgs = call.function?.arguments;
    let args: any = {};

    try {
      args = typeof funcArgs === 'string' ? JSON.parse(funcArgs) : funcArgs;
    } catch {}

    let toolResult = '';

    switch (funcName) {
      case 'web_search': {
        const query = args.query || '';
        if (onStream) onStream('🔍 正在联网搜索...', false);
        
        searchResults = await webSearch(
          query,
          settings.baiduQianfanApiKey,
        );
        toolResult = formatSearchResults(searchResults);
        
        if (!toolResult) {
          toolResult = '搜索未返回结果。';
        }

        toolCalls.push({
          tool: 'web_search',
          input: query,
          output: toolResult.slice(0, 500),
          timestamp: Date.now(),
        });
        break;
      }

      case 'image_gen': {
        const prompt = args.prompt || '';
        if (onStream) onStream('🎨 正在生成图片...', false);

        const imageResult = await generateImage(
          prompt,
          settings.dashscopeApiKey,
        );

        if (imageResult?.url) {
          generatedImageUrl = imageResult.url;
          toolResult = `图片已成功生成。图片URL: ${imageResult.url}`;
        } else {
          toolResult = '图片生成失败，请稍后重试。';
        }

        toolCalls.push({
          tool: 'image_gen',
          input: prompt,
          output: toolResult.slice(0, 200),
          timestamp: Date.now(),
        });
        break;
      }

      default:
        toolResult = `未知工具: ${funcName}`;
    }

    // 添加工具结果消息
    toolMessages.push({
      role: 'tool',
      content: toolResult,
      tool_call_id: call.id,
    });
  }

  // ── 第二轮：AI 整合工具结果生成最终回复（流式） ──
  const finalContent = await chatCompletion(
    toolMessages,
    settings.deepseekApiKey,
    settings.deepseekBaseUrl,
    settings.deepseekModel,
    onStream,
    settings.temperature,
    settings.maxTokens,
  );

  return {
    content: finalContent,
    toolCalls,
    searchResults,
    generatedImageUrl,
  };
}
