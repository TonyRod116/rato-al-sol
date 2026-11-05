import test from 'node:test';
import assert from 'node:assert/strict';
import { stableMapBounds, stableMapCenter } from '../mobile/src/viewport.mjs';

test('native map coordinate noise preserves the center and bounds references', () => {
  const center = { latitude: 40.4168, longitude: -3.7038 };
  const bounds = [-3.705, 40.415, -3.702, 40.418];
  assert.equal(stableMapCenter(center, { latitude: center.latitude + 5e-8, longitude: center.longitude - 5e-8 }), center);
  assert.equal(stableMapBounds(bounds, bounds.map((value, i) => value + (i % 2 ? 5e-8 : -5e-8))), bounds);
});

test('real movement, zoom and lost bounds remain observable', () => {
  const center = { latitude: 40.4168, longitude: -3.7038 };
  const moved = { latitude: center.latitude + .00001, longitude: center.longitude };
  const bounds = [-3.705, 40.415, -3.702, 40.418];
  const zoomed = [-3.7051, 40.4149, -3.7019, 40.4181];
  assert.deepEqual(stableMapCenter(center, moved), moved);
  assert.notEqual(stableMapCenter(center, moved), center);
  assert.equal(stableMapCenter(center, { latitude: NaN, longitude: -3.7 }), center);
  assert.equal(stableMapBounds(bounds, zoomed), zoomed);
  assert.equal(stableMapBounds(bounds, null), null);
});
