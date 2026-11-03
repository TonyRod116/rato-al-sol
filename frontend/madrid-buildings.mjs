// One bounded request for the Ayala pilot; heights are estimates in metres.
const ENDPOINT = 'https://sigma.madrid.es/hosted/rest/services/cartografia/EDIFICIOS_ALTURAS/MapServer/0/query';
export const AYALA_BOUNDS = [-3.692, 40.425, -3.685, 40.429];
export const AYALA_CENTER = { lat: 40.42785, lng: -3.6873 };
const MAX_FEATURES = 2000;

function validRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000) return false;
  const valid = ring.every((point) => Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    point[0] > AYALA_BOUNDS[0] - .02 && point[0] < AYALA_BOUNDS[2] + .02 &&
    point[1] > AYALA_BOUNDS[1] - .02 && point[1] < AYALA_BOUNDS[3] + .02);
  return valid && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
}

function normalize(feature) {
  const height = feature?.properties?.ALTURA;
  const geometry = feature?.geometry;
  if (!Number.isFinite(height) || height <= 0 || height > 500 || !geometry) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || !polygons.every((polygon) =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing))) return null;
  return { type: 'Feature', properties: { height }, geometry };
}

export async function getMadridBuildings(fetchFn = fetch) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    where: '1=1', geometry: AYALA_BOUNDS.join(','), geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ALTURA', returnGeometry: 'true', f: 'geojson',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchFn(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Building service unavailable');
    const data = await response.json();
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) ||
        !data.features.length || data.features.length >= MAX_FEATURES || data.exceededTransferLimit) {
      throw new Error('Incomplete building geometry');
    }
    const features = data.features.map(normalize).filter(Boolean);
    if (!features.length) throw new Error('No valid building heights');
    const vertices = features.reduce((total, feature) => {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      return total + polygons.reduce((count, polygon) => count + polygon.reduce((sum, ring) => sum + ring.length, 0), 0);
    }, 0);
    if (vertices > 200000) throw new Error('Building geometry exceeds pilot limit');
    return { type: 'FeatureCollection', features, omitted: data.features.length - features.length };
  } finally { clearTimeout(timeout); }
}

export function insideAyala({ lng, lat }) {
  return lng >= AYALA_BOUNDS[0] && lng <= AYALA_BOUNDS[2] && lat >= AYALA_BOUNDS[1] && lat <= AYALA_BOUNDS[3];
}
