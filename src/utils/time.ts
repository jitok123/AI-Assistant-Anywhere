/**
 * 时间工具函数（本地工具）
 */

const CN_WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export interface TimeSnapshot {
  timestamp: number;
  iso: string;
  locale: string;
  date: string;
  time: string;
  weekDay: string;
  timezone: string;
}

/** 获取当前时间快照（本地设备时间） */
export function getTimeSnapshot(now = new Date()): TimeSnapshot {
  const timestamp = now.getTime();
  const weekDay = CN_WEEKDAYS[now.getDay()];

  return {
    timestamp,
    iso: now.toISOString(),
    locale: now.toLocaleString('zh-CN', { hour12: false }),
    date: now.toLocaleDateString('zh-CN'),
    time: now.toLocaleTimeString('zh-CN', { hour12: false }),
    weekDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  };
}

/**
 * 生成可注入系统提示词的时间上下文
 * 用于减少“把当前日期误判为未来/过去”的幻觉
 */
export function buildTimeContextLine(): string {
  const t = getTimeSnapshot();
  return `【当前时间锚点】现在是 ${t.locale}（${t.weekDay}，时区 ${t.timezone}，Unix ${t.timestamp}）。涉及“今天/昨天/未来事件”时，必须以此时间为准。`;
}

/** 检测是否是时间查询意图 */
export function detectTimeIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const patterns: RegExp[] = [
    /现在几点|几点了|当前时间|现在时间|北京时间/, 
    /今天几号|今天日期|当前日期|几月几号|星期几|周几/,
    /时间戳|unix|timestamp/i,
    /what time|current time|today'?s date|date today|day of week/i,
  ];

  return patterns.some((p) => p.test(t));
}

/** 时间工具输出（可直接给用户） */
export function formatTimeToolAnswer(): string {
  const t = getTimeSnapshot();
  return [
    `现在时间：${t.locale}`,
    `今天日期：${t.date}（${t.weekDay}）`,
    `时区：${t.timezone}`,
    `Unix 时间戳：${t.timestamp}`,
  ].join('\n');
}
