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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { addMarkdownToRag, processUnembeddedChunks } from '../src/services/rag';
import { pickMarkdownFiles } from '../src/utils/fileUtils';
import { clearAllRagChunks } from '../src/services/database';

export default function RagScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { settings, ragStats, refreshRagStats } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 上传 Markdown 文件
  const handleUploadMarkdown = useCallback(async () => {
    if (!settings.dashscopeApiKey) {
      Alert.alert('提示', '请先在设置中配置阿里云 DashScope API Key');
      return;
    }

    const files = await pickMarkdownFiles();
    if (!files.length) return;

    setUploading(true);
    try {
      let totalChunks = 0;
      for (const file of files) {
        const chunks = await addMarkdownToRag(
          file.content,
          file.name,
          settings.dashscopeApiKey,
          settings.embeddingModel
        );
        totalChunks += chunks;
      }
      await refreshRagStats();
      Alert.alert('上传成功', `已导入 ${files.length} 个文件，共 ${totalChunks} 个知识块`);
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
        settings.embeddingModel
      );
      await refreshRagStats();
      Alert.alert('处理完成', `成功处理 ${count} 个待嵌入的知识块`);
    } catch (error: any) {
      Alert.alert('处理失败', error.message);
    } finally {
      setProcessing(false);
    }
  }, [settings.dashscopeApiKey, settings.embeddingModel]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>← 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>📚 知识库</Text>
        <View style={{ width: 60 }} />
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

          {/* 上传 Markdown */}
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleUploadMarkdown}
            disabled={uploading}
          >
            <View style={styles.actionLeft}>
              <Text style={styles.actionIcon}>📄</Text>
              <View>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  上传 Markdown 文件
                </Text>
                <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>
                  支持多选 .md / .txt，自动分块并嵌入
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
              📌 <Text style={{ fontWeight: '600' }}>Markdown 支持</Text> — 上传 .md 文件构建专属知识库{'\n\n'}
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    padding: 8,
    width: 60,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
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
    padding: 20,
    borderRadius: 16,
    borderWidth: 0.5,
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
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    marginBottom: 10,
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
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  helpSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  helpCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  helpText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
