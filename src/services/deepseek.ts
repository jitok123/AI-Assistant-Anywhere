/**
 * DeepSeek API 服务
 * 支持流式和非流式对话，兼容 React Native
 * 
 * 流式方案：XMLHttpRequest (解决 RN 不支持 ReadableStream 的问题)
 * URL 智能拼接：自动处理 /v1 路径，兼容所有 OpenAI 格式 API
 * 网络容错：自动重试、超时处理
 */
import type { ApiMessage, StreamCallback, ChatCompletionOptions } from '../types';
import { buildOpenAIChatCompletionsUrl } from '../config/api';
import { reportError } from './errorHandler';

/** 网络请求重试配置 */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * 智能构建 API URL
 * 自动处理不同服务商的 BaseURL 格式差异
 */
function buildApiUrl(baseUrl: string): string {
  return buildOpenAIChatCompletionsUrl(baseUrl);
}

/**
 * 🤖 对话模型 API 调用
 * 兼容所有 OpenAI Chat Completions 格式的 API
 * 包括：DeepSeek / 通义千问 / Kimi / GLM / OpenAI / Ollama 等
 */
export async function chatCompletion(
  messages: ApiMessage[],
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com',
  model: string = 'deepseek-chat',
  onStream?: StreamCallback,
  temperature: number = 0.7,
  maxTokens: number = 4096,
  tools?: any[],
): Promise<string> {
  const url = buildApiUrl(baseUrl);
  const isStream = !!onStream;

  const body: any = {
    model,
    messages,
    stream: isStream,
    temperature,
    max_tokens: maxTokens,
  };

  // 添加函数调用工具定义
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  if (isStream) {
    // 🔑 使用 XMLHttpRequest 流式传输 (React Native 兼容)
    return streamWithXHR(url, apiKey, body, onStream!);
  }

  // 非流式请求（带重试）
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // 不对 4xx 客户端错误重试
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`API请求失败 (${response.status}): ${errorText}`);
        }
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      
      // DeepSeek Reasoner 模型返回 reasoning_content + content
      const content = choice?.message?.content || '';
      return content;
    } catch (error: any) {
      reportError(error, {
        module: 'deepseek',
        action: 'chatCompletion',
        extra: { model, attempt: attempt + 1 },
      }, attempt < MAX_RETRIES ? 'warning' : 'error');
      lastError = error;
      // 4xx 不重试
      if (error.message?.includes('(4')) throw error;
      if (attempt < MAX_RETRIES) {
        console.warn(`请求失败，${RETRY_DELAY_MS}ms 后重试 (${attempt + 1}/${MAX_RETRIES}):`, error.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError || new Error('请求失败');
}

/**
 * 非流式调用，返回完整的 choices 对象（用于 Agent 函数调用）
 */
export async function chatCompletionRaw(
  messages: ApiMessage[],
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com',
  model: string = 'deepseek-chat',
  temperature: number = 0.7,
  maxTokens: number = 4096,
  tools?: any[],
): Promise<any> {
  const url = buildApiUrl(baseUrl);
  const body: any = {
    model,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`API请求失败 (${response.status}): ${errorText}`);
        }
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (error: any) {
      reportError(error, {
        module: 'deepseek',
        action: 'chatCompletionRaw',
        extra: { model, attempt: attempt + 1 },
      }, attempt < MAX_RETRIES ? 'warning' : 'error');
      lastError = error;
      if (error.message?.includes('(4')) throw error;
      if (attempt < MAX_RETRIES) {
        console.warn(`Raw 请求重试 (${attempt + 1}/${MAX_RETRIES}):`, error.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError || new Error('请求失败');
}

/**
 * 🚀 XMLHttpRequest 流式传输
 * React Native 的 fetch 不支持 ReadableStream，
 * 使用 XHR 的 onreadystatechange 实现增量读取 SSE 数据
 */
function streamWithXHR(
  url: string,
  apiKey: string,
  body: object,
  onStream: StreamCallback
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.responseType = 'text';

    let fullContent = '';
    let reasoningContent = '';
    let lastIndex = 0;
    let sseBuffer = '';

    /** 解析新收到的 SSE 数据 */
    const processNewData = () => {
      const newText = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;
      if (!newText) return;

      sseBuffer += newText;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // DeepSeek Reasoner: reasoning_content
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
          }
          // 正常内容
          if (delta.content) {
            fullContent += delta.content;
            onStream(fullContent, false);
          }
        } catch {
          // 忽略 JSON 解析错误（不完整的数据块）
        }
      }
    };

    xhr.onreadystatechange = () => {
      // readyState 3 = LOADING（部分数据到达）
      if (xhr.readyState >= 3 && xhr.status >= 200 && xhr.status < 300) {
        try {
          processNewData();
        } catch {}
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // 处理剩余数据
        try { processNewData(); } catch {}
        // 如果没有通过流获取到内容，尝试作为普通 JSON 解析
        if (!fullContent && xhr.responseText) {
          try {
            const jsonData = JSON.parse(xhr.responseText);
            fullContent = jsonData.choices?.[0]?.message?.content || '';
          } catch {
            // 最后尝试从 SSE 文本中完整解析
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
        onStream(fullContent, true);
        resolve(fullContent);
      } else {
        const errMsg = xhr.responseText?.substring(0, 500) || '未知错误';
        reject(new Error(`API请求失败 (${xhr.status}): ${errMsg}`));
      }
    };

    xhr.onerror = () => reject(new Error('网络连接失败，请检查网络后重试'));
    xhr.timeout = 120000;
    xhr.ontimeout = () => reject(new Error('请求超时（120秒），请检查网络或减少输入长度'));
    xhr.send(JSON.stringify(body));
  });
}

/** 自动生成对话标题 */
export async function generateTitle(
  userMessage: string,
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com',
  model: string = 'deepseek-chat'
): Promise<string> {
  try {
    const messages: ApiMessage[] = [
      {
        role: 'system',
        content: '请根据用户的第一条消息生成一个简短的对话标题（不超过15个字），直接返回标题文本，不要加引号或其他格式。',
      },
      { role: 'user', content: userMessage },
    ];
    const title = await chatCompletion(messages, apiKey, baseUrl, model);
    return title.trim().slice(0, 30);
  } catch {
    return userMessage.slice(0, 15) + (userMessage.length > 15 ? '...' : '');
  }
}

/** 导出 buildApiUrl 供其他模块使用 */
export { buildApiUrl };
