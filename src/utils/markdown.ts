/**
 * Markdown 文本分块工具
 */

/** 按 Markdown 结构分块 */
export function chunkMarkdown(
  text: string,
  maxChunkSize: number = 500,
  overlap: number = 50
): string[] {
  // 按标题分割
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.length <= maxChunkSize) {
      chunks.push(trimmed);
    } else {
      // 长段落继续分割
      const subChunks = chunkByParagraph(trimmed, maxChunkSize, overlap);
      chunks.push(...subChunks);
    }
  }

  return chunks.filter((c) => c.length > 10); // 过滤过短的块
}

/** 按段落分块 */
function chunkByParagraph(
  text: string,
  maxChunkSize: number,
  overlap: number
): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const candidate = currentChunk
      ? currentChunk + '\n\n' + para
      : para;

    if (candidate.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // 添加重叠
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + para;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/** 通用文本分块 */
export function chunkText(
  text: string,
  maxChunkSize: number = 500,
  overlap: number = 50
): string[] {
  if (text.trim().length <= maxChunkSize) {
    return [text.trim()];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // 尝试在句号处断开
    if (end < text.length) {
      const searchText = text.slice(start, end);
      const breakPoints = [
        searchText.lastIndexOf('。'),
        searchText.lastIndexOf('！'),
        searchText.lastIndexOf('？'),
        searchText.lastIndexOf('.\n'),
        searchText.lastIndexOf('. '),
        searchText.lastIndexOf('\n\n'),
        searchText.lastIndexOf('\n'),
      ];
      const bestBreak = Math.max(...breakPoints);
      if (bestBreak > maxChunkSize * 0.3) {
        end = start + bestBreak + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end - overlap;
  }

  return chunks;
}

/** 从聊天消息创建可索引文本 */
export function formatMessageForRag(
  role: string,
  content: string,
  timestamp: number
): string {
  const date = new Date(timestamp).toLocaleString('zh-CN');
  const roleLabel = role === 'user' ? '用户' : 'AI助手';
  return `[${date}] ${roleLabel}: ${content}`;
}
