import test from 'node:test';
import assert from 'node:assert/strict';
import { places, demoSun, outcomeFor, visiblePlaces, parseSharedState, shareUrl } from '../frontend/demo-data.mjs';

test('el escenario usa la fecha y hora con geometría inventada', () => {
  const winter = demoSun('2026-12-21', 900);
  const summer = demoSun('2026-06-21', 900);
  assert.notDeepEqual(winter, summer);
  assert.ok(places.some((place) => outcomeFor(place, winter) !== outcomeFor(place, summer)));
  assert.equal(outcomeFor(places.find((place) => place.id === 'el-olivo'), summer), 'unknown');
  assert.equal(outcomeFor(places[0], demoSun('2026-12-21', 1200)), 'night');
});

test('el filtro usa el mismo estado que la selección y excluye lo desconocido', () => {
  const sun = demoSun('2026-06-21', 750);
  const sunny = visiblePlaces('sun', sun);
  assert.ok(sunny.length > 0);
  assert.ok(sunny.every((place) => outcomeFor(place, sun) === 'sun'));
  assert.ok(!sunny.some((place) => place.id === 'el-olivo'));
  assert.equal(visiblePlaces('all', sun).length, places.length);
  assert.equal(visiblePlaces('sun', demoSun('2026-12-21', 1200)).length, 0);
});

test('el enlace compartido solo acepta valores válidos del ejemplo', () => {
  const defaults = { date: '2026-11-02', minutes: 750, filter: 'all', selected: 'la-parra' };
  assert.deepEqual(parseSharedState('?fecha=2026-02-30&hora=99999&filtro=x&terraza=abc', defaults), defaults);
  assert.deepEqual(parseSharedState('?fecha=0000-01-01&hora=9e2', defaults), defaults);
  assert.deepEqual(parseSharedState('?fecha=2100-01-01', defaults), defaults);
  const url = shareUrl('https://usuario:clave@example.test/app/?ubicacion=personal#secreto', {
    date: '2026-11-03', minutes: 900, filter: 'shade', selected: 'la-plaza',
  });
  assert.equal(url, 'https://example.test/app/?fecha=2026-11-03&hora=900&filtro=shade&terraza=la-plaza');
  assert.deepEqual(parseSharedState(new URL(url).search, defaults), {
    date: '2026-11-03', minutes: 900, filter: 'shade', selected: 'la-plaza',
  });
});
