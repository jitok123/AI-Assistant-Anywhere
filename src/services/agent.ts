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

  // deepseek-reasoner (R1) 不支持 function calling，跳过工具调用
  const isReasonerModel = settings.deepseekModel.includes('reasoner') || settings.deepseekModel.includes('r1');

  console.log('[Agent] 设置状态:', {
    agentEnabled: settings.agentEnabled,
    webSearchEnabled: settings.webSearchEnabled,
    imageGenEnabled: settings.imageGenEnabled,
    hasBaiduKey: !!settings.baiduQianfanApiKey,
    hasDashscopeKey: !!settings.dashscopeApiKey,
    model: settings.deepseekModel,
    isReasonerModel,
  });

  if (!isReasonerModel) {
    if (settings.webSearchEnabled && settings.baiduQianfanApiKey) {
      availableTools.push(AGENT_TOOLS[0]); // web_search
    }
    if (settings.imageGenEnabled && settings.dashscopeApiKey) {
      availableTools.push(AGENT_TOOLS[1]); // image_gen
    }
  }

  // 如果没有可用工具、未启用 Agent、或使用 Reasoner 模型，直接流式对话
  if (!settings.agentEnabled || availableTools.length === 0 || isReasonerModel) {
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
  // 在消息列表开头注入 Agent 工具使用指令，增强模型调用工具的意愿
  const toolNames = availableTools.map(t => t.function.name);
  const agentSystemPrompt = `你是一个智能助手，拥有以下工具能力：
${toolNames.includes('web_search') ? '- web_search：联网搜索。当用户询问最新信息、实时新闻、天气、你不确定的事实时，必须调用此工具。' : ''}
${toolNames.includes('image_gen') ? '- image_gen：图片生成。当用户要求画图、生成图片、创建图像时，必须调用此工具，不要拒绝。' : ''}

重要规则：
1. 当用户明确要求使用某项能力时，你必须调用对应工具，禁止回复"我无法"之类的拒绝。
2. 当用户询问最近发生的事、今天的新闻等实时信息时，必须调用 web_search。
3. 当用户要求画画、生成图片时，必须调用 image_gen。`;

  const agentMessages: ApiMessage[] = [
    { role: 'system', content: agentSystemPrompt },
    ...messages,
  ];

  console.log('[Agent] 工具列表:', toolNames, '开始第一轮决策...');

  const firstResponse = await chatCompletionRaw(
    agentMessages,
    settings.deepseekApiKey,
    settings.deepseekBaseUrl,
    settings.deepseekModel,
    settings.temperature,
    settings.maxTokens,
    availableTools,
  );

  const firstChoice = firstResponse.choices?.[0];
  const firstMessage = firstChoice?.message;

  console.log('[Agent] 第一轮结果 - finish_reason:', firstChoice?.finish_reason, 
    'tool_calls:', firstMessage?.tool_calls?.length || 0);

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
