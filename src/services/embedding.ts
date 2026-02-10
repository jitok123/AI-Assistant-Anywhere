/**
 * 阿里云 DashScope Embedding API 服务
 * 用于文本向量化
 */

// 阿里云 DashScope Text Embedding API 端点
const DASHSCOPE_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

/** 获取文本的 embedding 向量 */
export async function getEmbedding(
  text: string,
  apiKey: string,
  model: string = 'text-embedding-v3'
): Promise<number[]> {
  // 清理和验证输入
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('文本内容不能为空');
  }
  if (!apiKey) {
    throw new Error('API Key 不能为空');
  }
  
  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: {
        texts: [cleanText],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API 请求失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const embedding = data?.output?.embeddings?.[0]?.embedding;

  if (!embedding) {
    throw new Error('Embedding 返回数据格式异常');
  }

  return embedding;
}

/** 批量获取 embedding（最多 25 条） */
export async function getBatchEmbeddings(
  texts: string[],
  apiKey: string,
  model: string = 'text-embedding-v3'
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!apiKey) {
    throw new Error('API Key 不能为空');
  }

  // 过滤空文本
  const validTexts = texts.map(t => t.trim()).filter(t => t.length > 0);
  if (validTexts.length === 0) return [];

  // DashScope 批量限制
  const batchSize = 25;
  const results: number[][] = [];

  for (let i = 0; i < validTexts.length; i += batchSize) {
    const batch = validTexts.slice(i, i + batchSize);
    
    const response = await fetch(DASHSCOPE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: {
          texts: batch,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch Embedding 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const embeddings = data?.output?.embeddings;

    if (!embeddings || embeddings.length !== batch.length) {
      throw new Error('Batch Embedding 返回数据异常');
    }

    // DashScope 返回结果按 text_index 排序
    const sorted = [...embeddings].sort(
      (a: any, b: any) => a.text_index - b.text_index
    );
    results.push(...sorted.map((e: any) => e.embedding));
  }

  return results;
}
