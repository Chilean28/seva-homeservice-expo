import { getInitials } from '@/lib/avatar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnreadChat } from '@/lib/contexts/UnreadChatContext';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  formatAudioTime,
  isJobChatOpen,
  openPhoneDialer,
  parseVoiceDurationMs,
  useChatKeyboard,
  type PhoneDialerCopy,
} from '@seva/shared';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoAV = require('expo-av');
const Audio = ExpoAV.Audio as any;
const { InterruptionModeIOS, InterruptionModeAndroid } = ExpoAV;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_url?: string | null;
};

type ConvMeta = {
  otherName: string;
  serviceName: string;
  /** Last 6 chars of booking id for display */
  bookingId: string | null;
  /** Full booking UUID for Jobs tab highlight / job detail */
  bookingFullId: string | null;
  customerPhone: string | null;
  avatarUrl: string | null;
};

const CALL_CUSTOMER_COPY: PhoneDialerCopy = {
  noPhoneTitle: 'No phone number',
  noPhoneMessage: 'This customer has not added a phone number to their profile.',
  invalidTitle: 'Invalid number',
  invalidMessage: 'Could not use this phone number.',
  dialerUnsupportedTitle: 'Unable to call',
  dialerUnsupportedMessage: 'This device cannot open the phone dialer.',
  openFailedTitle: 'Unable to call',
  openFailedMessage: 'Could not open the phone app.',
};

export default function ConversationScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { setUnreadCount } = useUnreadChat();
  const { workerId } = useWorkerProfile(user?.id);
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ConvMeta>({
    otherName: 'Chat',
    serviceName: '',
    bookingId: null,
    bookingFullId: null,
    customerPhone: null,
    avatarUrl: null,
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImageUris, setPendingImageUris] = useState<string[]>([]);
  const { keyboardVisible, keyboardHeight } = useChatKeyboard();
  const listRef = useRef<FlatList>(null);
  const prevBookingStatusRef = useRef<string | null>(null);
  const [recording, setRecording] = useState<any | null>(null);
  const [recordingMillis, setRecordingMillis] = useState(0);
  const [recordingSending, setRecordingSending] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playbackPosMs, setPlaybackPosMs] = useState(0);
  const [playbackDurMs, setPlaybackDurMs] = useState(0);
  const [playbackIsPlaying, setPlaybackIsPlaying] = useState(false);
  const [voiceDurationCache, setVoiceDurationCache] = useState<Record<string, number>>({});
  const [bookingScheduledAt, setBookingScheduledAt] = useState<string | null>(null);
  const [, setChatWindowTick] = useState(0);
  const soundRef = useRef<{
    unloadAsync: () => Promise<unknown>;
    getStatusAsync: () => Promise<{
      isLoaded?: boolean;
      isPlaying?: boolean;
      positionMillis?: number;
      durationMillis?: number;
    }>;
    pauseAsync: () => Promise<unknown>;
    playAsync: () => Promise<unknown>;
  } | null>(null);
  const recPulseAnim = useRef(new Animated.Value(1)).current;
  const playPulseAnim = useRef(new Animated.Value(1)).current;
  const playbackCachePathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recording) {
      recPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recPulseAnim, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(recPulseAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording, recPulseAnim]);

  useEffect(() => {
    if (!playbackIsPlaying || !playingMessageId) {
      playPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(playPulseAnim, { toValue: 0.45, duration: 400, useNativeDriver: true }),
        Animated.timing(playPulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [playbackIsPlaying, playingMessageId, playPulseAnim]);

  useEffect(() => {
    if (keyboardHeight > 0) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return () => clearTimeout(t);
    }
  }, [keyboardHeight]);

  const fetchUnreadCount = useCallback(async () => {
    if (!workerId || !user?.id) return 0;
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .eq('worker_id', workerId);
    const ids = (convs ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return 0;
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', ids)
      .is('read_at', null)
      .neq('sender_id', user.id);
    return count ?? 0;
  }, [workerId, user?.id]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoadError(null);
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at, attachment_url')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) {
      setLoadError(error.message || 'Could not load messages.');
    } else if (msgs) {
      setMessages(msgs as MessageRow[]);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const { data: conv } = await supabase
        .from('conversations')
        .select(
          'customer_id, worker_id, booking_id, users!conversations_customer_id_fkey (full_name, avatar_url, phone), bookings (id, scheduled_date, status, services (name))'
        )
        .eq('id', conversationId)
        .single();
      if (conv && workerId && (conv as { worker_id: string }).worker_id === workerId) {
        const c = conv as {
          booking_id?: string | null;
          users?: { full_name: string; avatar_url: string | null; phone?: string | null } | null;
          bookings?: {
            id: string;
            scheduled_date: string;
            status?: string;
            services: { name: string } | null;
          } | null | Array<{
            id: string;
            scheduled_date: string;
            status?: string;
            services: { name: string } | null;
          }>;
        };
        const otherName = c.users?.full_name ?? 'Customer';
        const avatarUrl = c.users?.avatar_url ?? null;
        const customerPhone = (c.users?.phone ?? '').trim() || null;
        const b = Array.isArray(c.bookings) ? c.bookings[0] : c.bookings;
        const serviceName = b?.services?.name ?? '';
        const rawId = b?.id;
        const bookingFullId = rawId ? String(rawId) : null;
        const bookingId = bookingFullId ? bookingFullId.slice(-6) : null;
        prevBookingStatusRef.current = b?.status ?? null;
        setMeta({ otherName, serviceName, bookingId, bookingFullId, customerPhone, avatarUrl });
        setBookingScheduledAt(b?.scheduled_date ?? null);
      } else {
        setLoadError('You do not have access to this conversation.');
        setLoading(false);
        return;
      }
      fetchMessages();
    })();
  }, [conversationId, workerId, fetchMessages]);

  useEffect(() => {
    const id = setInterval(() => setChatWindowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newRow = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    const bid = meta.bookingFullId;
    if (!bid) return;
    const channel = supabase
      .channel(`booking-status-w:${bid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bid}`,
        },
        (payload) => {
          const row = payload.new as { status?: string };
          const newStatus = row?.status;
          if (!newStatus) return;
          const prev = prevBookingStatusRef.current;
          if (prev != null && prev !== newStatus) {
            Alert.alert(
              'Booking update',
              `Job status is now ${newStatus.replace(/_/g, ' ')}.`
            );
          }
          prevBookingStatusRef.current = newStatus;
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meta.bookingFullId]);

  const sendMessage = useCallback(async () => {
    const body = input.trim();
    if (!body || !user?.id || !conversationId || sending || recording) return;
    setSending(true);
    setInput('');
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body,
    } as never);
    setSending(false);
    if (!error) fetchMessages();
  }, [input, user?.id, conversationId, sending, fetchMessages]);

  const pickImage = useCallback(async () => {
    if (!user?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    if (uris.length) setPendingImageUris((prev) => [...prev, ...uris].slice(0, 10));
  }, [user?.id]);

  const removePendingImage = useCallback((index: number) => {
    setPendingImageUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadAndSendImages = useCallback(
    async (uris: string[]) => {
      if (!conversationId || !user?.id || sending || recording || !uris.length) return;
      setSending(true);
      const caption = input.trim();
      setInput('');
      setPendingImageUris([]);
      try {
        for (let i = 0; i < uris.length; i++) {
          const uri = uris[i];
          const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${i}.jpg`;
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) {
            Alert.alert('Upload failed', 'Image file not found. Try choosing again.');
            setPendingImageUris(uris.slice(i));
            break;
          }
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
          if (!base64 || base64.length < 100) {
            Alert.alert('Upload failed', 'Could not read image data. Try another photo.');
            setPendingImageUris(uris.slice(i));
            break;
          }
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
          const { error: uploadError } = await supabase.storage
            .from('chat-attachments')
            .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) {
            Alert.alert('Upload failed', uploadError.message);
            setPendingImageUris(uris.slice(i));
            break;
          }
          const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);
          const attachmentUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
          const body = i === 0 ? caption : '';
          const { error: insertError } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: user.id,
            body,
            attachment_url: attachmentUrl,
          } as never);
          if (insertError) {
            Alert.alert('Send failed', insertError.message);
            setPendingImageUris(uris.slice(i));
            break;
          }
        }
        fetchMessages();
      } finally {
        setSending(false);
      }
    },
    [conversationId, user?.id, sending, recording, input, fetchMessages]
  );

  const onSendPress = useCallback(() => {
    if (pendingImageUris.length > 0) {
      uploadAndSendImages(pendingImageUris);
      return;
    }
    if (input.trim()) sendMessage();
  }, [pendingImageUris, input, uploadAndSendImages, sendMessage]);

  const startRecording = useCallback(async () => {
    if (recording || recordingSending || !user?.id || !conversationId) return;
    try {
      const permResult = await Audio.requestPermissionsAsync();
      const status = (permResult as { status?: string }).status;
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your microphone to record voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recording.setOnRecordingStatusUpdate((status: any) => {
        if (status.isRecording) {
          setRecordingMillis(status.durationMillis ?? 0);
        }
      });
      setRecording(recording);
    } catch {
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  }, [recording, recordingSending, user?.id, conversationId]);

  const stopRecordingAndSend = useCallback(async () => {
    if (!recording || !user?.id || !conversationId || recordingSending) return;
    setRecordingSending(true);
    let voiceDurationMs = recordingMillis;
    try {
      const st = await recording.getStatusAsync?.();
      if (st && typeof st.durationMillis === 'number' && st.durationMillis > 0) {
        voiceDurationMs = st.durationMillis;
      }
    } catch {
      /* use recordingMillis */
    }
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) {
        setRecordingSending(false);
        return;
      }
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        Alert.alert('Send failed', 'Audio file not found. Try again.');
        setRecordingSending(false);
        return;
      }
      const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.m4a`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (!base64 || base64.length < 100) {
        Alert.alert('Send failed', 'Could not read audio data. Try again.');
        setRecordingSending(false);
        return;
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, bytes, { contentType: 'audio/m4a', upsert: false });
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        setRecordingSending(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);
      const attachmentUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: String(Math.max(0, Math.round(voiceDurationMs))),
        attachment_url: attachmentUrl,
      } as never);
      if (insertError) {
        Alert.alert('Send failed', insertError.message);
        setRecordingSending(false);
        return;
      }
      fetchMessages();
    } catch {
      Alert.alert('Send failed', 'Could not send voice message. Try again.');
    } finally {
      setRecordingSending(false);
      setRecordingMillis(0);
    }
  }, [recording, recordingMillis, user?.id, conversationId, recordingSending, fetchMessages]);

  const onMicPress = useCallback(() => {
    if (recording) {
      void stopRecordingAndSend();
    } else {
      void startRecording();
    }
  }, [recording, startRecording, stopRecordingAndSend]);

  const stopVoicePlayback = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) await s.unloadAsync().catch(() => { });
    if (playbackCachePathRef.current) {
      void FileSystem.deleteAsync(playbackCachePathRef.current, { idempotent: true }).catch(() => { });
      playbackCachePathRef.current = null;
    }
    setPlayingMessageId(null);
    setPlaybackPosMs(0);
    setPlaybackDurMs(0);
    setPlaybackIsPlaying(false);
  }, []);

  const playVoiceMessage = useCallback(
    async (messageId: string, url: string) => {
      let localPath: string | null = null;
      try {
        if (soundRef.current && playingMessageId === messageId) {
          const st = await soundRef.current.getStatusAsync();
          if (st.isLoaded && st.isPlaying) {
            await soundRef.current.pauseAsync();
            setPlaybackIsPlaying(false);
            return;
          }
          if (st.isLoaded && !st.isPlaying) {
            await soundRef.current.playAsync();
            setPlaybackIsPlaying(true);
            return;
          }
        }
        await stopVoicePlayback();
        playbackCachePathRef.current = null;
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        let playUri = url;
        const cacheDir = FileSystem.cacheDirectory;
        if (cacheDir) {
          localPath = `${cacheDir}voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
          try {
            const dl = await FileSystem.downloadAsync(url, localPath);
            if (dl?.uri) playUri = dl.uri;
          } catch {
            localPath = null;
          }
        }
        if (localPath) playbackCachePathRef.current = localPath;
        const { sound } = await Audio.Sound.createAsync({ uri: playUri }, { shouldPlay: true, volume: 1 });
        soundRef.current = sound;
        setPlayingMessageId(messageId);
        setPlaybackIsPlaying(true);
        sound.setOnPlaybackStatusUpdate(
          (status: {
            isLoaded?: boolean;
            didJustFinish?: boolean;
            positionMillis?: number;
            durationMillis?: number;
            isPlaying?: boolean;
          }) => {
            if (!status.isLoaded) return;
            const dur = status.durationMillis ?? 0;
            const pos = status.positionMillis ?? 0;
            setPlaybackDurMs(dur);
            setPlaybackPosMs(pos);
            setPlaybackIsPlaying(!!status.isPlaying);
            if (dur > 0) setVoiceDurationCache((prev) => ({ ...prev, [messageId]: dur }));
            if (status.didJustFinish) {
              void sound.unloadAsync();
              const p = playbackCachePathRef.current;
              playbackCachePathRef.current = null;
              if (p) void FileSystem.deleteAsync(p, { idempotent: true }).catch(() => { });
              soundRef.current = null;
              setPlayingMessageId(null);
              setPlaybackPosMs(0);
              setPlaybackDurMs(0);
              setPlaybackIsPlaying(false);
            }
          }
        );
      } catch {
        if (localPath) void FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => { });
        await stopVoicePlayback();
        Alert.alert('Playback failed', 'Could not play this audio message.');
      }
    },
    [playingMessageId, stopVoicePlayback]
  );

  const isOwn = (senderId: string) => senderId === user?.id;

  useEffect(() => {
    if (!conversationId || !workerId || !user?.id) return;
    (async () => {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() } as never)
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id)
        .is('read_at', null);
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    })();
  }, [conversationId, workerId, user?.id, fetchUnreadCount, setUnreadCount]);

  const openJobDetailsFromChat = useCallback(() => {
    if (!meta.bookingFullId) return;
    router.push(`/job/${meta.bookingFullId}` as Parameters<typeof router.push>[0]);
  }, [meta.bookingFullId]);

  const onCallCustomer = useCallback(() => {
    openPhoneDialer(meta.customerPhone, CALL_CUSTOMER_COPY);
  }, [meta.customerPhone]);

  if (!conversationId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Invalid conversation.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const titleLine = meta.serviceName ? `${meta.otherName} - ${meta.serviceName}` : meta.otherName;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          {meta.avatarUrl ? (
            <Image source={{ uri: meta.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarFallback]}>
              <Text style={styles.headerAvatarInitials}>{getInitials(meta.otherName)}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.headerCenterTouchable}
            onPress={openJobDetailsFromChat}
            disabled={!meta.bookingFullId}
            activeOpacity={meta.bookingFullId ? 0.65 : 1}
            accessibilityRole="button"
            accessibilityLabel={meta.bookingFullId ? 'View job details' : undefined}
          >
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {titleLine}
              </Text>
              {meta.bookingId ? (
                <Text style={styles.headerSubtitle}>
                  Booking ID : {meta.bookingId}
                  {meta.bookingFullId ? ' · Tap for details' : ''}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCallCustomer}
            style={styles.headerCallBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Call customer"
            accessibilityRole="button"
          >
            <Ionicons name="call-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        enabled
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#000" />
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 8 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const own = isOwn(item.sender_id);
              return (
                <View style={[styles.bubbleRow, own ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
                  {!own ? (
                    meta.avatarUrl ? (
                      <Image source={{ uri: meta.avatarUrl }} style={styles.bubbleAvatar} />
                    ) : (
                      <View style={[styles.bubbleAvatar, styles.avatarFallback]}>
                        <Text style={styles.bubbleAvatarInitials}>{getInitials(meta.otherName)}</Text>
                      </View>
                    )
                  ) : null}
                  {item.attachment_url ? (
                    /\.(jpe?g|png|webp)(\?|$)/i.test(item.attachment_url) ? (
                      <View style={styles.bubblePhotoContainer}>
                        <View style={styles.bubbleImageWrap}>
                          <ExpoImage
                            source={{ uri: item.attachment_url }}
                            style={styles.bubbleImage}
                            contentFit="cover"
                            transition={200}
                          />
                        </View>
                        {item.body ? (
                          <View style={[styles.bubblePhotoTextBar, own ? styles.bubblePhotoTextBarOwn : styles.bubblePhotoTextBarOther]}>
                            <Text style={styles.bubbleText}>{item.body}</Text>
                            <Text style={styles.bubbleTime}>
                              {new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.bubbleTime}>
                            {new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        )}
                      </View>
                    ) : (() => {
                      const fromBody = parseVoiceDurationMs(item.body);
                      const cachedDur = voiceDurationCache[item.id] ?? 0;
                      const isThis = playingMessageId === item.id;
                      const totalMs =
                        fromBody > 0
                          ? fromBody
                          : cachedDur > 0
                            ? cachedDur
                            : isThis && playbackDurMs > 0
                              ? playbackDurMs
                              : 0;
                      const showProgress = isThis && (playbackIsPlaying || playbackPosMs > 0);
                      const totalDisplay = totalMs > 0 ? totalMs : isThis && playbackDurMs > 0 ? playbackDurMs : 0;
                      return (
                        <TouchableOpacity
                          style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleVoice]}
                          onPress={() => playVoiceMessage(item.id, item.attachment_url!)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.voiceRow}>
                            <Animated.View style={{ opacity: isThis && playbackIsPlaying ? playPulseAnim : 1 }}>
                              <Ionicons
                                name={isThis && playbackIsPlaying ? 'pause-circle' : 'play-circle'}
                                size={26}
                                color="#000"
                              />
                            </Animated.View>
                            <View style={styles.voiceTextWrap}>
                              <Text style={styles.voiceLabel}>
                                {showProgress && totalDisplay > 0
                                  ? `${formatAudioTime(playbackPosMs)} / ${formatAudioTime(totalDisplay)}`
                                  : showProgress
                                    ? formatAudioTime(playbackPosMs)
                                    : totalDisplay > 0
                                      ? `Voice · ${formatAudioTime(totalDisplay)}`
                                      : 'Voice message'}
                              </Text>
                              <Text style={styles.bubbleTime}>
                                {new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })()
                  ) : (
                    <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
                      <Text style={styles.bubbleText}>{item.body}</Text>
                      <Text style={styles.bubbleTime}>
                        {new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {recording && (!bookingScheduledAt || isJobChatOpen(bookingScheduledAt)) ? (
          <View style={styles.recordingBar}>
            <Animated.View style={[styles.recordingDot, { opacity: recPulseAnim }]} />
            <Text style={styles.recordingTime}>{formatAudioTime(recordingMillis)}</Text>
            <Text style={styles.recordingHint}>Recording · tap stop to send</Text>
          </View>
        ) : null}

        {!bookingScheduledAt || isJobChatOpen(bookingScheduledAt) ? (
          <View
            style={[
              styles.inputRow,
              {
                paddingBottom: keyboardVisible
                  ? 8
                  : Platform.OS === 'android'
                    ? 12
                    : 12 + insets.bottom,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.inputIconBtnLeft}
              onPress={pickImage}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Choose photo"
            >
              <Ionicons name="image-outline" size={24} color="#000" />
            </TouchableOpacity>
            <View
              style={[
                styles.inputBox,
                pendingImageUris.length > 0 ? styles.inputBoxWithPhotos : null,
              ]}
            >
              {pendingImageUris.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingImagesScroll} style={styles.pendingImagesScrollWrap}>
                  {pendingImageUris.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={styles.pendingImageWrap}>
                      <ExpoImage source={{ uri }} style={styles.pendingImage} contentFit="cover" />
                      <TouchableOpacity
                        style={styles.pendingImageRemove}
                        onPress={() => removePendingImage(index)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remove selected photo"
                      >
                        <Ionicons name="close-circle" size={22} color="#333" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <TextInput
                style={[styles.input, pendingImageUris.length > 0 && styles.inputWithPhotos]}
                value={input}
                onChangeText={setInput}
                placeholder="Messages..."
                placeholderTextColor="#999"
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                maxLength={2000}
              />
            </View>
            <TouchableOpacity
              style={[styles.micBtn, (sending || recordingSending) && styles.micBtnDisabled]}
              onPress={onMicPress}
              disabled={sending || recordingSending}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop and send voice message' : 'Record voice message'}
            >
              <Ionicons
                name={recording ? 'stop-circle' : 'mic'}
                size={24}
                color={recording ? '#D32F2F' : '#000'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, ((!input.trim() && pendingImageUris.length === 0) || sending || recording) && styles.sendBtnDisabled]}
              onPress={onSendPress}
              disabled={(!input.trim() && pendingImageUris.length === 0) || sending || recording}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.chatEndedBar,
              { paddingBottom: Platform.OS === 'android' ? 12 : 12 + insets.bottom },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={20} color="#666" />
            <Text style={styles.chatEndedText}>
              This chat closed 48 hours after the scheduled job. You can still read messages above.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  headerWrapper: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    ...appScreenHeaderBarPadding,
  },
  backBtn: { padding: 8, marginRight: 4 },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0E0E0',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  headerAvatarInitials: { fontSize: 18, fontWeight: '600', color: '#666' },
  headerCenterTouchable: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headerCenter: { minWidth: 0, justifyContent: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  headerCallBtn: {
    padding: 8,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { padding: 16, paddingBottom: 8 },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  bubbleAvatarInitials: { fontSize: 12, fontWeight: '600', color: '#666' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleOwn: {
    backgroundColor: '#FFEB3B',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: '#000' },
  bubblePhotoContainer: { maxWidth: '80%' },
  bubblePhotoLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  bubblePhotoTextBar: { padding: 12, borderRadius: 16, marginTop: 4, maxWidth: '100%' },
  bubblePhotoTextBarOwn: { backgroundColor: '#FFEB3B', borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  bubblePhotoTextBarOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E8', borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  bubbleImageWrap: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  bubbleImage: { width: '100%', height: '100%' },
  bubbleTime: { fontSize: 11, color: '#666', marginTop: 4 },
  bubbleVoice: {},
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceTextWrap: { flexDirection: 'column' },
  voiceLabel: { fontSize: 14, fontWeight: '600', color: '#000' },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFEBE8',
    borderTopWidth: 1,
    borderTopColor: '#FFCDD2',
    gap: 10,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D32F2F',
  },
  recordingTime: { fontSize: 17, fontWeight: '700', color: '#B71C1C', fontVariant: ['tabular-nums'] },
  recordingHint: { flex: 1, fontSize: 13, color: '#666' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  inputBox: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    backgroundColor: '#FFEB3B',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
    maxHeight: 220,
  },
  inputBoxWithPhotos: {
    minHeight: 120,
    maxHeight: 320,
  },
  pendingImagesScrollWrap: { marginBottom: 6, maxHeight: 72 },
  pendingImagesScroll: { flexDirection: 'row', gap: 6 },
  pendingImageWrap: { position: 'relative' },
  pendingImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  pendingImageRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    paddingHorizontal: 4,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 16,
    lineHeight: 22,
    color: '#000',
    minHeight: 28,
    maxHeight: 152,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  inputWithPhotos: { minHeight: 32 },
  inputIconBtnLeft: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    marginBottom: 6,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    marginBottom: 6,
  },
  micBtnDisabled: { opacity: 0.5 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFEB3B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    marginBottom: 6,
  },
  sendBtnDisabled: { opacity: 0.5 },
  chatEndedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: '#F5F5F5',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  chatEndedText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#666' },
  backButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
  },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },
});
