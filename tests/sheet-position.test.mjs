import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeSheet, tapSheet } from '../mobile/src/sheet-position.mjs';

test('dragging down reveals the map and dragging up restores the panel', () => {
  assert.equal(swipeSheet('expanded', 40), 'normal');
  assert.equal(swipeSheet('normal', 40), 'minimized');
  assert.equal(swipeSheet('minimized', -40), 'normal');
  assert.equal(swipeSheet('normal', -40), 'expanded');
  assert.equal(swipeSheet('normal', 12), 'normal');
});

test('tapping the handle reveals the map and can always restore the panel', () => {
  assert.equal(tapSheet('normal'), 'minimized');
  assert.equal(tapSheet('minimized'), 'normal');
  assert.equal(tapSheet('expanded'), 'normal');
});
