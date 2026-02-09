/**
 * 设置页面 — 重点突出 AI 模型选择
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store';
import { exportData, importDataFile } from '../src/utils/fileUtils';
import {
  CHAT_MODEL_PRESETS,
  EMBEDDING_MODEL_PRESETS,
  type ChatModelPreset,
  type EmbeddingModelPreset,
} from '../src/config/models';

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { settings, updateSettings, getExportData, importData, ragStats } =
    useAppStore();

  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showDashscopeKey, setShowDashscopeKey] = useState(false);
  const [chatModelPickerVisible, setChatModelPickerVisible] = useState(false);
  const [embeddingModelPickerVisible, setEmbeddingModelPickerVisible] = useState(false);

  // 找到当前选中的预设
  const currentChatPreset = CHAT_MODEL_PRESETS.find(
    (p) => p.model === settings.deepseekModel && p.baseUrl === settings.deepseekBaseUrl
  );

  const handleExport = async () => {
    try {
      const data = await getExportData();
      const success = await exportData(data);
      if (success) {
        Alert.alert('成功', '数据已导出');
      } else {
        Alert.alert('提示', '数据导出不可用');
      }
    } catch (error: any) {
      Alert.alert('导出失败', error.message);
    }
  };

  const handleImport = async () => {
    Alert.alert('导入数据', '导入会将数据合并到现有数据中，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定导入',
        onPress: async () => {
          try {
            const data = await importDataFile();
            if (data) {
              await importData(data);
              Alert.alert('成功', '数据已导入');
            }
          } catch (error: any) {
            Alert.alert('导入失败', error.message);
          }
        },
      },
    ]);
  };

  /** 选择对话模型预设 */
  const selectChatModel = (preset: ChatModelPreset) => {
    updateSettings({
      deepseekModel: preset.model,
      deepseekBaseUrl: preset.baseUrl,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
    });
    setChatModelPickerVisible(false);
  };

  /** 选择 Embedding 模型预设 */
  const selectEmbeddingModel = (preset: EmbeddingModelPreset) => {
    updateSettings({ embeddingModel: preset.model });
    setEmbeddingModelPickerVisible(false);
  };

  const Section = ({
    title,
    icon,
    children,
  }: {
    title: string;
    icon?: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {icon ? `${icon} ` : ''}{title}
      </Text>
      <View
        style={[
          styles.sectionContent,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );

  const Row = ({
    label,
    hint,
    children,
    isLast = false,
  }: {
    label: string;
    hint?: string;
    children: React.ReactNode;
    isLast?: boolean;
  }) => (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.rowLabelWrap}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {hint && (
          <Text style={[styles.rowHint, { color: colors.textTertiary }]}>
            {hint}
          </Text>
        )}
      </View>
      <View style={styles.rowContent}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* 头部 */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>← 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ==================== 🤖 对话模型（最显眼） ==================== */}
        <Section title="对话 AI 模型" icon="🤖">
          {/* 当前模型卡片 */}
          <TouchableOpacity
            style={[styles.modelCard, { borderColor: colors.primary }]}
            onPress={() => setChatModelPickerVisible(true)}
          >
            <View style={styles.modelCardHeader}>
              <Text style={[styles.modelCardLabel, { color: colors.textSecondary }]}>
                当前模型
              </Text>
              <Text style={[styles.modelCardChange, { color: colors.primary }]}>
                点击切换 →
              </Text>
            </View>
            <Text style={[styles.modelCardName, { color: colors.text }]}>
              {currentChatPreset?.name || settings.deepseekModel}
            </Text>
            <Text style={[styles.modelCardDesc, { color: colors.textTertiary }]}>
              {currentChatPreset?.description || `自定义模型: ${settings.deepseekModel}`}
            </Text>
            <View style={styles.modelCardTags}>
              <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>
                  {settings.deepseekModel}
                </Text>
              </View>
              {currentChatPreset?.supportsVision && (
                <View style={[styles.tag, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={[styles.tagText, { color: '#2E7D32' }]}>
                    🖼️ 视觉
                  </Text>
                </View>
              )}
              <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>
                  T={settings.temperature}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <Row label="API Key" hint="对话模型的密钥">
            <View style={styles.keyRow}>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, flex: 1 },
                ]}
                value={settings.deepseekApiKey}
                onChangeText={(v) => updateSettings({ deepseekApiKey: v })}
                placeholder="sk-..."
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showDeepseekKey}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowDeepseekKey(!showDeepseekKey)}
                style={styles.eyeBtn}
              >
                <Text>{showDeepseekKey ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </Row>
          <Row label="API 地址" hint="兼容 OpenAI 格式的 Base URL">
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={settings.deepseekBaseUrl}
              onChangeText={(v) => updateSettings({ deepseekBaseUrl: v })}
              placeholder="https://api.deepseek.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </Row>
          <Row label="模型名称" hint="自定义模型 ID（选预设会自动填写）">
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={settings.deepseekModel}
              onChangeText={(v) => updateSettings({ deepseekModel: v })}
              placeholder="deepseek-chat"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </Row>
          <Row label="Temperature" hint="越高越有创意，越低越稳定">
            <TextInput
              style={[
                styles.input,
                styles.smallInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={String(settings.temperature)}
              onChangeText={(v) =>
                updateSettings({ temperature: parseFloat(v) || 0.7 })
              }
              keyboardType="decimal-pad"
            />
          </Row>
          <Row label="Max Tokens" hint="单次回复最大长度" isLast>
            <TextInput
              style={[
                styles.input,
                styles.smallInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={String(settings.maxTokens)}
              onChangeText={(v) =>
                updateSettings({ maxTokens: parseInt(v) || 4096 })
              }
              keyboardType="number-pad"
            />
          </Row>
        </Section>

        {/* ==================== 📊 Embedding 模型 ==================== */}
        <Section title="Embedding 模型（RAG 向量化 & 语音识别）" icon="📊">
          <Row label="DashScope API Key" hint="阿里云密钥，RAG + 语音共用">
            <View style={styles.keyRow}>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, flex: 1 },
                ]}
                value={settings.dashscopeApiKey}
                onChangeText={(v) => updateSettings({ dashscopeApiKey: v })}
                placeholder="sk-..."
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showDashscopeKey}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowDashscopeKey(!showDashscopeKey)}
                style={styles.eyeBtn}
              >
                <Text>{showDashscopeKey ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </Row>
          <Row label="Embedding 模型" isLast>
            <TouchableOpacity
              style={[
                styles.embeddingSelector,
                { borderColor: colors.border, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => setEmbeddingModelPickerVisible(true)}
            >
              <Text style={[{ color: colors.text, fontSize: 14 }]}>
                {settings.embeddingModel}
              </Text>
              <Text style={{ color: colors.textTertiary }}> ▼</Text>
            </TouchableOpacity>
          </Row>
        </Section>

        {/* ==================== 📚 RAG 设置 ==================== */}
        <Section title="RAG 知识库" icon="📚">
          <Row label="检索数量 (Top-K)" hint="每次检索的参考文本块数">
            <TextInput
              style={[
                styles.input,
                styles.smallInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={String(settings.ragTopK)}
              onChangeText={(v) =>
                updateSettings({ ragTopK: parseInt(v) || 5 })
              }
              keyboardType="number-pad"
            />
          </Row>
          <Row label="分块大小" hint="知识块最大字符数">
            <TextInput
              style={[
                styles.input,
                styles.smallInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={String(settings.chunkSize)}
              onChangeText={(v) =>
                updateSettings({ chunkSize: parseInt(v) || 500 })
              }
              keyboardType="number-pad"
            />
          </Row>
          <Row label="自动保存对话到RAG" isLast>
            <Switch
              value={settings.autoSaveToRag}
              onValueChange={(v) => updateSettings({ autoSaveToRag: v })}
              trackColor={{ true: colors.primary }}
            />
          </Row>
        </Section>

        {/* ==================== 🎨 通用设置 ==================== */}
        <Section title="通用" icon="🎨">
          <Row label="主题">
            <View style={styles.themeRow}>
              {(['auto', 'light', 'dark'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => updateSettings({ theme: t })}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor:
                        settings.theme === t
                          ? colors.primary
                          : colors.primaryLight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: settings.theme === t ? '#FFF' : colors.text,
                      fontSize: 13,
                    }}
                  >
                    {t === 'auto'
                      ? '跟随系统'
                      : t === 'light'
                      ? '浅色'
                      : '深色'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Row>
          <Row label="系统提示词" hint="自定义 AI 人设" isLast>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={settings.systemPrompt}
              onChangeText={(v) => updateSettings({ systemPrompt: v })}
              placeholder="系统提示词..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
            />
          </Row>
        </Section>

        {/* ==================== 💾 数据管理 ==================== */}
        <Section title="数据管理" icon="💾">
          <Row label="RAG 总块数">
            <Text style={{ color: colors.textSecondary }}>
              {ragStats.totalChunks} (已嵌入: {ragStats.embeddedChunks})
            </Text>
          </Row>
          <Row label="导出全部数据">
            <TouchableOpacity
              onPress={handleExport}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.actionBtnText}>📤 导出</Text>
            </TouchableOpacity>
          </Row>
          <Row label="导入数据" isLast>
            <TouchableOpacity
              onPress={handleImport}
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
            >
              <Text style={styles.actionBtnText}>📥 导入</Text>
            </TouchableOpacity>
          </Row>
        </Section>

        {/* 关于 */}
        <View style={styles.about}>
          <Text
            style={{
              color: colors.textTertiary,
              textAlign: 'center',
              fontSize: 13,
            }}
          >
            随身AI助手 v1.0.0{'\n'}
            一个真正懂你的AI助手{'\n'}
            本地数据存储 · 跨会话记忆 · 隐私保障
          </Text>
        </View>
      </ScrollView>

      {/* ==================== 对话模型选择弹窗 ==================== */}
      <Modal
        visible={chatModelPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setChatModelPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                🤖 选择对话模型
              </Text>
              <TouchableOpacity
                onPress={() => setChatModelPickerVisible(false)}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[styles.modalSubtitle, { color: colors.textTertiary }]}
            >
              选择预设模型会自动填写 API 地址和模型名称。{'\n'}
              不同模型需要对应的 API Key。
            </Text>
            <FlatList
              data={CHAT_MODEL_PRESETS}
              keyExtractor={(item) => `${item.baseUrl}/${item.model}`}
              renderItem={({ item }) => {
                const isActive =
                  item.model === settings.deepseekModel &&
                  item.baseUrl === settings.deepseekBaseUrl;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modelOption,
                      {
                        borderColor: isActive
                          ? colors.primary
                          : colors.border,
                        backgroundColor: isActive
                          ? colors.primaryLight
                          : 'transparent',
                      },
                    ]}
                    onPress={() => selectChatModel(item)}
                  >
                    <View style={styles.modelOptionHeader}>
                      <Text
                        style={[
                          styles.modelOptionName,
                          {
                            color: isActive ? colors.primary : colors.text,
                          },
                        ]}
                      >
                        {isActive ? '✅ ' : ''}
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.modelOptionId,
                          { color: colors.textTertiary },
                        ]}
                      >
                        {item.model}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.modelOptionDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.description}
                    </Text>
                    <View style={styles.modelOptionTags}>
                      {item.supportsVision && (
                        <Text
                          style={[
                            styles.miniTag,
                            {
                              color: '#2E7D32',
                              backgroundColor: '#E8F5E9',
                            },
                          ]}
                        >
                          🖼️ 图片
                        </Text>
                      )}
                      {item.supportsStream && (
                        <Text
                          style={[
                            styles.miniTag,
                            {
                              color: colors.primary,
                              backgroundColor: colors.primaryLight,
                            },
                          ]}
                        >
                          ⚡ 流式
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>

      {/* ==================== Embedding 模型选择弹窗 ==================== */}
      <Modal
        visible={embeddingModelPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEmbeddingModelPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              styles.smallModal,
              { backgroundColor: colors.surface },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                📊 选择 Embedding 模型
              </Text>
              <TouchableOpacity
                onPress={() => setEmbeddingModelPickerVisible(false)}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            {EMBEDDING_MODEL_PRESETS.map((preset) => {
              const isActive = preset.model === settings.embeddingModel;
              return (
                <TouchableOpacity
                  key={preset.model}
                  style={[
                    styles.modelOption,
                    {
                      borderColor: isActive
                        ? colors.primary
                        : colors.border,
                      backgroundColor: isActive
                        ? colors.primaryLight
                        : 'transparent',
                    },
                  ]}
                  onPress={() => selectEmbeddingModel(preset)}
                >
                  <Text
                    style={[
                      styles.modelOptionName,
                      {
                        color: isActive ? colors.primary : colors.text,
                      },
                    ]}
                  >
                    {isActive ? '✅ ' : ''}
                    {preset.name}
                  </Text>
                  <Text
                    style={[
                      styles.modelOptionDesc,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {preset.description} (维度: {preset.dimensions})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 8, width: 60 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  sectionContent: {
    borderRadius: 12,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 14, paddingVertical: 12 },
  rowLabelWrap: { marginBottom: 6 },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  rowHint: { fontSize: 11, marginTop: 2 },
  rowContent: {},
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  smallInput: { width: 90 },
  multilineInput: { height: 80, textAlignVertical: 'top' },
  keyRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { padding: 8, marginLeft: 4 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  about: { padding: 30 },

  // 模型卡片
  modelCard: {
    margin: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  modelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelCardLabel: { fontSize: 12 },
  modelCardChange: { fontSize: 13, fontWeight: '600' },
  modelCardName: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modelCardDesc: { fontSize: 13, marginBottom: 8 },
  modelCardTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: { fontSize: 11, fontWeight: '600' },

  // Embedding 选择器
  embeddingSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'space-between',
  },

  // 模态弹窗
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  smallModal: {
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  modelOption: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  modelOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelOptionName: { fontSize: 15, fontWeight: '600' },
  modelOptionId: { fontSize: 11 },
  modelOptionDesc: { fontSize: 12, marginBottom: 6 },
  modelOptionTags: { flexDirection: 'row', gap: 6 },
  miniTag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    fontWeight: '600',
  },
});
