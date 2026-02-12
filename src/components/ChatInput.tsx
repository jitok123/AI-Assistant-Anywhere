/**
 * 聊天输入框组件
 * 支持文本输入、图片选择
 */
import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';
import {
  pickChatFile,
  readTextFileSafely,
  saveFileLocally,
  saveImageLocally,
} from '../utils/fileUtils';

type PendingAttachment =
  | {
      kind: 'image';
      uri: string;
      name: string;
    }
  | {
      kind: 'file';
      uri: string;
      name: string;
      mimeType?: string;
      textContent?: string;
    };

export function ChatInput() {
  const colors = useTheme();
  const [text, setText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { sendMessage, isLoading, stopGeneration } =
    useAppStore();

  // 发送消息（文本 + 可选图片）
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingAttachment) return;
    if (isLoading) return;

    const currentText = trimmed;
    const attachment = pendingAttachment;
    setText('');
    setPendingAttachment(null);

    try {
      if (attachment?.kind === 'image') {
        await sendMessage(currentText || '请描述这张图片', 'image', attachment.uri);
      } else if (attachment?.kind === 'file') {
        await sendMessage(
          currentText || `请帮我分析文件：${attachment.name}`,
          'file',
          undefined,
          {
            uri: attachment.uri,
            name: attachment.name,
            mimeType: attachment.mimeType,
            textContent: attachment.textContent,
          },
        );
      } else {
        await sendMessage(currentText, 'text');
      }
    } catch (error: any) {
      Alert.alert('错误', error.message);
    }
  };

  // 移除待附加的图片
  const removePendingImage = () => {
    setPendingAttachment(null);
  };

  // 选择图片
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const localUri = await saveImageLocally(result.assets[0].uri);
        if (localUri) {
          setPendingAttachment({
            kind: 'image',
            uri: localUri,
            name: result.assets[0].fileName || '图片',
          });
        }
      }
    } catch (error: any) {
      Alert.alert('选择图片失败', error.message);
    }
  };

  // 选择文件
  const pickFile = async () => {
    try {
      const file = await pickChatFile();
      if (!file) return;

      const localUri = await saveFileLocally(file.uri, file.name);
      if (!localUri) {
        Alert.alert('提示', '文件保存失败，请重试');
        return;
      }

      const textContent = await readTextFileSafely(localUri, file.name, file.mimeType);

      setPendingAttachment({
        kind: 'file',
        uri: localUri,
        name: file.name,
        mimeType: file.mimeType,
        textContent,
      });
    } catch (error: any) {
      Alert.alert('选择文件失败', error.message || '未知错误');
    }
  };

  const chooseAttachment = () => {
    Alert.alert('添加附件', '请选择要添加的附件类型', [
      { text: '图片', onPress: pickImage },
      { text: '文件', onPress: pickFile },
      { text: '取消', style: 'cancel' },
    ]);
  };

  return (
      <View>
        {/* 图片预览 */}
        {pendingAttachment && (
          <View style={[styles.imagePreviewRow, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
            <View style={styles.imagePreviewWrap}>
              <View style={[styles.imagePreviewPlaceholder, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {pendingAttachment.kind === 'image' ? `📷 ${pendingAttachment.name}` : `📎 ${pendingAttachment.name}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={removePendingImage}
                style={styles.imageRemoveBtn}
              >
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={[styles.container, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
        {/* 图片按钮 */}
        <TouchableOpacity
          onPress={chooseAttachment}
          style={[styles.iconBtn]}
          disabled={isLoading}
          activeOpacity={0.6}
        >
          <View style={[styles.iconCircle, { borderColor: colors.border }]}>
            <Text style={[styles.iconSymbol, { color: colors.textSecondary }]}>+</Text>
          </View>
        </TouchableOpacity>

        {/* 输入框 */}
        <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            placeholder="输入消息..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={5000}
            editable={!isLoading}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
        </View>

        {/* 发送/停止按钮 */}
        {isLoading ? (
          <TouchableOpacity
            onPress={stopGeneration}
            style={[styles.sendBtn, { backgroundColor: colors.error }]}
            activeOpacity={0.6}
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendBtn,
              {
                backgroundColor: text.trim() || pendingAttachment ? colors.primary : colors.border,
              },
            ]}
            disabled={!text.trim() && !pendingAttachment}
            activeOpacity={0.6}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        )}
      </View>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  iconBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 图片按钮：圆形 +
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSymbol: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 46,
    maxHeight: 124,
    marginHorizontal: 8,
  },
  input: {
    fontSize: 15,
    maxHeight: 98,
    lineHeight: 21,
  },
  // 录音按钮
  micBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#FFF',
  },
  // 图片预览
  imagePreviewRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 0.5,
  },
  imagePreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagePreviewPlaceholder: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  imageRemoveBtn: {
    marginLeft: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
