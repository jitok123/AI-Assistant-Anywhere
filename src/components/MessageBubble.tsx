/**
 * 聊天消息气泡组件
 */
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../hooks/useTheme';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const colors = useTheme();
  const isUser = message.role === 'user';

  const bubbleStyle = isUser
    ? [styles.bubble, styles.userBubble, { backgroundColor: colors.userBubble }]
    : [styles.bubble, styles.aiBubble, { backgroundColor: colors.aiBubble, borderColor: colors.border }];

  const textColor = isUser ? colors.userBubbleText : colors.aiBubbleText;

  const mdStyles = {
    body: { color: textColor, fontSize: 15, lineHeight: 22 },
    heading1: { color: textColor, fontSize: 20, fontWeight: '700' as const, marginBottom: 8 },
    heading2: { color: textColor, fontSize: 18, fontWeight: '600' as const, marginBottom: 6 },
    heading3: { color: textColor, fontSize: 16, fontWeight: '600' as const, marginBottom: 4 },
    paragraph: { color: textColor, marginBottom: 8 },
    link: { color: colors.primary },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : colors.primaryLight,
      color: textColor,
      paddingHorizontal: 4,
      borderRadius: 3,
      fontSize: 13,
    },
    code_block: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 10,
      borderRadius: 8,
      fontSize: 13,
      fontFamily: 'monospace',
    },
    fence: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 10,
      borderRadius: 8,
      fontSize: 13,
    },
    blockquote: {
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: 10,
      backgroundColor: 'transparent',
    },
    list_item: { color: textColor },
    bullet_list: { color: textColor },
    ordered_list: { color: textColor },
  };

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {/* 角色标识 */}
      <View style={[styles.avatar, { backgroundColor: isUser ? colors.primary : colors.primaryLight }]}>
        <Text style={[styles.avatarText, { color: isUser ? '#FFF' : colors.primary }]}>
          {isUser ? '你' : 'AI'}
        </Text>
      </View>

      <View style={[styles.contentWrap, isUser && styles.userContentWrap]}>
        {/* 图片消息 */}
        {message.imageUri && (
          <Image
            source={{ uri: message.imageUri }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        {/* 文本内容 */}
        <View style={bubbleStyle}>
          {message.content ? (
            isUser ? (
              <Text style={{ color: textColor, fontSize: 15, lineHeight: 22 }}>
                {message.content}
              </Text>
            ) : (
              <Markdown style={mdStyles as any}>
                {message.content}
              </Markdown>
            )
          ) : (
            <Text style={{ color: colors.textTertiary, fontStyle: 'italic' }}>
              思考中...
            </Text>
          )}
        </View>

        {/* 时间和类型标记 */}
        <Text style={[styles.meta, { color: colors.textTertiary }, isUser && styles.userMeta]}>
          {message.type === 'voice' ? '🎤 ' : ''}
          {message.type === 'image' ? '🖼️ ' : ''}
          {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'flex-start',
  },
  userContainer: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contentWrap: {
    flex: 1,
    marginLeft: 8,
    marginRight: 40,
  },
  userContentWrap: {
    marginLeft: 40,
    marginRight: 8,
    alignItems: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: '100%',
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 6,
  },
  meta: {
    fontSize: 11,
    marginTop: 3,
    marginLeft: 4,
  },
  userMeta: {
    marginLeft: 0,
    marginRight: 4,
  },
});
