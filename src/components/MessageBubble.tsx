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

/** 移除 Markdown 图片语法，避免 react-native-markdown-display 的 key prop 崩溃 */
function stripMarkdownImages(text: string): string {
  // 移除 ![alt](url) 格式
  return text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
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
        {/* 图片消息 (用户上传/AI生成) */}
        {(message.imageUri || message.generatedImageUrl) && (
          <Image
            source={{ uri: message.imageUri || message.generatedImageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        {/* 文件消息 */}
        {message.fileName && (
          <View style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fileIcon, { color: colors.primary }]}>📎</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                {message.fileName}
              </Text>
              {!!message.fileMimeType && (
                <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {message.fileMimeType}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* 思考过程/工具调用展示 */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <View style={styles.toolsContainer}>
            {message.toolCalls.map((call, idx) => (
              <View
                key={idx}
                style={[styles.toolCall, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.toolTitle, { color: colors.textSecondary }]}>
                  {call.tool === 'web_search' ? '🔍 联网搜索' : 
                   call.tool === 'image_gen' ? '🎨 图片生成' : '⚙️ 工具调用'}
                </Text>
                <Text style={[styles.toolInput, { color: colors.textTertiary }]} numberOfLines={1}>
                  "{call.input}"
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 搜索结果来源引用 */}
        {!isUser && message.searchResults && message.searchResults.length > 0 && (
          <View style={styles.sourcesContainer}>
            <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>参考来源:</Text>
            {message.searchResults.map((res, idx) => (
              <Text key={idx} style={[styles.sourceLink, { color: colors.primary }]} numberOfLines={1}>
                [{idx + 1}] {res.title}
              </Text>
            ))}
          </View>
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
                {stripMarkdownImages(message.content)}
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
          {message.type === 'voice' ? '[语音] ' : ''}
          {message.type === 'image' ? '[图片] ' : ''}
          {message.type === 'file' ? '[文件] ' : ''}
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
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    marginRight: 14,
  },
  userContentWrap: {
    marginLeft: 14,
    marginRight: 8,
    alignItems: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    maxWidth: '96%',
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
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    maxWidth: 260,
  },
  fileIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
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
  // 工具调用样式
  toolsContainer: {
    marginBottom: 8,
  },
  toolCall: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 6,
    borderWidth: 0.5,
    marginBottom: 4,
  },
  toolTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 6,
  },
  toolInput: {
    fontSize: 11,
    flex: 1,
  },
  // 来源引用样式
  sourcesContainer: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 8,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  sourceLink: {
    fontSize: 11,
    marginBottom: 2,
    textDecorationLine: 'underline',
  },
});
