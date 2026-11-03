import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { Platform, StyleSheet, View } from 'react-native';
import { mapAtmosphere } from '../../frontend/map-atmosphere.mjs';
import { DEFAULT_LOCATION } from '../../frontend/shared/default-location.mjs';
import { translate } from '../../frontend/shared/i18n.mjs';

// Android's map colour-scheme prop is only applied at creation by this version
// of react-native-maps, so a map style lets it follow the time slider live.
const nightMap = [
  { elementType: 'geometry', stylers: [{ color: '#263a46' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d2dce0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#263a46' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#405560' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#182e3b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#304b49' }] },
];
const defaultMap = [];

export default function MapCanvas({ camera, places, selected, language, shadows, sun, onMove, onPick, onPlace }) {
  const map = useRef(null);
  const atmosphere = mapAtmosphere(sun);
  useEffect(() => {
    if (camera) map.current?.animateCamera({ center: { latitude: camera.latitude, longitude: camera.longitude } }, { duration: 350 });
  }, [camera]);
  return <View style={styles.container}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialCamera={{ center: DEFAULT_LOCATION, pitch: 45, heading: 0, altitude: 700, zoom: 16 }}
      showsBuildings showsCompass pitchEnabled rotateEnabled userInterfaceStyle={Platform.OS === 'android' ? 'light' : atmosphere.isNight ? 'dark' : 'light'}
      customMapStyle={Platform.OS === 'android' ? atmosphere.isNight ? nightMap : defaultMap : undefined}
      onRegionChangeComplete={(region) => onMove({ latitude: region.latitude, longitude: region.longitude })}
      onPress={(event) => onPick(event.nativeEvent.coordinate)} accessibilityLabel={translate(language, 'Mapa. Toca para elegir un punto exterior.', 'Map. Tap to choose an outdoor point.')}>
      {shadows.map((coordinates, index) => <Polygon key={index} coordinates={coordinates} fillColor="rgba(48,67,73,0.26)" strokeColor="rgba(48,67,73,0.05)" strokeWidth={0.5} tappable={false} />)}
      {places.slice(0, 30).map((place) => <Marker key={place.id} coordinate={place} title={place.name} pinColor="#cf7554"
        onPress={(event) => { event.stopPropagation(); onPlace(place); }} />)}
      {selected && <Marker coordinate={selected} title={selected.name} pinColor="#273e33" />}
    </MapView>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: atmosphere.nativeTint }]} />
  </View>;
}
const styles = StyleSheet.create({
  container: { height: 300, backgroundColor: '#ebe4d7', overflow: 'hidden', borderRadius: 4 },
});
