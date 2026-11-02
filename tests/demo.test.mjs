import test from 'node:test';
import assert from 'node:assert/strict';
import { places, outcomeFor, visiblePlaces, parseSharedState, shareUrl } from '../frontend/demo-data.mjs';

test('el ejemplo cambia con la hora y usa intervalos sin solapes', () => {
  const parra = places.find((place) => place.id === 'la-parra');
  assert.equal(outcomeFor(parra, 899), 'sun');
  assert.equal(outcomeFor(parra, 900), 'shade');
  assert.equal(outcomeFor(parra, 1200), 'shade');
});

test('datos ausentes u horas inválidas nunca se convierten en sol', () => {
  assert.equal(outcomeFor(places.find((place) => place.id === 'el-olivo'), 720), 'unknown');
  assert.equal(outcomeFor(places[0], Number.NaN), 'unknown');
  assert.equal(outcomeFor(places[0], -1), 'unknown');
  assert.equal(outcomeFor({}, 720), 'unknown');
});

test('el filtro usa el mismo estado que la selección y excluye lo desconocido', () => {
  const sunny = visiblePlaces('sun', 720);
  assert.ok(sunny.length > 0);
  assert.ok(sunny.every((place) => outcomeFor(place, 720) === 'sun'));
  assert.ok(!sunny.some((place) => place.id === 'el-olivo'));
  assert.equal(visiblePlaces('all', 720).length, places.length);
  assert.equal(visiblePlaces('sun', 1200).length, 0);
});

test('el enlace compartido solo acepta valores válidos del ejemplo', () => {
  const defaults = { date: '2026-11-02', minutes: 750, filter: 'all', selected: 'la-parra' };
  assert.deepEqual(parseSharedState('?fecha=2026-02-30&hora=99999&filtro=x&terraza=abc', defaults), defaults);
  assert.deepEqual(parseSharedState('?fecha=0000-01-01&hora=9e2', defaults), defaults);
  const url = shareUrl('https://usuario:clave@example.test/app/?ubicacion=personal#secreto', {
    date: '2026-11-03', minutes: 900, filter: 'shade', selected: 'la-plaza',
  });
  assert.equal(url, 'https://example.test/app/?fecha=2026-11-03&hora=900&filtro=shade&terraza=la-plaza');
  assert.deepEqual(parseSharedState(new URL(url).search, defaults), {
    date: '2026-11-03', minutes: 900, filter: 'shade', selected: 'la-plaza',
  });
});
