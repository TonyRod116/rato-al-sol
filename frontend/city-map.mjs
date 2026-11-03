import { AYALA_BOUNDS } from './madrid-buildings.mjs';
import { mapAtmosphere } from './map-atmosphere.mjs';
import { drawShadowMask } from './shadow-mask.mjs?v=20261103-6';
import { AERIAL_TILES, AERIAL_ATTRIBUTION } from './map-basemap.mjs';

export async function createCityMap(element, onViewChange = () => {}, onBasemapError = () => {}) {
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
    minZoom: 14, maxZoom: 19,
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
          ['building-3d', 'fill-extrusion-opacity', .8],
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

  const [west, south, east, north] = AYALA_BOUNDS;
  const coverage = { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  const empty = { type: 'FeatureCollection', features: [] };
  map.addSource('ayala-buildings', { type: 'geojson', data: empty, maxzoom: 17 });
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const shadowCoordinates = ([w, s, e, n]) => [[w, n], [e, n], [e, s], [w, s]];
  map.addSource('ayala-shadows', { type: 'canvas', canvas: shadowCanvas, animate: false,
    coordinates: shadowCoordinates(AYALA_BOUNDS) });
  const belowBuildings = map.getLayer('building') ? 'building' : undefined;
  map.addLayer({ id: 'ayala-shadows', type: 'raster', source: 'ayala-shadows',
    paint: { 'raster-opacity': .44, 'raster-fade-duration': 0 } }, belowBuildings);
  map.addLayer({ id: 'ayala-buildings-2d', type: 'fill', source: 'ayala-buildings', minzoom: 13,
    layout: { visibility: 'none' }, paint: { 'fill-color': '#d6ae99', 'fill-opacity': .8 } }, belowBuildings);
  const below3d = map.getLayer('building-3d') ? 'building-3d' : undefined;
  map.addLayer({ id: 'ayala-buildings-3d', type: 'fill-extrusion', source: 'ayala-buildings', minzoom: 13,
    paint: { 'fill-extrusion-color': '#d8a993', 'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': 0, 'fill-extrusion-opacity': .8 } }, below3d);
  // Replace the schematic tile buildings only within the municipal coverage area.
  function useMunicipalBuildings() {
    for (const id of ['building', 'building-3d']) {
      if (!map.getLayer(id)) continue;
      const original = map.getFilter(id);
      const outside = ['!', ['within', coverage]];
      map.setFilter(id, original ? ['all', original, outside] : outside);
    }
  }
  let usingMunicipal = false;
  if (map.getLayer('building-3d')) map.setLayerZoomRange('building-3d', 13, 24);
  if (map.getLayer('building')) {
    map.setLayerZoomRange('building', 13, 24);
    map.setLayoutProperty('building', 'visibility', 'none');
  }
  let aerialSelected = false, aerialSourceId = '', aerialGeneration = 0;
  map.on('error', (event) => {
    if (aerialSelected && event.sourceId === aerialSourceId) {
      aerialSelected = false;
      map.removeLayer('pnoa-aerial');
      map.removeSource(aerialSourceId);
      onBasemapError();
    }
  });
  const notifyView = (settled = false) => {
    const bounds = map.getBounds();
    const x = (bounds.getEast() - bounds.getWest()) * .2;
    const y = (bounds.getNorth() - bounds.getSouth()) * .2;
    onViewChange({ bearing: map.getBearing(), pitch: map.getPitch(), center: map.getCenter(), settled,
      shadowBounds: [bounds.getWest() - x, bounds.getSouth() - y, bounds.getEast() + x, bounds.getNorth() + y] });
  };
  map.on('rotate', () => notifyView());
  map.on('pitch', () => notifyView());
  map.on('moveend', () => notifyView(true));
  notifyView(true);
  let markers = [];
  let fittedPlaces = false;
  const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  return {
    setBuildings(buildings) {
      map.getSource('ayala-buildings').setData(buildings);
      if (!usingMunicipal) { useMunicipalBuildings(); usingMunicipal = true; }
    },
    setShadows(shadows, bounds = AYALA_BOUNDS) {
      const size = Math.max(element.clientWidth, element.clientHeight) * (window.devicePixelRatio || 1) * 1.4;
      drawShadowMask(shadowCanvas, shadows, bounds, size);
      const source = map.getSource('ayala-shadows');
      source.setCoordinates(shadowCoordinates(bounds));
      source.play();
      map.once('render', () => source.pause());
    },
    setSun(sun) {
      map.getCanvas().style.filter = mapAtmosphere(sun).cssFilter;
      const daylight = sun && sun.altitude >= 5;
      map.setLight({ anchor: 'map', color: '#fff9ef', intensity: daylight ? .3 : .12,
        position: daylight ? [1.5, sun.azimuth, 90 - sun.altitude] : [1.5, 180, 30],
        'position-transition': { duration: 0 }, 'intensity-transition': { duration: 0 } });
    },
    setBasemap(kind) {
      aerialSelected = kind === 'aerial';
      if (aerialSelected && !map.getLayer('pnoa-aerial')) {
        aerialSourceId = `pnoa-aerial-${++aerialGeneration}`;
        map.addSource(aerialSourceId, { type: 'raster', tiles: [AERIAL_TILES], tileSize: 256,
          maxzoom: 19, attribution: AERIAL_ATTRIBUTION });
        map.addLayer({ id: 'pnoa-aerial', type: 'raster', source: aerialSourceId,
          paint: { 'raster-fade-duration': 0 } }, 'ayala-shadows');
      }
      if (map.getLayer('pnoa-aerial')) map.setLayoutProperty('pnoa-aerial', 'visibility', aerialSelected ? 'visible' : 'none');
    },
    set3D(enabled) {
      for (const id of ['building-3d', 'ayala-buildings-3d']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none');
      }
      if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', enabled ? 'none' : 'visible');
      map.setLayoutProperty('ayala-buildings-2d', 'visibility', enabled ? 'none' : 'visible');
      // Below zoom 14 the provider omits almost every building from its tiles.
      map.setMinZoom(enabled ? 14 : 13);
      map.easeTo({ pitch: enabled ? 55 : 0, duration: duration() });
    },
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
  };
}
