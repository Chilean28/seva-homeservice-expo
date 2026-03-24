import type { SearchLocationMapRef } from '@/components/SearchLocationMap';
import React, { useImperativeHandle, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// react-native-maps does not support web. Show fallback: coords + Open in Maps + Select.

type Props = {
  initialLat: number;
  initialLng: number;
  onLocationChange: (lat: number, lng: number) => void;
  onSelect: (lat: number, lng: number) => void;
};

const SearchLocationMap = React.forwardRef<SearchLocationMapRef, Props>(function SearchLocationMap(
  { initialLat, initialLng, onLocationChange, onSelect },
  ref
) {
  const [coords, setCoords] = useState({ lat: initialLat, lng: initialLng });

  useImperativeHandle(
    ref,
    () => ({
      animateToLocation(lat: number, lng: number) {
        setCoords({ lat, lng });
        onLocationChange(lat, lng);
      },
    }),
    [onLocationChange]
  );

  const mapUrl = useMemo(
    () => `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`,
    [coords.lat, coords.lng]
  );

  return (
    <View style={styles.mapFallback}>
      <Text style={styles.mapFallbackText}>
        {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
      </Text>
      <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(mapUrl)}>
        <Text style={styles.linkButtonText}>Open in Maps</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.selectButton} onPress={() => onSelect(coords.lat, coords.lng)}>
        <Text style={styles.selectButtonText}>Select This Location</Text>
      </TouchableOpacity>
    </View>
  );
});

export default SearchLocationMap;

const styles = StyleSheet.create({
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mapFallbackText: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  selectButton: {
    marginTop: 12,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
