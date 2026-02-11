/**
 * 阿里云 DashScope Embedding API 服务
 * 使用 OpenAI 兼容格式端点
 */

// 阿里云 DashScope OpenAI 兼容格式 Embedding 端点
const DASHSCOPE_API_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

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
      input: cleanText,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API 请求失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;

  if (!embedding) {
    throw new Error('Embedding 返回数据格式异常');
  }

  return embedding;
}

/** 批量获取 embedding（最多 10 条/批） */
export async function getBatchEmbeddings(
  texts: string[],
  apiKey: string,
  model: string = 'text-embedding-v3'
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!apiKey) {
    console.warn('[Embedding] API Key 为空，跳过批量 embedding');
    return texts.map(() => []);
  }

  // 过滤空文本，记录原始索引映射
  const validEntries: { index: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]?.trim();
    if (t && t.length > 0) validEntries.push({ index: i, text: t });
  }
  if (validEntries.length === 0) return texts.map(() => []);

  // DashScope text-embedding-v3/v4 每次请求最多 10 条
  const batchSize = 10;
  const resultMap: Record<number, number[]> = {};

  for (let i = 0; i < validEntries.length; i += batchSize) {
    const batchEntries = validEntries.slice(i, i + batchSize);
    const batchTexts = batchEntries.map(e => e.text);
    
    try {
      const response = await fetch(DASHSCOPE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batchTexts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        console.error(`[Embedding] 批次请求失败 (${response.status}):`, errorText.slice(0, 200));
        continue; // 跳过失败的批次，继续处理下一批
      }

      const data = await response.json();
      const embeddings = data?.data;

      if (!embeddings || !Array.isArray(embeddings)) {
        console.error('[Embedding] 返回数据格式异常:', JSON.stringify(data).slice(0, 200));
        continue;
      }

      // OpenAI 兼容格式按 index 排序
      const sorted = [...embeddings].sort(
        (a: any, b: any) => (a.index || 0) - (b.index || 0)
      );
      for (let j = 0; j < sorted.length && j < batchEntries.length; j++) {
        const emb = sorted[j]?.embedding;
        if (emb && Array.isArray(emb)) {
          resultMap[batchEntries[j].index] = emb;
        }
      }
    } catch (err: any) {
      console.error('[Embedding] 批次异常:', err?.message?.slice(0, 200));
      continue; // 网络错误等，跳过继续
    }
  }

  // 按原始顺序返回结果，失败的位置返回空数组
  return texts.map((_, idx) => resultMap[idx] || []);
}
