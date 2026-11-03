import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingShadows, shadowDirection } from '../frontend/map-shadows.mjs';
import { getMadridBuildings, insideAyala } from '../frontend/madrid-buildings.mjs';

const square = [[-3.688, 40.427], [-3.6879, 40.427], [-3.6879, 40.4271], [-3.688, 40.4271], [-3.688, 40.427]];
const hole = [[-3.68798, 40.42702], [-3.68798, 40.42708], [-3.68792, 40.42708], [-3.68792, 40.42702], [-3.68798, 40.42702]];
const raw = { type: 'Feature', properties: { ALTURA: 10 }, geometry: { type: 'Polygon', coordinates: [square, hole] } };
const response = (data) => async () => ({ ok: true, json: async () => data });

test('Madrid building input is bounded, validated and never invents missing heights', async () => {
  let requested;
  const buildings = await getMadridBuildings(async (url, options) => {
    requested = [url, options];
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [raw, { ...raw, properties: { ALTURA: null } }] }) };
  });
  assert.equal(buildings.features.length, 1);
  assert.equal(buildings.omitted, 1);
  assert.equal(requested[0].searchParams.get('geometry'), '-3.692,40.425,-3.685,40.429');
  assert.equal(requested[1].credentials, 'omit');
  assert.ok(insideAyala({ lng: -3.688, lat: 40.427 }));
  assert.ok(!insideAyala({ lng: -3.7, lat: 40.427 }));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [raw], exceededTransferLimit: true })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [] })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: Array(2000).fill(raw) })));
  await assert.rejects(getMadridBuildings(response({ type: 'FeatureCollection', features: [{ ...raw, geometry: { type: 'Polygon', coordinates: [square.slice(0, -1)] } }] })));
});

test('a 10 m building at 45° casts a 10 m shadow opposite the sun, including courtyard edges', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  const north = buildingShadows(buildings, { altitude: 45, azimuth: 180 });
  const shapes = north.features[0].geometry.coordinates;
  const roof = shapes[0];
  assert.equal(roof.length, 2, 'roof retains its courtyard');
  assert.equal(shapes.length, 9, 'sweeps both outer and courtyard edges');
  assert.ok(Math.abs((roof[0][0][1] - square[0][1]) * 111319.49079327358 - 10) < .001);
  assert.ok(Math.abs(roof[0][0][0] - square[0][0]) < 1e-10);
  const west = buildingShadows(buildings, { altitude: 45, azimuth: 90 }).features[0].geometry.coordinates[0][0][0];
  assert.ok(west[0] < square[0][0]);
  assert.deepEqual(shadowDirection({ altitude: 45, azimuth: 180 }), { bearing: 0, label: 'norte' });
  assert.deepEqual(shadowDirection({ altitude: 45, azimuth: 90 }), { bearing: 270, label: 'oeste' });
});

test('no shadow is drawn or direction claimed near or below the horizon', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  for (const altitude of [-15, 0, 4.9]) {
    assert.equal(buildingShadows(buildings, { altitude, azimuth: 180 }).features.length, 0);
    assert.equal(shadowDirection({ altitude, azimuth: 180 }), null);
  }
});

test('viewport filtering keeps a shadow cast into view by an off-screen building', async () => {
  const buildings = await getMadridBuildings(response({ type: 'FeatureCollection', features: [raw] }));
  const sun = { altitude: 45, azimuth: 90 };
  const reachesView = [-3.68815, 40.427, -3.68803, 40.4271];
  const farAway = [-3.689, 40.427, -3.6889, 40.4271];
  assert.deepEqual(buildingShadows(buildings, sun, reachesView), buildingShadows(buildings, sun));
  assert.equal(buildingShadows(buildings, sun, farAway).features.length, 0);
});
