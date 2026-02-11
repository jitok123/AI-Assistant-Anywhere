/**
 * AI Agent 服务 — 关键词预路由 + DeepSeek 集成
 *
 * 新架构（不依赖 Function Calling，所有模型通用）：
 *
 *   用户输入 → 严格意图检测
 *     ├─ 画图指令 → qwen-image-max → 图片URL + 简短确认文字
 *     ├─ 搜索意图 → Qwen+search(提取事实) → 注入DeepSeek → 流式回复
 *     └─ 普通对话 → DeepSeek 直接流式回复
 *
 * 要点：
 *   - 联网搜索结果由 DeepSeek 整合回答，保持统一的对话风格
 *   - 图片生成使用 qwen-image-max，通过 generatedImageUrl 展示（不用Markdown）
 *   - 意图检测极严格，避免误触发
 */
import { chatCompletion } from './deepseek';
import { searchAndExtract } from './webSearch';
import { generateImage } from './imageGen';
import type {
  ApiMessage,
  AppSettings,
  StreamCallback,
  ToolCallRecord,
  WebSearchResult,
} from '../types';

// ==================== 严格意图检测 ====================

/**
 * 检测是否为明确的「画图/生成图片」指令
 *
 * 设计原则：宁可漏过，不可误触
 * - 只匹配祈使句/命令式的绘画请求
 * - 排除关于过去生成的提问、讨论、反问
 */
function detectImageGenIntent(text: string): boolean {
  const t = text.trim();

  // ── 负向排除（最先检查，快速过滤） ──
  if (/[记得想起回忆提到说过].*[画绘图图片生成]/.test(t)) return false;
  if (/[之前上次以前曾经刚才].*[画绘图生成]/.test(t)) return false;
  if (/[不能不会无法没法][够]?[画绘生成]/.test(t)) return false;

  // ── 正向匹配：用户要求创建图像 ──

  // 1️⃣ 画/绘 + 量词/对象
  if (/[画绘][一个张幅只条两三]/.test(t)) return true;
  if (/[画绘]个/.test(t)) return true;

  // 2️⃣ 请求式：给我画/帮我画/请画/来画
  if (/[给帮为请来][我你]?.*[画绘制]/.test(t)) return true;

  // 3️⃣ 生成+图/画/像/照片
  if (/生成[一]?[张幅个副]?.*[图画像照片]/.test(t)) return true;

  // 4️⃣ 创作/制作+图/画/像
  if (/[制创]作[一]?[张幅个副]?.*[图照画像插]/.test(t)) return true;

  // 5️⃣ 宽泛"生成"指令：后面是具体视觉描述（≥2字），排除文本/代码类
  //    ✅ "生成超绝美少女" "生成一只猫" "生成风景"
  //    ❌ "生成代码" "生成文本" "生成报告"
  if (/生成[一个两三只条张幅副]?[^\s，。？！]{2,}/.test(t)) {
    if (!/生成.*[代码文字文本文档报告计划方案列表摘要总结分析回答内容文章翻译]/.test(t)) {
      return true;
    }
  }

  // 6️⃣ "可以/能生成X吗" — 带具体描述(≥4字)的是请求，不是纯能力疑问
  //    ✅ "你可以生成超绝美少女吗" "能生成一张风景图吗"
  //    ❌ "你能生成吗" "可以画画吗"
  if (/[可以能够].*生成.{4,}/.test(t)) {
    if (!/生成.*[代码文字文本报告文章翻译]/.test(t)) {
      return true;
    }
  }

  // 7️⃣ 画/绘+具体描述（无量词但有明确对象 ≥2字）
  if (/[画绘][一个]?[^\s，。？！]{2,}/.test(t) && !/[画绘][面板廊展饼线图表]/.test(t)) {
    return true;
  }

  // 8️⃣ English
  if (/draw |paint |generate.*(image|picture|photo)|create.*(image|picture|art)/i.test(t)) return true;

  return false;
}

/**
 * 检测是否为联网搜索意图
 * 匹配时间敏感、实时性强的问题
 */
function detectWebSearchIntent(text: string): boolean {
  const PATTERNS: RegExp[] = [
    /搜[索一查]|搜[一]?下/,                   // 搜索/搜一下
    /[今明昨]天.*[新闻消息天气事件热点]/,        // 今天的新闻
    /[今明昨]天.*[发生有什么怎么]/,             // 今天发生了什么
    /最新[的]?[新闻消息资讯进展动态]/,          // 最新新闻
    /最近[的]?[新闻消息热点事件]/,              // 最近新闻
    /近期[热点事件动态]/,                       // 近期热点
    /实时[信息数据资讯新闻]/,                   // 实时信息
    /新闻[是什么有哪]/,                         // 新闻是什么
    /热[点搜榜]|头条/,                          // 热搜/热点/头条
    /[查找搜].*[一下].*[资料信息]/,             // 查一下资料
    /[联上]网.*[搜查找看]/,                     // 联网搜/上网查
    /[现当]在.*[价格股价汇率天气温度比分]/,      // 现在的价格/天气
    /\d{4}年\d{1,2}月.*[新闻事件发生]/,         // 2026年2月的新闻
    /search|latest news|current/i,              // English
  ];
  return PATTERNS.some((p) => p.test(text));
}

// ==================== Agent 主流程 ====================

export interface AgentResult {
  content: string;
  toolCalls: ToolCallRecord[];
  searchResults?: WebSearchResult[];
  generatedImageUrl?: string;
}

/**
 * 🧠 AI Agent 处理流程
 */
export async function agentProcess(
  messages: ApiMessage[],
  settings: AppSettings,
  onStream?: StreamCallback,
): Promise<AgentResult> {
  const toolCalls: ToolCallRecord[] = [];

  // 提取用户最新消息
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

  // ══════════════════════════════════════════════
  //  路由1：图片生成（严格匹配绘画指令）
  // ══════════════════════════════════════════════
  if (
    settings.agentEnabled &&
    settings.imageGenEnabled &&
    settings.dashscopeApiKey &&
    detectImageGenIntent(userText)
  ) {
    console.log('[Agent] ✅ 匹配图片生成意图');
    if (onStream) onStream('🎨 正在生成图片，请稍候...', false);

    try {
      const imageResult = await generateImage(userText, settings.dashscopeApiKey);

      if (imageResult?.url) {
        // 不在 content 中放 Markdown 图片语法，避免渲染崩溃
        // 图片通过 generatedImageUrl 字段由 MessageBubble 原生 <Image> 显示
        const content = '🎨 图片已成功生成！';
        if (onStream) onStream(content, true);

        toolCalls.push({
          tool: 'image_gen',
          input: userText,
          output: imageResult.url,
          timestamp: Date.now(),
        });

        return { content, toolCalls, generatedImageUrl: imageResult.url };
      }
    } catch (error: any) {
      console.warn('[Agent] 图片生成失败:', error?.message);
    }
    // 失败则降级到普通对话
    console.log('[Agent] 图片生成失败，降级到普通对话');
  }

  // ══════════════════════════════════════════════
  //  路由2：联网搜索 → 事实提取 → DeepSeek 回答
  // ══════════════════════════════════════════════
  if (
    settings.agentEnabled &&
    settings.webSearchEnabled &&
    settings.dashscopeApiKey &&
    detectWebSearchIntent(userText)
  ) {
    console.log('[Agent] ✅ 匹配联网搜索意图');
    if (onStream) onStream('🔍 正在联网搜索...', false);

    try {
      // 第1步：Qwen + enable_search 获取搜索增强的事实信息（非流式）
      const searchFacts = await searchAndExtract(userText, settings.dashscopeApiKey);

      if (searchFacts) {
        console.log('[Agent] 搜索事实获取成功, 长度:', searchFacts.length);

        toolCalls.push({
          tool: 'web_search',
          input: userText,
          output: searchFacts.slice(0, 500),
          timestamp: Date.now(),
        });

        // 第2步：将搜索结果注入 DeepSeek 消息上下文
        const enhancedMessages = [...messages];

        // 找到系统消息并追加搜索上下文
        const sysIdx = enhancedMessages.findIndex((m) => m.role === 'system');
        const searchContext =
          '\n\n【联网搜索结果（来自实时搜索，请据此回答用户问题）】\n' + searchFacts;

        if (sysIdx >= 0 && typeof enhancedMessages[sysIdx].content === 'string') {
          enhancedMessages[sysIdx] = {
            ...enhancedMessages[sysIdx],
            content: (enhancedMessages[sysIdx].content as string) + searchContext,
          };
        } else {
          enhancedMessages.unshift({
            role: 'system',
            content: '你是一个智能助手。' + searchContext,
          });
        }

        // 第3步：用 DeepSeek 流式生成最终回复（含搜索上下文）
        if (onStream) onStream('', false); // 清空 "正在搜索" 提示
        const content = await chatCompletion(
          enhancedMessages,
          settings.deepseekApiKey,
          settings.deepseekBaseUrl,
          settings.deepseekModel,
          onStream,
          settings.temperature,
          settings.maxTokens,
        );

        return { content, toolCalls };
      }
    } catch (error: any) {
      console.warn('[Agent] 联网搜索失败:', error?.message);
    }
    // 搜索失败则降级到普通对话
    console.log('[Agent] 联网搜索失败，降级到普通对话');
  }

  // ══════════════════════════════════════════════
  //  路由3：普通对话 → DeepSeek 直接回复
  // ══════════════════════════════════════════════
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
