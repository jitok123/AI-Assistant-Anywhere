/**
 * 联网搜索服务 — 阿里云 DashScope Qwen + enable_search
 *
 * 使用 Qwen 模型的内置联网搜索能力，通过 OpenAI 兼容接口调用。
 * 无需额外搜索 API Key，直接使用 DashScope API Key。
 *
 * API: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 *      添加 enable_search: true 参数
 *
 * 两种用法：
 *   1. searchAndExtract — 非流式，提取搜索事实（供 DeepSeek 使用）
 *   2. qwenSearchChat  — 直接流式回复（备用）
 */
import type { WebSearchResult, ApiMessage, StreamCallback } from '../types';
import { getDashScopeCompatibleChatUrl } from '../config/api';
import { reportError } from './errorHandler';

/** DashScope OpenAI 兼容端点 */
const DASHSCOPE_CHAT_URL = getDashScopeCompatibleChatUrl();

/** 联网搜索使用的 Qwen 模型 */
const SEARCH_MODEL = 'qwen-plus';

/**
 * 🔍 联网搜索并提取事实信息（非流式）
 *
 * 用于 Agent 流程：
 *   1. 调用 Qwen + enable_search 获取搜索增强回复
 *   2. 返回纯文本事实内容
 *   3. 由 Agent 注入到 DeepSeek 上下文中
 */
export async function searchAndExtract(
  query: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey || !query.trim()) return '';

  console.log('[WebSearch] searchAndExtract, 查询:', query.slice(0, 60));

  try {
    const response = await fetch(DASHSCOPE_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        messages: [
          {
            role: 'system',
            content:
              '你是一个联网搜索助手。请根据搜索结果，整理出与用户问题相关的关键事实信息。'
              + '输出要求：简洁、客观、有条理，列出关键事实要点和来源。不需要完整的回答，只需提供事实素材。',
          },
          { role: 'user', content: query.trim() },
        ],
        stream: false,
        enable_search: true,
        temperature: 0.3, // 低温度以获取更准确的事实
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WebSearch] 搜索失败 (${response.status}):`, errorText);
      return '';
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[WebSearch] ✅ 事实提取完成, 长度:', content.length);
    return content;
  } catch (error: any) {
    reportError(error, {
      module: 'webSearch',
      action: 'searchAndExtract',
      extra: { queryPreview: query.slice(0, 120) },
    });
    return '';
  }
}

/**
 * 直接使用 Qwen + enable_search 流式回复（备用方案）
 */
export async function qwenSearchChat(
  messages: ApiMessage[],
  apiKey: string,
  onStream?: StreamCallback,
  temperature: number = 0.7,
): Promise<string> {
  if (!apiKey) return '';

  const body: any = {
    model: SEARCH_MODEL,
    messages,
    stream: !!onStream,
    temperature,
    enable_search: true,
  };

  if (!onStream) {
    // 非流式
    try {
      const response = await fetch(DASHSCOPE_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) return '';
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch {
      return '';
    }
  }

  // 流式 (XHR)
  return streamSearchWithXHR(DASHSCOPE_CHAT_URL, apiKey, body, onStream);
}

/**
 * XHR 流式搜索（React Native 兼容）
 */
function streamSearchWithXHR(
  url: string,
  apiKey: string,
  body: object,
  onStream: StreamCallback,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.responseType = 'text';

    let fullContent = '';
    let lastIndex = 0;
    let sseBuffer = '';

    const processNewData = () => {
      const newText = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;
      if (!newText) return;

      sseBuffer += newText;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            onStream(fullContent, false);
          }
        } catch {}
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.status >= 200 && xhr.status < 300) {
        try { processNewData(); } catch {}
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { processNewData(); } catch {}
        if (!fullContent && xhr.responseText) {
          try {
            const jsonData = JSON.parse(xhr.responseText);
            fullContent = jsonData.choices?.[0]?.message?.content || '';
          } catch {}
        }
        onStream(fullContent, true);
        resolve(fullContent);
      } else {
        reject(new Error(`联网搜索请求失败 (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('联网搜索网络连接失败'));
    xhr.timeout = 30000;
    xhr.ontimeout = () => reject(new Error('联网搜索超时'));
    xhr.send(JSON.stringify(body));
  });
}

// ==================== 向后兼容 ====================

export function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`).join('\n\n');
}

export async function webSearch(query: string, apiKey: string): Promise<WebSearchResult[]> {
  return [];
}
