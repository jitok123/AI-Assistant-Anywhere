/**
 * DeepSeek API 服务
 * 支持流式和非流式对话
 */
import type { ApiMessage, StreamCallback } from '../types';

/**
 * 🤖 对话模型 API 调用
 * 兼容所有 OpenAI Chat Completions 格式的 API
 * 包括：DeepSeek / 通义千问 / Kimi / GLM / OpenAI / Ollama 等
 * 模型预设列表见: config/models.ts
 */
export async function chatCompletion(
  messages: ApiMessage[],
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com',
  model: string = 'deepseek-chat',
  onStream?: StreamCallback,
  temperature: number = 0.7,
  maxTokens: number = 4096
): Promise<string> {
  // ⚡ 所有兼容 OpenAI 格式的 API 都通过 /v1/chat/completions 端点
  const url = `${baseUrl}/v1/chat/completions`;
  const isStream = !!onStream;

  const body = {
    model,
    messages,
    stream: isStream,
    temperature,
    max_tokens: maxTokens,
  };

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
    throw new Error(`API请求失败 (${response.status}): ${errorText}`);
  }

  if (isStream && response.body) {
    return handleStreamResponse(response, onStream!);
  } else {
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  }
}

/** 处理流式响应 */
async function handleStreamResponse(
  response: Response,
  onStream: StreamCallback
): Promise<string> {
  let fullContent = '';

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onStream(fullContent, true);
          return fullContent;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onStream(fullContent, false);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  onStream(fullContent, true);
  return fullContent;
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
    // 生成标题失败时，截取用户消息前15个字
    return userMessage.slice(0, 15) + (userMessage.length > 15 ? '...' : '');
  }
}
