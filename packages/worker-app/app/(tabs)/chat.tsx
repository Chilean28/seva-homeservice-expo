import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { getInitials } from '@/lib/avatar';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnreadChat } from '@/lib/contexts/UnreadChatContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import {
  FlatList,
  Image,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

type ConversationRow = {
  id: string;
  customer_id: string;
  worker_id: string;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
  users?: { full_name: string; avatar_url: string | null } | null;
  bookings?: { id: string; services: { name: string } | null } | null | Array<{ id: string; services: { name: string } | null }>;
};

type LastMessage = { conversation_id: string; body: string; created_at: string; attachment_url?: string | null; sender_id?: string };

export default function ChatScreen() {
  const { user } = useAuth();
  const { setUnreadCount } = useUnreadChat();
  const { workerId, loading: profileLoading, refetch: refetchProfile } = useWorkerProfile(user?.id);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const conversationIdsRef = useRef<string[]>([]);


  const fetchConversations = useCallback(async () => {
    if (!workerId) {
      setConversations([]);
      setLastMessages({});
      setLoading(false);
      setRefreshing(false);
      setUnreadCount(0);
      return;
    }
    const { data: convs, error } = await supabase
      .from('conversations')
      .select(
        `
        id,
        customer_id,
        worker_id,
        booking_id,
        created_at,
        updated_at,
        users!conversations_customer_id_fkey (full_name, avatar_url),
        bookings (id, services (name))
      `
      )
      .eq('worker_id', workerId)
      .order('updated_at', { ascending: false });

    if (error) {
      setConversations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const list = (convs as ConversationRow[]) ?? [];

    if (list.length === 0) {
      setConversations([]);
      setLastMessages({});
      setUnreadConvIds(new Set());
      conversationIdsRef.current = [];
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const ids = list.map((c) => c.id);
    const [msgsRes, unreadRes] = await Promise.all([
      supabase
        .from('messages')
        .select('conversation_id, body, created_at, attachment_url, sender_id')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false }),
      user?.id
        ? supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', ids)
            .is('read_at', null)
            .neq('sender_id', user.id)
        : { data: [] as { conversation_id: string }[] },
    ]);
    const byConv: Record<string, LastMessage> = {};
    for (const m of msgsRes.data ?? []) {
      const msg = m as LastMessage;
      if (!byConv[msg.conversation_id]) byConv[msg.conversation_id] = msg;
    }
    const unreadIds = new Set((unreadRes.data ?? []).map((r) => r.conversation_id));
    setLastMessages(byConv);
    setUnreadConvIds(unreadIds);
    setUnreadCount((unreadRes.data ?? []).length);
    const sorted = [...list].sort((a, b) => {
      const tA = byConv[a.id]?.created_at ?? a.created_at;
      const tB = byConv[b.id]?.created_at ?? b.created_at;
      return tB.localeCompare(tA);
    });
    setConversations(sorted);
    conversationIdsRef.current = sorted.map((c) => c.id);
    setLoading(false);
    setRefreshing(false);
  }, [workerId, user?.id, setUnreadCount]);

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      if (!workerId) return;
      Alert.alert('Delete chat?', 'This will remove the entire chat thread.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await supabase
                .from('conversations')
                .delete()
                .eq('id', conversationId)
                .eq('worker_id', workerId);

              if (error) {
                Alert.alert('Error', error.message || 'Failed to delete chat.');
                return;
              }

              await fetchConversations();
            })();
          },
        },
      ]);
    },
    [workerId, fetchConversations]
  );

  useEffect(() => {
    if (!profileLoading) fetchConversations();
  }, [profileLoading, fetchConversations]);

  // Realtime: new conversations where I'm the worker
  useEffect(() => {
    if (!workerId) return;
    const channel = supabase
      .channel('chat-list-conversations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `worker_id=eq.${workerId}`,
        },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId, fetchConversations]);

  // Realtime: new messages in any of my conversations (refetch list so last message, order & unread update)
  useEffect(() => {
    if (!workerId) return;
    const channel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const convId = (payload.new as { conversation_id?: string })?.conversation_id;
          if (convId && conversationIdsRef.current.includes(convId)) {
            fetchConversations();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const convId = (payload.new as { conversation_id?: string })?.conversation_id;
          if (convId && conversationIdsRef.current.includes(convId)) {
            fetchConversations();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId, fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), fetchConversations()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, fetchConversations]);

  const otherName = (row: ConversationRow) => (row.users as { full_name?: string } | null)?.full_name ?? 'Customer';
  const serviceLabel = (row: ConversationRow) => {
    const b = row.bookings;
    if (!b) return 'Chat';
    const single = Array.isArray(b) ? b[0] : b;
    return (single as { services?: { name: string } | null })?.services?.name ?? 'Chat';
  };
  const lastMsg = (row: ConversationRow) => {
    const m = lastMessages[row.id];
    if (!m) return 'No messages yet';
    if (m.attachment_url) {
      const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(m.attachment_url);
      if (isImage) return m.sender_id === user?.id ? 'You sent a photo' : 'Sent a photo';
      return m.sender_id === user?.id ? 'You sent a voice message' : 'Voice message';
    }
    return m.body.length > 40 ? m.body.slice(0, 40) + '...' : m.body;
  };

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.placeholderText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!workerId) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={APP_SCREEN_HEADER_BG} />
        <View style={styles.headerWrapper}>
          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Message</Text>
              </View>
              <View style={styles.headerSide} />
            </View>
          </SafeAreaView>
        </View>
        <View style={styles.centered}>
          <Text style={styles.placeholderText}>Complete your profile to use chat.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={APP_SCREEN_HEADER_BG} />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Message</Text>
            </View>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>

      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.content}>
        {loading ? (
          <View style={styles.centered}>
            <Text style={styles.placeholderText}>Loading...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.centered}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
            }>
            <Ionicons name="chatbubbles-outline" size={56} color="#CCC" />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.placeholderText}>Customers can start a chat from a booking.</Text>
          </ScrollView>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const hasUnread = unreadConvIds.has(item.id);
              return (
                <Swipeable
                  containerStyle={styles.swipeContainer}
                  childrenContainerStyle={styles.swipeChildren}
                  renderRightActions={() => (
                    <TouchableOpacity
                      style={styles.deleteAction}
                      onPress={() => handleDeleteConversation(item.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                  overshootRight={false}
                  rightThreshold={40}
                >
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => router.push(`/conversation/${item.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarWrap}>
                      {item.users?.avatar_url ? (
                        <Image
                          source={{ uri: item.users.avatar_url }}
                          style={styles.avatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.avatarPlaceholder, styles.avatarFallback]}>
                          <Text style={styles.avatarInitials}>{getInitials(otherName(item))}</Text>
                        </View>
                      )}
                      {hasUnread ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <View style={styles.rowContent}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.senderName, hasUnread && styles.senderNameUnread]} numberOfLines={1}>
                          {otherName(item)}
                        </Text>
                        <Text style={styles.serviceTag} numberOfLines={1}>
                          {serviceLabel(item)}
                        </Text>
                      </View>
                      <Text style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]} numberOfLines={1}>
                        {lastMsg(item)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
            }
          />
        )}
        </View>
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  headerSide: { width: 40, minHeight: 44, justifyContent: 'center' },
  headerSideRight: { width: 40, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  content: { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingVertical: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 16 },
  placeholderText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 22, fontWeight: '600', color: '#666' },
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  senderNameUnread: {
    fontWeight: '800',
  },
  serviceTag: { fontSize: 13, color: '#999' },
  lastMessage: { fontSize: 14, color: '#666' },
  lastMessageUnread: {
    fontWeight: '600',
    color: '#000',
  },
  separator: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginLeft: 20,
    marginRight: 20,
  },
  deleteAction: {
    width: 86,
    height: '100%',
    marginLeft: 0,
    marginRight: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeContainer: { overflow: 'hidden', borderRadius: 12 },
  swipeChildren: { backgroundColor: '#fff' },
});
