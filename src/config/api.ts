/**
 * 统一 API 版本与端点配置
 * 目的：避免各服务模块硬编码路径，便于后续升级/切换。
 */

export const API_VERSION = {
  OPENAI_COMPAT: 'v1',
  DASHSCOPE_SERVICE: 'v1',
} as const;

export const API_ENDPOINTS = {
  DEEPSEEK_BASE: 'https://api.deepseek.com',
  DASHSCOPE_BASE: 'https://dashscope.aliyuncs.com',
} as const;

/** OpenAI 兼容 chat completions URL */
export function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (/\/v\d+$/.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/${API_VERSION.OPENAI_COMPAT}/chat/completions`;
}

/** DashScope 兼容模式 chat completions URL */
export function getDashScopeCompatibleChatUrl(): string {
  return `${API_ENDPOINTS.DASHSCOPE_BASE}/compatible-mode/${API_VERSION.OPENAI_COMPAT}/chat/completions`;
}

/** DashScope 兼容模式 base URL（供 chatCompletion 自动拼接） */
export function getDashScopeCompatibleBaseUrl(): string {
  return `${API_ENDPOINTS.DASHSCOPE_BASE}/compatible-mode/${API_VERSION.OPENAI_COMPAT}`;
}

/** DashScope 生图同步端点 URL */
export function getDashScopeImageGenerationUrl(): string {
  return `${API_ENDPOINTS.DASHSCOPE_BASE}/api/${API_VERSION.DASHSCOPE_SERVICE}/services/aigc/multimodal-generation/generation`;
}

/** DashScope 任务轮询端点 URL */
export function getDashScopeTaskBaseUrl(): string {
  return `${API_ENDPOINTS.DASHSCOPE_BASE}/api/${API_VERSION.DASHSCOPE_SERVICE}/tasks`;
}
