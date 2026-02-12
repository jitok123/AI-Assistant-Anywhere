/**
 * 文件操作工具
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { ExportData } from '../types';

/** 应用数据目录 */
const DATA_DIR = FileSystem.documentDirectory + 'ai_helper/';
const EXPORT_DIR = FileSystem.documentDirectory + 'exports/';

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
      type: ['text/markdown', 'text/plain', 'text/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const content = await FileSystem.readAsStringAsync(asset.uri);
    return { name: asset.name, content };
  } catch (error) {
    console.error('文件选择失败:', error);
    return null;
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
    const textExt = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yaml', '.yml'];
    const isTextByExt = textExt.some((ext) => lowerName.endsWith(ext));
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

/** 将图片转为 Base64 */
export async function imageToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${base64}`;
}

/** 获取数据目录大小 */
export async function getStorageSize(): Promise<string> {
  try {
    await ensureDirectory(DATA_DIR);
    const info = await FileSystem.getInfoAsync(DATA_DIR, { size: true });
    const bytes = (info as any).size || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return '未知';
  }
}
