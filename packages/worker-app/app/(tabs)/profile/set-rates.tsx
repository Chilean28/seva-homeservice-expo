import {
  APP_SCREEN_HEADER_BG,
  APP_SCREEN_HEADER_PADDING_BOTTOM,
  APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  APP_SCREEN_HEADER_PADDING_TOP_INNER,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type RateRow = {
  service_id: string;
  service_name: string;
  base_price: number;
  custom_price: number | null;
};

export default function SetRatesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { workerId, loading: profileLoading, refetch: refetchProfile } = useWorkerProfile(user?.id);
  const [rateRows, setRateRows] = useState<RateRow[]>([]);
  const [serviceRates, setServiceRates] = useState<Record<string, string>>({});
  const [ratesSaving, setRatesSaving] = useState(false);

  const fetchRates = useCallback(async () => {
    if (!workerId) {
      setRateRows([]);
      setServiceRates({});
      return;
    }
    const { data } = await supabase
      .from('service_subscriptions')
      .select('service_id, custom_price, services(name, base_price)')
      .eq('worker_id', workerId);
    const subs =
      (data as {
        service_id: string;
        custom_price: number | null;
        services: { name: string; base_price: number } | null;
      }[]) ?? [];
    setRateRows(
      subs.map((s) => ({
        service_id: s.service_id,
        service_name: s.services?.name ?? 'Service',
        base_price: Number(s.services?.base_price ?? 0),
        custom_price: s.custom_price != null ? Number(s.custom_price) : null,
      }))
    );
    const rates: Record<string, string> = {};
    subs.forEach((s) => {
      rates[s.service_id] = s.custom_price != null ? String(s.custom_price) : '';
    });
    setServiceRates(rates);
  }, [workerId]);

  useEffect(() => {
    if (!profileLoading && workerId) fetchRates();
  }, [profileLoading, workerId, fetchRates]);

  const setServiceRate = useCallback((serviceId: string, value: string) => {
    setServiceRates((prev) => ({ ...prev, [serviceId]: value }));
  }, []);

  const parseRate = useCallback((val: string): number | null => {
    const s = val.trim();
    if (s === '') return null;
    const n = parseFloat(s);
    if (Number.isNaN(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }, []);

  const saveRates = useCallback(async () => {
    if (!workerId) return;
    setRatesSaving(true);
    try {
      for (const row of rateRows) {
        const val = serviceRates[row.service_id] ?? '';
        const num = parseRate(val);
        const { error } = await supabase
          .from('service_subscriptions')
          .update({ custom_price: num } as never)
          .eq('worker_id', workerId)
          .eq('service_id', row.service_id);
        if (error) throw new Error(error.message);
      }
      await refetchProfile();
      Alert.alert('Saved', 'Your rates have been updated.');
    } finally {
      setRatesSaving(false);
    }
  }, [workerId, rateRows, serviceRates, parseRate, refetchProfile]);

  if (profileLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + APP_SCREEN_HEADER_PADDING_TOP_INNER }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set rates</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + APP_SCREEN_HEADER_PADDING_TOP_INNER }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Set rates</Text>
        <View style={styles.headerSpacer} />
      </View>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>Your hourly rate ($/hr) per service customers book.</Text>
          {rateRows.length === 0 ? (
            <Text style={styles.empty}>Add services from Profile → Setup to set rates.</Text>
          ) : (
            <>
              {rateRows.map((row) => (
                <View key={row.service_id} style={styles.rateRow}>
                  <Text style={styles.rateServiceName}>{row.service_name}</Text>
                  <View style={styles.rateInputWrap}>
                    <Text style={styles.ratePrefix}>$</Text>
                    <TextInput
                      style={styles.rateInput}
                      value={serviceRates[row.service_id] ?? ''}
                      onChangeText={(v) => setServiceRate(row.service_id, v)}
                      placeholder={`Default $${row.base_price.toFixed(2)}`}
                      placeholderTextColor="#999"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveBtn, ratesSaving && styles.saveBtnDisabled]}
                onPress={saveRates}
                disabled={ratesSaving}
              >
                <Text style={styles.saveText}>{ratesSaving ? 'Saving…' : 'Save rates'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_SCREEN_HEADER_BG },
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: APP_SCREEN_HEADER_PADDING_HORIZONTAL,
    paddingBottom: APP_SCREEN_HEADER_PADDING_BOTTOM,
    backgroundColor: APP_SCREEN_HEADER_BG,
  },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', ...appScreenHeaderTitleStyle },
  headerSpacer: { width: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  scroll: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  empty: { fontSize: 15, color: '#666' },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  rateServiceName: { fontSize: 16, fontWeight: '600', color: '#000', flex: 1 },
  rateInputWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 120 },
  ratePrefix: { fontSize: 16, color: '#666', marginRight: 4 },
  rateInput: {
    flex: 1,
    height: 44,
    minWidth: 80,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F9F9F9',
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#FFEB3B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
