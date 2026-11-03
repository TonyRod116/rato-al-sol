import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, getBuildings, searchNearby, searchPlaces } from '../mobile/src/places.mjs';
import { atMinutes, lightAt, prepareScene, solarWindows } from '../mobile/src/estimate.mjs';
import { getMadridScene } from '../mobile/src/madrid-scene.mjs';
import { searchMadridFallback, searchMadridParks } from '../mobile/src/ayala-fallback.mjs';
import { sunPosition } from '../frontend/solar.mjs';

const madrid = { latitude: 40.42785, longitude: -3.6873 };
const reply = (elements) => async (_url, options) => ({ ok: true, json: async () => ({ elements }), options });

test('place search sends literal bounded input in POST, never in the URL', async () => {
  let sent;
  const fetch = async (url, options) => { sent = { url, ...options }; return { ok: true, json: async () => ({ elements: [{ type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Un parque' } }] }) }; };
  const result = await searchPlaces('parque.*";out;', madrid, 1000, fetch);
  assert.equal(result.length, 1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, 'https://overpass-api.de/api/interpreter');
  assert.ok(!sent.url.includes(String(madrid.latitude)));
  const query = decodeURIComponent(sent.body.slice(5));
  assert.ok(query.includes('parque\\\\.\\\\*\\";out;'));
  await assert.rejects(() => searchPlaces('x', madrid, 1000, fetch));
  await assert.rejects(() => searchPlaces('parque', madrid, 100000, fetch));
});

test('nearby results are real entries within the requested radius and restaurants are not terrace points', async () => {
  const elements = [
    { type: 'node', id: 1, lat: madrid.latitude, lon: madrid.longitude, tags: { name: 'Un café', amenity: 'cafe', outdoor_seating: 'yes' } },
    { type: 'way', id: 2, center: { lat: madrid.latitude + .002, lon: madrid.longitude }, tags: { name: 'Un parque', leisure: 'park' } },
    { type: 'node', id: 3, lat: madrid.latitude + .02, lon: madrid.longitude, tags: { name: 'Lejos', leisure: 'park' } },
    { type: 'node', id: 4, lat: 999, lon: 2, tags: { name: 'Inválido' } },
  ];
  const results = await searchNearby(madrid, 500, reply(elements));
  assert.deepEqual(results.map((p) => p.kind), ['business', 'public']);
  assert.ok(results[1].distance > 200 && results[1].distance < 250);
  assert.equal(distanceMetres(madrid, madrid), 0);
});

test('building heights remain unknown when absent and incomplete geometry is rejected', async () => {
  const geometry = [
    { lat: 40.4278, lon: -3.6873 }, { lat: 40.4278, lon: -3.6872 },
    { lat: 40.4279, lon: -3.6872 }, { lat: 40.4278, lon: -3.6873 },
  ];
  const buildings = await getBuildings([madrid], reply([
    { type: 'way', id: 1, geometry, tags: { 'building:levels': '4' } },
    { type: 'way', id: 2, geometry, tags: {} },
  ]));
  assert.equal(buildings[0].height, 12);
  assert.equal(buildings[1].height, null);
  await assert.rejects(() => getBuildings([madrid], reply([{ type: 'way', geometry: geometry.slice(1), tags: {} }])));
  await assert.rejects(() => getBuildings([madrid], reply([])));
});

test('Madrid building lookup puts its coordinates in a POST and rejects missing heights', async () => {
  let request;
  const feature = { type: 'Feature', properties: { ALTURA: 20 }, geometry: { type: 'Polygon', coordinates: [[[-3.6874, 40.4278], [-3.6873, 40.4278], [-3.6873, 40.4279], [-3.6874, 40.4278]]] } };
  const fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }; };
  const buildings = await getMadridScene(madrid, fetch);
  assert.equal(buildings[0].height, 20);
  assert.equal(request.method, 'POST');
  assert.ok(!request.url.includes(String(madrid.latitude)));
  feature.properties.ALTURA = null;
  await assert.rejects(() => getMadridScene(madrid, fetch));
});

test('Madrid name fallback searches the public register via POST and keeps entrances distinct', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ success: true, result: { records: [
      { id_terraza: '42', rotulo: 'Bar de prueba', coordenada_x_local: '443000', coordenada_y_local: '4476000', desc_tipo_acceso_local: 'Puerta Calle' },
      { id_terraza: '43', rotulo: 'Sin entrada', coordenada_x_local: '', coordenada_y_local: '', desc_tipo_acceso_local: 'Interior' },
    ] } }) };
  };
  const places = await searchMadridFallback(madrid, 5000, 'Bar de prueba', fetch);
  assert.equal(request.method, 'POST');
  assert.ok(!request.url.includes('Bar'));
  assert.equal(JSON.parse(request.body).q, 'Bar de prueba');
  assert.equal(places.length, 1);
  assert.ok(places.every((place) => place.kind === 'business'));
  assert.ok(!places.some((place) => place.name === 'Sin entrada'));
});

test('municipal park fallback filters reference points locally and ignores invalid locations', async () => {
  let requested;
  const fetch = async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ '@graph': [
      { id: '1', title: 'Jardín cercano', location: { latitude: madrid.latitude + .001, longitude: madrid.longitude } },
      { id: '2', title: 'Jardín lejano', location: { latitude: madrid.latitude + .02, longitude: madrid.longitude } },
      { id: '3', title: 'Sin posición' },
      { id: '4', title: 'Inválido', location: { latitude: '40.4', longitude: -3.6 } },
    ] }) };
  };
  const places = await searchMadridParks(madrid, 500, 'jardín', fetch);
  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Jardín cercano');
  assert.equal(places[0].kind, 'public');
  assert.ok(!requested.includes(String(madrid.latitude)) && !requested.includes('jardín'));
  await assert.rejects(() => searchMadridParks(madrid, 500, '', async () => ({ ok: true, json: async () => ({}) })));
});

test('unknown obstruction is not sunshine; known obstruction and open ray are distinguished', () => {
  const instant = new Date('2026-06-21T11:00:00Z');
  const sun = sunPosition(instant, madrid.latitude, madrid.longitude);
  const angle = sun.azimuth * Math.PI / 180;
  const x = Math.sin(angle) * 30, y = -Math.cos(angle) * 30;
  const square = (cx, cy) => [[cx - 5, cy - 5], [cx + 5, cy - 5], [cx + 5, cy + 5], [cx - 5, cy + 5]];
  const scene = { point: madrid, radius: 400, buildings: [{ footprint: square(x, y), height: 110 }] };
  assert.equal(lightAt(scene, instant), 'shade');
  scene.buildings[0].height = null;
  assert.equal(lightAt(scene, instant), 'unknown');
  scene.buildings[0] = { footprint: square(-x, -y), height: 110 };
  assert.equal(lightAt(scene, instant), 'sun');
  scene.buildings[0] = { footprint: square(0, 0), height: 110 };
  assert.equal(lightAt(scene, instant), 'unknown');
  assert.equal(lightAt(scene, new Date('2026-06-21T00:00:00Z')), 'night');
});

test('solar intervals cover the day in labelled samples and empty coverage remains unknown', () => {
  const scene = prepareScene(madrid, [{ footprint: [
    { latitude: 40.4278, longitude: -3.6873 }, { latitude: 40.4278, longitude: -3.6872 },
    { latitude: 40.4279, longitude: -3.6872 }, { latitude: 40.4278, longitude: -3.6873 },
  ], height: 15 }], 250);
  const windows = solarWindows(scene, new Date(2026, 5, 21, 12));
  assert.equal(windows[0].from, 0);
  assert.equal(windows.at(-1).to, 1440);
  assert.ok(windows.every((w, i) => !i || windows[i - 1].to === w.from));
  assert.equal(lightAt(null, atMinutes(new Date(), 720)), 'unknown');
  assert.equal(prepareScene(madrid, []), null);
});

test('phone local time does not silently shift the skipped DST hour', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Madrid';
    const day = new Date(2026, 2, 29, 12);
    assert.deepEqual([atMinutes(day, 90)?.toISOString(), atMinutes(day, 150), atMinutes(day, 210)?.toISOString()],
      ['2026-03-29T00:30:00.000Z', null, '2026-03-29T01:30:00.000Z']);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
