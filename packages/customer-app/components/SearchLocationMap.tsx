import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

export type SearchLocationMapRef = {
  animateToLocation: (lat: number, lng: number) => void;
};

type Props = {
  initialLat: number;
  initialLng: number;
  onLocationChange: (lat: number, lng: number) => void;
  onSelect: (lat: number, lng: number) => void;
  onPressMyLocation?: () => void;
};

const SearchLocationMap = React.forwardRef<SearchLocationMapRef, Props>(function SearchLocationMap(
  { initialLat, initialLng, onLocationChange, onSelect, onPressMyLocation },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const [marker, setMarker] = useState({ latitude: initialLat, longitude: initialLng });

  useImperativeHandle(
    ref,
    () => ({
      animateToLocation(lat: number, lng: number) {
        setMarker({ latitude: lat, longitude: lng });
        onLocationChange(lat, lng);
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          500
        );
      },
    }),
    [onLocationChange]
  );

  const onMarkerDragEnd = useCallback(
    (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setMarker({ latitude, longitude });
      onLocationChange(latitude, longitude);
    },
    [onLocationChange]
  );

  const onMapPress = useCallback(
    (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setMarker({ latitude, longitude });
      onLocationChange(latitude, longitude);
    },
    [onLocationChange]
  );

  return (
    <View style={styles.mapWrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: initialLat,
          longitude: initialLng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker
          coordinate={marker}
          draggable
          onDragEnd={onMarkerDragEnd}
          pinColor="red"
        />
      </MapView>
      <TouchableOpacity
        style={styles.myLocationButton}
        onPress={onPressMyLocation}
        activeOpacity={0.8}
        accessibilityLabel="Center map on my location"
      >
        <Ionicons name="locate" size={24} color="#FFEB3B" />
      </TouchableOpacity>
    </View>
  );
});

export default SearchLocationMap;

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
