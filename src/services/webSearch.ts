/**
 * 联网搜索服务 — 阿里云 DashScope Qwen + enable_search
 *
 * 使用 Qwen 模型的内置联网搜索能力，通过 OpenAI 兼容接口调用。
 * 无需额外搜索 API Key，直接使用 DashScope API Key。
 *
 * API: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 *      添加 enable_search: true 参数
 */
import type { WebSearchResult, ApiMessage, StreamCallback } from '../types';

/** DashScope OpenAI 兼容端点 */
const DASHSCOPE_CHAT_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/** 用于联网搜索的 Qwen 模型（快速、支持联网搜索） */
const SEARCH_MODEL = 'qwen-plus';

/**
 * 🔍 使用 Qwen + enable_search 进行联网搜索并生成回复
 * 支持流式输出，直接返回完整内容
 */
export async function qwenSearchChat(
  messages: ApiMessage[],
  apiKey: string,
  onStream?: StreamCallback,
  temperature: number = 0.7,
): Promise<string> {
  if (!apiKey) {
    console.warn('[WebSearch] 缺少 DashScope API Key');
    return '';
  }

  console.log('[WebSearch] 开始联网搜索, 模型:', SEARCH_MODEL);

  const body: any = {
    model: SEARCH_MODEL,
    messages,
    stream: !!onStream,
    temperature,
    enable_search: true,
  };

  if (onStream) {
    return streamSearchWithXHR(DASHSCOPE_CHAT_URL, apiKey, body, onStream);
  }

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WebSearch] 请求失败 (${response.status}):`, errorText);
      return '';
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[WebSearch] ✅ 搜索完成, 内容长度:', content.length);
    return content;
  } catch (error: any) {
    console.error('[WebSearch] 错误:', error?.message || error);
    return '';
  }
}

/**
 * XHR 流式联网搜索（React Native 兼容）
 * 使用 XMLHttpRequest 替代 fetch 实现流式传输
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

    /** 增量解析 SSE 数据 */
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
        } catch {
          // 忽略不完整的 JSON 数据块
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.status >= 200 && xhr.status < 300) {
        try {
          processNewData();
        } catch {}
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          processNewData();
        } catch {}

        // 如果流式没有拿到内容，尝试作为普通 JSON 解析
        if (!fullContent && xhr.responseText) {
          try {
            const jsonData = JSON.parse(xhr.responseText);
            fullContent = jsonData.choices?.[0]?.message?.content || '';
          } catch {
            // 尝试从 SSE 文本中完整解析
            const allLines = xhr.responseText.split('\n');
            for (const line of allLines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const d = trimmed.slice(6);
              if (d === '[DONE]') continue;
              try {
                const p = JSON.parse(d);
                const c = p.choices?.[0]?.delta?.content;
                if (c) fullContent += c;
              } catch {}
            }
          }
        }

        console.log('[WebSearch] ✅ 流式搜索完成, 内容长度:', fullContent.length);
        onStream(fullContent, true);
        resolve(fullContent);
      } else {
        const errMsg = xhr.responseText?.substring(0, 300) || '未知错误';
        reject(new Error(`联网搜索请求失败 (${xhr.status}): ${errMsg}`));
      }
    };

    xhr.onerror = () => reject(new Error('联网搜索网络连接失败'));
    xhr.timeout = 60000;
    xhr.ontimeout = () => reject(new Error('联网搜索请求超时（60秒）'));
    xhr.send(JSON.stringify(body));
  });
}

// ==================== 旧接口兼容 ====================

/**
 * 格式化搜索结果为文本（保留向后兼容）
 */
export function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`)
    .join('\n\n');
}

/**
 * @deprecated 旧版搜索接口，已替换为 qwenSearchChat
 */
export async function webSearch(
  query: string,
  apiKey: string,
): Promise<WebSearchResult[]> {
  console.warn('[WebSearch] webSearch() 已弃用，请使用 qwenSearchChat()');
  return [];
}
