import test from 'node:test';
import assert from 'node:assert/strict';
import { firstWithResults } from '../mobile/src/first-results.mjs';

test('empty saved results retain their incomplete and old-data flags', async () => {
  const result = await firstWithResults([Promise.resolve({ places: [], source: 'osm', partial: true, stale: true })]);
  assert.equal(result.partial, true);
  assert.equal(result.stale, true);
});

test('nearby search reports a provider failure even after another source returns', async () => {
  let fail, warnings = 0;
  const slow = new Promise((_, reject) => { fail = reject; });
  const found = await firstWithResults([Promise.resolve({ places: [{ id: 1 }], source: 'municipal' }), slow], () => warnings++);
  assert.equal(found.source, 'municipal');
  assert.equal(warnings, 0);
  fail(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(warnings, 1);
});

test('nearby search distinguishes every source failing from an empty source', async () => {
  let warnings = 0;
  const failed = () => { warnings++; };
  const result = await firstWithResults([Promise.reject(new Error('offline')), Promise.resolve({ places: [] })], failed);
  assert.deepEqual(result, { places: [], source: 'empty' });
  assert.equal(warnings, 1);
  await assert.rejects(firstWithResults([Promise.reject(new Error('offline'))], failed), /offline/);
});
