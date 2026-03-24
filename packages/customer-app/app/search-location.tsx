import {
  APP_SCREEN_HEADER_BG,
  APP_SCREEN_HEADER_PADDING_BOTTOM,
  APP_SCREEN_HEADER_PADDING_HORIZONTAL,
  APP_SCREEN_HEADER_PADDING_TOP_INNER,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import SearchLocationMap, { type SearchLocationMapRef } from '@/components/SearchLocationMap';
import { useLocationSelection } from '@/lib/contexts/LocationSelectionContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RETURN_TO_VALUES = ['create-booking', 'home', 'profile-add-address', 'profile-edit-address'] as const;
export type ReturnToValue = (typeof RETURN_TO_VALUES)[number];
type PlaceSuggestion = { label: string; lat: number; lng: number };
const PHNOM_PENH_BOUNDS = {
  minLat: 11.45,
  maxLat: 11.75,
  minLng: 104.75,
  maxLng: 105.05,
};

function isWithinPhnomPenh(lat: number, lng: number): boolean {
  return (
    lat >= PHNOM_PENH_BOUNDS.minLat &&
    lat <= PHNOM_PENH_BOUNDS.maxLat &&
    lng >= PHNOM_PENH_BOUNDS.minLng &&
    lng <= PHNOM_PENH_BOUNDS.maxLng
  );
}

async function coordsToDisplayName(lat: number, lng: number): Promise<string> {
  try {
    const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!result) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (result.formattedAddress?.trim()) return result.formattedAddress.trim();
    const parts = [
      result.name,
      result.street,
      result.district,
      result.subregion,
      result.city,
      result.region,
      result.country,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(', ') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export default function SearchLocationScreen() {
  const router = useRouter();
  const { setPendingLocationSelection } = useLocationSelection();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const paramLat = params.lat != null ? parseFloat(params.lat) : NaN;
  const paramLng = params.lng != null ? parseFloat(params.lng) : NaN;
  const returnTo = params.returnTo && RETURN_TO_VALUES.includes(params.returnTo as ReturnToValue)
    ? (params.returnTo as ReturnToValue)
    : undefined;

  const mapRef = useRef<SearchLocationMapRef>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentAddress, setCurrentAddress] = useState<string>('Current location');
  const [coords, setCoords] = useState({ lat: 11.5692, lng: 104.9173 });
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const locationChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geofenceAlertAtRef = useRef<number>(0);

  const showPhnomPenhOnlyAlert = useCallback(() => {
    const now = Date.now();
    if (now - geofenceAlertAtRef.current < 1200) return;
    geofenceAlertAtRef.current = now;
    Alert.alert('Phnom Penh only', 'Please choose a location inside Phnom Penh.');
  }, []);

  const currentAddressSummary = useMemo(() => {
    if (loading) return 'Getting location…';
    const addr = currentAddress?.trim();
    if (!addr) return 'Tap map to set location';
    const rawParts = addr.split(',').map((p) => p.trim()).filter(Boolean);
    const parts: string[] = [];
    for (const p of rawParts) {
      const prev = parts[parts.length - 1];
      if (prev && prev.localeCompare(p, undefined, { sensitivity: 'base' }) === 0) continue;
      parts.push(p);
      if (parts.length >= 2) break;
    }
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return parts[0] ?? addr;
  }, [currentAddress, loading]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!Number.isNaN(paramLat) && !Number.isNaN(paramLng)) {
        if (mounted) setCoords({ lat: paramLat, lng: paramLng });
        const name = await coordsToDisplayName(paramLat, paramLng);
        if (mounted) setCurrentAddress(name);
        if (mounted) setLoading(false);
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (mounted) setCoords({ lat, lng });
          const name = await coordsToDisplayName(lat, lng);
          if (mounted) setCurrentAddress(name);
        } else if (mounted) {
          setCurrentAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        }
      } catch (e) {
        console.warn('Could not get current location:', e);
        if (mounted) setCurrentAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [paramLat, paramLng]);

  useEffect(() => {
    return () => {
      if (locationChangeTimeoutRef.current) clearTimeout(locationChangeTimeoutRef.current);
      if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    };
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setFetchingSuggestions(false);
      return;
    }
    setFetchingSuggestions(true);
    try {
      // Lightweight no-key fallback autocomplete (OSM Nominatim). If this fails, submit still falls back to expo geocode.
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2` +
        `&q=${encodeURIComponent(q + ', Phnom Penh, Cambodia')}` +
        `&limit=8&addressdetails=1&bounded=1` +
        `&viewbox=${PHNOM_PENH_BOUNDS.minLng},${PHNOM_PENH_BOUNDS.maxLat},${PHNOM_PENH_BOUNDS.maxLng},${PHNOM_PENH_BOUNDS.minLat}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(Platform.OS === 'web' ? { 'User-Agent': 'seva-homeservice-app' } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
      const parsed: PlaceSuggestion[] = (data ?? [])
        .map((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const label = (item.display_name ?? '').trim();
          if (!label) return null;
          if (!isWithinPhnomPenh(lat, lng)) return null;
          if (!/phnom penh/i.test(label)) return null;
          return { label, lat, lng };
        })
        .filter((v): v is PlaceSuggestion => Boolean(v))
        .slice(0, 5);
      setSuggestions(parsed);
    } catch {
      setSuggestions([]);
    } finally {
      setFetchingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      setFetchingSuggestions(false);
      return;
    }
    suggestionTimeoutRef.current = setTimeout(() => {
      void fetchSuggestions(q);
    }, 250);
  }, [searchQuery, fetchSuggestions]);

  const buildMapsLink = useCallback((lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`, []);

  const handleSelect = useCallback(async () => {
    if (!returnTo) {
      router.back();
      return;
    }
    if (!isWithinPhnomPenh(coords.lat, coords.lng)) {
      showPhnomPenhOnlyAlert();
      return;
    }
    let area_name: string | null = null;
    try {
      const [result] = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
      if (result) {
        const parts = [result.district, result.subregion, result.city].filter(Boolean) as string[];
        if (parts.length) area_name = parts.join(', ');
      }
    } catch {
      // ignore; area stays null
    }
    setPendingLocationSelection({
      address: currentAddress,
      lat: coords.lat,
      lng: coords.lng,
      area_name: area_name ?? undefined,
      location_link: buildMapsLink(coords.lat, coords.lng),
    });
    router.back();
  }, [router, returnTo, currentAddress, coords.lat, coords.lng, setPendingLocationSelection, buildMapsLink, showPhnomPenhOnlyAlert]);

  const handleLocationChange = useCallback((lat: number, lng: number) => {
    if (!isWithinPhnomPenh(lat, lng)) {
      showPhnomPenhOnlyAlert();
      mapRef.current?.animateToLocation(coords.lat, coords.lng);
      return;
    }
    setCoords({ lat, lng });
    setCurrentAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    if (locationChangeTimeoutRef.current) clearTimeout(locationChangeTimeoutRef.current);
    locationChangeTimeoutRef.current = setTimeout(async () => {
      locationChangeTimeoutRef.current = null;
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    }, 400);
  }, [coords.lat, coords.lng, showPhnomPenhOnlyAlert]);

  const handlePressMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to center on your position.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (!isWithinPhnomPenh(lat, lng)) {
        showPhnomPenhOnlyAlert();
        return;
      }
      setCoords({ lat, lng });
      mapRef.current?.animateToLocation(lat, lng);
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    } catch (e) {
      Alert.alert('Error', 'Could not get your location. Try again.');
    }
  }, [showPhnomPenhOnlyAlert]);

  const handleSearchSubmit = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    Keyboard.dismiss();
    if (suggestions.length > 0) {
      const best = suggestions[0];
      if (!isWithinPhnomPenh(best.lat, best.lng)) {
        showPhnomPenhOnlyAlert();
        return;
      }
      setCoords({ lat: best.lat, lng: best.lng });
      mapRef.current?.animateToLocation(best.lat, best.lng);
      setCurrentAddress(best.label);
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length === 0) {
        Alert.alert('No results', `No location found for "${query}". Try a different search.`);
        setSearching(false);
        return;
      }
      const { latitude: lat, longitude: lng } = results[0];
      if (!isWithinPhnomPenh(lat, lng)) {
        showPhnomPenhOnlyAlert();
        return;
      }
      setCoords({ lat, lng });
      mapRef.current?.animateToLocation(lat, lng);
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    } catch (e) {
      Alert.alert('Error', 'Search failed. Try again or use the map to pick a location.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, suggestions, showPhnomPenhOnlyAlert]);

  const handlePickSuggestion = useCallback((item: PlaceSuggestion) => {
    if (!isWithinPhnomPenh(item.lat, item.lng)) {
      showPhnomPenhOnlyAlert();
      return;
    }
    Keyboard.dismiss();
    setSearchQuery(item.label);
    setCoords({ lat: item.lat, lng: item.lng });
    mapRef.current?.animateToLocation(item.lat, item.lng);
    setCurrentAddress(item.label);
    setSuggestions([]);
  }, [showPhnomPenhOnlyAlert]);

  const handleSelectFromMap = useCallback(
    async (lat: number, lng: number) => {
      if (!isWithinPhnomPenh(lat, lng)) {
        showPhnomPenhOnlyAlert();
        mapRef.current?.animateToLocation(coords.lat, coords.lng);
        return;
      }
      const address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setCoords({ lat, lng });
      setCurrentAddress(address);
      if (returnTo) {
        let area_name: string | null = null;
        try {
          const [result] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (result) {
            const parts = [result.district, result.subregion, result.city].filter(Boolean) as string[];
            if (parts.length) area_name = parts.join(', ');
          }
        } catch {
          // ignore
        }
        setPendingLocationSelection({
          address,
          lat,
          lng,
          area_name: area_name ?? undefined,
          location_link: `https://www.google.com/maps?q=${lat},${lng}`,
        });
      }
      router.back();
    },
    [router, returnTo, setPendingLocationSelection, showPhnomPenhOnlyAlert, coords.lat, coords.lng]
  );

  return (
    <View style={styles.container}>
      {/* Yellow header - extends to top of screen; content padded below status bar */}
      <View style={[styles.header, { paddingTop: insets.top + APP_SCREEN_HEADER_PADDING_TOP_INNER }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Location</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search address or place name"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          editable={!searching}
        />
        <TouchableOpacity
          style={[styles.searchSubmitBtn, searching && styles.searchSubmitBtnDisabled]}
          onPress={handleSearchSubmit}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons name="arrow-forward" size={22} color="#000" />
          )}
        </TouchableOpacity>
      </View>
      {(fetchingSuggestions || suggestions.length > 0) && (
        <View style={styles.suggestionPanel}>
          {fetchingSuggestions && suggestions.length === 0 ? (
            <View style={styles.suggestionLoadingRow}>
              <ActivityIndicator size="small" color="#666" />
              <Text style={styles.suggestionLoadingText}>Searching…</Text>
            </View>
          ) : (
            suggestions.map((item, idx) => (
              <TouchableOpacity
                key={`${item.lat}-${item.lng}-${idx}`}
                style={[styles.suggestionRow, idx === suggestions.length - 1 && styles.suggestionRowLast]}
                onPress={() => handlePickSuggestion(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location-outline" size={18} color="#777" />
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* My Current Location - shows general location name from reverse geocode */}
      <View style={styles.currentLocationRow}>
        <Text style={styles.currentLocationLabel}>My Current Location</Text>
        <View style={styles.addressRow}>
          <View style={styles.yellowDot} />
          <Text style={styles.addressText} numberOfLines={3}>
            {currentAddressSummary}
          </Text>
        </View>
      </View>

      {/* Map area - full map on web, placeholder + Open in Maps on native */}
      <View style={styles.mapContainer}>
        <SearchLocationMap
          ref={mapRef}
          initialLat={coords.lat}
          initialLng={coords.lng}
          onLocationChange={handleLocationChange}
          onSelect={handleSelectFromMap}
          onPressMyLocation={handlePressMyLocation}
        />
      </View>

      {/* Select This Location button - uses current coords (updated by map) */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => handleSelect()}
          activeOpacity={0.8}
        >
          <Text style={styles.selectButtonText}>Select This Location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: APP_SCREEN_HEADER_BG,
    paddingHorizontal: APP_SCREEN_HEADER_PADDING_HORIZONTAL,
    paddingBottom: APP_SCREEN_HEADER_PADDING_BOTTOM,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  headerRight: {
    width: 32,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    padding: 0,
    paddingRight: 8,
  },
  searchSubmitBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  searchSubmitBtnDisabled: {
    opacity: 0.6,
  },
  suggestionPanel: {
    marginHorizontal: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#222',
  },
  suggestionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestionLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  currentLocationRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  currentLocationLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yellowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFEB3B',
    marginRight: 8,
  },
  addressText: {
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
    minHeight: 280,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
  },
  selectButton: {
    backgroundColor: '#FFEB3B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
});
