/**
 * 聊天输入框组件
 * 支持文本输入、语音输入、图片选择
 */
import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';
import {
  startRecording,
  stopRecording,
  recognizeSpeech,
} from '../services/voice';
import { saveImageLocally } from '../utils/fileUtils';

export function ChatInput() {
  const colors = useTheme();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  const { sendMessage, isLoading, stopGeneration, chatMode, settings } =
    useAppStore();

  // 发送文本消息
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setText('');
    try {
      await sendMessage(trimmed, 'text');
    } catch (error: any) {
      Alert.alert('错误', error.message);
    }
  };

  // 开始/停止录音
  const toggleRecording = async () => {
    if (isRecording) {
      // 停止录音
      setIsRecording(false);
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      const uri = await stopRecording();
      if (uri && settings.dashscopeApiKey) {
        try {
          const recognizedText = await recognizeSpeech(
            uri,
            settings.dashscopeApiKey
          );
          if (recognizedText) {
            if (chatMode === 'voice') {
              // 语音模式直接发送
              await sendMessage(recognizedText, 'voice');
            } else {
              // 文本模式填入输入框
              setText(recognizedText);
            }
          }
        } catch (error: any) {
          Alert.alert('语音识别失败', error.message);
        }
      } else if (uri) {
        Alert.alert('提示', '请先在设置中配置阿里云 API Key 以使用语音识别');
      }
    } else {
      // 开始录音
      try {
        await startRecording();
        setIsRecording(true);
        // 录音动画
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.3,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        ).start();
      } catch (error: any) {
        Alert.alert('录音失败', error.message);
      }
    }
  };

  // 选择图片
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets[0]) {
        const localUri = await saveImageLocally(result.assets[0].uri);
        if (localUri) {
          const caption = text.trim() || '';
          setText('');
          await sendMessage(caption || '请描述这张图片', 'image', localUri);
        }
      }
    } catch (error: any) {
      Alert.alert('选择图片失败', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
        {/* 图片按钮 */}
        <TouchableOpacity
          onPress={pickImage}
          style={[styles.iconBtn]}
          disabled={isLoading}
        >
          <Text style={[styles.iconText, { color: colors.textSecondary }]}>📷</Text>
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

        {/* 语音按钮 */}
        <TouchableOpacity
          onPress={toggleRecording}
          style={[styles.iconBtn]}
          disabled={isLoading}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={[styles.iconText, { color: isRecording ? colors.error : colors.textSecondary }]}>
              {isRecording ? '⏹️' : '🎤'}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        {/* 发送/停止按钮 */}
        {isLoading ? (
          <TouchableOpacity
            onPress={stopGeneration}
            style={[styles.sendBtn, { backgroundColor: colors.error }]}
          >
            <Text style={styles.sendBtnText}>■</Text>
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
            disabled={!text.trim()}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
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
  iconText: {
    fontSize: 22,
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
});
