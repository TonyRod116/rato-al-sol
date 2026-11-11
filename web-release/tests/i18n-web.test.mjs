import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalan } from '../frontend/shared/catalog-ca.mjs';
import { isLanguage, translate, translateDirection } from '../frontend/shared/i18n.mjs';
import { searchCategory } from '../frontend/shared/places.mjs';

test('Catalan is available without changing Spanish or English translations', () => {
  assert.ok(isLanguage('ca'));
  assert.equal(isLanguage('fr'), false);
  assert.equal(translate('es', 'Sol estimado', 'Estimated sun'), 'Sol estimado');
  assert.equal(translate('en', 'Sol estimado', 'Estimated sun'), 'Estimated sun');
  assert.equal(translate('ca', 'Sol estimado', 'Estimated sun'), 'Sol estimat');
  assert.equal(translate('ca', 'Hola Ana', 'Hello Ana', 'Hola Anna'), 'Hola Anna');
  assert.equal(translateDirection('ca', 'Noreste'), 'Nord-est');
  assert.equal(translateDirection('en', 'Noreste'), 'Northeast');
});

test('all fixed interface labels have a Catalan translation', async () => {
  const html = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
  const missing = [...html.matchAll(/data-en(?:-(?:aria-label|placeholder|content))?="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((english) => !(english in catalan) && english !== 'Sun Time' && english !== 'Sun Time, home');
  assert.deepEqual(missing, []);
  assert.match(html, /<option value="ca">CA<\/option>/);
});

test('Catalan search categories retain Spanish and English categories', () => {
  assert.equal(searchCategory('terrasses')?.kind, 'business');
  assert.equal(searchCategory('parcs')?.kind, 'public');
  assert.equal(searchCategory('plaça')?.kind, 'public');
  assert.equal(searchCategory('restaurants')?.kind, 'business');
  assert.equal(searchCategory('parque')?.kind, 'public');
  assert.equal(searchCategory('places'), null); // Generic English word is not treated as squares.
});

test('language changes update title, accessible labels and dynamic messages', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const brand = { dataset: { en: 'Sun Time', ca: 'Rato al Sol' }, textContent: 'Rato al Sol' };
  const status = { dataset: {}, textContent: '' };
  const attrs = new Map([['placeholder', 'Nombre'], ['data-en-placeholder', 'Name or type of place']]);
  const input = { getAttribute: (key) => attrs.get(key) ?? null, hasAttribute: (key) => attrs.has(key), setAttribute: (key, value) => attrs.set(key, value) };
  const selector = { value: '' };
  globalThis.document = {
    documentElement: { lang: 'es' }, title: '',
    querySelectorAll: (query) => query === '[data-en]' ? [brand, ...(status.dataset.en ? [status] : [])] : query === '[data-en-placeholder]' ? [input] : [],
    getElementById: (id) => id === 'language' ? selector : null,
  };
  try {
    const { setLanguage, message, savedLanguage } = await import('../frontend/i18n.mjs');
    setLanguage('en', true);
    assert.equal(document.title, 'Sun Time — Explore the light in Madrid and Barcelona');
    assert.equal(brand.textContent, 'Sun Time');
    message(status, '2 lugares', '2 places', '2 llocs');
    setLanguage('ca', true);
    assert.equal(document.documentElement.lang, 'ca');
    assert.equal(document.title, 'Rato al Sol — Explora la llum a Madrid i Barcelona');
    assert.equal(brand.textContent, 'Rato al Sol');
    assert.equal(attrs.get('placeholder'), 'Nom o tipus de lloc');
    assert.equal(status.textContent, '2 llocs');
    assert.equal(savedLanguage(), 'ca');
    setLanguage('es');
    assert.equal(status.textContent, '2 lugares');
    assert.equal(attrs.get('placeholder'), 'Nombre');
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});
