/**
 * 知识库文件入库前处理：提取可用于 embedding 的纯文本
 */
import type { ApiMessage } from '../types';
import type { KnowledgeUploadFile } from '../utils/fileUtils';
import { imageToBase64, readPdfTextSafely, readTextFileSafely } from '../utils/fileUtils';
import { chatCompletion } from './deepseek';
import { getDashScopeCompatibleBaseUrl } from '../config/api';

export interface KnowledgeExtractionResult {
  text: string;
  warnings: string[];
  sourceKind: KnowledgeUploadFile['kind'];
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

async function extractFromImage(file: KnowledgeUploadFile, dashscopeApiKey: string): Promise<string> {
  const imageData = await imageToBase64(file.uri);

  const messages: ApiMessage[] = [
    {
      role: 'system',
      content:
        '你是知识库预处理助手。任务：从图片中提取可检索文本。'
        + '输出要求：1) 尽量OCR提取原文；2) 再给出3-8条事实要点；3) 用中文；4) 禁止编造。',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `请提取这张图片中的文字与关键信息，用于构建本地知识库。文件名：${file.name}` },
        { type: 'image_url', image_url: { url: imageData } },
      ],
    },
  ];

  return chatCompletion(
    messages,
    dashscopeApiKey,
    getDashScopeCompatibleBaseUrl(),
    'qwen-vl-max',
    undefined,
    0.2,
    1800,
  );
}

export async function extractKnowledgeText(
  file: KnowledgeUploadFile,
  dashscopeApiKey: string,
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
      const visualText = await extractFromImage(file, dashscopeApiKey);
      if (!visualText.trim()) {
        warnings.push('图片识别结果为空，仅记录文件元信息');
        return {
          text: wrapWithMeta(file, '图片已上传，但未识别到可用文本。'),
          warnings,
          sourceKind: file.kind,
        };
      }
      return { text: wrapWithMeta(file, visualText), warnings, sourceKind: file.kind };
    } catch (error) {
      console.warn('图片知识提取失败:', error);
      warnings.push('图片识别失败，仅记录文件元信息');
      return {
        text: wrapWithMeta(file, '图片识别失败，建议稍后重试。'),
        warnings,
        sourceKind: file.kind,
      };
    }
  }

  return { text: '', warnings: ['该格式当前不支持入库'], sourceKind: file.kind };
}
