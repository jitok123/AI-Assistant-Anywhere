/**
 * 主聊天页面
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Text,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { MessageBubble } from '../src/components/MessageBubble';
import { ChatInput } from '../src/components/ChatInput';
import { ConversationDrawer } from '../src/components/ConversationDrawer';
import { speak, stopSpeaking } from '../src/services/voice';
import type { Message } from '../src/types';

export default function ChatScreen() {
  const colors = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const {
    messages,
    isLoading,
    initialized,
    currentConversationId,
    conversations,
    chatMode,
    setChatMode,
    newConversation,
    settings,
  } = useAppStore();

  const currentConv = conversations.find((c) => c.id === currentConversationId);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // 播放/停止语音
  const toggleSpeak = (message: Message) => {
    if (speakingId === message.id) {
      stopSpeaking();
      setSpeakingId(null);
    } else {
      stopSpeaking();
      setSpeakingId(message.id);
      speak(message.content, () => setSpeakingId(null));
    }
  };

  if (!initialized) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          正在初始化...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.headerBtn}
        >
          <Text style={{ color: colors.text, fontSize: 22 }}>☰</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {currentConv?.title || '随身AI助手'}
        </Text>

        <View style={styles.headerRight}>
          {/* 聊天模式切换 */}
          <TouchableOpacity
            onPress={() => setChatMode(chatMode === 'text' ? 'voice' : 'text')}
            style={styles.headerBtn}
          >
            <Text style={{ color: chatMode === 'voice' ? colors.primary : colors.textSecondary, fontSize: 18 }}>
              {chatMode === 'voice' ? '🎙️' : '💬'}
            </Text>
          </TouchableOpacity>

          {/* 新建对话 */}
          <TouchableOpacity
            onPress={() => newConversation()}
            style={styles.headerBtn}
          >
            <Text style={{ color: colors.primary, fontSize: 20 }}>✎</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 消息列表 */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon]}>🤖</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            随身AI助手
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            一个真正懂你的AI助手
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
            所有对话都会被记忆 · 支持知识库 · 本地存储
          </Text>

          {!settings.deepseekApiKey && (
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={[styles.setupBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.setupBtnText}>⚙️ 先去配置 API Key</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => item.role === 'assistant' && toggleSpeak(item)}
            >
              <MessageBubble message={item} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 加载指示器 */}
      {isLoading && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>
            AI正在思考...
          </Text>
        </View>
      )}

      {/* 输入框 */}
      <ChatInput />

      {/* 对话列表抽屉 */}
      <Modal
        visible={drawerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <ConversationDrawer onClose={() => setDrawerVisible(false)} />
          <TouchableOpacity
            style={styles.drawerBackdrop}
            onPress={() => setDrawerVisible(false)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
  },
  messageList: {
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  setupBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  typingText: {
    marginLeft: 8,
    fontSize: 13,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
