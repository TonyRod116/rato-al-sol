import test from 'node:test';
import assert from 'node:assert/strict';
import { getMadridTerraces } from '../frontend/madrid.mjs';

const terrace = {
  id_terraza: '32', rotulo: 'LOCAL DE PRUEBA', desc_barrio_local: 'RECOLETOS',
  clase_vial_edificio: 'CALLE', desc_vial_edificio: 'AYALA', num_edificio: '000019',
  cal_edificio: null, desc_situacion_local: 'Abierto', desc_situacion_terraza: 'Abierta',
};
const response = (records) => ({ ok: true, json: async () => ({ success: true, result: { records } }) });

test('consulta solo la zona seleccionada y presenta una dirección del local, sin inventar mesas', async () => {
  let request;
  const result = await getMadridTerraces(async (url, options) => {
    request = { url: new URL(url), options };
    return response([terrace]);
  });
  assert.deepEqual(result, [{ id: '32', name: 'LOCAL DE PRUEBA', address: 'Calle de Ayala, 19' }]);
  assert.equal(request.url.origin, 'https://datos.madrid.es');
  assert.equal(request.url.searchParams.get('resource_id'), '200085-6-censo-locales');
  assert.equal(JSON.parse(request.url.searchParams.get('filters')).desc_vial_edificio, 'AYALA');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
});

test('descarta filas inválidas o fuera de la consulta y no oculta un contrato roto como lista vacía', async () => {
  const valid = { ...terrace, rotulo: '<img src=x onerror=alert(1)>' };
  const result = await getMadridTerraces(async () => response([
    valid, { ...terrace, id_terraza: '33', desc_vial_edificio: 'GOYA' },
    { ...terrace, id_terraza: '34', num_edificio: 'no-numero' },
  ]));
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '<img src=x onerror=alert(1)>'); // se mostrará como texto, nunca HTML
  await assert.rejects(() => getMadridTerraces(async () => response([{ unexpected: 'schema' }])));
  await assert.rejects(() => getMadridTerraces(async () => ({ ok: true, json: async () => ({ success: false }) })));
  await assert.rejects(() => getMadridTerraces(async () => ({ ok: false, status: 503 })));
  assert.deepEqual(await getMadridTerraces(async () => response([])), []);
});
