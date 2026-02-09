/**
 * 向量相似度搜索工具
 */

/** 计算两个向量的余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 在向量集合中查找最相似的 Top-K 结果 */
export function findTopK(
  queryEmbedding: number[],
  chunks: Array<{ id: string; content: string; embedding: number[] }>,
  k: number = 5
): Array<{ id: string; content: string; score: number }> {
  const scored = chunks
    .map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
