/**
 * RAG (检索增强生成) 服务
 * 核心：将新数据增量嵌入到向量库，查询时检索最相关的文本块
 */
import * as Crypto from 'expo-crypto';
import { getEmbedding, getBatchEmbeddings } from './embedding';
import {
  addRagChunk,
  addRagChunks,
  getAllRagChunksWithEmbeddings,
  getChunksWithoutEmbeddings,
  updateChunkEmbedding,
} from './database';
import { findTopK } from '../utils/vectorSearch';
import { chunkMarkdown, chunkText, formatMessageForRag } from '../utils/markdown';
import type { RagChunk, RagSearchResult, Message } from '../types';

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
        await updateChunkEmbedding(ragChunks[i].id, embeddings[i]);
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
  embeddingModel: string
): Promise<number> {
  if (!dashscopeApiKey) throw new Error('请先配置阿里云 API Key');

  const chunks = chunkMarkdown(content, 500, 50);
  const ragChunks: RagChunk[] = [];

  for (const text of chunks) {
    const id = await generateId();
    ragChunks.push({
      id,
      source: 'upload',
      sourceId: fileName,
      content: text,
      embedding: null,
      createdAt: Date.now(),
    });
  }

  await addRagChunks(ragChunks);

  // 计算 embedding
  try {
    const embeddings = await getBatchEmbeddings(
      chunks,
      dashscopeApiKey,
      embeddingModel
    );
    for (let i = 0; i < ragChunks.length; i++) {
      if (embeddings[i]) {
        await updateChunkEmbedding(ragChunks[i].id, embeddings[i]);
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
    const queryEmbedding = await getEmbedding(query, dashscopeApiKey, embeddingModel);

    // 从数据库获取所有有 embedding 的块
    const allChunks = await getAllRagChunksWithEmbeddings();

    if (allChunks.length === 0) return [];

    // 向量相似度搜索
    const results = findTopK(queryEmbedding, allChunks, topK);

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      source: 'rag',
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
  embeddingModel: string
): Promise<number> {
  if (!dashscopeApiKey) return 0;

  const chunks = await getChunksWithoutEmbeddings();
  if (chunks.length === 0) return 0;

  let processed = 0;
  const texts = chunks.map((c) => c.content);

  try {
    const embeddings = await getBatchEmbeddings(
      texts,
      dashscopeApiKey,
      embeddingModel
    );
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings[i]) {
        await updateChunkEmbedding(chunks[i].id, embeddings[i]);
        processed++;
      }
    }
  } catch (error) {
    console.error('补充 embedding 失败:', error);
  }

  return processed;
}
