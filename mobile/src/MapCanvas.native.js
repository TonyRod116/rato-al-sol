import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { Platform, StyleSheet, View } from 'react-native';
import { mapAtmosphere } from '../../frontend/map-atmosphere.mjs';
import { DEFAULT_LOCATION } from '../../frontend/shared/default-location.mjs';
import { translate } from '../../frontend/shared/i18n.mjs';
import { nativeVisibleViewport, paddedViewport } from './viewport.mjs';

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

// The rest of the screen updates frequently (for example while the user
// searches). Reuse the native overlays until the actual shadow geometry changes.
const ShadowPolygons = React.memo(function ShadowPolygons({ shadows }) {
  return shadows.features.flatMap((feature, featureIndex) => feature.geometry.coordinates.map((polygon, polygonIndex) => <Polygon
    key={`${featureIndex}-${polygonIndex}`} coordinates={polygon[0].map(([longitude, latitude]) => ({ latitude, longitude }))}
    holes={polygon.slice(1).map((ring) => ring.map(([longitude, latitude]) => ({ latitude, longitude })))}
    fillColor="rgba(48,67,73,0.26)" strokeColor="transparent" strokeWidth={0} tappable={false} />));
});

export default function MapCanvas({ camera, places, selected, language, shadows, sun, view3D, onMove, onPick, onPlace, style }) {
  const map = useRef(null), viewRequest = useRef(0);
  const atmosphere = mapAtmosphere(sun);
  useEffect(() => {
    if (camera) map.current?.animateCamera({ center: { latitude: camera.latitude, longitude: camera.longitude } }, { duration: 350 });
  }, [camera]);
  useEffect(() => { map.current?.animateCamera({ pitch: view3D ? 20 : 0 }, { duration: 350 }); }, [view3D]);
  async function move(region) {
    const request = ++viewRequest.current;
    let boundary;
    try { boundary = await map.current?.getMapBoundaries(); } catch { /* Fall back to the reported region. */ }
    if (request !== viewRequest.current) return;
    const visibleBounds = nativeVisibleViewport(region, boundary);
    onMove({ latitude: region.latitude, longitude: region.longitude, bounds: paddedViewport(visibleBounds), visibleBounds });
  }
  return <View style={[styles.container, style]}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialCamera={{ center: DEFAULT_LOCATION, pitch: 20, heading: 0, altitude: 450, zoom: 17.3 }}
      showsBuildings showsCompass pitchEnabled rotateEnabled userInterfaceStyle={Platform.OS === 'android' ? 'light' : atmosphere.isNight ? 'dark' : 'light'}
      customMapStyle={Platform.OS === 'android' ? atmosphere.isNight ? nightMap : defaultMap : undefined}
      onRegionChangeComplete={move}
      onPress={(event) => onPick(event.nativeEvent.coordinate)} accessibilityLabel={translate(language, 'Mapa. Toca para elegir un punto exterior.', 'Map. Tap to choose an outdoor point.')}>
      <ShadowPolygons shadows={shadows} />
      {places.slice(0, 30).map((place) => <Marker key={place.id} coordinate={place} title={place.name} pinColor="#cf7554"
        onPress={(event) => { event.stopPropagation(); onPlace(place); }} />)}
      {selected && <Marker coordinate={selected} title={selected.name} pinColor="#273e33" />}
    </MapView>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: atmosphere.nativeTint }]} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ebe4d7', overflow: 'hidden' },
});
