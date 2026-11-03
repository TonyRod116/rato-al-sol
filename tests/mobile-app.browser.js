// Run with playwright-cli against the Expo web preview; providers are synthetic.
async page => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  for (const pattern of ['**/sigma.madrid.es/**', '**/overpass-api.de/**', '**/datos.madrid.es/**']) {
    await page.route(pattern, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  }
  await page.reload();
  await page.getByRole('radio', { name: 'Español' }).click();
  const attribution = await page.getByRole('link', { name: 'OpenStreetMap' }).boundingBox();
  const handle = await page.getByRole('button', { name: 'Ampliar panel' }).boundingBox();
  if (!attribution || !handle || attribution.y + attribution.height > handle.y) throw new Error('La atribución del mapa queda tapada por la ficha.');
  await page.getByRole('button', { name: 'Buscar lugar, ciudad o dirección' }).click();
  await page.getByRole('textbox', { name: 'Nombre o tipo de lugar' }).fill('restaurante');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'No se han podido consultar los lugares' }).waitFor();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const ring = [[-3.70378, 40.41699], [-3.70362, 40.41699], [-3.70362, 40.41711], [-3.70378, 40.41711], [-3.70378, 40.41699]];
  await page.route('**/sigma.madrid.es/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ALTURA: 15 }, geometry: { type: 'Polygon', coordinates: [ring] } }] }),
  }));
  await page.route('**/overpass-api.de/**', route => {
    const geometry = decodeURIComponent(route.request().postData() || '').includes('out geom');
    const elements = geometry ? [{ type: 'way', id: 50, tags: { building: 'yes', height: '15' }, geometry: ring.map(([lon, lat]) => ({ lat, lon })) }] : [
      { type: 'node', id: 101, lat: 40.41695, lon: -3.70345, tags: { name: 'Parque de prueba', leisure: 'park' } },
      { type: 'node', id: 102, lat: 40.41705, lon: -3.70370, tags: { name: 'Terraza de prueba', amenity: 'restaurant', outdoor_seating: 'yes' } },
    ];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ elements }) });
  });
  await page.route('**/datos.madrid.es/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: route.request().url().includes('datastore_search') ? JSON.stringify({ success: true, result: { records: [], total: 0 } }) : JSON.stringify({ '@graph': [] }),
  }));
  await page.reload();
  await page.getByRole('tab', { name: 'Buscar sol' }).click();
  await page.getByRole('slider', { name: 'Distancia máxima' }).fill('2500');
  await page.getByRole('slider', { name: 'Hora inicial de búsqueda' }).fill('600');
  await page.getByRole('checkbox', { name: 'Buscar durante una franja' }).click();
  await page.getByRole('slider', { name: 'Hora final de búsqueda' }).fill('900');
  await page.getByRole('button', { name: 'Buscar lugares con sol' }).click();
  await page.getByText(/Analizados \d+ espacio/).waitFor();
  await page.getByRole('button', { name: /Parque de prueba/ }).first().click();
  const title = page.getByText('Parque de prueba', { exact: true }).first();
  await title.waitFor();
  await page.waitForTimeout(250);
  const rect = await title.boundingBox();
  if (!rect || rect.y < 0 || rect.y > 440) throw new Error('El lugar elegido no queda visible al volver al mapa.');
  const slider = page.getByRole('slider', { name: 'Hora para consultar el sol' });
  await slider.fill('780');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByText('Parque de prueba', { exact: true }).first().waitFor();
  if (await page.getByRole('slider', { name: 'Time to check sunlight' }).inputValue() !== '780') throw new Error('La hora cambió al cambiar de idioma.');
  if (failures.length) throw new Error(failures.join('; '));
  return { providerFailure: 'visible', selectedPlace: 'visible', languageAndTime: 'preserved' };
}
