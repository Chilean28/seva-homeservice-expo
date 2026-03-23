import { useAuth } from '@/lib/contexts/AuthContext';
import { useLocationSelection } from '@/lib/contexts/LocationSelectionContext';
import { supabase } from '@/lib/supabase/client';
import type { CustomerAddress } from '@/lib/types/database';
import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const RETURN_TO_ADD = 'profile-add-address';
const RETURN_TO_EDIT = 'profile-edit-address';

export default function AddressFormScreen() {
  const { user } = useAuth();
  const { getAndClearPendingLocationSelection } = useLocationSelection();
  const params = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const isEdit = Boolean(params.id);
  const rawReturnTo = params.returnTo;
  const returnToBooking =
    (Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo) === 'create-booking';

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [areaName, setAreaName] = useState('');
  const [locationLink, setLocationLink] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(!!params.id);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const pending = getAndClearPendingLocationSelection();
      if (pending) {
        setAddress(pending.address);
        setLatitude(pending.lat);
        setLongitude(pending.lng);
        if (pending.area_name != null) setAreaName(pending.area_name);
        if (pending.location_link != null) setLocationLink(pending.location_link);
      }
    }, [getAndClearPendingLocationSelection])
  );

  useEffect(() => {
    if (!params.id || !user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('id', params.id!)
        .eq('customer_id', user.id)
        .maybeSingle();
      if (error || !data) {
        setLoading(false);
        return;
      }
      const row = data as CustomerAddress;
      setLabel(row.label);
      setAddress(row.address);
      setAreaName(row.area_name ?? '');
      setLocationLink(row.location_link ?? '');
      setLatitude(row.latitude ?? undefined);
      setLongitude(row.longitude ?? undefined);
      setIsDefault(row.is_default);
      setLoading(false);
    })();
  }, [params.id, user?.id]);

  const openMap = useCallback(() => {
    const returnTo = isEdit ? RETURN_TO_EDIT : RETURN_TO_ADD;
    router.push({
      pathname: '/search-location',
      params: { returnTo, ...(latitude != null && longitude != null ? { lat: String(latitude), lng: String(longitude) } : {}) },
    });
  }, [isEdit, latitude, longitude]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    const trimmedLabel = label.trim();
    const trimmedAddress = address.trim();
    if (!trimmedLabel) {
      Alert.alert('Error', 'Enter a label (e.g. Home, Work).');
      return;
    }
    if (!trimmedAddress) {
      Alert.alert('Error', 'Enter an address.');
      return;
    }
    setSaving(true);
    try {
      if (isDefault) {
        await supabase.from('customer_addresses').update({ is_default: false } as never).eq('customer_id', user.id);
      }
      if (isEdit && params.id) {
        const { error } = await supabase
          .from('customer_addresses')
          .update({
            label: trimmedLabel,
            address: trimmedAddress,
            area_name: areaName.trim() || null,
            location_link: locationLink.trim() || null,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            is_default: isDefault,
          } as never)
          .eq('id', params.id)
          .eq('customer_id', user.id);
        if (error) throw error;
        Alert.alert('Saved', 'Address updated.', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        const { error } = await supabase.from('customer_addresses').insert({
          customer_id: user.id,
          label: trimmedLabel,
          address: trimmedAddress,
          area_name: areaName.trim() || null,
          location_link: locationLink.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          is_default: isDefault,
        } as never);
        if (error) throw error;
        Alert.alert('Saved', 'Address added.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  }, [user?.id, label, address, areaName, locationLink, latitude, longitude, isDefault, isEdit, params.id, returnToBooking]);

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit address</Text>
            <View style={styles.backBtn} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#666" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? 'Edit address' : 'Add address'}</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Label</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Home, Work"
            placeholderTextColor="#999"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.mapBtn} onPress={openMap} activeOpacity={0.8}>
            <Ionicons name="map-outline" size={20} color="#000" />
            <Text style={styles.mapBtnText}>{address ? 'Update on map' : 'Pick on map'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Area / District (optional)</Text>
          <TextInput
            style={styles.input}
            value={areaName}
            onChangeText={setAreaName}
            placeholder="e.g. Daun Penh, BKK1"
            placeholderTextColor="#999"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Map link (optional)</Text>
          <TextInput
            style={styles.input}
            value={locationLink}
            onChangeText={setLocationLink}
            placeholder="https://www.google.com/maps?q=..."
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Set as default address</Text>
          <Switch
            value={isDefault}
            onValueChange={setIsDefault}
            trackColor={{ false: '#E0E0E0', true: '#FFEB3B' }}
            thumbColor={Platform.OS === 'android' ? '#F9A825' : undefined}
          />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 40 },
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
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  mapBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  saveBtn: {
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
