/**
 * 知识库文件入库前处理：提取可用于 embedding 的文本 / 多模态输入
 */
import type { EmbeddingInputItem } from './embedding';
import type { KnowledgeUploadFile } from '../utils/fileUtils';
import { imageToBase64, readPdfTextSafely, readTextFileSafely } from '../utils/fileUtils';

export interface KnowledgeExtractionResult {
  text: string;
  warnings: string[];
  sourceKind: KnowledgeUploadFile['kind'];
  /** 可选：直接用于向量化的原始输入（如图片） */
  embeddingInputs?: EmbeddingInputItem[];
}

function wrapWithMeta(file: KnowledgeUploadFile, body: string): string {
  const kindLabel = file.kind === 'image' ? '图片' : file.kind === 'pdf' ? 'PDF' : '文本';
  return [
    `【来源文件】${file.name}`,
    `【文件类型】${kindLabel}${file.mimeType ? ` (${file.mimeType})` : ''}`,
    '',
    body.trim(),
  ].join('\n');
}

async function buildImageEmbeddingInput(file: KnowledgeUploadFile): Promise<EmbeddingInputItem> {
  const imageData = await imageToBase64(file.uri);
  return {
    kind: 'image',
    image: imageData,
  };
}

export async function extractKnowledgeText(
  file: KnowledgeUploadFile,
  _dashscopeApiKey: string,
): Promise<KnowledgeExtractionResult> {
  const warnings: string[] = [];

  if (file.kind === 'text') {
    const raw = await readTextFileSafely(file.uri, file.name, file.mimeType);
    if (!raw.trim()) {
      return { text: '', warnings: ['文本文件内容为空或不可读取'], sourceKind: file.kind };
    }
    return { text: wrapWithMeta(file, raw), warnings, sourceKind: file.kind };
  }

  if (file.kind === 'pdf') {
    const raw = await readPdfTextSafely(file.uri, 30000);
    if (!raw.trim()) {
      warnings.push('PDF 未能提取到可用文本（可能是扫描件），可改为上传图片后再入库');
      return {
        text: wrapWithMeta(file, '该 PDF 当前无法提取正文，仅记录了文件元信息。'),
        warnings,
        sourceKind: file.kind,
      };
    }
    return { text: wrapWithMeta(file, raw), warnings, sourceKind: file.kind };
  }

  if (file.kind === 'image') {
    try {
      const embeddingInput = await buildImageEmbeddingInput(file);
      warnings.push('图片已走快速入库：使用 qwen3-vl-embedding 直接向量化，不再调用 qwen-vl-max OCR。');
      return {
        text: wrapWithMeta(file, '图片已入库（快速模式：不做 OCR 全文提取）。可通过图文语义检索召回。'),
        warnings,
        sourceKind: file.kind,
        embeddingInputs: [embeddingInput],
      };
    } catch (error) {
      console.warn('图片快速入库失败:', error);
      warnings.push('图片向量化准备失败，仅记录文件元信息');
      return {
        text: wrapWithMeta(file, '图片入库失败，建议稍后重试。'),
        warnings,
        sourceKind: file.kind,
      };
    }
  }

  return { text: '', warnings: ['该格式当前不支持入库'], sourceKind: file.kind };
}
