/**
 * 对话列表侧边栏组件（抽屉）
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';
import { APP_AVATAR } from '../constants/branding';

interface Props {
  onClose: () => void;
}

export function ConversationDrawer({ onClose }: Props) {
  const colors = useTheme();
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const {
    conversations,
    currentConversationId,
    selectConversation,
    newConversation,
    deleteConversation,
    deleteConversations,
  } = useAppStore();

  const handleSelect = async (id: string) => {
    if (editMode) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
      return;
    }
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

  const toggleEditMode = () => {
    setEditMode((prev) => !prev);
    setSelectedIds([]);
  };

  const allSelected = useMemo(
    () => conversations.length > 0 && selectedIds.length === conversations.length,
    [selectedIds.length, conversations.length]
  );

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(conversations.map((c) => c.id));
    }
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    Alert.alert('批量删除', `确定删除已选中的 ${selectedIds.length} 个会话吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteConversations(selectedIds);
          setSelectedIds([]);
          setEditMode(false);
        },
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
        <View style={styles.headerLeft}>
          <Image source={APP_AVATAR} style={styles.headerAvatar} />
          <Text style={[styles.title, { color: colors.text }]}>对话列表</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleEditMode} style={styles.headerActionBtn}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              {editMode ? '完成' : '编辑'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {editMode && (
        <View style={[styles.editToolbar, { borderBottomColor: colors.border }]}> 
          <TouchableOpacity onPress={toggleSelectAll}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {allSelected ? '取消全选' : '全选'}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
            已选 {selectedIds.length} 项
          </Text>
        </View>
      )}

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
                onLongPress={() => !editMode && handleDelete(item.id, item.title)}
              >
                <View style={styles.itemMain}>
                  {editMode && (
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: selectedIds.includes(item.id) ? colors.primary : colors.border,
                          backgroundColor: selectedIds.includes(item.id) ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {selectedIds.includes(item.id) && (
                        <Text style={styles.checkboxTick}>✓</Text>
                      )}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
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
                  </View>
                </View>
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
        {editMode ? (
          <TouchableOpacity
            style={[
              styles.bulkDeleteBtn,
              {
                backgroundColor: selectedIds.length ? colors.danger : colors.border,
              },
            ]}
            onPress={handleBulkDelete}
            disabled={!selectedIds.length}
          >
            <Text style={styles.bulkDeleteText}>删除已选会话</Text>
          </TouchableOpacity>
        ) : (
          <>
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
          </>
        )}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  headerActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
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
  editToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
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
  itemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxTick: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: -1,
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
  bulkDeleteBtn: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bulkDeleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
