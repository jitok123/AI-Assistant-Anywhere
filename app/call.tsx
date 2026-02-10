/**
 * 实时语音通话页面
 * 
 * 类似豆包打电话功能：
 * - 全屏通话界面，大圆形脉冲动画
 * - 按住说话 / 自动语音激活
 * - AI 回复自动朗读（TTS）
 * - 结合 RAG 记忆系统，通话也有上下文
 * - 通话记录自动保存到对话中
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Alert,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import {
  startRecording,
  stopRecording,
  recognizeSpeech,
  speak,
  stopSpeaking,
} from '../src/services/voice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type CallState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function CallScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { settings, sendMessage, messages } = useAppStore();

  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isInCall, setIsInCall] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  // 通话计时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 动画
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 启动脉冲动画
  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  // 启动涟漪动画
  const startRippleAnimation = useCallback(() => {
    const createRipple = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    };
    createRipple(ringAnim1, 0).start();
    createRipple(ringAnim2, 1000).start();
  }, [ringAnim1, ringAnim2]);

  // 开始通话
  const startCall = () => {
    if (!settings.dashscopeApiKey) {
      Alert.alert('提示', '请先在设置中配置阿里云 API Key 以使用语音功能');
      return;
    }
    setIsInCall(true);
    setCallDuration(0);
    setCurrentText('');
    setAiResponse('准备就绪，请开始说话');
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
    startPulseAnimation();
    startRippleAnimation();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // 结束通话
  const endCall = () => {
    setIsInCall(false);
    setCallState('idle');
    stopSpeaking();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pulseAnim.stopAnimation();
    ringAnim1.stopAnimation();
    ringAnim2.stopAnimation();
    pulseAnim.setValue(1);
    ringAnim1.setValue(0);
    ringAnim2.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  };

  // 按下录音
  const handlePressIn = async () => {
    if (!isInCall || callState === 'processing') return;
    stopSpeaking();
    setCallState('listening');
    setCurrentText('正在聆听...');
    try {
      await startRecording();
    } catch (err: any) {
      Alert.alert('录音失败', err.message);
      setCallState('idle');
    }
  };

  // 松开停止录音并处理
  const handlePressOut = async () => {
    if (callState !== 'listening') return;
    setCallState('processing');
    setCurrentText('正在识别...');

    try {
      const uri = await stopRecording();
      if (!uri) {
        setCallState('idle');
        setCurrentText('');
        return;
      }

      // 语音识别
      const text = await recognizeSpeech(uri, settings.dashscopeApiKey);
      if (!text.trim()) {
        setCallState('idle');
        setCurrentText('没有听清，请再说一次');
        return;
      }

      setCurrentText(text);

      // 发送消息给 AI（复用 store 的 sendMessage，带 RAG 上下文）
      await sendMessage(text, 'voice');

      // 获取最新的 AI 回复
      const latestMessages = useAppStore.getState().messages;
      const lastAiMsg = latestMessages.filter((m) => m.role === 'assistant').pop();

      if (lastAiMsg?.content) {
        setAiResponse(lastAiMsg.content);
        setCallState('speaking');

        // TTS 朗读
        speak(lastAiMsg.content, () => {
          if (useAppStore.getState()) {
            setCallState('idle');
            setCurrentText('');
          }
        });
      } else {
        setCallState('idle');
      }
    } catch (err: any) {
      console.error('通话处理错误:', err);
      setAiResponse('抱歉，出现了错误');
      setCallState('idle');
    }
  };

  // 格式化时间
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 状态文本
  const stateLabel = {
    idle: '按住说话',
    listening: '正在聆听...',
    processing: '思考中...',
    speaking: 'AI 回复中',
  };

  // 状态颜色
  const stateColor = {
    idle: colors.primary,
    listening: colors.error,
    processing: colors.textSecondary,
    speaking: colors.success,
  };

  // 清理
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* 返回按钮 */}
      <TouchableOpacity
        onPress={isInCall ? endCall : () => router.back()}
        style={styles.backBtn}
        activeOpacity={0.7}
      >
        <Text style={[styles.backText, { color: colors.textSecondary }]}>
          {isInCall ? '挂断' : '返回'}
        </Text>
      </TouchableOpacity>

      {/* 顶部信息区 */}
      <View style={styles.topSection}>
        <View style={[styles.aiAvatar, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.aiAvatarText, { color: colors.primary }]}>AI</Text>
        </View>
        <Text style={[styles.aiName, { color: colors.text }]}>AI 助手</Text>
        {isInCall && (
          <Text style={[styles.duration, { color: colors.textSecondary }]}>
            {formatDuration(callDuration)}
          </Text>
        )}
      </View>

      {/* 中间对话区 */}
      <View style={styles.dialogSection}>
        {currentText ? (
          <View style={[styles.dialogBubble, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.dialogLabel, { color: colors.primary }]}>你说：</Text>
            <Text style={[styles.dialogText, { color: colors.text }]} numberOfLines={3}>
              {currentText}
            </Text>
          </View>
        ) : null}

        {aiResponse ? (
          <View style={[styles.dialogBubble, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5 }]}>
            <Text style={[styles.dialogLabel, { color: colors.success }]}>AI：</Text>
            <Text style={[styles.dialogText, { color: colors.text }]} numberOfLines={5}>
              {aiResponse}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 底部操作区 */}
      <View style={styles.bottomSection}>
        {/* 状态指示 */}
        <Text style={[styles.stateLabel, { color: stateColor[callState] }]}>
          {isInCall ? stateLabel[callState] : '点击开始通话'}
        </Text>

        {/* 涟漪动画 */}
        {isInCall && (
          <>
            <Animated.View
              style={[
                styles.ripple,
                {
                  borderColor: stateColor[callState],
                  opacity: ringAnim1.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 0],
                  }),
                  transform: [
                    {
                      scale: ringAnim1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.5],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ripple,
                {
                  borderColor: stateColor[callState],
                  opacity: ringAnim2.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 0],
                  }),
                  transform: [
                    {
                      scale: ringAnim2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.5],
                      }),
                    },
                  ],
                },
              ]}
            />
          </>
        )}

        {/* 主按钮 */}
        {!isInCall ? (
          <TouchableOpacity
            onPress={startCall}
            style={[styles.mainBtn, { backgroundColor: colors.success }]}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <View style={styles.phoneIcon}>
                <Text style={styles.phoneIconText}>T</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
              styles.mainBtn,
              {
                backgroundColor:
                  callState === 'listening'
                    ? colors.error
                    : callState === 'processing'
                    ? colors.textTertiary
                    : callState === 'speaking'
                    ? colors.success
                    : colors.primary,
              },
            ]}
            activeOpacity={0.7}
            disabled={callState === 'processing'}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <View style={styles.phoneIcon}>
                <Text style={styles.phoneIconText}>
                  {callState === 'listening' ? '●' : callState === 'processing' ? '...' : 'T'}
                </Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* 挂断按钮 */}
        {isInCall && (
          <TouchableOpacity
            onPress={endCall}
            style={[styles.hangupBtn, { backgroundColor: colors.error }]}
            activeOpacity={0.7}
          >
            <Text style={styles.hangupText}>挂断</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 20,
  },
  aiAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiAvatarText: {
    fontSize: 28,
    fontWeight: '800',
  },
  aiName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  duration: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  dialogSection: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  dialogBubble: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  dialogLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dialogText: {
    fontSize: 16,
    lineHeight: 24,
  },
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 60,
    position: 'relative',
  },
  stateLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 24,
  },
  ripple: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    bottom: 90,
  },
  mainBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  phoneIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneIconText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
  },
  hangupBtn: {
    marginTop: 24,
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 24,
  },
  hangupText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
