import { AddCardStripeModal } from '@/components/AddCardStripeModal';
import {
  getPaymentMethods,
  getPaymentMethodDisplayLabel,
  removePaymentMethod,
  setDefaultPaymentMethod,
  type SavedPaymentMethod,
} from '@/lib/paymentMethods';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  useRefreshOnAppActive,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

type MethodOption = { id: string; label: string; icon: 'card-outline' | 'wallet-outline' };

const STATIC_METHODS: MethodOption[] = [
  { id: 'cash', label: 'Cash', icon: 'wallet-outline' },
];

export default function PaymentMethodsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    from?: string;
    workerId?: string;
    workerName?: string;
    serviceId?: string;
    serviceName?: string;
    basePrice?: string;
    scheduledDate?: string;
    address?: string;
    notes?: string;
    customerPhone?: string;
    serviceLat?: string;
    serviceLng?: string;
  }>();

  const isFromProfile = params.from === 'profile';

  const [savedList, setSavedList] = useState<SavedPaymentMethod[]>([]);
  const [savedOptions, setSavedOptions] = useState<MethodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [addCardModalVisible, setAddCardModalVisible] = useState(false);
  const allMethods = [...savedOptions, ...STATIC_METHODS];
  const selectedLabel = allMethods.find((m) => m.id === selectedId)?.label ?? allMethods[0]?.label ?? 'Card';

  const loadMethods = useCallback(async (preferredId?: string) => {
    if (!user?.id) {
      setSavedList([]);
      setSavedOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await getPaymentMethods(user.id);
    setSavedList(list);
    const options: MethodOption[] = list.map((m) => ({
      id: m.id,
      label: getPaymentMethodDisplayLabel(m),
      icon: 'card-outline',
    }));
    setSavedOptions(options);
    const defaultCard = list.find((m) => m.isDefault) ?? null;
    const preferredMatch =
      preferredId &&
      list.find((m) => m.id === preferredId || m.stripePaymentMethodId === preferredId);
    if (preferredMatch) {
      setSelectedId(preferredMatch.id);
    } else {
      setSelectedId((prev) => {
        if (prev && (prev === 'cash' || list.some((m) => m.id === prev))) return prev;
        return defaultCard?.id ?? 'cash';
      });
    }
    setLoading(false);
  }, [user?.id]);

  const handleSetDefault = useCallback(
    async (methodId: string) => {
      if (!user?.id) return;
      const next = await setDefaultPaymentMethod(user.id, methodId);
      setSavedList(next);
      setSavedOptions(next.map((m) => ({ id: m.id, label: getPaymentMethodDisplayLabel(m), icon: 'card-outline' as const })));
    },
    [user?.id]
  );

  const handleRemove = useCallback(
    (method: SavedPaymentMethod) => {
      if (!user?.id) return;
      Alert.alert(
        'Remove card',
        `Remove ${getPaymentMethodDisplayLabel(method)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const next = await removePaymentMethod(user.id, method.id);
              setSavedList(next);
              setSavedOptions(next.map((m) => ({ id: m.id, label: getPaymentMethodDisplayLabel(m), icon: 'card-outline' as const })));
            },
          },
        ]
      );
    },
    [user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      loadMethods();
    }, [loadMethods])
  );

  useRefreshOnAppActive(loadMethods);

  const onContinue = useCallback(() => {
    const selectedCard = selectedId && selectedId !== 'cash' ? savedList.find((m) => m.id === selectedId) : null;
    const paymentMethodStripeId = selectedCard?.stripePaymentMethodId ?? undefined;
    router.replace({
      pathname: '/review-booking',
      params: {
        workerId: params.workerId ?? '',
        workerName: params.workerName ?? '',
        serviceId: params.serviceId ?? '',
        serviceName: params.serviceName ?? '',
        basePrice: params.basePrice ?? '',
        scheduledDate: params.scheduledDate ?? '',
        address: params.address ?? '',
        notes: params.notes ?? '',
        customerPhone: params.customerPhone ?? '',
        serviceLat: params.serviceLat ?? '',
        serviceLng: params.serviceLng ?? '',
        paymentMethod: selectedLabel,
        ...(paymentMethodStripeId ? { paymentMethodStripeId } : {}),
      },
    } as Parameters<typeof router.replace>[0]);
  }, [params, selectedLabel, selectedId, savedList]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isFromProfile ? 'Payment' : 'Payment Methods'}</Text>
          <View style={styles.headerBack} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : isFromProfile ? (
          <>
            <Text style={styles.sectionTitle}>Payment methods</Text>
            {savedList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="card-outline" size={48} color="#CCC" />
                <Text style={styles.emptyTitle}>No payment methods</Text>
                <Text style={styles.emptyText}>Add a card to pay for bookings quickly.</Text>
              </View>
            ) : (
              savedList.map((m) => (
                <View key={m.id} style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Ionicons name="card-outline" size={24} color="#666" />
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardLabel}>{getPaymentMethodDisplayLabel(m)}</Text>
                      {m.isDefault && <Text style={styles.defaultBadge}>Default</Text>}
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    {!m.isDefault && (
                      <TouchableOpacity onPress={() => handleSetDefault(m.id)} style={styles.setDefaultBtn}>
                        <Text style={styles.setDefaultText}>Set default</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleRemove(m)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${getPaymentMethodDisplayLabel(m)}`}
                    >
                      <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <Text style={styles.addSectionTitle}>Add method</Text>
            <TouchableOpacity style={styles.addCard} activeOpacity={0.8} onPress={() => setAddCardModalVisible(true)}>
              <Ionicons name="card-outline" size={24} color="#666" />
              <Text style={styles.addCardLabel}>Card</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {allMethods.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.methodCard}
                onPress={() => setSelectedId(m.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={m.icon}
                  size={24}
                  color={m.id === 'cash' ? '#F9A825' : '#333'}
                />
                <Text style={styles.methodLabel}>{m.label}</Text>
                <View style={[styles.radio, selectedId === m.id && styles.radioSelected]}>
                  {selectedId === m.id ? (
                    <View style={styles.radioDot} />
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}

            <Text style={styles.addSectionTitle}>Add Methods</Text>
            <TouchableOpacity
              style={styles.addCard}
              activeOpacity={0.8}
              onPress={() => setAddCardModalVisible(true)}
            >
              <Ionicons name="card-outline" size={24} color="#666" />
              <Text style={styles.addCardLabel}>Card</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </>
        )}

        {!isFromProfile && (
          <TouchableOpacity style={styles.continueBtn} onPress={onContinue}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <AddCardStripeModal
        visible={addCardModalVisible}
        onClose={() => {
          setAddCardModalVisible(false);
          void loadMethods();
          setTimeout(() => void loadMethods(), 200);
          setTimeout(() => void loadMethods(), 500);
        }}
        onSuccess={(paymentMethodId) => {
          void loadMethods(paymentMethodId);
          setTimeout(() => void loadMethods(paymentMethodId), 150);
          setTimeout(() => void loadMethods(paymentMethodId), 450);
        }}
        userId={user?.id ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { minWidth: 44, minHeight: 44, padding: 4, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  headerBack: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  loadingText: { fontSize: 14, color: '#666' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 12 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardInfo: { marginLeft: 14 },
  cardLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
  defaultBadge: { fontSize: 12, color: '#34C759', marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setDefaultBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  setDefaultText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  methodLabel: { flex: 1, fontSize: 16, color: '#000', marginLeft: 14 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: { borderColor: '#34C759' },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
  },

  addSectionTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginTop: 24, marginBottom: 10 },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  addCardLabel: { flex: 1, fontSize: 16, color: '#000', marginLeft: 14 },

  continueBtn: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: '#000' },
});
