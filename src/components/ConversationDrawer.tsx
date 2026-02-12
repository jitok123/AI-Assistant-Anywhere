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
  Pressable,
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

  const formatGroup = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const delta = now.getTime() - d.getTime();
    if (d.toDateString() === now.toDateString()) return '今天';
    if (delta <= 7 * 24 * 60 * 60 * 1000) return '7天内';
    return '更早';
  };

  const groupedData = conversations.map((item, index) => {
    const current = formatGroup(item.updatedAt);
    const prev = index > 0 ? formatGroup(conversations[index - 1].updatedAt) : '';
    return {
      ...item,
      showGroupHeader: current !== prev,
      groupLabel: current,
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.sidebarBg }]}>
      {/* 头部 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>对话列表</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>✕</Text>
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
        data={groupedData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isActive = item.id === currentConversationId;
          return (
            <View>
              {item.showGroupHeader && (
                <Text style={[styles.groupHeader, { color: colors.textTertiary }]}>
                  {item.groupLabel}
                </Text>
              )}
              <Pressable
                style={[
                  styles.item,
                  {
                    backgroundColor: isActive ? colors.primaryLight : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
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
                <Text style={[styles.itemDate, { color: colors.textSecondary }]}>
                  {formatDate(item.updatedAt)}
                </Text>
              </Pressable>
            </View>
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
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>设置</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => {
            onClose();
            router.push('/rag');
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>知识库</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: 320,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
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
    marginHorizontal: 14,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  newBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  item: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
    marginLeft: 14,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 12,
    marginTop: 4,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
});
