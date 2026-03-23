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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RETURN_TO_VALUES = ['create-booking', 'home', 'profile-add-address', 'profile-edit-address'] as const;
export type ReturnToValue = (typeof RETURN_TO_VALUES)[number];

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
  const [coords, setCoords] = useState({ lat: 11.5434, lng: 104.8986 }); // Diamond Island area default
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const locationChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
  }, []);

  const buildMapsLink = useCallback((lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`, []);

  const handleSelect = useCallback(async () => {
    if (!returnTo) {
      router.back();
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
  }, [router, returnTo, currentAddress, coords.lat, coords.lng, setPendingLocationSelection, buildMapsLink]);

  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setCoords({ lat, lng });
    setCurrentAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    if (locationChangeTimeoutRef.current) clearTimeout(locationChangeTimeoutRef.current);
    locationChangeTimeoutRef.current = setTimeout(async () => {
      locationChangeTimeoutRef.current = null;
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    }, 400);
  }, []);

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
      setCoords({ lat, lng });
      mapRef.current?.animateToLocation(lat, lng);
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    } catch (e) {
      Alert.alert('Error', 'Could not get your location. Try again.');
    }
  }, []);

  const handleSearchSubmit = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length === 0) {
        Alert.alert('No results', `No location found for "${query}". Try a different search.`);
        setSearching(false);
        return;
      }
      const { latitude: lat, longitude: lng } = results[0];
      setCoords({ lat, lng });
      mapRef.current?.animateToLocation(lat, lng);
      const name = await coordsToDisplayName(lat, lng);
      setCurrentAddress(name);
    } catch (e) {
      Alert.alert('Error', 'Search failed. Try again or use the map to pick a location.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleSelectFromMap = useCallback(
    async (lat: number, lng: number) => {
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
    [router, returnTo, setPendingLocationSelection]
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
