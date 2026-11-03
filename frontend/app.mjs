import { civilTimeToUtc, sunPosition } from './solar.mjs';
import { getMadridTerraces } from './madrid.mjs';
import { AYALA_CENTER } from './madrid-buildings.mjs';
import { buildingShadows, shadowDirection } from './map-shadows.mjs';
import { getViewportBuildings, viewportBounds } from './viewport-buildings.mjs';
import { createOpenMap } from './open-map.mjs?v=20261103-8';
import { createCityMap } from './city-map.mjs?v=20261103-8';
import { createExplorer } from './explore-search.mjs?v=20261103-8';

const $ = (selector) => document.querySelector(selector);
const today = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const state = { date: `${today.year}-${today.month}-${today.day}`, minutes: Math.floor((Number(today.hour) * 60 + Number(today.minute)) / 10) * 10 };
const empty = { type: 'FeatureCollection', features: [] };
let buildings, activeMap, madridPlaces = [], selectedMadrid = '', madridConsulted = '';
let mapStarted = false, mapLoading = false, is3D = true, playback, pendingFrame;
let view = { bearing: 0, pitch: 0, center: AYALA_CENTER };
let currentDirection = null;
let buildingsLoading = false, buildingsError = '', buildingRequest = 0, buildingKey = '', buildingTimer;
let searchPins;
let searchTimeEdited = false;
const explorer = createExplorer({
  getCenter: () => ({ latitude: view.center.lat, longitude: view.center.lng }),
  getDate: () => state.date,
  getTime: () => state.minutes,
  onPlaces: (places, onSelect) => { searchPins = { places, onSelect }; activeMap?.showPlaces(places, onSelect); },
  onPoint: (point, focus) => {
    activeMap?.setSelectedPoint(point);
    if (focus) activeMap?.focus({ lat: point.latitude, lng: point.longitude });
  },
});

function formattedTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function updateNearbyControls() {
  const start = $('#nearby-start'), end = $('#nearby-end'), radius = $('#nearby-radius');
  const from = start.valueAsNumber;
  end.min = String(from + 10);
  if (end.valueAsNumber <= from) end.value = String(Math.min(1440, from + 60));
  $('#nearby-start-value').value = formattedTime(from);
  $('#nearby-end-value').value = formattedTime(end.valueAsNumber);
  $('#nearby-radius-value').value = radius.valueAsNumber < 1000 ? `${radius.valueAsNumber} m` : `${(radius.valueAsNumber / 1000).toFixed(1).replace('.', ',').replace(',0', '')} km`;
  $('#nearby-end-control').hidden = !$('#nearby-end-enabled').checked;
  for (const input of [start, end, radius]) {
    input.style.setProperty('--progress', `${(input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min) || 1) * 100}%`);
    input.setAttribute('aria-valuetext', input === radius ? $('#nearby-radius-value').value : formattedTime(input.valueAsNumber));
  }
}

function updateCompass() {
  const direction = currentDirection;
  $('#shadow-compass').hidden = !direction;
  if (!direction) return;
  const radians = (direction.bearing - view.bearing) * Math.PI / 180;
  const pitch = (view.pitch || 0) * Math.PI / 180;
  const screenAngle = Math.atan2(Math.sin(radians), Math.cos(radians) * Math.cos(pitch)) * 180 / Math.PI;
  $('#compass-arrow').style.transform = `rotate(${screenAngle}deg)`;
  $('#compass-label').textContent = direction.label;
  $('#direction-symbol').style.transform = `rotate(${direction.bearing}deg)`;
}

function updateShadowStatus() {
  const status = $('#shadow-status');
  $('#shadows-retry').hidden = !buildingsError;
  if (buildingsLoading) status.textContent = 'Cargando alturas de edificios…';
  else if (buildingsError) status.textContent = buildingsError;
  else if (!buildings) status.textContent = 'Las sombras aún no están disponibles.';
  else if (buildings.source === 'osm') status.textContent = 'Sombras orientativas · OpenStreetMap. Pueden faltar edificios y alturas.';
  else if (buildings.omitted) status.textContent = 'Sombras orientativas · alturas municipales. Faltan algunas alturas.';
  else status.textContent = 'Sombras orientativas · alturas municipales de la zona visible.';
}

function updateSolar() {
  const instant = civilTimeToUtc(state.date, state.minutes);
  const sun = sunPosition(instant, view.center.lat, view.center.lng);
  currentDirection = shadowDirection(sun);
  const clock = formattedTime(state.minutes);
  if (!searchTimeEdited) $('#nearby-start').value = String(state.minutes);
  updateNearbyControls();
  $('#date').value = state.date;
  $('#time').value = state.minutes;
  $('#time-value').value = clock;
  $('#time').setAttribute('aria-valuetext', `${clock}, hora de Madrid`);
  $('#time').style.setProperty('--progress', `${state.minutes / 1430 * 100}%`);
  $('#direction-text').textContent = !instant
    ? 'Esta hora no existe en Madrid por el cambio al horario de verano. Elige otra hora.'
    : currentDirection
    ? `A las ${clock}, las sombras apuntan hacia el ${currentDirection.label}.`
    : sun && sun.altitude < -1 ? `A las ${clock} es de noche; no hay sombra solar.`
      : `A las ${clock} el sol está muy bajo; no mostramos sombras fiables.`;
  $('#direction-symbol').textContent = currentDirection ? '↑' : sun && sun.altitude < -1 ? '☾' : '☼';
  if (!currentDirection) $('#direction-symbol').style.transform = '';
  updateCompass();
  explorer.updateTime();
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (activeMap) {
      activeMap.setSun?.(sun);
      activeMap.setShadows(buildings && currentDirection ? buildingShadows(buildings, sun, view.shadowBounds) : empty, view.shadowBounds);
    }
  });
}

function stopPlayback() {
  clearInterval(playback); playback = null;
  $('#play-day').setAttribute('aria-pressed', 'false');
  $('#play-day').textContent = '▶ Ver pasar el día';
}

function loadBuildings(force = false) {
  const bounds = viewportBounds(view.shadowBounds);
  if (!activeMap || !bounds) return;
  const key = bounds.join(',');
  if (!force && key === buildingKey) return;
  buildingKey = key;
  const request = ++buildingRequest;
  clearTimeout(buildingTimer);
  buildings = null; buildingsLoading = true; buildingsError = '';
  activeMap.setBuildings(empty);
  activeMap.setShadows(empty, bounds);
  updateShadowStatus();
  buildingTimer = setTimeout(async () => {
    try {
      const result = await getViewportBuildings(bounds);
      if (request !== buildingRequest) return;
      buildings = result;
      activeMap?.setBuildings(buildings);
      updateSolar();
    } catch (error) {
      if (request !== buildingRequest) return;
      buildings = null;
      buildingsError = error?.message?.startsWith('Acerca el mapa') ? error.message : 'No hemos podido cargar las alturas de esta zona. Prueba de nuevo.';
      activeMap?.setShadows(empty, bounds);
    } finally {
      if (request === buildingRequest) { buildingsLoading = false; updateShadowStatus(); }
    }
  }, 350);
}

function selectMadrid(id, focus = true) {
  selectedMadrid = id;
  for (const button of document.querySelectorAll('#madrid-list button')) {
    const selected = button.dataset.id === id;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const place = madridPlaces.find((entry) => entry.id === id);
  activeMap?.highlight(id);
  if (focus && place?.position) explorer.selectPoint({ latitude: place.position.lat, longitude: place.position.lng, name: place.name, kind: 'business' }, true);
}

function updateMadridMarkers() {
  if (explorer.hasSearch()) return;
  activeMap?.showPlaces(madridPlaces, selectMadrid);
  activeMap?.highlight(selectedMadrid);
}

async function loadMadrid() {
  const button = $('#madrid-load'), status = $('#madrid-status'), results = $('#madrid-list');
  button.disabled = true;
  status.textContent = 'Consultando el censo municipal…';
  try {
    madridPlaces = await getMadridTerraces();
    results.replaceChildren();
    if (!madridPlaces.length) {
      selectedMadrid = ''; madridConsulted = '';
      status.textContent = 'El censo no devuelve terrazas para esta selección. Prueba de nuevo más tarde.';
    } else {
      madridPlaces.forEach((terrace, index) => {
        const item = document.createElement('li'), entry = document.createElement('button');
        const number = document.createElement('span'), identity = document.createElement('span');
        const name = document.createElement('strong'), address = document.createElement('small');
        const arrow = document.createElement('span');
        entry.type = 'button'; entry.dataset.id = terrace.id;
        number.className = 'place-number'; number.textContent = String(index + 1);
        name.textContent = terrace.name;
        address.textContent = terrace.position ? terrace.address : `${terrace.address} · sin punto en el mapa`;
        arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
        identity.append(name, address); entry.append(number, identity, arrow); item.append(entry); results.append(item);
        entry.addEventListener('click', () => selectMadrid(terrace.id));
      });
      madridConsulted = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
      }).format(new Date());
      status.textContent = `${madridPlaces.length} ${madridPlaces.length === 1 ? 'registro' : 'registros'} · Consulta: ${madridConsulted}`;
      if (!madridPlaces.some((place) => place.id === selectedMadrid)) selectedMadrid = madridPlaces[0].id;
      selectMadrid(selectedMadrid, false);
    }
    updateMadridMarkers();
    button.textContent = 'Actualizar ↻';
  } catch {
    status.textContent = madridConsulted
      ? `No hemos podido actualizar. Se mantiene la consulta anterior: ${madridConsulted}.`
      : 'No podemos consultar el censo de Madrid. Comprueba tu conexión y vuelve a intentarlo.';
    button.textContent = 'Reintentar ↻';
  } finally { button.disabled = false; }
}

function onViewChange(next) {
  view = next;
  updateCompass();
  updateShadowStatus();
  if (next.settled && activeMap) { updateSolar(); loadBuildings(); }
}

function activateMap(map, isCity) {
  activeMap = map;
  $('#city-map').hidden = !isCity;
  $('#open-map').hidden = isCity;
  $('#city-controls').hidden = !isCity;
  $('#map-options').hidden = !isCity;
  $('#map-basemaps').hidden = false;
  $('#map-dimension').hidden = !isCity || !is3D;
  $('#map-message').hidden = true;
  $('#select-map-center').disabled = false;
  $('#use-location').disabled = false;
  if (searchPins) activeMap.showPlaces(searchPins.places, searchPins.onSelect);
  else updateMadridMarkers();
  activeMap.setSelectedPoint(explorer.getSelected());
  if (buildings) activeMap.setBuildings(buildings);
  updateSolar();
  activeMap.invalidate();
  loadBuildings();
}

function updateBasemapButtons(aerial) {
  $('#basemap-street').setAttribute('aria-pressed', String(!aerial));
  $('#basemap-aerial').setAttribute('aria-pressed', String(aerial));
  $('.real-map-shell').classList.toggle('has-aerial', aerial);
}

function basemapError() {
  updateBasemapButtons(false);
  $('#basemap-status').hidden = false;
  $('#basemap-status').textContent = 'No hemos podido cargar la foto aérea. Mostramos el plano; puedes volver a intentarlo.';
}

async function loadOpenMap() {
  $('#city-map').hidden = true; $('#open-map').hidden = false;
  try {
    let tilesAvailable = false;
    const map = await createOpenMap($('#open-map'), (available) => {
      tilesAvailable = available;
      $('#map-message').hidden = available;
      $('#map-retry').hidden = available;
      if (!available) $('#map-message-text').textContent = 'No hemos podido cargar el mapa. Puedes consultar la lista o volver a intentarlo.';
    }, onViewChange, basemapError, (point) => explorer.selectPoint(point));
    activateMap(map, false);
    $('#map-message').hidden = tilesAvailable;
    $('#map-provider-status').hidden = false;
    $('#map-provider-status').textContent = 'La vista 3D no está disponible en este navegador; mostramos el mapa en 2D.';
  } catch {
    $('#map-message').hidden = false;
    $('#map-message-text').textContent = 'No hemos podido cargar el mapa. Puedes consultar la lista o volver a intentarlo.';
    $('#map-retry').hidden = false;
  }
}

async function loadMap() {
  if (mapStarted || mapLoading) return;
  mapStarted = true; mapLoading = true;
  try { activateMap(await createCityMap($('#city-map'), onViewChange, basemapError, (point) => explorer.selectPoint(point)), true); }
  catch { await loadOpenMap(); }
  finally { mapLoading = false; }
}

$('#time').addEventListener('input', (event) => { stopPlayback(); state.minutes = Number(event.target.value); updateSolar(); });
$('#nearby-start').addEventListener('input', () => { searchTimeEdited = true; updateNearbyControls(); });
for (const id of ['nearby-end', 'nearby-radius']) $(`#${id}`).addEventListener('input', updateNearbyControls);
$('#nearby-end-enabled').addEventListener('change', updateNearbyControls);
$('#nearby-form').addEventListener('submit', () => { searchTimeEdited = true; });
$('#select-map-center').addEventListener('click', () => explorer.selectPoint({ latitude: view.center.lat, longitude: view.center.lng }));
$('#use-location').addEventListener('click', () => {
  const button = $('#use-location'), status = $('#nearby-status');
  if (!navigator.geolocation) { status.textContent = 'Tu navegador no ofrece ubicación. Puedes mover el mapa hasta la zona que quieras.'; return; }
  button.disabled = true;
  status.textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const { latitude, longitude } = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
      status.textContent = 'No hemos podido localizarte. Puedes mover el mapa.'; button.disabled = false; return;
    }
    view = { ...view, center: { lat: latitude, lng: longitude } };
    activeMap?.focus({ lat: latitude, lng: longitude });
    status.textContent = 'Mapa centrado en tu ubicación. Elige la hora y busca cerca.';
    button.disabled = false;
  }, () => {
    status.textContent = 'No hemos podido usar tu ubicación. Puedes mover el mapa hasta la zona que quieras.';
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
});
$('#date').addEventListener('change', (event) => {
  stopPlayback();
  if (!event.target.validity.valid || !civilTimeToUtc(event.target.value, 720)) { event.target.value = state.date; return; }
  state.date = event.target.value; updateSolar(); explorer.updateDate();
});
$('#play-day').addEventListener('click', () => {
  if (playback) return stopPlayback();
  if (state.minutes >= 1430) state.minutes = 0;
  updateSolar();
  $('#play-day').setAttribute('aria-pressed', 'true');
  $('#play-day').textContent = '❚❚ Pausar';
  playback = setInterval(() => {
    state.minutes = Math.min(1430, state.minutes + 10); updateSolar();
    if (state.minutes >= 1430) stopPlayback();
  }, 450);
});
$('#madrid-load').addEventListener('click', loadMadrid);
$('#shadows-retry').addEventListener('click', () => loadBuildings(true));
$('#map-retry').addEventListener('click', () => window.location.reload());
$('#map-rotate').addEventListener('click', () => activeMap?.rotate?.());
function setView3D(enabled) {
  is3D = enabled;
  $('#map-pitch').setAttribute('aria-pressed', String(is3D));
  $('#map-pitch').textContent = is3D ? 'Vista 3D' : 'Vista 2D';
  $('#map-detail').setAttribute('aria-pressed', String(!is3D));
  $('#map-detail').textContent = is3D ? 'Pasar a vista 2D ↗' : 'Volver a edificios en 3D ↗';
  $('#map-dimension').hidden = !is3D;
  activeMap?.set3D?.(is3D);
}
$('#map-detail').addEventListener('click', () => setView3D(!is3D));
$('#map-pitch').addEventListener('click', () => setView3D(!is3D));
for (const [id, kind] of [['basemap-street', 'street'], ['basemap-aerial', 'aerial']]) {
  $(`#${id}`).addEventListener('click', () => {
    updateBasemapButtons(kind === 'aerial');
    $('#basemap-status').hidden = false;
    $('#basemap-status').textContent = kind === 'aerial'
      ? 'Foto aérea PNOA/IGN: puede ser antigua y conserva las sombras del momento en que se tomó.' : '';
    if (kind === 'street') $('#basemap-status').hidden = true;
    activeMap?.setBasemap(kind);
  });
}
const oldParams = new URLSearchParams(window.location.search);
if (['fecha', 'hora', 'filtro', 'terraza'].some((key) => oldParams.has(key))) $('#old-link-note').hidden = false;
updateSolar();
loadMadrid();
loadMap();
