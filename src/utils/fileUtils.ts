/**
 * 文件操作工具
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import type { ExportData } from '../types';

/** 应用数据目录 */
const DATA_DIR = FileSystem.documentDirectory + 'ai_helper/';
const EXPORT_DIR = FileSystem.documentDirectory + 'exports/';

export type KnowledgeFileKind = 'text' | 'pdf' | 'image' | 'unsupported';

export interface KnowledgeUploadFile {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  kind: KnowledgeFileKind;
}

const TEXT_FILE_EXTENSIONS = [
  '.md', '.markdown', '.txt', '.csv', '.json', '.log', '.xml', '.yaml', '.yml', '.html', '.htm', '.rtf'
];
const IMAGE_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp'];

function isMarkdownLikeFile(name?: string, mimeType?: string): boolean {
  const lowerName = (name || '').toLowerCase();
  const byExt = ['.md', '.markdown', '.txt'].some((ext) => lowerName.endsWith(ext));
  const mt = (mimeType || '').toLowerCase();
  const byMime = mt.startsWith('text/') || mt.includes('markdown') || mt.includes('plain');
  return byExt || byMime;
}

function getKnowledgeFileKind(name?: string, mimeType?: string): KnowledgeFileKind {
  const lowerName = (name || '').toLowerCase();
  const mt = (mimeType || '').toLowerCase();

  const isTextByExt = TEXT_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const isTextByMime = mt.startsWith('text/') || mt.includes('json') || mt.includes('xml') || mt.includes('csv');
  if (isTextByExt || isTextByMime) return 'text';

  if (lowerName.endsWith('.pdf') || mt.includes('pdf')) return 'pdf';

  const isImageByExt = IMAGE_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const isImageByMime = mt.startsWith('image/');
  if (isImageByExt || isImageByMime) return 'image';

  return 'unsupported';
}

function decodeBase64ToLatin1(base64: string, maxOutputChars: number = 3_200_000): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const cleaned = (base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  let output = '';

  for (let i = 0; i < cleaned.length; i += 4) {
    const enc1 = alphabet.indexOf(cleaned.charAt(i));
    const enc2 = alphabet.indexOf(cleaned.charAt(i + 1));
    const enc3 = alphabet.indexOf(cleaned.charAt(i + 2));
    const enc4 = alphabet.indexOf(cleaned.charAt(i + 3));

    if (enc1 < 0 || enc2 < 0) continue;

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    output += String.fromCharCode(chr1);

    if (enc3 !== 64 && enc3 >= 0) {
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      output += String.fromCharCode(chr2);
    }
    if (enc4 !== 64 && enc4 >= 0) {
      const chr3 = ((enc3 & 3) << 6) | enc4;
      output += String.fromCharCode(chr3);
    }

    if (output.length >= maxOutputChars) {
      return output.slice(0, maxOutputChars);
    }
  }

  return output;
}

function extractPdfStrings(segment: string): string[] {
  const strings: string[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let current = '';

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];

    if (!inString) {
      if (ch === '(') {
        inString = true;
        depth = 1;
        current = '';
      }
      continue;
    }

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '(') {
      depth += 1;
      current += ch;
      continue;
    }

    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        strings.push(current);
        inString = false;
        continue;
      }
      current += ch;
      continue;
    }

    current += ch;
  }

  return strings;
}

function decodePdfEscapes(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractTextFromPdfBinary(binary: string): string {
  const btBlocks = binary.match(/BT[\s\S]*?ET/g) || [];
  const textParts: string[] = [];

  for (const block of btBlocks) {
    const strings = extractPdfStrings(block);
    for (const s of strings) {
      const decoded = decodePdfEscapes(s).trim();
      if (decoded) textParts.push(decoded);
    }
  }

  if (textParts.length > 0) {
    return textParts.join('\n');
  }

  const fallback = binary.match(/[\x20-\x7E\u4e00-\u9fa5]{5,}/g) || [];
  return fallback.join('\n');
}

/** 轻量提取 PDF 文本（适用于文本型 PDF；扫描件建议转图片 OCR） */
export async function readPdfTextSafely(uri: string, maxChars: number = 20000): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = decodeBase64ToLatin1(base64, 3_200_000);
    const raw = extractTextFromPdfBinary(binary)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return raw.slice(0, maxChars);
  } catch (error) {
    console.warn('读取 PDF 失败:', error);
    return '';
  }
}

/** 确保目录存在 */
export async function ensureDirectory(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/** 选择 Markdown 文件 */
export async function pickMarkdownFile(): Promise<{
  name: string;
  content: string;
} | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets.find((a) => isMarkdownLikeFile(a.name, a.mimeType));
    if (!asset) return null;
    const content = await FileSystem.readAsStringAsync(asset.uri);
    return { name: asset.name, content };
  } catch (error) {
    console.error('文件选择失败:', error);
    return null;
  }
}

/** 选择多个 Markdown 文件 */
export async function pickMarkdownFiles(): Promise<Array<{
  name: string;
  content: string;
}>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    const validAssets = result.assets.filter((asset) =>
      isMarkdownLikeFile(asset.name, asset.mimeType)
    );
    if (validAssets.length === 0) {
      return [];
    }

    const files: Array<{ name: string; content: string }> = [];
    for (const asset of validAssets) {
      try {
        const content = await FileSystem.readAsStringAsync(asset.uri);
        files.push({ name: asset.name, content });
      } catch (error) {
        console.warn(`读取文件失败: ${asset.name}`, error);
      }
    }
    return files;
  } catch (error) {
    console.error('多文件选择失败:', error);
    return [];
  }
}

/** 选择知识库文件（支持文本 / PDF / 图片） */
export async function pickKnowledgeFiles(): Promise<KnowledgeUploadFile[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    return result.assets
      .map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        kind: getKnowledgeFileKind(asset.name, asset.mimeType),
      }))
      .filter((f) => f.kind !== 'unsupported');
  } catch (error) {
    console.error('知识库文件选择失败:', error);
    return [];
  }
}

/** 选择任意文件（聊天附件） */
export async function pickChatFile(): Promise<{
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
} | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    };
  } catch (error) {
    console.error('文件选择失败:', error);
    return null;
  }
}

/** 选择多个聊天附件 */
export async function pickChatFiles(): Promise<Array<{
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}>> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    }));
  } catch (error) {
    console.error('多文件选择失败:', error);
    return [];
  }
}

/** 保存附件到本地 */
export async function saveFileLocally(
  sourceUri: string,
  originalName: string,
): Promise<string | null> {
  try {
    const filesDir = DATA_DIR + 'files/';
    await ensureDirectory(filesDir);

    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${safeName}`;
    const destUri = filesDir + filename;

    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return destUri;
  } catch (error) {
    console.error('文件保存失败:', error);
    return null;
  }
}

/** 尝试读取文本文件内容（非文本文件返回空字符串） */
export async function readTextFileSafely(
  uri: string,
  fileName: string,
  mimeType?: string,
): Promise<string> {
  try {
    const lowerName = fileName.toLowerCase();
    const isTextByExt = TEXT_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const isTextByMime = !!mimeType && (
      mimeType.startsWith('text/')
      || mimeType.includes('json')
      || mimeType.includes('xml')
      || mimeType.includes('csv')
    );

    if (!isTextByExt && !isTextByMime) return '';

    const content = await FileSystem.readAsStringAsync(uri);
    return content.slice(0, 12000);
  } catch (error) {
    console.warn('读取文本附件失败:', error);
    return '';
  }
}

/** 导出数据到文件并分享 */
export async function exportData(data: ExportData): Promise<boolean> {
  try {
    await ensureDirectory(EXPORT_DIR);
    const filename = `ai_helper_backup_${Date.now()}.json`;
    const filePath = EXPORT_DIR + filename;
    const jsonStr = JSON.stringify(data, null, 2);
    await FileSystem.writeAsStringAsync(filePath, jsonStr);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: '导出AI助手数据',
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('导出失败:', error);
    return false;
  }
}

/** 选择并导入数据文件 */
export async function importDataFile(): Promise<ExportData | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
    const data: ExportData = JSON.parse(content);

    // 基本验证
    if (!data.version || !data.conversations || !data.messages) {
      throw new Error('无效的备份文件格式');
    }
    // 兼容不含 ragChunks 的旧备份
    if (!data.ragChunks) {
      data.ragChunks = [];
    }

    return data;
  } catch (error) {
    console.error('导入失败:', error);
    return null;
  }
}

/** 保存图片到本地 */
export async function saveImageLocally(
  sourceUri: string
): Promise<string | null> {
  try {
    const imagesDir = DATA_DIR + 'images/';
    await ensureDirectory(imagesDir);
    const filename = `img_${Date.now()}.jpg`;
    const destUri = imagesDir + filename;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return destUri;
  } catch (error) {
    console.error('图片保存失败:', error);
    return null;
  }
}

/** 下载远程图片到本地目录（用于 AI 生成图片保存） */
export async function downloadRemoteImage(
  imageUrl: string,
): Promise<string | null> {
  try {
    const imagesDir = DATA_DIR + 'downloads/';
    await ensureDirectory(imagesDir);
    const filename = `ai_img_${Date.now()}.jpg`;
    const fileUri = imagesDir + filename;
    await FileSystem.downloadAsync(imageUrl, fileUri);
    return fileUri;
  } catch (error) {
    console.error('下载图片失败:', error);
    return null;
  }
}

/** 保存图片到系统相册（支持本地或远程 URL） */
export async function saveImageToGallery(imageUri: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      return false;
    }

    let localUri = imageUri;
    if (/^https?:\/\//i.test(imageUri)) {
      const downloaded = await downloadRemoteImage(imageUri);
      if (!downloaded) return false;
      localUri = downloaded;
    }

    await MediaLibrary.saveToLibraryAsync(localUri);
    return true;
  } catch (error) {
    console.error('保存到相册失败:', error);
    return false;
  }
}

/** 将图片转为 Base64 */
export async function imageToBase64(uri: string): Promise<string> {
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 960 } }],
      {
        compress: 0.6,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (manipulated.base64) {
      return `data:image/jpeg;base64,${manipulated.base64}`;
    }
  } catch (error) {
    console.warn('图片压缩失败，回退原图编码:', error);
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${base64}`;
}

/** 获取数据目录大小 */
export async function getStorageSize(): Promise<string> {
  try {
    await ensureDirectory(DATA_DIR);
    const info = await FileSystem.getInfoAsync(DATA_DIR);
    const bytes = (info as any).size || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return '未知';
  }
}
