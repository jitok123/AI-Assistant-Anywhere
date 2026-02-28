/**
 * RAG 知识库管理页面
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { APP_AVATAR } from '../src/constants/branding';
import {
  addMarkdownToRag,
  processUnembeddedChunks,
  resolveRagEmbeddingModel,
} from '../src/services/rag';
import { pickKnowledgeFiles } from '../src/utils/fileUtils';
import { clearAllRagChunks } from '../src/services/database';
import { extractKnowledgeText } from '../src/services/knowledgeIngest';

export default function RagScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { settings, ragStats, refreshRagStats } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 上传知识库文件（文本 / PDF / 图片）
  const handleUploadKnowledge = useCallback(async () => {
    if (!settings.dashscopeApiKey) {
      Alert.alert('提示', '请先在设置中配置阿里云 DashScope API Key');
      return;
    }

    const files = await pickKnowledgeFiles();
    if (!files.length) return;

    setUploading(true);
    try {
      let totalChunks = 0;
      let successCount = 0;
      const failedFiles: string[] = [];
      const warningNotes: string[] = [];

      for (const file of files) {
        try {
          const extracted = await extractKnowledgeText(file, settings.dashscopeApiKey);
          if (!extracted.text.trim()) {
            failedFiles.push(file.name);
            continue;
          }

          const chunks = await addMarkdownToRag(
            extracted.text,
            file.name,
            settings.dashscopeApiKey,
            extracted.sourceKind === 'text'
              ? resolveRagEmbeddingModel(settings, 'text')
              : resolveRagEmbeddingModel(settings, 'non_text'),
            extracted.sourceKind === 'text' ? 'text' : 'non_text',
            extracted.embeddingInputs,
          );
          totalChunks += chunks;
          successCount += 1;

          if (extracted.warnings.length > 0) {
            warningNotes.push(`${file.name}: ${extracted.warnings.join('；')}`);
          }
        } catch (error) {
          console.warn('[RAG] 文件入库失败:', file.name, error);
          failedFiles.push(file.name);
        }
      }

      await refreshRagStats();

      let message = `已导入 ${successCount}/${files.length} 个文件，共 ${totalChunks} 个知识块。`;
      if (failedFiles.length > 0) {
        message += `\n\n未成功：${failedFiles.join('、')}`;
      }
      if (warningNotes.length > 0) {
        message += `\n\n提示：${warningNotes.slice(0, 2).join('；')}${warningNotes.length > 2 ? '…' : ''}`;
      }

      Alert.alert(successCount > 0 ? '导入完成' : '导入失败', message);
    } catch (error: any) {
      Alert.alert('上传失败', error.message);
    } finally {
      setUploading(false);
    }
  }, [settings.dashscopeApiKey, settings.embeddingModel]);

  // 处理未嵌入的块
  const handleProcessPending = useCallback(async () => {
    if (!settings.dashscopeApiKey) {
      Alert.alert('提示', '请先配置阿里云 API Key');
      return;
    }

    setProcessing(true);
    try {
      const count = await processUnembeddedChunks(
        settings.dashscopeApiKey,
        resolveRagEmbeddingModel(settings, 'text'),
        resolveRagEmbeddingModel(settings, 'non_text'),
      );
      await refreshRagStats();
      Alert.alert('处理完成', `成功处理 ${count} 个待嵌入的知识块`);
    } catch (error: any) {
      Alert.alert('处理失败', error.message);
    } finally {
      setProcessing(false);
    }
  }, [
    settings.dashscopeApiKey,
    settings.embeddingModel,
    settings.ragTextEmbeddingModel,
    settings.ragNonTextEmbeddingModel,
  ]);

  // 清空知识库
  const handleClearRag = () => {
    Alert.alert('清空知识库', '确定要清空所有 RAG 知识块吗？此操作不可撤销！', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定清空',
        style: 'destructive',
        onPress: async () => {
          await clearAllRagChunks();
          await refreshRagStats();
          Alert.alert('已清空', '知识库已清空');
        },
      },
    ]);
  };

  const pendingCount = ragStats.totalChunks - ragStats.embeddedChunks;

  const goBackSafe = () => {
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goBackSafe} style={styles.backBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }} numberOfLines={1}>← 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>知识库</Text>
        <View style={{ width: 86 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 统计卡片 */}
        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statsTitle, { color: colors.text }]}>知识库概览</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {ragStats.totalChunks}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>总块数</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.success }]}>
                {ragStats.embeddedChunks}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>已嵌入</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {ragStats.chatChunks}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>来自对话</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {ragStats.uploadChunks}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>来自上传</Text>
            </View>
          </View>
        </View>

        {/* 操作区 */}
        <View style={styles.actionsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            操作
          </Text>

          {/* 上传知识库文件 */}
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleUploadKnowledge}
            disabled={uploading}
          >
            <View style={styles.actionLeft}>
              <Image source={APP_AVATAR} style={styles.actionImageIcon} />
              <View>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  上传知识库文件
                </Text>
                <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>
                  支持 .md / .txt / .pdf / 图片，多选后自动入库
                </Text>
              </View>
            </View>
            {uploading && <ActivityIndicator size="small" color={colors.primary} />}
          </TouchableOpacity>

          {/* 处理待嵌入 */}
          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={handleProcessPending}
              disabled={processing}
            >
              <View style={styles.actionLeft}>
                <Text style={styles.actionIcon}>⚡</Text>
                <View>
                  <Text style={[styles.actionTitle, { color: colors.text }]}>
                    处理待嵌入数据
                  </Text>
                  <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>
                    {pendingCount} 个知识块等待 Embedding 处理
                  </Text>
                </View>
              </View>
              {processing && <ActivityIndicator size="small" color={colors.primary} />}
            </TouchableOpacity>
          )}

          {/* 清空知识库 */}
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleClearRag}
          >
            <View style={styles.actionLeft}>
              <Text style={styles.actionIcon}>🗑️</Text>
              <View>
                <Text style={[styles.actionTitle, { color: colors.danger }]}>
                  清空知识库
                </Text>
                <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>
                  删除所有 RAG 知识块（不可撤销）
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* 说明 */}
        <View style={styles.helpSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            关于 RAG
          </Text>
          <View style={[styles.helpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.textSecondary }]}>
              📌 <Text style={{ fontWeight: '600' }}>一切皆历史</Text> — 所有聊天对话自动保存为知识，跨会话记忆{'\n\n'}
              📌 <Text style={{ fontWeight: '600' }}>增量更新</Text> — 新数据会被追加到知识库，而不是每次全量重建{'\n\n'}
              📌 <Text style={{ fontWeight: '600' }}>本地存储</Text> — 所有数据存储在手机本地，隐私有保障{'\n\n'}
              📌 <Text style={{ fontWeight: '600' }}>多格式导入</Text> — 支持文本 / PDF / 图片构建专属知识库{'\n\n'}
              📌 <Text style={{ fontWeight: '600' }}>节省成本</Text> — 已嵌入的数据无需重复计算
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    padding: 8,
    width: 86,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  statsCard: {
    margin: 16,
    padding: 22,
    borderRadius: 20,
    borderWidth: 0.5,
    shadowColor: '#0B1221',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  actionsSection: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    marginLeft: 4,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 0.5,
    marginBottom: 12,
    shadowColor: '#0B1221',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  actionImageIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 12,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  actionDesc: {
    fontSize: 13,
    marginTop: 3,
  },
  helpSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  helpCard: {
    padding: 17,
    borderRadius: 16,
    borderWidth: 0.5,
  },
  helpText: {
    fontSize: 16,
    lineHeight: 30,
  },
});
