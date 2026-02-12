/**
 * 全局错误处理（统一日志结构 + 预留 Sentry 接入点）
 */

export type ErrorLevel = 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorContext {
  module: string;
  action?: string;
  extra?: Record<string, any>;
}

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: any;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const anyErr = error as any;
    return {
      name: error.name || 'Error',
      message: error.message || '未知错误',
      stack: error.stack,
      code: anyErr?.code,
      cause: anyErr?.cause,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }

  return {
    name: 'UnknownError',
    message: '发生未知异常',
    cause: error,
  };
}

/**
 * 统一上报入口
 * 当前默认 console；未来可在此接入 @sentry/react-native。
 */
export function reportError(error: unknown, context: ErrorContext, level: ErrorLevel = 'error'): void {
  const normalized = normalizeError(error);
  const payload = {
    level,
    ...context,
    error: normalized,
    timestamp: Date.now(),
  };

  if (level === 'warning') {
    console.warn('[ErrorHandler]', JSON.stringify(payload));
  } else {
    console.error('[ErrorHandler]', JSON.stringify(payload));
  }

  // Sentry 预留接入点（可选）
  // if (SentryEnabled) {
  //   Sentry.captureException(error, { tags: { module: context.module, action: context.action }, extra: context.extra });
  // }
}

/** 将异常转换为用户友好文案 */
export function toUserFriendlyMessage(error: unknown): string {
  const msg = normalizeError(error).message || '';
  if (msg.includes('Network') || msg.includes('网络') || msg.includes('Failed to fetch')) {
    return '网络连接失败，请检查网络后重试。';
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return '请求超时，请稍后重试。';
  }
  if (msg.includes('401') || msg.includes('Unauthorized')) {
    return '认证失败，请检查 API Key。';
  }
  if (msg.includes('429') || msg.includes('rate')) {
    return '请求过于频繁，请稍后重试。';
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return '服务暂时不可用，请稍后重试。';
  }
  return msg ? `出错了：${msg.slice(0, 200)}` : '抱歉，发生了错误。';
}
