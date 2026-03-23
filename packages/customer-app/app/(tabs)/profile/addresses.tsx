import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import type { CustomerAddress } from '@/lib/types/database';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  useRefreshOnAppActive,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = Platform.select({ ios: 88, android: 72, default: 72 });

export default function AddressesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const goToAddAddress = useCallback(() => {
    router.push('/(tabs)/profile/address-form');
  }, []);

  const fetchAddresses = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Fetch addresses error:', error);
      setList([]);
    } else {
      setList((data as CustomerAddress[]) ?? []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  useFocusEffect(
    useCallback(() => {
      fetchAddresses();
    }, [fetchAddresses])
  );

  useRefreshOnAppActive(fetchAddresses);

  const setDefault = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      await supabase.from('customer_addresses').update({ is_default: false } as never).eq('customer_id', user.id);
      await supabase.from('customer_addresses').update({ is_default: true } as never).eq('id', id);
      fetchAddresses();
    },
    [user?.id, fetchAddresses]
  );

  const deleteAddress = useCallback(
    (item: CustomerAddress) => {
      Alert.alert('Delete address', `Remove "${item.label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('customer_addresses').delete().eq('id', item.id);
            fetchAddresses();
          },
        },
      ]);
    },
    [fetchAddresses]
  );

  const openMapLink = useCallback((item: CustomerAddress) => {
    const url = item.location_link?.trim() ||
      (item.latitude != null && item.longitude != null
        ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
        : null);
    if (url) Linking.openURL(url);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CustomerAddress }) => (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>{item.label}</Text>
            {item.is_default && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Default</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardAddress} numberOfLines={2}>
            {item.address}
          </Text>
          {item.area_name ? (
            <Text style={styles.cardArea} numberOfLines={1}>{item.area_name}</Text>
          ) : null}
          {(item.location_link || (item.latitude != null && item.longitude != null)) ? (
            <TouchableOpacity style={styles.mapLinkBtn} onPress={() => openMapLink(item)}>
              <Ionicons name="map-outline" size={18} color="#007AFF" />
              <Text style={styles.mapLinkText}>Open in Maps</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.cardActions}>
          {!item.is_default && (
            <TouchableOpacity onPress={() => setDefault(item.id)} style={styles.actionBtn}>
              <Ionicons name="star-outline" size={20} color="#000" />
              <Text style={styles.actionBtnText}>Set default</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/profile/address-form', params: { id: item.id } } as const)} style={styles.actionBtn}>
            <Ionicons name="options-outline" size={20} color="#000" />
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteAddress(item)} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [setDefault, deleteAddress, openMapLink]
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Addresses</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#666" />
        </View>
      ) : (
        <>
          <FlatList
            data={list}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No saved addresses yet.</Text>
                <Text style={styles.emptySubtext}>Add one to use when booking.</Text>
                <TouchableOpacity style={styles.emptyAddBtn} onPress={goToAddAddress} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={24} color="#000" />
                  <Text style={styles.emptyAddBtnText}>Add your first address</Text>
                </TouchableOpacity>
              </View>
            }
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + TAB_BAR_HEIGHT }]}>
            <TouchableOpacity style={styles.addBtn} onPress={goToAddAddress} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#000" />
              <Text style={styles.addBtnText}>Add address</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  listContent: { padding: 16, paddingBottom: 180 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 16,
    marginBottom: 12,
  },
  cardMain: { marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#000', marginRight: 8 },
  defaultBadge: { backgroundColor: '#FFEB3B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  defaultBadgeText: { fontSize: 12, fontWeight: '600', color: '#000' },
  cardAddress: { fontSize: 14, color: '#666' },
  cardArea: { fontSize: 13, color: '#888', marginTop: 4 },
  mapLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  mapLinkText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnText: { fontSize: 14, color: '#000' },
  actionBtnTextDanger: { color: '#FF3B30' },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#666' },
  emptySubtext: { fontSize: 14, color: '#999', marginTop: 4 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  emptyAddBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E8E8E8' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFEB3B',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  addBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
