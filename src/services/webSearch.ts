/**
 * 百度千帆 AI 联网搜索服务
 * API: https://qianfan.baidubce.com/v2/ai_search/web_search
 * 
 * 当 AI Agent 判断需要联网搜索时调用
 */
import type { WebSearchResult } from '../types';

const QIANFAN_SEARCH_URL = 'https://qianfan.baidubce.com/v2/ai_search/web_search';

/**
 * 百度千帆联网搜索
 */
export async function webSearch(
  query: string,
  apiKey: string,
  maxResults: number = 5,
): Promise<WebSearchResult[]> {
  if (!apiKey || !query.trim()) return [];

  try {
    const response = await fetch(QIANFAN_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: query.trim(),
        scope: 'all',
        top_n: maxResults,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`联网搜索失败 (${response.status}):`, errorText);
      return [];
    }

    const data = await response.json();

    // 解析百度千帆搜索结果
    const results: WebSearchResult[] = [];
    const searchResults = data?.results || data?.data?.results || [];

    for (const item of searchResults) {
      results.push({
        title: item.title || '',
        url: item.url || item.link || '',
        snippet: item.content || item.snippet || item.abstract || '',
      });
    }

    return results.slice(0, maxResults);
  } catch (error) {
    console.error('联网搜索错误:', error);
    return [];
  }
}

/**
 * 将搜索结果格式化为上下文文本
 */
export function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) return '';

  return results
    .map(
      (r, i) =>
        `[搜索结果${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`,
    )
    .join('\n\n');
}
