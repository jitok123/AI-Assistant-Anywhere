/**
 * AI Agent 服务 — 基于关键词预路由的工具调用架构
 *
 * 核心思路：
 *   不依赖 LLM 的 function calling（deepseek-reasoner 等模型不支持），
 *   而是通过分析用户输入的关键词来决定工具调用。
 *
 * 路由逻辑：
 *   用户输入 → 关键词检测
 *     ├─ 匹配图片生成 → qwen-image-max 生成图片 → 返回图片URL
 *     ├─ 匹配联网搜索 → Qwen + enable_search → 返回搜索增强回复
 *     └─ 无匹配 → 原模型直接回复
 */
import { chatCompletion } from './deepseek';
import { qwenSearchChat } from './webSearch';
import { generateImage } from './imageGen';
import type {
  ApiMessage,
  AppSettings,
  StreamCallback,
  ToolCallRecord,
  WebSearchResult,
} from '../types';

// ==================== 关键词检测 ====================

/** 图片生成意图关键词 */
const IMAGE_GEN_PATTERNS: RegExp[] = [
  /画[一个张幅]|画个|画[一]?[只条幅张]/,
  /生成[一张个幅]*[图片图像照片画作]/,
  /[帮请].*[画绘制生成].*[图片图像画照片]/,
  /给[我你].*[画绘制]|[画绘制].*给[我你]/,
  /[创作绘制].*[图像图画图片插画]/,
  /[制作生成创建].*[图像图片照片壁纸]/,
  /[美人风景人物卡通动漫].*图/,
  /图片.*[生成创建制作]/,
  /P一|p一|P个|p个/,
  /draw|paint|generate.*image|create.*image|make.*picture/i,
];

/** 联网搜索意图关键词 */
const WEB_SEARCH_PATTERNS: RegExp[] = [
  /搜[索一查]|搜[一]?下/,
  /[今明昨]天.*[新闻消息天气事件]/,
  /[今明昨]天.*[什么怎么哪]/,
  /最新|最近|近期|实时/,
  /[现当]在.*[几多什么怎]/,
  /\d{4}年.*[新闻事件发生]/,
  /新闻|热[点搜榜]|头条/,
  /[查找搜].*[资料信息数据]/,
  /帮[我你].*[查找搜]|[联上]网.*[搜查找看]/,
  /[价格股票天气比分比赛汇率航班快递]/,
  /[谁什么哪].*[赢了冠军获胜当选上映]/,
  /search|latest|news|current|today/i,
];

/** 检测是否匹配图片生成意图 */
function detectImageGenIntent(text: string): boolean {
  return IMAGE_GEN_PATTERNS.some((p) => p.test(text));
}

/** 检测是否匹配联网搜索意图 */
function detectWebSearchIntent(text: string): boolean {
  return WEB_SEARCH_PATTERNS.some((p) => p.test(text));
}

// ==================== Agent 主流程 ====================

export interface AgentResult {
  content: string;
  toolCalls: ToolCallRecord[];
  searchResults?: WebSearchResult[];
  generatedImageUrl?: string;
}

/**
 * 🧠 AI Agent 完整处理流程（关键词预路由）
 *
 * 1. 从用户最新消息提取文本
 * 2. 关键词匹配 → 图片生成 / 联网搜索 / 普通对话
 * 3. 工具成功 → 返回工具结果；失败 → 降级到普通对话
 */
export async function agentProcess(
  messages: ApiMessage[],
  settings: AppSettings,
  onStream?: StreamCallback,
): Promise<AgentResult> {
  const toolCalls: ToolCallRecord[] = [];

  // 获取用户最新消息文本
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const userText =
    typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? (lastUserMsg!.content as any[])
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join(' ')
        : '';

  console.log('[Agent] 分析用户意图:', userText.slice(0, 60));
  console.log('[Agent] 设置状态:', {
    agentEnabled: settings.agentEnabled,
    webSearchEnabled: settings.webSearchEnabled,
    imageGenEnabled: settings.imageGenEnabled,
    hasDashscopeKey: !!settings.dashscopeApiKey,
    model: settings.deepseekModel,
  });

  // ── 路由1：图片生成 ──
  if (
    settings.agentEnabled &&
    settings.imageGenEnabled &&
    settings.dashscopeApiKey &&
    detectImageGenIntent(userText)
  ) {
    console.log('[Agent] ✅ 匹配图片生成意图');
    if (onStream) onStream('🎨 正在生成图片，请稍候...', false);

    try {
      const imageResult = await generateImage(
        userText,
        settings.dashscopeApiKey,
      );

      if (imageResult?.url) {
        const content = `🎨 图片已生成！\n\n![生成的图片](${imageResult.url})`;

        if (onStream) onStream(content, true);

        toolCalls.push({
          tool: 'image_gen',
          input: userText,
          output: imageResult.url,
          timestamp: Date.now(),
        });

        return {
          content,
          toolCalls,
          generatedImageUrl: imageResult.url,
        };
      }
    } catch (error: any) {
      console.warn('[Agent] 图片生成失败:', error?.message);
    }

    // 图片生成失败，降级到普通对话
    console.log('[Agent] 图片生成失败，降级到普通对话');
  }

  // ── 路由2：联网搜索 ──
  if (
    settings.agentEnabled &&
    settings.webSearchEnabled &&
    settings.dashscopeApiKey &&
    detectWebSearchIntent(userText)
  ) {
    console.log('[Agent] ✅ 匹配联网搜索意图');
    if (onStream) onStream('🔍 正在联网搜索...', false);

    try {
      const searchContent = await qwenSearchChat(
        messages,
        settings.dashscopeApiKey,
        onStream,
        settings.temperature,
      );

      if (searchContent) {
        toolCalls.push({
          tool: 'web_search',
          input: userText,
          output: searchContent.slice(0, 500),
          timestamp: Date.now(),
        });

        return {
          content: searchContent,
          toolCalls,
        };
      }
    } catch (error: any) {
      console.warn('[Agent] 联网搜索失败:', error?.message);
    }

    // 搜索失败，降级到普通对话
    console.log('[Agent] 联网搜索失败，降级到普通对话');
  }

  // ── 路由3：普通对话 ──
  console.log('[Agent] 走普通对话流程');
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
