/**
 * 聊天消息气泡组件（V2.0）
 * 支持 Markdown / LaTeX / Mermaid / 附件与工具调用可视化。
 */
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';
import { getUserBubbleColorByStyle, Typography } from '../constants/theme';
import { APP_AVATAR } from '../constants/branding';
import type { Message } from '../types';
import { saveImageToGallery } from '../utils/fileUtils';

interface Props {
  message: Message;
}

type RichSegment =
  | { type: 'text'; value: string }
  | { type: 'latex'; value: string }
  | { type: 'mermaid'; value: string };

function stripLatexFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('$$') && t.endsWith('$$')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('\\[') && t.endsWith('\\]')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('\\(') && t.endsWith('\\)')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseRichContentSegments(content: string): RichSegment[] {
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/gi;
  const segments: RichSegment[] = [];
  let cursor = 0;

  const pushTextWithLatex = (text: string) => {
    if (!text) return;
    const latexRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g;
    let innerCursor = 0;
    let latexMatch: RegExpExecArray | null;

    while ((latexMatch = latexRegex.exec(text)) !== null) {
      const before = text.slice(innerCursor, latexMatch.index);
      if (before) segments.push({ type: 'text', value: before });
      const latexRaw = latexMatch[0];
      if (latexRaw.trim()) {
        segments.push({ type: 'latex', value: stripLatexFence(latexRaw) });
      }
      innerCursor = latexMatch.index + latexRaw.length;
    }

    const tail = text.slice(innerCursor);
    if (tail) segments.push({ type: 'text', value: tail });
  };

  let m: RegExpExecArray | null;
  while ((m = mermaidRegex.exec(content)) !== null) {
    const before = content.slice(cursor, m.index);
    pushTextWithLatex(before);

    const chart = m[1]?.trim();
    if (chart) segments.push({ type: 'mermaid', value: chart });
    cursor = m.index + m[0].length;
  }

  pushTextWithLatex(content.slice(cursor));
  return segments.filter((seg) => seg.value.trim().length > 0);
}

function buildLatexHtml(latex: string, textColor: string, darkBg = false): string {
  const bgColor = darkBg ? '#111827' : 'transparent';
  const safeLatex = latex
    .replace(/\\begin\{document\}|\\end\{document\}/g, '')
    .trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    html, body { margin:0; padding:0; background:${bgColor}; overflow:auto; width:100%; height:100%; }
    #math { color:${textColor}; font-size:1.08rem; padding:8px 10px; line-height:1.4; }
    .err { opacity: 0.85; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="math"></div>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script>
    (function () {
      var target = document.getElementById('math');
      var input = ${JSON.stringify(safeLatex)};
      try {
        katex.render(input, target, { displayMode: true, throwOnError: false, strict: 'ignore', trust: true });
      } catch (e) {
        try {
          target.innerHTML = '<div class="err">LaTeX 渲染失败，以下为源码：\\n\\n' + input.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        } catch (_e) {
          target.textContent = input;
        }
      }
    })();
  </script>
</body>
</html>`;
}

function buildMermaidHtml(chart: string, darkMode: boolean, zoomEnabled = false, darkBg = false): string {
  const theme = darkMode ? 'dark' : 'default';
  const bgColor = darkBg ? '#111827' : 'transparent';
  const zoomMeta = zoomEnabled
    ? '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8, minimum-scale=0.5, user-scalable=yes" />'
    : '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />';

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  ${zoomMeta}
  <style>
    html, body { margin:0; padding:0; background:${bgColor}; width: 100%; height: 100%; }
    body { ${zoomEnabled ? 'overflow:auto;' : 'overflow:hidden;'} }
    #wrap { box-sizing: border-box; padding: 16px; width: 100%; min-height: 100%; display: flex; justify-content: center; align-items: center; }
    .mermaid { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 100%; text-align: center; }
    .mermaid svg { max-width: 100%; height: auto; }
    .err { color: #E5E7EB; opacity: 0.9; font-size: 13px; line-height: 1.6; white-space: pre-wrap; text-align: left; }
  </style>
</head>
<body>
  <div id="wrap">
    <pre class="mermaid">${chart
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    (async function () {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: '${theme}' });
        const nodes = document.querySelectorAll('.mermaid');
        await mermaid.run({ nodes: nodes });
      } catch (e) {
        var wrap = document.getElementById('wrap');
        if (wrap) {
          wrap.innerHTML = '<div class="err">Mermaid 渲染失败，以下为源码：\\n\\n' + ${JSON.stringify(chart)}.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        }
      }
    })();
  </script>
</body>
</html>`;
}

/** 移除 Markdown 图片语法，避免 react-native-markdown-display 的 key prop 崩溃 */
export function stripMarkdownImages(text: string): string {
  // 移除 ![alt](url) 格式
  return text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
}

function MessageBubbleImpl({ message }: Props) {
  const colors = useTheme();
  const { userDisplayName, userAvatarEmoji, userBubbleStyle, theme } = useAppStore((s) => s.settings);
  const isUser = message.role === 'user';
  const [previewUri, setPreviewUri] = React.useState<string | null>(null);
  const [mermaidPreview, setMermaidPreview] = React.useState<string | null>(null);
  const [latexPreview, setLatexPreview] = React.useState<string | null>(null);
  const isDark = theme === 'dark';
  const userBubbleColor = getUserBubbleColorByStyle(userBubbleStyle, isDark);
  const sanitizedContent = stripMarkdownImages(message.content || '');
  const richSegments = React.useMemo(
    () => parseRichContentSegments(sanitizedContent),
    [sanitizedContent]
  );
  const shouldFallbackToPlainMarkdown =
    sanitizedContent.length > 16000 || richSegments.length > 16;
  const hasRichSegments =
    !shouldFallbackToPlainMarkdown && richSegments.some((seg) => seg.type !== 'text');

  const bubbleStyle = isUser
    ? [styles.bubble, styles.userBubble, { backgroundColor: userBubbleColor }]
    : [styles.bubble, styles.aiBubble, { backgroundColor: colors.aiBubble, borderColor: colors.border }];

  const textColor = isUser ? colors.userBubbleText : colors.aiBubbleText;
  const displayAvatarEmoji = React.useMemo(
    () => Array.from((userAvatarEmoji || '🙂').trim()).slice(0, 2).join('') || '🙂',
    [userAvatarEmoji]
  );

  const mdStyles = {
    body: { color: textColor, fontSize: 16, lineHeight: 29, fontFamily: Typography.fontFamily, letterSpacing: 0.2 },
    heading1: { color: textColor, fontSize: 22, fontWeight: '700' as const, marginTop: 6, marginBottom: 12, lineHeight: 32 },
    heading2: { color: textColor, fontSize: 20, fontWeight: '700' as const, marginTop: 5, marginBottom: 11, lineHeight: 30 },
    heading3: { color: textColor, fontSize: 18, fontWeight: '600' as const, marginTop: 4, marginBottom: 10, lineHeight: 28 },
    paragraph: { color: textColor, marginBottom: 14, lineHeight: 29 },
    link: { color: colors.primary },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : colors.primaryLight,
      color: textColor,
      paddingHorizontal: 4,
      borderRadius: 5,
      fontSize: 14,
    },
    code_block: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 12,
      borderRadius: 10,
      fontSize: 14,
      fontFamily: 'monospace',
    },
    fence: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 12,
      borderRadius: 10,
      fontSize: 14,
    },
    blockquote: {
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: 10,
      paddingVertical: 6,
      marginBottom: 10,
      backgroundColor: 'rgba(120,145,180,0.08)',
      borderTopRightRadius: 8,
      borderBottomRightRadius: 8,
    },
    list_item: { color: textColor, lineHeight: 29, marginBottom: 6 },
    bullet_list: { color: textColor },
    ordered_list: { color: textColor },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
  };

  const handleDownloadImage = async (uri?: string) => {
    if (!uri) return;
    const ok = await saveImageToGallery(uri);
    if (ok) {
      Alert.alert('保存成功', '图片已保存到系统相册');
    } else {
      Alert.alert('保存失败', '请检查相册权限后重试');
    }
  };

  const attachmentImageUris = (message.attachments || [])
    .filter((att) => att.kind === 'image')
    .map((att) => att.uri)
    .filter(Boolean);

  const legacyUris = [message.imageUri, message.generatedImageUrl].filter(
    (u): u is string => !!u
  );

  const imageUris = Array.from(new Set([...attachmentImageUris, ...legacyUris]));

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {/* 角色标识 */}
      <View style={[styles.avatar, { borderColor: isUser ? colors.primary : colors.border }]}>
        {isUser ? (
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {displayAvatarEmoji}
          </Text>
        ) : (
          <Image source={APP_AVATAR} style={styles.avatarImage} />
        )}
      </View>

      <View style={[styles.contentWrap, isUser && styles.userContentWrap]}>
        {/* 图片消息（支持多图） */}
        {imageUris.length > 0 && (
          <View style={styles.imageGrid}>
            {imageUris.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={styles.imageItemWrap}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUri(uri)}>
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadBtn, { borderColor: colors.border }]}
                  onPress={() => handleDownloadImage(uri)}
                >
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Typography.fontFamily }}>⬇ 下载图片</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 多附件展示 */}
        {!!message.attachments?.some((att) => att.kind === 'file') && (
          <View style={styles.multiAttachmentWrap}>
            {message.attachments?.filter((att) => att.kind === 'file').map((att, idx) => (
              <View key={`${att.uri}-${idx}`} style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.fileIcon, { color: colors.primary }]}>📎</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  {!!att.mimeType && (
                    <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {att.mimeType}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
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
                   call.tool === 'image_gen' ? '🎨 图片生成' :
                   call.tool === 'vision_analyze' ? '🖼️ 图片识别' :
                   call.tool === 'time_now' ? '🕒 时间工具' : '⚙️ 工具调用'}
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
              <Text style={{ color: textColor, fontSize: 16, lineHeight: 29, fontFamily: Typography.fontFamily, letterSpacing: 0.2 }}>
                {message.content}
              </Text>
            ) : hasRichSegments ? (
              <View>
                {richSegments.map((seg, idx) => {
                  if (seg.type === 'text') {
                    return (
                      <View key={`text-${idx}`} style={styles.richTextChunk}>
                        <Markdown style={mdStyles as any}>{seg.value}</Markdown>
                      </View>
                    );
                  }

                  if (seg.type === 'latex') {
                    const lineCount = seg.value.split('\n').length;
                    const webHeight = Math.min(320, Math.max(88, 52 + lineCount * 28));
                    return (
                      <TouchableOpacity
                        key={`latex-${idx}`}
                        activeOpacity={0.85}
                        onPress={() => setLatexPreview(seg.value)}
                        style={[styles.latexCard, { borderColor: colors.border }]}
                      >
                        <WebView
                          originWhitelist={["*"]}
                          source={{ html: buildLatexHtml(seg.value, textColor) }}
                          style={{ height: webHeight, backgroundColor: 'transparent' }}
                          scrollEnabled={false}
                          javaScriptEnabled
                          pointerEvents="none"
                        />
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={`mermaid-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => setMermaidPreview(seg.value)}
                      style={[styles.mermaidCard, { borderColor: colors.border }]}
                    >
                      <View style={[styles.mermaidHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.mermaidTitle, { color: colors.textSecondary }]}>Mermaid 图表（点击放大）</Text>
                      </View>
                      <WebView
                        originWhitelist={["*"]}
                        source={{ html: buildMermaidHtml(seg.value, isDark, false, false) }}
                        style={styles.mermaidWebView}
                        scrollEnabled={false}
                        javaScriptEnabled
                        pointerEvents="none"
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Markdown style={mdStyles as any}>
                {sanitizedContent}
              </Markdown>
            )
          ) : (
            <Text style={{ color: colors.textTertiary, fontStyle: 'italic', fontFamily: Typography.fontFamily }}>
              思考中...
            </Text>
          )}
        </View>

        {isUser && (
          <Text style={[styles.userName, { color: colors.textTertiary }]} numberOfLines={1}>
            {userDisplayName || '我'}
          </Text>
        )}

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

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>

      <Modal
        visible={!!mermaidPreview}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setMermaidPreview(null)}
      >
        <View style={styles.richPreviewBackdrop}>
          <View style={styles.mermaidModalHeader}>
            <Text style={styles.mermaidModalTitle}>Mermaid 图表预览（可双指缩放）</Text>
            <View style={styles.previewActionRow}>
              <TouchableOpacity 
                onPress={async () => {
                  if (mermaidPreview) {
                    await Clipboard.setStringAsync(mermaidPreview);
                    Alert.alert('已复制', 'Mermaid 源码已复制到剪贴板');
                  }
                }} 
                style={styles.mermaidCloseBtn}
              >
                <Text style={styles.mermaidCloseText}>复制源码</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMermaidPreview(null)} style={styles.mermaidCloseBtn}>
                <Text style={styles.mermaidCloseText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
          {mermaidPreview && (
            <WebView
              originWhitelist={["*"]}
              source={{ html: buildMermaidHtml(mermaidPreview, isDark, true, true) }}
              style={styles.mermaidModalWebView}
              javaScriptEnabled
              scrollEnabled
              scalesPageToFit={true}
              bounces={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              androidLayerType="hardware"
              renderToHardwareTextureAndroid
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={!!latexPreview}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setLatexPreview(null)}
      >
        <View style={styles.richPreviewBackdrop}>
          <View style={styles.mermaidModalHeader}>
            <Text style={styles.mermaidModalTitle}>LaTeX 公式预览</Text>
            <View style={styles.previewActionRow}>
              <TouchableOpacity 
                onPress={async () => {
                  if (latexPreview) {
                    await Clipboard.setStringAsync(latexPreview);
                    Alert.alert('已复制', 'LaTeX 源码已复制到剪贴板');
                  }
                }} 
                style={styles.mermaidCloseBtn}
              >
                <Text style={styles.mermaidCloseText}>复制源码</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLatexPreview(null)} style={styles.mermaidCloseBtn}>
                <Text style={styles.mermaidCloseText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
          {latexPreview && (
            <WebView
              originWhitelist={["*"]}
              source={{ html: buildLatexHtml(latexPreview, '#FFFFFF', true) }}
              style={styles.mermaidModalWebView}
              javaScriptEnabled
              scrollEnabled
              scalesPageToFit={true}
              bounces={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              androidLayerType="hardware"
              renderToHardwareTextureAndroid
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleImpl);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'flex-start',
  },
  userContainer: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    maxWidth: '98%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  userBubble: {
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    borderBottomLeftRadius: 6,
    borderWidth: 0.8,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 6,
  },
  imageGrid: {
    marginBottom: 2,
  },
  imageItemWrap: {
    marginBottom: 4,
  },
  downloadBtn: {
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  multiAttachmentWrap: {
    marginBottom: 6,
    maxWidth: 280,
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
    fontFamily: Typography.fontFamily,
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Typography.fontFamily,
  },
  meta: {
    fontSize: 11,
    marginTop: 5,
    marginLeft: 4,
    fontFamily: Typography.fontFamily,
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 11,
    marginTop: 4,
    marginRight: 4,
    fontFamily: Typography.fontFamily,
  },
  userMeta: {
    marginLeft: 0,
    marginRight: 4,
  },
  // 工具调用样式
  toolsContainer: {
    marginBottom: 10,
  },
  toolCall: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 0.8,
    marginBottom: 6,
  },
  toolTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 6,
    fontFamily: Typography.fontFamily,
  },
  toolInput: {
    fontSize: 11,
    flex: 1,
    fontFamily: Typography.fontFamily,
  },
  // 来源引用样式
  sourcesContainer: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: 'rgba(90, 140, 255, 0.08)',
    borderRadius: 10,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
    fontFamily: Typography.fontFamily,
  },
  sourceLink: {
    fontSize: 11,
    marginBottom: 2,
    textDecorationLine: 'underline',
    fontFamily: Typography.fontFamily,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  richPreviewBackdrop: {
    flex: 1,
    backgroundColor: '#111827',
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  richTextChunk: {
    marginBottom: 4,
  },
  latexCard: {
    borderWidth: 0.8,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mermaidCard: {
    borderWidth: 0.8,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mermaidHeader: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 0.8,
  },
  mermaidTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily,
  },
  mermaidWebView: {
    height: 230,
    backgroundColor: 'transparent',
  },
  mermaidModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 12,
  },
  previewActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mermaidModalTitle: {
    color: '#EAF0FF',
    fontSize: 14,
    fontFamily: Typography.fontFamily,
  },
  mermaidCloseBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  mermaidCloseText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: Typography.fontFamily,
  },
  mermaidModalWebView: {
    width: '100%',
    flex: 1,
    backgroundColor: '#111827',
  },
});
