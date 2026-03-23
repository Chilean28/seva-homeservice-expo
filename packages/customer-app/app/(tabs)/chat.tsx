import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { getInitials } from '@/lib/avatar';
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
  worker_profiles: {
    user_id: string;
    users: { full_name: string; avatar_url: string | null } | null;
  } | null;
  bookings?: {
    service_id: string;
    services: { name: string } | null;
  } | null;
};

type LastMessage = { conversation_id: string; body: string; created_at: string; attachment_url?: string | null; sender_id?: string };

export default function ChatScreen() {
  const { user } = useAuth();
  const { setUnreadCount, setRefetchUnread, refetchUnread } = useUnreadChat();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const conversationIdsRef = useRef<string[]>([]);
  /** All conversation ids per worker (for unread when list is deduped). */
  const workerConvIdsRef = useRef<Record<string, string[]>>({});

  const fetchConversations = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
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
        worker_profiles (
          user_id,
          users (full_name, avatar_url)
        ),
        bookings (
          service_id,
          services (name)
        )
      `
      )
      .eq('customer_id', user.id)
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
      setUnreadCount(0);
      conversationIdsRef.current = [];
      workerConvIdsRef.current = {};
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

    /** One row per worker: pick the thread with the latest activity (avoids duplicate rows for repeat bookings). */
    const seenWorker = new Map<string, ConversationRow>();
    for (const c of sorted) {
      const prev = seenWorker.get(c.worker_id);
      if (!prev) {
        seenWorker.set(c.worker_id, c);
        continue;
      }
      const tPrev = byConv[prev.id]?.created_at ?? prev.updated_at;
      const tCurr = byConv[c.id]?.created_at ?? c.updated_at;
      seenWorker.set(c.worker_id, tCurr.localeCompare(tPrev) >= 0 ? c : prev);
    }
    const deduped = Array.from(seenWorker.values()).sort((a, b) => {
      const tA = byConv[a.id]?.created_at ?? a.updated_at;
      const tB = byConv[b.id]?.created_at ?? b.updated_at;
      return tB.localeCompare(tA);
    });

    const workerToConvIds: Record<string, string[]> = {};
    for (const c of sorted) {
      if (!workerToConvIds[c.worker_id]) workerToConvIds[c.worker_id] = [];
      workerToConvIds[c.worker_id].push(c.id);
    }
    conversationIdsRef.current = sorted.map((c) => c.id);
    workerConvIdsRef.current = workerToConvIds;

    setConversations(deduped);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id, setUnreadCount]);

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      if (!user?.id) return;
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
                .eq('customer_id', user.id);

              if (error) {
                Alert.alert('Error', error.message || 'Failed to delete chat.');
                return;
              }

              // Refresh list + unread count.
              await fetchConversations();
              await refetchUnread();
            })();
          },
        },
      ]);
    },
    [user?.id, fetchConversations, refetchUnread]
  );

  useEffect(() => {
    setRefetchUnread(async () => {
      if (!user?.id) return;
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_id', user.id);
      const ids = (convs ?? []).map((c: { id: string }) => c.id);
      if (ids.length === 0) {
        setUnreadCount(0);
        return;
      }
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .is('read_at', null)
        .neq('sender_id', user.id);
      setUnreadCount(count ?? 0);
    });
    return () => setRefetchUnread(null);
  }, [user?.id, setRefetchUnread, setUnreadCount]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime: new conversations where I'm the customer
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('chat-list-conversations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchConversations]);

  // Realtime: new messages in any of my conversations (refetch list so last message, order & unread update)
  useEffect(() => {
    if (!user?.id) return;
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
  }, [user?.id, fetchConversations]);

  const otherName = (row: ConversationRow) =>
    row.worker_profiles?.users?.full_name ?? 'Worker';
  const serviceLabel = (row: ConversationRow) => {
    const b = row.bookings;
    if (!b) return 'Chat';
    const s = Array.isArray(b) ? b[0]?.services : (b as { services?: { name: string } | null })?.services;
    return s?.name ?? 'Chat';
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchConversations();
                }}
                tintColor="#000"
              />
            }>
            <Ionicons name="chatbubbles-outline" size={56} color="#CCC" />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.placeholderText}>
              Start a chat from a booking (tap Message on a booking with a worker).
            </Text>
          </ScrollView>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const idsForWorker = workerConvIdsRef.current[item.worker_id] ?? [item.id];
              const hasUnread = idsForWorker.some((id) => unreadConvIds.has(id));
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
                      <Ionicons name="trash-outline" size={20} color="#fff" />
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
                      {item.worker_profiles?.users?.avatar_url ? (
                        <Image
                          source={{ uri: item.worker_profiles.users.avatar_url }}
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchConversations();
                }}
                tintColor="#000"
              />
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
