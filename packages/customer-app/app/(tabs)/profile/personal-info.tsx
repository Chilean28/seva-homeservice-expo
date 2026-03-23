import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AVATAR_BUCKET = 'avatars';

export default function PersonalInfoScreen() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null | undefined>(undefined);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const authAvatarUrl = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const avatarUrl = localAvatarUrl !== undefined ? localAvatarUrl : authAvatarUrl;
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? '';
  const email = user?.email ?? '—';

  useEffect(() => {
    setLocalAvatarUrl(undefined);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setPhone(((data as { phone?: string } | null)?.phone ?? '').trim());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const updateAvatarUrl = useCallback(
    async (url: string | null) => {
      if (!user?.id) return;
      const value = url ?? null;
      await supabase.auth.updateUser({ data: { avatar_url: value } });
      await supabase.from('users').update({ avatar_url: value } as never).eq('id', user.id);
      const { data } = await supabase.auth.refreshSession();
      if (data?.user) setLocalAvatarUrl(data.user.user_metadata?.avatar_url ?? null);
      else setLocalAvatarUrl(value);
      setAvatarVersion((v) => v + 1);
      await refreshUser();
    },
    [user?.id, refreshUser]
  );

  const uploadAvatar = useCallback(
    async (asset: { uri: string; fileName?: string | null }) => {
      if (!user?.id) return;
      setUploadingAvatar(true);
      try {
        const uri = asset.uri;
        const ext = (asset.fileName ?? uri).split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        if (!base64 || base64.length < 100) throw new Error('Could not read image data. Try another photo.');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
          contentType,
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
        const urlWithBust = `${publicUrl}?t=${Date.now()}`;
        setLocalAvatarUrl(urlWithBust);
        await updateAvatarUrl(urlWithBust);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to update photo';
        Alert.alert('Error', message);
        setLocalAvatarUrl(undefined);
      } finally {
        setUploadingAvatar(false);
      }
    },
    [user?.id, updateAvatarUrl]
  );

  const handleChangePhoto = useCallback(() => {
    if (uploadingAvatar) return;
    const options: { text: string; onPress?: () => void }[] = [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Photo library access is required.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
        },
      },
    ];
    if (avatarUrl) options.push({ text: 'Remove Photo', onPress: () => { setLocalAvatarUrl(null); updateAvatarUrl(null); } });
    options.push({ text: 'Cancel', style: 'cancel' } as { text: string; onPress?: () => void });
    Alert.alert('Profile picture', 'Change your profile photo', options);
  }, [uploadingAvatar, avatarUrl, uploadAvatar, updateAvatarUrl]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    const cleanedPhone = phone.trim();
    const digits = cleanedPhone.replace(/\D/g, '');
    if (!cleanedPhone || digits.length < 8 || digits.length > 15) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    setSaving(true);
    const { error: updateAuth } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    if (updateAuth) {
      setSaving(false);
      Alert.alert('Error', updateAuth.message);
      return;
    }
    const { error: updateDb } = await supabase
      .from('users')
      .update({ full_name: fullName.trim(), phone: cleanedPhone } as never)
      .eq('id', user.id);
    setSaving(false);
    if (updateDb) {
      Alert.alert('Error', updateDb.message);
      return;
    }
    Alert.alert('Saved', 'Your profile has been updated.');
    router.back();
  }, [user?.id, fullName, phone]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personal Info</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={handleChangePhoto}
            activeOpacity={0.8}
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? (
              <View style={[styles.avatarPlaceholder, styles.avatarUploading]}>
                <ActivityIndicator size="large" color="#666" />
              </View>
            ) : avatarUrl ? (
              <Image key={avatarVersion} source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>
                  {displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            {!uploadingAvatar && (
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={18} color="#000" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change profile picture</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#999"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{email}</Text>
          <Text style={styles.hint}>Email cannot be changed here.</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
          />
          <Text style={styles.hint}>Used by workers to coordinate your booking.</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { width: 40 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUploading: { opacity: 0.9 },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFEB3B',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '600', color: '#666' },
  avatarHint: { fontSize: 12, color: '#666', marginTop: 8 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  value: { fontSize: 16, color: '#000' },
  hint: { fontSize: 12, color: '#999', marginTop: 4 },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
