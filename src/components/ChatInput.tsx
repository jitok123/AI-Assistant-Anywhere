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
import { saveImageLocally } from '../utils/fileUtils';

export function ChatInput() {
  const colors = useTheme();
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { sendMessage, isLoading, stopGeneration, settings } =
    useAppStore();

  // 发送消息（文本 + 可选图片）
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;
    if (isLoading) return;

    const currentText = trimmed;
    const currentImage = pendingImage;
    setText('');
    setPendingImage(null);

    try {
      if (currentImage) {
        await sendMessage(currentText || '请描述这张图片', 'image', currentImage);
      } else {
        await sendMessage(currentText, 'text');
      }
    } catch (error: any) {
      Alert.alert('错误', error.message);
    }
  };

  // 移除待附加的图片
  const removePendingImage = () => {
    setPendingImage(null);
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
          setPendingImage(localUri);
        }
      }
    } catch (error: any) {
      Alert.alert('选择图片失败', error.message);
    }
  };

  return (
      <View>
        {/* 图片预览 */}
        {pendingImage && (
          <View style={[styles.imagePreviewRow, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
            <View style={styles.imagePreviewWrap}>
              <View style={[styles.imagePreviewPlaceholder, { backgroundColor: colors.inputBg }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>📷 图片已选择</Text>
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
          onPress={pickImage}
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
                backgroundColor: text.trim() ? colors.primary : colors.border,
              },
            ]}
            disabled={!text.trim() && !pendingImage}
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
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 0.5,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 图片按钮：圆形 +
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSymbol: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: -1,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxHeight: 120,
    marginHorizontal: 4,
  },
  input: {
    fontSize: 15,
    maxHeight: 100,
    lineHeight: 20,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
