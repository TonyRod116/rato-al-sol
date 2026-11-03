import test from 'node:test';
import assert from 'node:assert/strict';
import { unionShadows } from '../mobile/src/shadow-union.mjs';
import { buildingShadows } from '../frontend/map-shadows.mjs';

const polygon = (coordinates) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates } });
const rectangle = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
const area = (ring) => Math.abs(ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2);

test('overlapping pieces and separate buildings form one coverage with no double painted area', () => {
  const result = unionShadows({ features: [polygon([rectangle(0, 0, 3, 2)]), polygon([rectangle(2, 0, 5, 2)])] });
  const shapes = result.features[0].geometry.coordinates;
  assert.equal(shapes.length, 1);
  assert.equal(area(shapes[0][0]), 10);
});

test('a courtyard remains a hole unless covered by another shadow', () => {
  const building = polygon([rectangle(0, 0, 6, 6), rectangle(2, 2, 4, 4)]);
  let shapes = unionShadows({ features: [building] }).features[0].geometry.coordinates;
  assert.equal(shapes[0].length, 2);
  assert.equal(area(shapes[0][1]), 4);
  shapes = unionShadows({ features: [building, polygon([rectangle(2, 2, 3, 4)])] }).features[0].geometry.coordinates;
  assert.equal(shapes[0].length, 2);
  assert.equal(area(shapes[0][1]), 2);
});

test('invalid input is rejected without drawing partially dissolved shadows', () => {
  assert.equal(unionShadows({ features: [polygon([rectangle(0, 0, 1, 1)]), polygon([[null]])] }), null);
  assert.deepEqual(unionShadows({ features: [] }), { type: 'FeatureCollection', features: [] });
});

test('building shadows dissolve when sun-aligned walls produce degenerate sweep pieces', () => {
  const building = { ...polygon([rectangle(-3.7, 40.4, -3.6999, 40.4001)]), properties: { height: 10 } };
  for (const azimuth of [0, 90, 180, 270]) {
    const shadows = buildingShadows({ features: [building] }, { altitude: 45, azimuth });
    const result = unionShadows(shadows);
    assert.ok(result, `azimuth ${azimuth} should remain drawable`);
    assert.ok(result.features.length);
    assert.ok(area(result.features[0].geometry.coordinates[0][0]) > 0);
  }
});
