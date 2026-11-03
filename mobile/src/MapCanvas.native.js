import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { StyleSheet, View, Text } from 'react-native';

export default function MapCanvas({ camera, places, selected, shadows, onMove, onPick, onPlace }) {
  const map = useRef(null);
  useEffect(() => {
    if (camera) map.current?.animateCamera({ center: { latitude: camera.latitude, longitude: camera.longitude } }, { duration: 350 });
  }, [camera]);
  return <View style={styles.container}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialCamera={{ center: { latitude: 40.42785, longitude: -3.6873 }, pitch: 45, heading: 0, altitude: 700, zoom: 16 }}
      showsBuildings showsCompass pitchEnabled rotateEnabled onRegionChangeComplete={(region) => onMove({ latitude: region.latitude, longitude: region.longitude })}
      onPress={(event) => onPick(event.nativeEvent.coordinate)} accessibilityLabel="Mapa. Toca para elegir un punto exterior.">
      {shadows.map((coordinates, index) => <Polygon key={index} coordinates={coordinates} fillColor="rgba(48,67,73,0.26)" strokeColor="rgba(48,67,73,0.05)" strokeWidth={0.5} tappable={false} />)}
      {places.slice(0, 30).map((place) => <Marker key={place.id} coordinate={place} title={place.name} pinColor="#cf7554"
        onPress={(event) => { event.stopPropagation(); onPlace(place); }} />)}
      {selected && <Marker coordinate={selected} title={selected.name} pinColor="#273e33" />}
    </MapView>
    <View style={styles.hint} pointerEvents="none"><Text style={styles.hintText}>TOCA PARA ELEGIR UN PUNTO  ↗</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  container: { height: 300, backgroundColor: '#ebe4d7', overflow: 'hidden', borderRadius: 4 },
  hint: { position: 'absolute', left: 12, top: 12, backgroundColor: '#fffaf0', paddingHorizontal: 10, paddingVertical: 8 },
  hintText: { color: '#31453b', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
});
