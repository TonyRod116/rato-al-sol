// Public OpenStreetMap pilot: queries are explicit, bounded and sent in the POST body.
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const EARTH_RADIUS = 6371000;
const MAX_PLACES = 80;
const MAX_BUILDINGS = 4000;
const recent = new Map();
let pauseUntil = 0;

const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

const categories = [
  { names: ['restaurante', 'restaurantes', 'restaurant', 'restaurants'], filter: '["amenity"~"^(restaurant|fast_food)$"]', kind: 'business' },
  { names: ['terraza', 'terrazas', 'terrace', 'terraces'], filter: '["amenity"~"^(restaurant|cafe|bar|pub|ice_cream)$"]["outdoor_seating"="yes"]', kind: 'business' },
  { names: ['bar', 'bares', 'bars'], filter: '["amenity"~"^(bar|pub)$"]', kind: 'business' },
  { names: ['cafe', 'cafes', 'cafeteria', 'cafeterias'], filter: '["amenity"="cafe"]', kind: 'business' },
  { names: ['parque', 'parques', 'jardin', 'jardines', 'park', 'parks', 'garden', 'gardens'], filter: '["leisure"~"^(park|garden|playground|recreation_ground)$"]', kind: 'public' },
  { names: ['plaza', 'plazas', 'square', 'squares'], filter: '["place"="square"]', kind: 'public' },
];

export function searchCategory(text) {
  const query = typeof text === 'string' ? fold(text) : '';
  if (!query || query.includes(' ') || !/^[a-z]+$/.test(query)) return null;
  return categories.find((category) => category.names.includes(query)) || categories.find((category) => category.names.some((name) =>
    query.length >= 5 && Math.abs(name.length - query.length) <= 2 && editDistance(name, query) <= (query.length >= 8 ? 2 : 1))) || null;
}

export function matchesName(text, name) {
  const query = fold(text), candidate = fold(name);
  if (candidate.includes(query)) return true;
  if (query.length < 4 || query.length > 40) return false;
  const words = candidate.split(/\s+/), count = query.split(/\s+/).length;
  const tolerance = query.length >= 8 ? 2 : 1;
  return words.some((_, i) => {
    const part = words.slice(i, i + count).join(' ');
    return Math.abs(part.length - query.length) <= tolerance && editDistance(query, part) <= tolerance;
  });
}

function namePattern(name) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (name.length < 4 || name.length > 40 || !/^[\p{L}\p{N} ]+$/u.test(name)) return escape(name);
  const chars = [...name], variants = [escape(name)];
  for (let i = 0; i < chars.length; i++) {
    const before = escape(chars.slice(0, i).join('')), after = escape(chars.slice(i + 1).join(''));
    variants.push(before + after, before + '.' + after, before + '.' + escape(chars.slice(i).join('')));
    if (i + 1 < chars.length) variants.push(before + escape(chars[i + 1] + chars[i]) + escape(chars.slice(i + 2).join('')));
  }
  return `(${[...new Set(variants)].join('|')})`;
}

export function validCoordinate(point) {
  return point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 85 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function distanceMetres(a, b) {
  if (!validCoordinate(a) || !validCoordinate(b)) return Infinity;
  const rad = Math.PI / 180;
  const lat1 = a.latitude * rad, lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function around(point, radius) {
  if (!validCoordinate(point) || !Number.isInteger(radius) || radius < 100 || radius > 5000) throw new Error('Búsqueda fuera de los límites permitidos.');
  return `${radius},${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

async function queryOverpass(query, fetchFn = fetch) {
  const live = fetchFn === globalThis.fetch;
  const now = Date.now();
  const cached = live && recent.get(query);
  if (cached && cached.until > now) return cached.elements;
  if (live && now < pauseUntil) throw new Error('El servicio de lugares está ocupado. Espera unos segundos y vuelve a probar.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 27000);
  try {
    const response = await fetchFn(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(`[out:json][timeout:20];${query}`)}`, signal: controller.signal,
    });
    if (response.status === 406 || response.status === 429 || response.status >= 500) {
      if (live) pauseUntil = Date.now() + 30000;
      throw new Error('El servicio de lugares está ocupado. Espera unos segundos y vuelve a probar.');
    }
    if (!response.ok) throw new Error('El servicio de lugares no está disponible.');
    const data = await response.json();
    if (!data || !Array.isArray(data.elements) || data.remark) throw new Error('La respuesta de lugares está incompleta.');
    if (live) {
      if (recent.size >= 8) recent.delete(recent.keys().next().value);
      recent.set(query, { elements: data.elements, until: Date.now() + 60000 });
    }
    return data.elements;
  } finally { clearTimeout(timeout); }
}

function kindFor(tags) {
  if (['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream'].includes(tags.amenity)) return 'business';
  if (['park', 'garden', 'playground', 'recreation_ground'].includes(tags.leisure) || tags.place === 'square') return 'public';
  return 'place';
}

function normalizePlace(item) {
  const tags = item?.tags;
  const point = item?.type === 'node' ? item : item?.center;
  const latitude = point?.lat, longitude = point?.lon;
  if (!tags || typeof tags.name !== 'string' || !tags.name.trim() || tags.name.length > 180 ||
      !['node', 'way', 'relation'].includes(item.type) || !Number.isSafeInteger(item.id) ||
      !validCoordinate({ latitude, longitude })) return null;
  return { id: `${item.type}/${item.id}`, name: tags.name.trim(), latitude, longitude,
    kind: kindFor(tags), outdoor: tags.outdoor_seating === 'yes' };
}

function normalizePlaces(elements, origin) {
  return elements.map(normalizePlace).filter(Boolean).map((place) => ({ ...place, distance: distanceMetres(origin, place) }))
    .sort((a, b) => a.distance - b.distance).slice(0, MAX_PLACES);
}

export async function searchPlaces(text, center, radius = 5000, fetchFn = fetch) {
  const name = typeof text === 'string' ? text.trim() : '';
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) throw new Error('Escribe entre 2 y 80 caracteres.');
  const category = searchCategory(name);
  // Escape both the regex and Overpass string; only our bounded alternatives are operators.
  const literal = namePattern(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const filter = category ? `${category.filter}["name"]` : `["name"~"${literal}",i]`;
  const elements = await queryOverpass(`nwr(around:${around(center, radius)})${filter};out center tags ${MAX_PLACES};`, fetchFn);
  return normalizePlaces(elements, center);
}

export async function searchNearby(center, radius, fetchFn = fetch) {
  const a = around(center, radius);
  const query = `(` +
    `nwr(around:${a})["leisure"~"^(park|garden|playground|recreation_ground)$"]["name"];` +
    `nwr(around:${a})["place"="square"]["name"];` +
    `nwr(around:${a})["amenity"~"^(restaurant|cafe|bar|pub|ice_cream)$"]["outdoor_seating"="yes"]["name"];` +
    `);out center tags ${MAX_PLACES};`;
  const elements = await queryOverpass(query, fetchFn);
  return normalizePlaces(elements, center).filter((place) => place.distance <= radius);
}

function heightOf(tags) {
  const raw = typeof tags?.height === 'string' ? tags.height.trim().replace(/\s*m$/, '') : '';
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 0 && n <= 500) return { value: n, source: 'height' };
  }
  const levels = tags?.['building:levels'];
  if (typeof levels === 'string' && /^\d{1,2}$/.test(levels) && Number(levels) > 0 && Number(levels) <= 100)
    return { value: Number(levels) * 3, source: 'levels' };
  return { value: null, source: 'unknown' };
}

export async function getBuildings(points, fetchFn = fetch) {
  if (!Array.isArray(points) || !points.length || points.length > 6 || !points.every(validCoordinate)) throw new Error('Puntos no válidos.');
  const clauses = points.map((point) => `way(around:${around(point, 400)})["building"];`).join('');
  const elements = await queryOverpass(`(${clauses});out geom ${MAX_BUILDINGS};`, fetchFn);
  if (!elements.length || elements.length >= MAX_BUILDINGS) throw new Error('No hay geometría de edificios suficiente para calcular.');
  const buildings = [];
  for (const item of elements) {
    if (item.type !== 'way' || !Array.isArray(item.geometry) || item.geometry.length < 4 || item.geometry.length > 10000) throw new Error('Hay geometría de edificios incompleta.');
    const footprint = item.geometry.map((p) => ({ latitude: p.lat, longitude: p.lon }));
    if (!footprint.every(validCoordinate) || distanceMetres(footprint[0], footprint.at(-1)) > 1) throw new Error('Hay geometría de edificios incompleta.');
    const height = heightOf(item.tags);
    buildings.push({ id: item.id, footprint, height: height.value, heightSource: height.source });
  }
  return buildings;
}
