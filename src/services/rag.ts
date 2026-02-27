/**
 * RAG (检索增强生成) 服务
 * 核心：将新数据增量嵌入到向量库，查询时检索最相关的文本块
 * 支持多层 RAG（general 层为传统 RAG）
 */
import * as Crypto from 'expo-crypto';
import { getEmbedding, getBatchEmbeddings } from './embedding';
import { getBatchEmbeddingsByItems } from './embedding';
import type { EmbeddingInputItem } from './embedding';
import {
  addRagChunk,
  addRagChunks,
  getAllRagChunksWithEmbeddings,
  getChunksWithoutEmbeddings,
  updateChunkEmbedding,
} from './database';
import { findTopK } from '../utils/vectorSearch';
import { chunkMarkdown, chunkText, formatMessageForRag } from '../utils/markdown';
import type { RagChunk, RagSearchResult, Message, AppSettings } from '../types';

function isMarkdownSource(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export function resolveRagEmbeddingModel(
  settings: Pick<AppSettings, 'embeddingModel' | 'ragTextEmbeddingModel' | 'ragNonTextEmbeddingModel'>,
  sourceKind: 'text' | 'non_text' = 'text',
): string {
  if (sourceKind === 'non_text') {
    return settings.ragNonTextEmbeddingModel || settings.embeddingModel || 'qwen3-vl-embedding';
  }
  return settings.ragTextEmbeddingModel || settings.embeddingModel || 'text-embedding-v3';
}

/** 生成唯一 ID */
async function generateId(): Promise<string> {
  const uuid = Crypto.randomUUID();
  return uuid;
}

/**
 * 将聊天消息加入 RAG
 * 每轮对话（用户+助手）会被拼接并分块后存入
 */
export async function addChatToRag(
  messages: Message[],
  dashscopeApiKey: string,
  embeddingModel: string
): Promise<void> {
  if (!dashscopeApiKey || messages.length === 0) return;

  // 格式化消息为可索引文本
  const texts = messages.map((m) =>
    formatMessageForRag(m.role, m.content, m.createdAt)
  );
  const combinedText = texts.join('\n');

  // 分块
  const chunks = chunkText(combinedText, 500, 50);
  const ragChunks: RagChunk[] = [];

  for (const content of chunks) {
    const id = await generateId();
    ragChunks.push({
      id,
      source: 'chat',
      sourceId: messages[0].conversationId,
      content,
      embedding: null,
      embeddingModel,
      layer: 'general',
      createdAt: Date.now(),
    });
  }

  // 存入数据库（先不包含 embedding）
  await addRagChunks(ragChunks);

  // 异步计算 embedding 并更新
  try {
    const embeddings = await getBatchEmbeddings(
      chunks,
      dashscopeApiKey,
      embeddingModel
    );
    for (let i = 0; i < ragChunks.length; i++) {
      if (embeddings[i]) {
        await updateChunkEmbedding(ragChunks[i].id, embeddings[i], embeddingModel);
      }
    }
  } catch (error) {
    console.error('计算 embedding 失败，数据已存储，将在后续补充:', error);
  }
}

/**
 * 上传 Markdown 文件到 RAG
 */
export async function addMarkdownToRag(
  content: string,
  fileName: string,
  dashscopeApiKey: string,
  embeddingModel: string,
  sourceKind: 'text' | 'non_text' = 'text',
  embeddingInputs?: EmbeddingInputItem[],
): Promise<number> {
  if (!dashscopeApiKey) throw new Error('请先配置阿里云 API Key');

  const chunks = embeddingInputs?.length
    ? embeddingInputs.map((_, idx) => {
        const base = content.trim() || `【来源文件】${fileName}`;
        return embeddingInputs.length > 1 ? `${base}\n\n【片段】${idx + 1}` : base;
      })
    : isMarkdownSource(fileName)
      ? chunkMarkdown(content, 500, 50)
      : chunkText(content, 550, 70);
  const ragChunks: RagChunk[] = [];

  for (const text of chunks) {
    const id = await generateId();
    ragChunks.push({
      id,
      source: 'upload',
      sourceId: fileName,
      content: text,
      embedding: null,
      embeddingModel,
      layer: 'general',
      createdAt: Date.now(),
    });
  }

  await addRagChunks(ragChunks);

  // 计算 embedding
  try {
    const embeddings = embeddingInputs?.length
      ? await getBatchEmbeddingsByItems(embeddingInputs, dashscopeApiKey, embeddingModel)
      : await getBatchEmbeddings(
          chunks,
          dashscopeApiKey,
          embeddingModel
        );
    for (let i = 0; i < ragChunks.length; i++) {
      if (embeddings[i]) {
        await updateChunkEmbedding(ragChunks[i].id, embeddings[i], embeddingModel);
      }
    }
  } catch (error) {
    console.error('Embedding 计算失败:', error);
  }

  return chunks.length;
}

/**
 * RAG 检索：根据查询文本找到最相关的 RAG 块
 */
export async function searchRag(
  query: string,
  dashscopeApiKey: string,
  embeddingModel: string,
  topK: number = 5
): Promise<RagSearchResult[]> {
  if (!dashscopeApiKey) return [];

  try {
    // 获取查询的 embedding
    // 从数据库获取所有有 embedding 的块
    const allChunks = await getAllRagChunksWithEmbeddings();

    if (allChunks.length === 0) return [];

    const modelGroups = new Map<string, typeof allChunks>();
    for (const chunk of allChunks) {
      const model = chunk.embeddingModel || embeddingModel;
      const list = modelGroups.get(model) || [];
      list.push(chunk as any);
      modelGroups.set(model, list);
    }

    const merged: Array<{ id: string; content: string; score: number }> = [];
    for (const [model, group] of modelGroups.entries()) {
      const queryEmbedding = await getEmbedding(query, dashscopeApiKey, model);
      const part = findTopK(queryEmbedding, group as any, topK);
      merged.push(...part);
    }

    const seen = new Set<string>();
    return merged
      .sort((a, b) => b.score - a.score)
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .slice(0, topK)
      .map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        source: 'rag',
        layer: 'general' as const,
      }));
  } catch (error) {
    console.error('RAG 搜索失败:', error);
    return [];
  }
}

/**
 * 处理未嵌入的 RAG 块
 * 用于补充之前因网络等原因未成功嵌入的数据
 */
export async function processUnembeddedChunks(
  dashscopeApiKey: string,
  embeddingModel: string,
  fallbackNonTextModel?: string,
): Promise<number> {
  if (!dashscopeApiKey) return 0;

  const chunks = await getChunksWithoutEmbeddings();
  if (chunks.length === 0) return 0;

  let processed = 0;
  try {
    const grouped = new Map<string, Array<{ idx: number; id: string; content: string }>>();
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const model = c.embeddingModel || (c.source === 'upload' && fallbackNonTextModel ? fallbackNonTextModel : embeddingModel);
      const arr = grouped.get(model) || [];
      arr.push({ idx: i, id: c.id, content: c.content });
      grouped.set(model, arr);
    }

    for (const [model, group] of grouped.entries()) {
      const embeddings = await getBatchEmbeddings(
        group.map((g) => g.content),
        dashscopeApiKey,
        model,
      );
      for (let i = 0; i < group.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          await updateChunkEmbedding(group[i].id, embeddings[i], model);
          processed++;
        }
      }
    }
  } catch (error) {
    console.error('补充 embedding 失败:', error);
  }

  return processed;
}
