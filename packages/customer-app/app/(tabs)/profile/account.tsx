import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MIN_PASSWORD_LENGTH = 6;

export default function AccountScreen() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePassword = useCallback(async () => {
    if (!oldPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Error', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword === oldPassword) {
      Alert.alert('Error', 'New password must be different from current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.trim();
    if (!email) {
      setSaving(false);
      Alert.alert('Error', 'Could not verify your account email. Please sign in again.');
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    if (reauthError) {
      setSaving(false);
      Alert.alert('Error', 'Current password is incorrect.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Done', 'Your password has been updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [oldPassword, newPassword, confirmPassword]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account & Security</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Text style={styles.sectionLabel}>Change password</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholder="Enter current password"
              placeholderTextColor="#999"
              secureTextEntry={!showOldPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowOldPassword((v) => !v)} activeOpacity={0.7}>
              <Ionicons name={showOldPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              placeholderTextColor="#999"
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPassword((v) => !v)} activeOpacity={0.7}>
              <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat password"
              placeholderTextColor="#999"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirmPassword((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleChangePassword}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Update password</Text>
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
  sectionLabel: { fontSize: 19, fontWeight: '700', color: '#000', marginBottom: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingRight: 44,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
