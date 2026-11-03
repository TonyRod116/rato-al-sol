// Fallback when the 3D map is unavailable. Official Leaflet 1.9.4 files
// are pinned with the integrity hashes published by the project.
export async function createOpenMap(element, onTileStatus, onViewChange = () => {}) {
  const version = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = `${version}.css`;
  css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = 'anonymous';
  const cssReady = new Promise((resolve, reject) => { css.onload = resolve; css.onerror = reject; });
  document.head.append(css);
  const script = document.createElement('script');
  script.src = `${version}.js`;
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
  const scriptReady = new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
  document.head.append(script);
  let timeout;
  try {
    await Promise.race([Promise.all([cssReady, scriptReady]), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Map timed out')), 12000);
    })]);
  } finally { clearTimeout(timeout); }
  if (!window.L?.map) throw new Error('Map unavailable');
  const L = window.L;
  const map = L.map(element, { zoomControl: false, scrollWheelZoom: false }).setView([40.42713, -3.68856], 17);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  });
  let loaded = false, failed = 0;
  const tileTimeout = setTimeout(() => { if (!loaded) onTileStatus(false); }, 12000);
  tiles.on('tileload', () => { loaded = true; clearTimeout(tileTimeout); onTileStatus(true); });
  tiles.on('tileerror', () => { if (!loaded && ++failed >= 3) onTileStatus(false); });
  tiles.addTo(map);
  const shadows = L.geoJSON(null, { interactive: false, style: { stroke: false, fillColor: '#536a70', fillOpacity: .25 } }).addTo(map);
  const notifyView = () => onViewChange({ bearing: 0, center: map.getCenter() });
  map.on('moveend', notifyView);
  notifyView();
  let markers = [];
  let pendingFit = false;
  function fitPlaces() {
    if (!pendingFit || !map.getSize().x || !map.getSize().y) return;
    const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: false });
    pendingFit = false;
  }
  return {
    setBuildings() {},
    setShadows(data) { shadows.clearLayers(); shadows.addData(data); },
    showPlaces(places, onSelect) {
      for (const marker of markers) marker.remove();
      markers = places.flatMap((place, index) => {
        if (!place.position) return [];
        const icon = L.divIcon({ className: 'open-map-pin', html: `<span class="google-pin">${index + 1}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
        const marker = L.marker([place.position.lat, place.position.lng], {
          icon, title: `${place.name}, entrada aproximada`, alt: `${place.name}, entrada aproximada`,
        }).addTo(map).on('click', () => onSelect(place.id));
        marker.ratoId = place.id;
        return [marker];
      });
      pendingFit = markers.length > 0;
      fitPlaces();
    },
    focus(position) { if (position) map.panTo([position.lat, position.lng]); },
    highlight(id) {
      for (const marker of markers) marker.getElement()?.classList.toggle('is-selected', marker.ratoId === id);
    },
    invalidate() { map.invalidateSize(); fitPlaces(); },
  };
}
