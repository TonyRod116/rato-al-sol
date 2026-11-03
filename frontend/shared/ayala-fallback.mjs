import { getMadridTerraces, madridUtmToLatLng } from '../madrid.mjs';
import { distanceMetres, validCoordinate } from './places.mjs';
import { inMadridArea } from './madrid-scene.mjs';

const PARKS_URL = 'https://datos.madrid.es/dataset/200761-0-parques-jardines/resource/200761-5-parques-jardines-json/download/200761-0-parques-jardines.json';
let parksCache = null;
const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

// Madrid's list covers major parks, not every green space. Its coordinates are
// reference points rather than surveyed sunny seating locations.
export async function searchMadridParks(center, radius, query = '', fetchFn = fetch) {
  if (!validCoordinate(center) || !inMadridArea(center) || !Number.isFinite(radius) || radius < 100 || radius > 5000) return [];
  const name = typeof query === 'string' ? fold(query.trim()) : '';
  if (name.length > 80) return [];
  let parks = fetchFn === fetch && parksCache?.expires > Date.now() ? parksCache.items : null;
  if (!parks) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchFn(PARKS_URL, { signal: controller.signal });
      if (!response.ok) throw new Error('Catálogo municipal de parques no disponible');
      const data = await response.json(), records = data?.['@graph'];
      if (!Array.isArray(records) || records.length > 1000) throw new Error('Catálogo municipal de parques incompleto');
      parks = records.map((item) => {
        const latitude = item?.location?.latitude, longitude = item?.location?.longitude;
        if (!/^\d{1,12}$/.test(String(item?.id)) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 ||
          typeof latitude !== 'number' || typeof longitude !== 'number' || !validCoordinate({ latitude, longitude })) return null;
        return { id: `madrid-park/${item.id}`, name: item.title.trim(), latitude, longitude, kind: 'public' };
      }).filter(Boolean);
      if (fetchFn === fetch) parksCache = { items: parks, expires: Date.now() + 5 * 60 * 1000 };
    } finally { clearTimeout(timer); }
  }
  return parks.filter((park) => !name || fold(park.name).includes(name))
    .map((park) => ({ ...park, distance: distanceMetres(center, park) }))
    .filter((park) => park.distance <= radius).sort((a, b) => a.distance - b.distance);
}

// Existing, explicitly limited municipal sample; coordinates are entrances.
export async function getAyalaFallback(center, radius, query = '', fetchFn = fetch) {
  if (!inMadridArea(center)) return [];
  const names = query.trim().toLocaleLowerCase('es');
  const records = await getMadridTerraces(fetchFn);
  return records.filter((item) => item.position && (!names || item.name.toLocaleLowerCase('es').includes(names)))
    .map((item) => ({ id: `madrid/${item.id}`, name: item.name, latitude: item.position.lat, longitude: item.position.lng, kind: 'business', outdoor: true }))
    .map((place) => ({ ...place, distance: distanceMetres(center, place) })).filter((place) => place.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

// Bounded name search in the municipal terrace register. The query is sent in
// the request body and returned coordinates identify business entrances only.
export async function searchMadridFallback(center, radius, query, fetchFn = fetch) {
  const name = typeof query === 'string' ? query.trim() : '';
  if (!inMadridArea(center) || name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) return [];
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const body = { resource_id: '200085-6-censo-locales', q: name, limit: 80,
      filters: { desc_situacion_terraza: 'Abierta', desc_situacion_local: 'Abierto' },
      fields: ['id_terraza', 'rotulo', 'coordenada_x_local', 'coordenada_y_local', 'desc_tipo_acceso_local'] };
    const response = await fetchFn('https://datos.madrid.es/api/3/action/datastore_search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Censo municipal no disponible');
    const data = await response.json(), records = data?.result?.records;
    if (data?.success !== true || !Array.isArray(records) || records.length > 80) throw new Error('Censo municipal incompleto');
    return records.map((item) => {
      if (!/^\d{1,12}$/.test(String(item.id_terraza)) || typeof item.rotulo !== 'string' || !item.rotulo.trim() ||
          item.rotulo.length > 120 || item.desc_tipo_acceso_local !== 'Puerta Calle') return null;
      const location = madridUtmToLatLng(item.coordenada_x_local, item.coordenada_y_local);
      return location && { id: `madrid/${item.id_terraza}`, name: item.rotulo.trim(), latitude: location.lat,
        longitude: location.lng, kind: 'business', outdoor: true };
    }).filter(Boolean).filter((place) => fold(place.name).includes(fold(name)))
      .map((place) => ({ ...place, distance: distanceMetres(center, place) }))
      .filter((place) => place.distance <= radius).sort((a, b) => a.distance - b.distance);
  } finally { clearTimeout(timer); }
}
