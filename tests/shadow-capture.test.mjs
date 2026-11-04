import test from 'node:test';
import assert from 'node:assert/strict';
import { captureShadow } from '../mobile/src/shadow-capture.mjs';

function fakeClock() {
  let id = 0;
  const timers = new Map();
  return { schedule(fn) { timers.set(++id, fn); return id; }, unschedule(key) { timers.delete(key); },
    tick() { const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); }, timers };
}

test('a timed-out capture retries once and ignores the late earlier callback', async () => {
  const clock = fakeClock(), callbacks = [], ready = [], errors = [];
  captureShadow({ capture: (callback) => callbacks.push(callback), write: async (data) => data,
    discard: () => assert.fail('no orphan expected'), onReady: (uri) => ready.push(uri), onError: (error) => errors.push(error), ...clock });
  clock.tick();
  assert.equal(callbacks.length, 2);
  callbacks[0]('old'); callbacks[1]('new');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, ['new']); assert.deepEqual(errors, []);
  assert.equal(clock.timers.size, 0);
});

test('a cancelled viewport cannot report failure or success and releases a file written late', async () => {
  const clock = fakeClock(), callbacks = [], ready = [], errors = [], removed = [];
  let finishWrite;
  const cancel = captureShadow({ capture: (callback) => callbacks.push(callback), write: () => new Promise((resolve) => { finishWrite = resolve; }),
    discard: (uri) => removed.push(uri), onReady: (uri) => ready.push(uri), onError: (error) => errors.push(error), ...clock });
  callbacks[0]('data');
  await Promise.resolve();
  cancel(); finishWrite('file://old.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, []); assert.deepEqual(errors, []); assert.deepEqual(removed, ['file://old.png']);
});

test('a missing callback after both attempts is reported as timeout', () => {
  const clock = fakeClock(), errors = [];
  captureShadow({ capture: () => {}, write: () => {}, discard: () => {}, onReady: () => {}, onError: (error) => errors.push(error), ...clock });
  clock.tick(); clock.tick();
  assert.deepEqual(errors, ['timeout']);
  assert.equal(clock.timers.size, 0);
});

test('a stalled file write times out and a later file is discarded', async () => {
  const clock = fakeClock(), callbacks = [], errors = [], removed = [];
  let finishWrite;
  captureShadow({ capture: (callback) => callbacks.push(callback), write: () => new Promise((resolve) => { finishWrite = resolve; }),
    discard: (uri) => removed.push(uri), onReady: () => assert.fail('late file must not be shown'), onError: (error) => errors.push(error), ...clock });
  callbacks[0]('data'); await Promise.resolve();
  clock.tick(); finishWrite('file://late.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, ['storage_timeout']); assert.deepEqual(removed, ['file://late.png']);
});
