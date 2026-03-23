import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useWorkLocationSelection } from '@/lib/contexts/WorkLocationSelectionContext';
import { supabase } from '@/lib/supabase/client';
import { uploadWorkerImage } from '@/lib/uploadWorkerAsset';
import type { Service } from '@/lib/types/database';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Alias for shared app yellow — avoids ReferenceError if Metro serves a stale bundle missing `const YELLOW`. */
const YELLOW = APP_SCREEN_HEADER_BG;

const MAX_PORTFOLIO = 5;

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const redirectTo = params.from === 'dashboard' ? '/(tabs)' : '/(tabs)/profile';
  const { user } = useAuth();
  const { profile, refetch } = useWorkerProfile(user?.id);
  const { getAndClear } = useWorkLocationSelection();

  useFocusEffect(
    useCallback(() => {
      const pending = getAndClear();
      if (pending) {
        setLatitude(pending.lat);
        setLongitude(pending.lng);
        setLocationDisplayName(pending.displayName);
        setLocationLink(pending.link);
      }
    }, [getAndClear])
  );

  /** Refresh catalog whenever worker opens this screen — new `services` rows show up without app restart. */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void supabase
        .from('services')
        .select('id, name, base_price')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (cancelled || error) return;
          if (data) setServices(data as Service[]);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationDisplayName, setLocationDisplayName] = useState<string | null>(null);
  const [locationLink, setLocationLink] = useState<string | null>(null);
  const [idDocumentLocalUri, setIdDocumentLocalUri] = useState<string | null>(null);
  const [idDocumentUrl, setIdDocumentUrl] = useState<string | null>(null);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [portfolioLocalUris, setPortfolioLocalUris] = useState<string[]>([]);
  const [serviceRates, setServiceRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);

  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? '');
      setExperienceYears(profile.experience_years != null ? String(profile.experience_years) : '');
      setPhone(profile.phone ?? '');
      setLatitude(profile.latitude ?? null);
      setLongitude(profile.longitude ?? null);
      setLocationDisplayName(profile.location_display_name ?? null);
      setLocationLink(profile.location_link ?? null);
      setIdDocumentUrl(profile.id_document_url ?? null);
    }
  }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('services').select('id, name, base_price').eq('is_active', true).order('name', { ascending: true }),
      profile?.id
        ? supabase.from('service_subscriptions').select('service_id, custom_price').eq('worker_id', profile.id)
        : Promise.resolve({ data: [] as { service_id: string; custom_price: number | null }[] }),
      profile?.id
        ? supabase.from('worker_portfolio_photos').select('photo_url').eq('worker_id', profile.id).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as { photo_url: string }[] }),
    ]).then(([servicesRes, subsRes, portfolioRes]) => {
      if (cancelled) return;
      if (!(servicesRes as { error?: unknown }).error && servicesRes.data) setServices(servicesRes.data as Service[]);
      if (profile?.id && !(subsRes as { error?: unknown }).error && (subsRes.data as { service_id: string; custom_price: number | null }[])) {
        const subs = subsRes.data as { service_id: string; custom_price: number | null }[];
        setSelectedServiceIds(new Set(subs.map((r) => r.service_id)));
        const rates: Record<string, string> = {};
        subs.forEach((r) => {
          rates[r.service_id] = r.custom_price != null ? String(r.custom_price) : '';
        });
        setServiceRates(rates);
      }
      if (profile?.id && !(portfolioRes as { error?: unknown }).error && (portfolioRes.data as { photo_url: string }[])) {
        setPortfolioUrls((portfolioRes.data as { photo_url: string }[]).map((r) => r.photo_url));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const toggleService = useCallback((id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setServiceRates((prev) => {
      const next = { ...prev };
      if (!next[id]) next[id] = '';
      return next;
    });
  }, []);

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

  const parseExperienceYears = useCallback((val: string): number | null => {
    if (val.trim() === '') return null;
    const n = parseFloat(val);
    if (Number.isNaN(n) || n < 0) return null;
    return Math.round(n);
  }, []);

  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to set your work location.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        maximumAge: 0,
        enableHighAccuracy: true,
      } as Location.LocationOptions);
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setLatitude(lat);
      setLongitude(lng);
      const link = `https://www.google.com/maps?q=${lat},${lng}`;
      setLocationLink(link);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { Accept: 'application/json' } }
        );
        const data = (await res.json()) as { display_name?: string; address?: { suburb?: string; city?: string; town?: string; state?: string } };
        const name = data?.address
          ? [data.address.suburb, data.address.city || data.address.town, data.address.state].filter(Boolean).join(', ') || data.display_name
          : data?.display_name;
        setLocationDisplayName(name || 'Work area');
      } catch {
        setLocationDisplayName('Work area');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get location. Try again.');
    }
  }, []);

  const pickIdDocument = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setIdDocumentLocalUri(result.assets[0].uri);
  }, []);

  const pickPortfolioPhotos = useCallback(async () => {
    const current = portfolioUrls.length + portfolioLocalUris.length;
    if (current >= MAX_PORTFOLIO) {
      Alert.alert('Limit reached', `You can add up to ${MAX_PORTFOLIO} past work photos.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length) {
      const add = result.assets.slice(0, MAX_PORTFOLIO - current).map((a) => a.uri);
      setPortfolioLocalUris((prev) => [...prev, ...add].slice(0, MAX_PORTFOLIO - portfolioUrls.length));
    }
  }, [portfolioUrls.length, portfolioLocalUris.length]);

  const removePortfolioAtIndex = useCallback((index: number) => {
    if (index < portfolioUrls.length) {
      setPortfolioUrls((prev) => prev.filter((_, i) => i !== index));
    } else {
      setPortfolioLocalUris((prev) => prev.filter((_, i) => i !== index - portfolioUrls.length));
    }
  }, [portfolioUrls.length]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    if (selectedServiceIds.size === 0) {
      Alert.alert('Select services', 'Choose at least one service you offer.');
      return;
    }
    if (latitude == null || longitude == null) {
      Alert.alert(
        'Work location',
        'Please set your work location. Tap "Use current location" so customers can find you nearby.'
      );
      return;
    }
    const trimmedBio = bio.trim();
    if (!trimmedBio) {
      Alert.alert('Bio required', 'Please tell customers about your experience.');
      return;
    }
    const expYears = parseExperienceYears(experienceYears);
    if (expYears == null) {
      Alert.alert('Experience required', 'Please enter your years of experience.');
      return;
    }
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      Alert.alert('Phone required', 'Please enter your phone number.');
      return;
    }
    if (!idDocumentUrl && !idDocumentLocalUri) {
      Alert.alert('ID document required', 'Please upload your ID document to complete your profile.');
      return;
    }
    setSaving(true);
    let workerId: string = profile?.id ?? '';

    try {
      if (profile) {
        // When editing, we require phone + an existing or newly selected ID.
        const updatePayload: Record<string, unknown> = {
          bio: trimmedBio,
          experience_years: expYears,
          phone: trimmedPhone,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          location_display_name: locationDisplayName?.trim() || null,
          location_link: locationLink?.trim() || null,
        };
        if (idDocumentLocalUri) {
          const url = await uploadWorkerImage(profile.id, idDocumentLocalUri, 'id.jpg');
          updatePayload.id_document_url = url;
          updatePayload.id_uploaded_at = new Date().toISOString();
        }
        const { error: updateProfile } = await supabase
          .from('worker_profiles')
          .update(updatePayload as never)
          .eq('id', profile.id);
        if (updateProfile) throw new Error(updateProfile.message);
        workerId = profile.id;

        await supabase.from('service_subscriptions').delete().eq('worker_id', profile.id);
        for (const serviceId of selectedServiceIds) {
          const customPrice = parseRate(serviceRates[serviceId] ?? '');
          const { error: addErr } = await supabase.from('service_subscriptions').insert({
            worker_id: profile.id,
            service_id: serviceId,
            custom_price: customPrice ?? null,
          } as never);
          if (addErr) throw new Error(addErr.message);
        }
      } else {
        const { data: existingUser } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
        if (!existingUser) {
          const { error: userErr } = await supabase.from('users').insert({
            id: user.id,
            user_type: 'worker',
            full_name: user.user_metadata?.full_name ?? user.email ?? 'Worker',
            email: user.email ?? '',
          } as never);
          if (userErr) throw new Error(userErr.message);
        }

        // Upsert so the same user can complete profile on another device (profile may already exist).
        const { data: upsertedProfile, error: upsertError } = await supabase
          .from('worker_profiles')
          .upsert(
            {
              user_id: user.id,
              bio: trimmedBio,
              experience_years: expYears,
              phone: trimmedPhone,
              latitude: latitude ?? null,
              longitude: longitude ?? null,
              location_display_name: locationDisplayName?.trim() || null,
              location_link: locationLink?.trim() || null,
            } as never,
            { onConflict: 'user_id' }
          )
          .select('id')
          .single();
        if (upsertError) throw new Error(upsertError.message);
        workerId = (upsertedProfile as { id: string }).id;

        if (idDocumentLocalUri) {
          const url = await uploadWorkerImage(workerId, idDocumentLocalUri, 'id.jpg');
          await supabase
            .from('worker_profiles')
            .update({ id_document_url: url, id_uploaded_at: new Date().toISOString() } as never)
            .eq('id', workerId);
        }

        await supabase.from('service_subscriptions').delete().eq('worker_id', workerId);
        for (const serviceId of selectedServiceIds) {
          const customPrice = parseRate(serviceRates[serviceId] ?? '');
          const { error: subErr } = await supabase.from('service_subscriptions').insert({
            worker_id: workerId,
            service_id: serviceId,
            custom_price: customPrice ?? null,
          } as never);
          if (subErr) throw new Error(subErr.message);
        }
      }

      const allPortfolioUrls = [...portfolioUrls];
      for (let i = 0; i < portfolioLocalUris.length; i++) {
        const url = await uploadWorkerImage(workerId, portfolioLocalUris[i], `portfolio/${Date.now()}_${i}.jpg`);
        allPortfolioUrls.push(url);
      }
      await supabase.from('worker_portfolio_photos').delete().eq('worker_id', workerId);
      for (let i = 0; i < allPortfolioUrls.length; i++) {
        await supabase.from('worker_portfolio_photos').insert({
          worker_id: workerId,
          photo_url: allPortfolioUrls[i],
          sort_order: i,
        } as never);
      }

      const wasFirstTime = !profile;
      await refetch();
      setSaving(false);
      if (wasFirstTime) {
        Alert.alert(
          "You're all set!",
          "Turn on 'Available for jobs' below to start receiving job requests.",
          [{ text: 'OK', onPress: () => router.replace(redirectTo as any) }]
        );
      } else {
        router.replace(redirectTo as any);
      }
    } catch (e: unknown) {
      setSaving(false);
      const message = e instanceof Error ? e.message : 'Failed to save.';
      if (__DEV__) console.error('[Profile setup] Save error:', e);
      if (message.toLowerCase().includes('network request failed')) {
        Alert.alert(
          'Connection error',
          'Could not reach the server. Check your internet connection and that you\'re logged in. If using a custom Supabase URL, ensure it\'s reachable from this device.'
        );
      } else {
        Alert.alert('Error', message);
      }
    }
  }, [user?.id, user?.email, user?.user_metadata?.full_name, profile, bio, experienceYears, selectedServiceIds, serviceRates, phone, latitude, longitude, locationDisplayName, locationLink, idDocumentLocalUri, portfolioUrls, portfolioLocalUris, refetch, parseExperienceYears, parseRate, redirectTo]);

  const tabBarBottomPadding = Platform.select({ ios: 120, android: 100, default: 80 });

  if (loading) {
    return (
      <View style={styles.rootYellow}>
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rootYellow}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace(redirectTo as any)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>{profile ? 'Edit profile' : 'Complete your profile'}</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarBottomPadding }]}>
        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Tell customers about your experience"
            placeholderTextColor="#999"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Years of experience</Text>
          <View style={styles.experienceInputWrap}>
            <TextInput
              style={styles.experienceInput}
              placeholder="e.g. 5 or 2.5"
              placeholderTextColor="#999"
              value={experienceYears}
              onChangeText={setExperienceYears}
              keyboardType="decimal-pad"
            />
            <Text style={styles.experienceUnit}>years</Text>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Services you offer *</Text>
          <View style={styles.serviceTagRow}>
            {services
              .filter((s) => selectedServiceIds.has(s.id))
              .map((s) => (
                <View key={s.id} style={styles.serviceTag}>
                  <Text style={styles.serviceTagText}>{s.name}</Text>
                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => toggleService(s.id)}
                    style={styles.serviceTagRemove}
                  >
                    <Ionicons name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}
          </View>
          {services.some((s) => !selectedServiceIds.has(s.id)) ? (
            <TouchableOpacity
              style={styles.addServiceBtn}
              onPress={() => setShowAddServiceModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={22} color="#000" />
              <Text style={styles.addServiceBtnText}>Add service</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.addServiceHint}>All services added. Tap a tag above to remove.</Text>
          )}
          <Modal
            visible={showAddServiceModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAddServiceModal(false)}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowAddServiceModal(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => {}}
                style={[styles.addServiceModal, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
              >
                <TouchableOpacity onPress={() => setShowAddServiceModal(false)} style={styles.modalCloseRow}>
                  <Text style={styles.modalDoneText}>Done</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Add a service</Text>
                <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                  {services
                    .filter((s) => !selectedServiceIds.has(s.id))
                    .map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.modalServiceRow}
                        onPress={() => {
                          toggleService(s.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.modalServiceName}>{s.name}</Text>
                        <Ionicons name="add" size={22} color="#000" />
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
        {selectedServiceIds.size > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Set your rates (optional)</Text>
            <Text style={styles.hint}>Leave blank to use default rate. Per service, e.g. per hour.</Text>
            {services
              .filter((s) => selectedServiceIds.has(s.id))
              .map((s) => (
                <View key={s.id} style={styles.rateRow}>
                  <Text style={styles.rateLabel}>{s.name}</Text>
                  <View style={styles.rateInputRow}>
                    <Text style={styles.ratePrefix}>$</Text>
                    <TextInput
                      style={styles.rateInput}
                      placeholder={`Default $${Number(s.base_price).toFixed(2)}`}
                      placeholderTextColor="#999"
                      value={serviceRates[s.id] ?? ''}
                      onChangeText={(v) => setServiceRate(s.id, v)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.label}>Work location</Text>
          <Text style={styles.hint}>
            Tap the box to pin a location on the map, or use &apos;Use current location&apos; below.
          </Text>
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/profile/set-work-location',
                params: {
                  ...(latitude != null && longitude != null && { lat: String(latitude), lng: String(longitude) }),
                },
              })
            }
            activeOpacity={0.8}
          >
            <Ionicons name="location-outline" size={22} color="#000" />
            <Text style={styles.locationBtnText}>
              {locationDisplayName || (latitude != null && longitude != null ? 'Location set — tap to change' : 'Tap to set location on map')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <View style={styles.locationActionsRow}>
            <TouchableOpacity style={styles.locationLinkBtn} onPress={useCurrentLocation} activeOpacity={0.7}>
              <Ionicons name="location-outline" size={18} color="#F9A825" />
              <Text style={styles.locationLinkText}>Use current location</Text>
            </TouchableOpacity>
            {locationLink ? (
              <TouchableOpacity
                style={styles.locationLinkBtn}
                onPress={() => Linking.openURL(locationLink)}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={18} color="#F9A825" />
                <Text style={styles.locationLinkText}>View on map</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. +1234567890"
            placeholderTextColor="#999"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>ID document</Text>
          <Text style={styles.hint}>Stored securely. Not shown on your public profile.</Text>
          {idDocumentUrl ? (
            <View style={[styles.uploadBtn, styles.uploadBtnLocked]}>
              <View style={styles.uploadBtnLockedRow}>
                <Ionicons name="checkmark-circle" size={22} color="#34C759" />
                <Text style={styles.uploadBtnText}>ID document uploaded</Text>
              </View>
              <Text style={styles.uploadBtnHint}>Cannot be replaced after submission.</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBtn} onPress={pickIdDocument}>
              <Ionicons name="card-outline" size={22} color="#000" />
              <Text style={styles.uploadBtnText}>
                {idDocumentLocalUri ? 'ID selected (tap to change before saving)' : 'Upload ID document'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Past work photos (optional, up to {MAX_PORTFOLIO})</Text>
          <Text style={styles.hint}>Shown on your profile so customers can see your work.</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickPortfolioPhotos}>
            <Ionicons name="images-outline" size={22} color="#000" />
            <Text style={styles.uploadBtnText}>Add photos</Text>
          </TouchableOpacity>
          {(portfolioUrls.length > 0 || portfolioLocalUris.length > 0) && (
            <View style={styles.portfolioGrid}>
              {[...portfolioUrls, ...portfolioLocalUris].map((uri, index) => (
                <View key={index} style={styles.portfolioItem}>
                  <Image source={{ uri }} style={styles.portfolioThumb} />
                  <TouchableOpacity
                    style={styles.portfolioRemove}
                    onPress={() => removePortfolioAtIndex(index)}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
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
  rootYellow: { flex: 1, backgroundColor: YELLOW },
  headerWrap: { backgroundColor: YELLOW },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: YELLOW,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1, backgroundColor: '#ffffff' },
  scrollContent: { padding: 20 },
  field: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
  },
  experienceInputWrap: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  experienceInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 0,
    margin: 0,
  },
  experienceUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
    textAlignVertical: 'top',
  },
  serviceTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  serviceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  serviceTagText: { fontSize: 15, fontWeight: '600', color: '#000', marginRight: 4 },
  serviceTagRemove: { padding: 4 },
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    backgroundColor: '#F9F9F9',
    gap: 8,
  },
  addServiceBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },
  addServiceHint: { fontSize: 13, color: '#666', marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  addServiceModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingHorizontal: 20,
  },
  modalCloseRow: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  modalDoneText: { fontSize: 17, fontWeight: '600', color: '#000' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 16 },
  modalScroll: { maxHeight: 320 },
  modalServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  modalServiceName: { fontSize: 16, fontWeight: '500', color: '#000' },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  rateLabel: { fontSize: 15, fontWeight: '600', color: '#000', flex: 1 },
  rateInputRow: { flexDirection: 'row', alignItems: 'center', minWidth: 100 },
  ratePrefix: { fontSize: 16, color: '#666', marginRight: 4 },
  rateInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: '#666', marginBottom: 8 },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  locationBtnText: { fontSize: 16, color: '#000' },
  locationActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  locationLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  locationLinkText: { fontSize: 15, color: '#F9A825', fontWeight: '600' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  uploadBtnLocked: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  uploadBtnLockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadBtnText: { fontSize: 16, color: '#000' },
  uploadBtnHint: { fontSize: 12, color: '#666', marginTop: 4 },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  portfolioItem: { position: 'relative' },
  portfolioThumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#eee' },
  portfolioRemove: { position: 'absolute', top: -8, right: -8 },
  saveBtn: {
    backgroundColor: YELLOW,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
