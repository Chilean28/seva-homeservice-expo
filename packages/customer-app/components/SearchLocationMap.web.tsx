import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// react-native-maps does not support web. Show fallback: coords + Open in Maps + Select.

type Props = {
  initialLat: number;
  initialLng: number;
  onLocationChange: (lat: number, lng: number) => void;
  onSelect: (lat: number, lng: number) => void;
};

export default function SearchLocationMap({
  initialLat,
  initialLng,
  onSelect,
}: Props) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${initialLat},${initialLng}`;
  return (
    <View style={styles.mapFallback}>
      <Text style={styles.mapFallbackText}>
        {initialLat.toFixed(4)}, {initialLng.toFixed(4)}
      </Text>
      <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(mapUrl)}>
        <Text style={styles.linkButtonText}>Open in Maps</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.selectButton} onPress={() => onSelect(initialLat, initialLng)}>
        <Text style={styles.selectButtonText}>Select This Location</Text>
      </TouchableOpacity>
    </View>
  );
}

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
