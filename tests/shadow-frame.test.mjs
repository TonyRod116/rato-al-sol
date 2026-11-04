import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackFrameReady, shadowFrameMatches } from '../mobile/src/shadow-frame.mjs';

test('a prefetched shadow is used only for its exact scene and instant', () => {
  const buildings = {}, area = [1, 2, 3, 4];
  const frame = { buildings, area, retryToken: 0, timeKey: 42, latitude: 40, longitude: -3 };
  assert.equal(shadowFrameMatches(frame, { ...frame }), true);
  for (const mismatch of [
    { buildings: {} }, { area: [...area] }, { retryToken: 1 }, { timeKey: 43 },
    { timeKey: null }, { latitude: 40.001 }, { longitude: -3.001 }, { generation: 1 },
  ]) assert.equal(shadowFrameMatches(frame, { ...frame, ...mismatch }), false);
});

test('play advances only after both the dwell and next frame have finished', () => {
  const frame = { buildings: {}, area: [0, 0, 1, 1], retryToken: 0, generation: 0, timeKey: 42, latitude: 40, longitude: -3 };
  const future = { ...frame, timeKey: 43 };
  assert.equal(playbackFrameReady(frame, null, future, 43, true), false);
  assert.equal(playbackFrameReady(frame, frame, null, 43, true), false);
  assert.equal(playbackFrameReady(frame, frame, future, 43, true), true);
  assert.equal(playbackFrameReady({ ...frame, timeKey: 44 }, frame, future, 43, true), false);
  assert.equal(playbackFrameReady(frame, frame, null, 43, false), true);
});
