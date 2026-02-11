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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { MessageBubble } from '../src/components/MessageBubble';
import { ChatInput } from '../src/components/ChatInput';
import { ConversationDrawer } from '../src/components/ConversationDrawer';
import type { Message } from '../src/types';

export default function ChatScreen() {
  const colors = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const {
    messages,
    isLoading,
    initialized,
    currentConversationId,
    conversations,
    newConversation,
    settings,
  } = useAppStore();

  const currentConv = conversations.find((c) => c.id === currentConversationId);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.headerBtn}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
            <View style={[styles.menuLine, { backgroundColor: colors.text, width: 16 }]} />
            <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {currentConv?.title || '随身AI助手'}
        </Text>

        <View style={styles.headerRight}>
          {/* 新建对话 */}
          <TouchableOpacity
            onPress={() => newConversation()}
            style={styles.headerBtn}
            activeOpacity={0.6}
          >
            <View style={[styles.newChatIcon, { borderColor: colors.primary }]}>
              <Text style={[styles.newChatPlus, { color: colors.primary }]}>+</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 消息列表 */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyLogo, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.emptyLogoText, { color: colors.primary }]}>AI</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            随身AI助手
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            多层记忆 · 联网搜索 · 图片生成 · 图片理解
          </Text>

          {!settings.deepseekApiKey && (
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={[styles.setupBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.7}
            >
              <Text style={styles.setupBtnText}>配置 API Key 开始使用</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} />
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
      </KeyboardAvoidingView>
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
    paddingHorizontal: 4,
    paddingVertical: 8,
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
    alignItems: 'center',
  },
  // 菜单图标 (三条横线)
  menuIcon: {
    width: 20,
    height: 16,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  // 模式切换按钮
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // 新建对话图标
  newChatIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatPlus: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
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
  emptyLogo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyLogoText: {
    fontSize: 28,
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  setupBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
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
