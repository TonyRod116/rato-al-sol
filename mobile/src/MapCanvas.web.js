import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

let leafletPromise;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.L); script.onerror = reject; document.head.appendChild(script);
  });
  return leafletPromise;
}

export default function MapCanvas({ camera, places, selected, shadows, onMove, onPick, onPlace }) {
  const element = useRef(null), map = useRef(null), layers = useRef(null), callbacks = useRef({});
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  callbacks.current = { onMove, onPick, onPlace };
  useEffect(() => {
    let disposed = false;
    loadLeaflet().then((L) => {
      if (disposed || !element.current) return;
      map.current = L.map(element.current, { zoomControl: false }).setView([40.42785, -3.6873], 16);
      L.control.zoom({ position: 'bottomleft' }).addTo(map.current);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map.current);
      layers.current = L.layerGroup().addTo(map.current);
      map.current.on('moveend', () => { const p = map.current.getCenter(); callbacks.current.onMove({ latitude: p.lat, longitude: p.lng }); });
      map.current.on('click', (event) => callbacks.current.onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      setReady(true);
    }).catch(() => setFailed(true));
    return () => { disposed = true; map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => { if (ready && camera) map.current?.setView([camera.latitude, camera.longitude], 16); }, [ready, camera]);
  useEffect(() => {
    if (!ready || !layers.current) return;
    const L = window.L; layers.current.clearLayers();
    shadows.forEach((shape) => L.polygon(shape.map((p) => [p.latitude, p.longitude]), { color: '#304349', weight: 0, fillOpacity: 0.25, interactive: false }).addTo(layers.current));
    places.slice(0, 30).forEach((place) => {
      const marker = L.circleMarker([place.latitude, place.longitude], { radius: 7, color: '#fffaf0', weight: 2, fillColor: '#cf7554', fillOpacity: 1 }).addTo(layers.current);
      marker.on('click', (e) => { L.DomEvent.stopPropagation(e); callbacks.current.onPlace(place); });
      const label = document.createElement('span'); label.textContent = place.name;
      marker.bindTooltip(label, { direction: 'top' });
    });
    if (selected) L.circleMarker([selected.latitude, selected.longitude], { radius: 9, color: '#fffaf0', weight: 3, fillColor: '#273e33', fillOpacity: 1, interactive: false }).addTo(layers.current);
  }, [ready, places, selected, shadows]);
  return <View style={{ height: 300, backgroundColor: '#ebe4d7', overflow: 'hidden', borderRadius: 4 }}>
    <div ref={element} aria-label="Mapa. Toca para elegir un punto exterior." style={{ height: '100%', width: '100%', zIndex: 0 }} />
    {failed && <Text style={{ position: 'absolute', left: 15, top: 15, color: '#31453b' }}>No se ha podido cargar el mapa.</Text>}
    <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 12, backgroundColor: '#fffaf0', paddingHorizontal: 10, paddingVertical: 8 }}><Text style={{ color: '#31453b', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>TOCA PARA ELEGIR UN PUNTO  ↗</Text></View>
  </View>;
}
