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
  Image,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { MessageBubble } from '../src/components/MessageBubble';
import { ChatInput } from '../src/components/ChatInput';
import { ConversationDrawer } from '../src/components/ConversationDrawer';
import { Typography } from '../src/constants/theme';
import { APP_AVATAR } from '../src/constants/branding';

export default function ChatScreen() {
  const colors = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const safeAreaEdges: Edge[] = Platform.OS === 'android'
    ? ['top', 'left', 'right']
    : ['top', 'left', 'right', 'bottom'];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt) => {
        if (drawerVisible) return false;
        return evt.nativeEvent.pageX <= 18;
      },
      onStartShouldSetPanResponder: (evt) => {
        if (drawerVisible) return false;
        return evt.nativeEvent.pageX <= 18;
      },
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
        if (drawerVisible) return false;
        return (
          gestureState.moveX < 32
          && gestureState.dx > 16
          && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2
        );
      },
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (drawerVisible) return false;
        return (
          gestureState.moveX < 32
          && gestureState.dx > 16
          && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2
        );
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!drawerVisible && (gestureState.dx > 38 || gestureState.vx > 0.45)) {
          setDrawerVisible(true);
        }
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

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
    <SafeAreaView edges={safeAreaEdges} style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.edgeSwipeZone} {...panResponder.panHandlers} />
            {/* 顶部导航 */}
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setDrawerVisible(true)}
                style={styles.headerBtn}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.menuIcon}>
                  <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
                  <View style={[styles.menuLine, { backgroundColor: colors.text, width: 16 }]} />
                  <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
                </View>
              </TouchableOpacity>

              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {currentConv?.title || '新对话'}
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
                  <Image source={APP_AVATAR} style={styles.emptyLogoImage} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  新对话
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  多层记忆 · 联网搜索 · 图片生成 · 图片理解
                </Text>

                <View style={styles.capabilityRow}>
                  <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                    <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>⚡ 智能路由</Text>
                  </View>
                  <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                    <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>🔎 实时检索</Text>
                  </View>
                  <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                    <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>📎 图文附件</Text>
                  </View>
                </View>

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
                style={{ flex: 1 }}
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <MessageBubble message={item} />
                )}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={scrollToBottom}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={45}
                windowSize={7}
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
              animationType="fade"
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
          </View>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="height"
          keyboardVerticalOffset={0}
        >
        <View style={{ flex: 1 }}>
          <View style={styles.edgeSwipeZone} {...panResponder.panHandlers} />
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.headerBtn}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.menuIcon}>
            <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
            <View style={[styles.menuLine, { backgroundColor: colors.text, width: 16 }]} />
            <View style={[styles.menuLine, { backgroundColor: colors.text }]} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {currentConv?.title || '新对话'}
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
              <Image source={APP_AVATAR} style={styles.emptyLogoImage} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            新对话
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            多层记忆 · 联网搜索 · 图片生成 · 图片理解
          </Text>

          <View style={styles.capabilityRow}>
            <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>⚡ 智能路由</Text>
            </View>
            <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>🔎 实时检索</Text>
            </View>
            <View style={[styles.capabilityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={[styles.capabilityText, { color: colors.textSecondary }]}>📎 图文附件</Text>
            </View>
          </View>

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
          style={{ flex: 1 }}
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={45}
          windowSize={7}
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
        animationType="fade"
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
        </View>
      </KeyboardAvoidingView>
      )}
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
    fontFamily: Typography.fontFamily,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: Typography.fontFamily,
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
    paddingVertical: 10,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyLogoText: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Typography.fontFamily,
  },
  emptyLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: Typography.fontFamily,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: Typography.fontFamily,
  },
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 14,
    gap: 8,
  },
  capabilityChip: {
    borderWidth: 0.8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  capabilityText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
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
    fontFamily: Typography.fontFamily,
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
    fontFamily: Typography.fontFamily,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,10,25,0.52)',
  },
  edgeSwipeZone: {
    position: 'absolute',
    left: 0,
    top: 56,
    bottom: 0,
    width: 20,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
});
