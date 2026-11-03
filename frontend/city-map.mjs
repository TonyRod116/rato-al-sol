// The footprints and heights are an illustration, not input to solar calculations.
export async function createCityMap(element) {
  const base = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = `${base}.css`;
  css.integrity = 'sha256-qx5w1Z7EBGW65+cDDaLzzPKBM/1QLmK9WY7vut/XpzI='; css.crossOrigin = 'anonymous';
  const script = document.createElement('script');
  script.src = `${base}.js`; script.async = true;
  script.integrity = 'sha256-RamwepGJzlYFTGIKlHzPQeKR5YyV6bYVM7dAqqZe5cs='; script.crossOrigin = 'anonymous';
  const resources = [css, script].map((resource) => new Promise((resolve, reject) => {
    resource.onload = resolve;
    resource.onerror = () => reject(new Error('Map library unavailable'));
    document.head.append(resource);
  }));
  let timeout;
  try {
    await Promise.race([Promise.all(resources), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Map library timed out')), 12000);
    })]);
  } finally { clearTimeout(timeout); }

  const gl = window.maplibregl;
  if (!gl?.Map) throw new Error('3D map unavailable');
  const map = new gl.Map({
    container: element,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-3.68856, 40.42713], zoom: 17, pitch: 55, bearing: -20,
    minZoom: 13, maxZoom: 19,
    scrollZoom: false,
  });
  map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-right');

  try {
    await new Promise((resolve, reject) => {
      let errors = 0;
      let finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Map tiles timed out')), 20000);
      map.on('error', () => { if (!finished && ++errors >= 4) finish(new Error('Map tiles unavailable')); });
      map.once('load', () => {
        // Match the warmth of the illustrative scene while keeping the map's labels and attribution.
        const paint = [
          ['background', 'background-color', '#f2e5ce'],
          ['landuse_residential', 'fill-color', '#efe1c8'],
          ['park', 'fill-color', '#c7d2af'],
          ['park', 'fill-outline-color', '#b8c5a4'],
          ['landcover_grass', 'fill-color', '#bdcda9'],
          ['landcover_wood', 'fill-color', '#a5b995'],
          ['road_minor', 'line-color', '#fff8ea'],
          ['road_secondary_tertiary', 'line-color', '#fff7e5'],
          ['building', 'fill-color', '#d6ae99'],
          ['building-3d', 'fill-extrusion-color', '#d8a993'],
          ['building-3d', 'fill-extrusion-opacity', 1],
        ];
        for (const [layer, property, value] of paint) {
          if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
        }
        for (const layer of ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']) {
          if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', 'none');
        }
        map.once('idle', () => {
          const buildings = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
          finish(buildings.length ? undefined : new Error('No building tiles available'));
        });
      });
    });
  } catch (error) {
    map.remove();
    throw error;
  }

  let markers = [];
  let fittedPlaces = false;
  const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  return {
    showPlaces(places, onSelect) {
      for (const entry of markers) entry.marker.remove();
      markers = places.flatMap((place, index) => {
        if (!place.position) return [];
        const pin = document.createElement('button');
        pin.type = 'button'; pin.className = 'google-pin city-map-pin';
        pin.textContent = String(index + 1);
        pin.setAttribute('aria-label', `${place.name}, entrada aproximada`);
        pin.addEventListener('click', () => onSelect(place.id));
        const marker = new gl.Marker({ element: pin, anchor: 'center' })
          .setLngLat([place.position.lng, place.position.lat]).addTo(map);
        return [{ marker, pin, id: place.id }];
      });
      if (!fittedPlaces && markers.length) {
        const bounds = new gl.LngLatBounds();
        for (const entry of markers) bounds.extend(entry.marker.getLngLat());
        map.fitBounds(bounds, {
          padding: { top: 75, bottom: 75, left: 45, right: 100 },
          maxZoom: 17, duration: 0, bearing: map.getBearing(), pitch: map.getPitch(),
        });
        fittedPlaces = true;
      }
    },
    focus(position) { if (position) map.easeTo({ center: [position.lng, position.lat], duration: duration() }); },
    highlight(id) { for (const entry of markers) entry.pin.classList.toggle('is-selected', entry.id === id); },
    invalidate() { map.resize(); },
    rotate() { map.easeTo({ bearing: map.getBearing() + 45, duration: duration() }); },
    set3D(enabled) { map.easeTo({ pitch: enabled ? 55 : 0, duration: duration() }); },
  };
}
