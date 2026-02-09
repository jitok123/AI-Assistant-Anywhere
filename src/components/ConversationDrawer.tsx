/**
 * 对话列表侧边栏组件（抽屉）
 */
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';

interface Props {
  onClose: () => void;
}

export function ConversationDrawer({ onClose }: Props) {
  const colors = useTheme();
  const router = useRouter();
  const {
    conversations,
    currentConversationId,
    selectConversation,
    newConversation,
    deleteConversation,
    renameConversation,
  } = useAppStore();

  const handleSelect = async (id: string) => {
    await selectConversation(id);
    onClose();
  };

  const handleNew = async () => {
    await newConversation();
    onClose();
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('删除对话', `确定要删除"${title}"吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteConversation(id),
      },
    ]);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.sidebarBg }]}>
      {/* 头部 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>对话列表</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 新建对话 */}
      <TouchableOpacity
        onPress={handleNew}
        style={[styles.newBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.newBtnText}>+ 新建对话</Text>
      </TouchableOpacity>

      {/* 对话列表 */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isActive = item.id === currentConversationId;
          return (
            <TouchableOpacity
              style={[
                styles.item,
                {
                  backgroundColor: isActive ? colors.primaryLight : 'transparent',
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => handleSelect(item.id)}
              onLongPress={() => handleDelete(item.id, item.title)}
            >
              <Text
                style={[
                  styles.itemTitle,
                  { color: isActive ? colors.primary : colors.text },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text style={[styles.itemDate, { color: colors.textTertiary }]}>
                {formatDate(item.updatedAt)}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.textTertiary }}>暂无对话</Text>
          </View>
        }
      />

      {/* 底部导航 */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => {
            onClose();
            router.push('/settings');
          }}
        >
          <Text style={{ color: colors.textSecondary }}>⚙️ 设置</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => {
            onClose();
            router.push('/rag');
          }}
        >
          <Text style={{ color: colors.textSecondary }}>📚 知识库</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  newBtn: {
    margin: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  newBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemDate: {
    fontSize: 11,
    marginTop: 3,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingVertical: 12,
    paddingBottom: 30,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
});
