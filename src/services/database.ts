/**
 * 本地 SQLite 数据库服务
 * 所有数据（对话、消息、RAG块、设置）均存储于本地
 * 支持多层 RAG（感性/理性/历史/通用）
 */
import * as SQLite from 'expo-sqlite';
import type {
  Conversation,
  Message,
  RagChunk,
  RagLayer,
  AppSettings,
} from '../types';

const DB_NAME = 'ai_helper.db';

let db: SQLite.SQLiteDatabase | null = null;

/** 获取数据库实例 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

/** 初始化数据库表 */
export async function initDatabase(): Promise<void> {
  const database = getDatabase();

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      image_uri TEXT,
      tool_calls TEXT,
      search_results TEXT,
      generated_image_url TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      content TEXT NOT NULL,
      embedding TEXT,
      layer TEXT DEFAULT 'general',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_rag_source ON rag_chunks(source);
    CREATE INDEX IF NOT EXISTS idx_rag_layer ON rag_chunks(layer);
  `);

  // 迁移：为旧数据添加 layer 字段
  try {
    await database.runAsync(
      "UPDATE rag_chunks SET layer = 'general' WHERE layer IS NULL"
    );
  } catch {}

  // 迁移：为旧 messages 表添加新字段
  try {
    await database.execAsync(`
      ALTER TABLE messages ADD COLUMN tool_calls TEXT;
    `);
  } catch {}
  try {
    await database.execAsync(`
      ALTER TABLE messages ADD COLUMN search_results TEXT;
    `);
  } catch {}
  try {
    await database.execAsync(`
      ALTER TABLE messages ADD COLUMN generated_image_url TEXT;
    `);
  } catch {}
}

// ==================== 对话管理 ====================

/** 创建新对话 */
export async function createConversation(
  id: string,
  title: string
): Promise<Conversation> {
  const now = Date.now();
  const database = getDatabase();
  await database.runAsync(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, title, now, now]
  );
  return { id, title, createdAt: now, updatedAt: now };
}

/** 获取所有对话（按时间倒序） */
export async function getAllConversations(): Promise<Conversation[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM conversations ORDER BY updated_at DESC'
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 更新对话标题 */
export async function updateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    [title, Date.now(), id]
  );
}

/** 更新对话时间 */
export async function touchConversation(id: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'UPDATE conversations SET updated_at = ? WHERE id = ?',
    [Date.now(), id]
  );
}

/** 删除对话及其消息 */
export async function deleteConversation(id: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync('DELETE FROM messages WHERE conversation_id = ?', [id]);
  await database.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
}

// ==================== 消息管理 ====================

/** 添加消息 */
export async function addMessage(message: Message): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT INTO messages (id, conversation_id, role, content, type, image_uri, tool_calls, search_results, generated_image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.type,
      message.imageUri || null,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.searchResults ? JSON.stringify(message.searchResults) : null,
      message.generatedImageUrl || null,
      message.createdAt,
    ]
  );
  await touchConversation(message.conversationId);
}

/** 更新消息内容（用于流式响应） */
export async function updateMessageContent(
  id: string,
  content: string
): Promise<void> {
  const database = getDatabase();
  await database.runAsync('UPDATE messages SET content = ? WHERE id = ?', [
    content,
    id,
  ]);
}

/** 获取对话的所有消息 */
export async function getMessages(
  conversationId: string
): Promise<Message[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    type: row.type || 'text',
    imageUri: row.image_uri,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    searchResults: row.search_results ? JSON.parse(row.search_results) : undefined,
    generatedImageUrl: row.generated_image_url || undefined,
    createdAt: row.created_at,
  }));
}

/** 获取最近 N 条消息（用于上下文） */
export async function getRecentMessages(
  conversationId: string,
  limit: number = 10
): Promise<Message[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?',
    [conversationId, limit]
  );
  return (rows as any[])
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      type: row.type || 'text',
      imageUri: row.image_uri,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      searchResults: row.search_results ? JSON.parse(row.search_results) : undefined,
      generatedImageUrl: row.generated_image_url || undefined,
      createdAt: row.created_at,
    }))
    .reverse();
}

// ==================== RAG 块管理 ====================

/** 添加 RAG 块 */
export async function addRagChunk(chunk: RagChunk): Promise<void> {
  const database = getDatabase();
  const embeddingStr = chunk.embedding ? JSON.stringify(chunk.embedding) : null;
  await database.runAsync(
    'INSERT OR REPLACE INTO rag_chunks (id, source, source_id, content, embedding, layer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [chunk.id, chunk.source, chunk.sourceId, chunk.content, embeddingStr, chunk.layer || 'general', chunk.createdAt]
  );
}

/** 批量添加 RAG 块 */
export async function addRagChunks(chunks: RagChunk[]): Promise<void> {
  const database = getDatabase();
  for (const chunk of chunks) {
    const embeddingStr = chunk.embedding ? JSON.stringify(chunk.embedding) : null;
    await database.runAsync(
      'INSERT OR REPLACE INTO rag_chunks (id, source, source_id, content, embedding, layer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [chunk.id, chunk.source, chunk.sourceId, chunk.content, embeddingStr, chunk.layer || 'general', chunk.createdAt]
    );
  }
}

/** 获取所有有 embedding 的 RAG 块 */
export async function getAllRagChunksWithEmbeddings(
  layer?: RagLayer
): Promise<
  Array<{ id: string; content: string; embedding: number[]; layer: RagLayer }>
> {
  const database = getDatabase();
  let query = 'SELECT id, content, embedding, layer FROM rag_chunks WHERE embedding IS NOT NULL';
  const params: any[] = [];
  if (layer) {
    query += ' AND layer = ?';
    params.push(layer);
  }
  const rows = await database.getAllAsync(query, params);
  return (rows as any[]).map((row) => ({
    id: row.id,
    content: row.content,
    embedding: JSON.parse(row.embedding),
    layer: row.layer || 'general',
  }));
}

/** 获取没有 embedding 的 RAG 块 */
export async function getChunksWithoutEmbeddings(): Promise<RagChunk[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM rag_chunks WHERE embedding IS NULL ORDER BY created_at ASC LIMIT 50'
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    content: row.content,
    embedding: null,
    layer: row.layer || 'general',
    createdAt: row.created_at,
  }));
}

/** 按层级获取 RAG 块 */
export async function getRagChunksByLayer(layer: RagLayer): Promise<RagChunk[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM rag_chunks WHERE layer = ? ORDER BY created_at DESC',
    [layer]
  );
  return (rows as any[]).map((row) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    content: row.content,
    embedding: row.embedding ? JSON.parse(row.embedding) : null,
    layer: row.layer,
    createdAt: row.created_at,
  }));
}

/** 清除指定层级的旧数据（用于感性层滚动更新） */
export async function clearOldRagChunks(
  layer: RagLayer,
  keepCount: number
): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    `DELETE FROM rag_chunks WHERE layer = ? AND id NOT IN (
      SELECT id FROM rag_chunks WHERE layer = ? ORDER BY created_at DESC LIMIT ?
    )`,
    [layer, layer, keepCount]
  );
}

/** 替换指定层级的所有数据（用于理性层整体更新） */
export async function replaceRagLayer(
  layer: RagLayer,
  chunks: RagChunk[]
): Promise<void> {
  const database = getDatabase();
  await database.runAsync('DELETE FROM rag_chunks WHERE layer = ?', [layer]);
  for (const chunk of chunks) {
    const embeddingStr = chunk.embedding ? JSON.stringify(chunk.embedding) : null;
    await database.runAsync(
      'INSERT INTO rag_chunks (id, source, source_id, content, embedding, layer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [chunk.id, chunk.source, chunk.sourceId, chunk.content, embeddingStr, layer, chunk.createdAt]
    );
  }
}

/** 更新 RAG 块的 embedding */
export async function updateChunkEmbedding(
  id: string,
  embedding: number[]
): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'UPDATE rag_chunks SET embedding = ? WHERE id = ?',
    [JSON.stringify(embedding), id]
  );
}

/** 获取 RAG 统计信息 */
export async function getRagStats(): Promise<{
  totalChunks: number;
  embeddedChunks: number;
  chatChunks: number;
  uploadChunks: number;
}> {
  const database = getDatabase();
  const total = (await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM rag_chunks'
  )) as any;
  const embedded = (await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM rag_chunks WHERE embedding IS NOT NULL'
  )) as any;
  const chat = (await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM rag_chunks WHERE source = 'chat'"
  )) as any;
  const upload = (await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM rag_chunks WHERE source = 'upload'"
  )) as any;

  return {
    totalChunks: total?.count || 0,
    embeddedChunks: embedded?.count || 0,
    chatChunks: chat?.count || 0,
    uploadChunks: upload?.count || 0,
  };
}

/** 清空所有 RAG 数据 */
export async function clearAllRagChunks(): Promise<void> {
  const database = getDatabase();
  await database.runAsync('DELETE FROM rag_chunks');
}

// ==================== 设置管理 ====================

/** 获取设置值 */
export async function getSetting(key: string): Promise<string | null> {
  const database = getDatabase();
  const row = (await database.getFirstAsync(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  )) as any;
  return row?.value || null;
}

/** 设置值 */
export async function setSetting(key: string, value: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

/** 获取所有设置 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const database = getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM settings');
  const settings: Record<string, string> = {};
  for (const row of rows as any[]) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ==================== 数据导入导出 ====================

/** 导出所有数据 */
export async function exportAllData(): Promise<{
  conversations: Conversation[];
  messages: Message[];
  ragChunks: RagChunk[];
}> {
  const conversations = await getAllConversations();
  const database = getDatabase();

  const msgRows = await database.getAllAsync(
    'SELECT * FROM messages ORDER BY created_at ASC'
  );
  const messages: Message[] = (msgRows as any[]).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    type: row.type || 'text',
    imageUri: row.image_uri,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    searchResults: row.search_results ? JSON.parse(row.search_results) : undefined,
    generatedImageUrl: row.generated_image_url || undefined,
    createdAt: row.created_at,
  }));

  const chunkRows = await database.getAllAsync(
    'SELECT * FROM rag_chunks ORDER BY created_at ASC'
  );
  const ragChunks: RagChunk[] = (chunkRows as any[]).map((row) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    content: row.content,
    embedding: row.embedding ? JSON.parse(row.embedding) : null,
    layer: row.layer || 'general',
    createdAt: row.created_at,
  }));

  return { conversations, messages, ragChunks };
}

/** 导入数据 */
export async function importAllData(data: {
  conversations: Conversation[];
  messages: Message[];
  ragChunks: RagChunk[];
}): Promise<void> {
  const database = getDatabase();

  for (const conv of data.conversations) {
    await database.runAsync(
      'INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [conv.id, conv.title, conv.createdAt, conv.updatedAt]
    );
  }

  for (const msg of data.messages) {
    await database.runAsync(
      'INSERT OR REPLACE INTO messages (id, conversation_id, role, content, type, image_uri, tool_calls, search_results, generated_image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        msg.id, msg.conversationId, msg.role, msg.content, msg.type,
        msg.imageUri || null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.searchResults ? JSON.stringify(msg.searchResults) : null,
        msg.generatedImageUrl || null,
        msg.createdAt,
      ]
    );
  }

  for (const chunk of data.ragChunks) {
    const embeddingStr = chunk.embedding ? JSON.stringify(chunk.embedding) : null;
    await database.runAsync(
      'INSERT OR REPLACE INTO rag_chunks (id, source, source_id, content, embedding, layer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [chunk.id, chunk.source, chunk.sourceId, chunk.content, embeddingStr, chunk.layer || 'general', chunk.createdAt]
    );
  }
}
