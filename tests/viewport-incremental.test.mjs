import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportLoader } from '../mobile/src/viewport.mjs';
import { getMadridBuildings } from '../frontend/madrid-buildings.mjs';

const a = [-3.706, 40.414, -3.702, 40.418];
const b = [-3.705, 40.414, -3.701, 40.418];
const feature = (id) => ({ properties: { id }, geometry: { type: 'Polygon', coordinates: [] } });

test('Madrid movement fetches only missing complete strips and deduplicates buildings', async () => {
  const requests = [];
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'madrid', bounds, features: requests.length === 1 ? [feature(1), feature(2)] : [feature(2), feature(3)], omitted: 0 };
  });
  await loader.get(a);
  const result = await loader.get(b);
  assert.deepEqual(requests[0].bounds, a);
  assert.deepEqual(requests[1].bounds, [-3.7022, 40.4138, -3.7008, 40.4182]);
  assert.equal(requests[1].options.allowEmpty, true);
  assert.deepEqual(result.bounds, b);
  assert.deepEqual(result.features.map((item) => item.properties.id), [1, 2, 3]);
  assert.strictEqual(loader.find(b), result);
});

test('a failed missing strip never appears as complete and can be retried', async () => {
  let fail = true;
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    if (options?.allowEmpty && fail) throw new Error('offline');
    return { source: 'madrid', bounds, features: [feature(1)], omitted: 0 };
  });
  await loader.get(a);
  await assert.rejects(loader.get(b), /offline/);
  assert.equal(loader.find(b), null);
  fail = false;
  assert.deepEqual((await loader.get(b)).bounds, b);
});

test('a successful response that does not cover its strip is rejected', async () => {
  const loader = createViewportLoader(async (bounds, _fetch, options) => ({
    source: 'madrid', bounds: options?.allowEmpty ? [-3.702, 40.414, -3.701, 40.418] : bounds,
    features: [feature(1)], omitted: 0,
  }));
  await loader.get(a);
  await assert.rejects(loader.get(b), /incompleta/);
  assert.equal(loader.find(b), null);
});

test('combined areas enforce the Madrid vertex budget after deduplication', async () => {
  const requests = [];
  const large = (id, count) => ({ properties: { id }, geometry: { type: 'Polygon', coordinates: [Array(count).fill([0, 0])] } });
  const loader = createViewportLoader(async (bounds, _fetch, options) => {
    requests.push({ bounds, options });
    return { source: 'madrid', bounds, features: requests.length === 1 ? [large(1, 100001)]
      : options?.allowEmpty ? [large(2, 100000)] : [], omitted: 0 };
  });
  await loader.get(a);
  assert.deepEqual((await loader.get(b)).features, []);
  assert.equal(requests.length, 3, 'an oversized union falls back to the normal full query');
  assert.deepEqual(requests[2].bounds, b);
});

test('merged coverage expires with its oldest source rather than extending stale data', async () => {
  let time = 0, requests = 0;
  const loader = createViewportLoader(async (bounds) => {
    requests++;
    return { source: 'madrid', bounds, features: [], omitted: 0 };
  }, () => time);
  await loader.get(a);
  time = 119000;
  await loader.get(b);
  assert.ok(loader.find(b));
  time = 120001;
  assert.equal(loader.find(b), null);
  await loader.get(b);
  assert.equal(requests, 3);
});

test('Madrid accepts a successful empty incremental strip, but not an empty full view', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  await assert.rejects(getMadridBuildings(fetch, a));
  assert.deepEqual((await getMadridBuildings(fetch, a, { allowEmpty: true })).features, []);
});

test('incremental strips with only unknown heights preserve the missing-height warning', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { OBJECTID: 1, ALTURA: null }, geometry: null },
  ] }) });
  await assert.rejects(getMadridBuildings(fetch, a));
  const result = await getMadridBuildings(fetch, a, { allowEmpty: true });
  assert.deepEqual(result.features, []);
  assert.equal(result.omitted, 1);
});

test('Madrid retries one transient server error but does not retry rate limiting or bad data', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }; };
  assert.deepEqual((await getMadridBuildings(fetch, a, { allowEmpty: true })).features, []);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(getMadridBuildings(async () => { calls++; return { ok: false, status: 429 }; }, a));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(getMadridBuildings(async () => { calls++; return { ok: true, json: async () => ({ bad: true }) }; }, a));
  assert.equal(calls, 1);
});

test('Madrid retries a transport failure once and never loops', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw new TypeError('network failure'); };
  await assert.rejects(getMadridBuildings(fetch, a));
  assert.equal(calls, 2);
});
