import { civilTimeToUtc, sunPosition } from './solar.mjs';
import { getMadridTerraces } from './madrid.mjs';
import { AYALA_CENTER, getMadridBuildings, insideAyala } from './madrid-buildings.mjs';
import { buildingShadows, shadowDirection } from './map-shadows.mjs';
import { createOpenMap } from './open-map.mjs';
import { createCityMap } from './city-map.mjs';

const $ = (selector) => document.querySelector(selector);
const today = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const state = { date: `${today.year}-${today.month}-${today.day}`, minutes: 750 };
const empty = { type: 'FeatureCollection', features: [] };
let buildings, activeMap, madridPlaces = [], selectedMadrid = '', madridConsulted = '';
let mapStarted = false, mapLoading = false, is3D = true, playback, pendingFrame;
let view = { bearing: 0, pitch: 0, center: AYALA_CENTER };
let currentDirection = null;
let buildingsLoading = false, buildingsError = false;

function formattedTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
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
  else if (buildingsError) status.textContent = 'No hemos podido cargar las alturas. No se pueden mostrar las sombras; inténtalo de nuevo.';
  else if (!buildings) status.textContent = 'Las sombras aún no están disponibles.';
  else if (!insideAyala(view.center)) status.textContent = 'Fuera de la zona estudiada: las sombras solo se calculan en el entorno de Ayala.';
  else if (buildings.omitted) status.textContent = 'Sombras orientativas en Ayala; faltan alturas válidas para algunos edificios.';
  else status.textContent = 'Sombras orientativas · alturas municipales del entorno de Ayala.';
}

function updateSolar() {
  const instant = civilTimeToUtc(state.date, state.minutes);
  const sun = sunPosition(instant, AYALA_CENTER.lat, AYALA_CENTER.lng);
  currentDirection = shadowDirection(sun);
  const clock = formattedTime(state.minutes);
  $('#date').value = state.date;
  $('#time').value = state.minutes;
  $('#time-value').value = clock;
  $('#time').setAttribute('aria-valuetext', `${clock}, hora de Madrid`);
  $('#time').style.setProperty('--progress', `${(state.minutes - 540) / 660 * 100}%`);
  $('#direction-text').textContent = currentDirection
    ? `A las ${clock}, las sombras apuntan hacia el ${currentDirection.label}.`
    : sun && sun.altitude < -1 ? `A las ${clock} es de noche; no hay sombra solar.`
      : `A las ${clock} el sol está muy bajo; no mostramos sombras fiables.`;
  $('#direction-symbol').textContent = currentDirection ? '↑' : sun && sun.altitude < -1 ? '☾' : '☼';
  if (!currentDirection) $('#direction-symbol').style.transform = '';
  updateCompass();
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (activeMap) {
      activeMap.setSun?.(sun);
      activeMap.setShadows(buildings && currentDirection ? buildingShadows(buildings, sun) : empty);
    }
  });
}

function stopPlayback() {
  clearInterval(playback); playback = null;
  $('#play-day').setAttribute('aria-pressed', 'false');
  $('#play-day').textContent = '▶ Ver pasar el día';
}

async function loadBuildings() {
  if (buildingsLoading) return;
  buildingsLoading = true; buildingsError = false; updateShadowStatus();
  try {
    buildings = await getMadridBuildings();
    activeMap?.setBuildings(buildings);
    updateSolar();
  } catch {
    buildings = null; buildingsError = true;
    activeMap?.setShadows(empty);
  } finally { buildingsLoading = false; updateShadowStatus(); }
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
  if (focus && place?.position) activeMap?.focus(place.position);
}

function updateMadridMarkers() {
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
}

function activateMap(map, isCity) {
  activeMap = map;
  $('#city-map').hidden = !isCity;
  $('#open-map').hidden = isCity;
  $('#city-controls').hidden = !isCity;
  $('#map-dimension').hidden = !isCity || !is3D;
  $('#map-message').hidden = true;
  updateMadridMarkers();
  if (buildings) activeMap.setBuildings(buildings);
  updateSolar();
  activeMap.invalidate();
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
    }, onViewChange);
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
  try { activateMap(await createCityMap($('#city-map'), onViewChange), true); }
  catch { await loadOpenMap(); }
  finally { mapLoading = false; }
}

$('#time').addEventListener('input', (event) => { stopPlayback(); state.minutes = Number(event.target.value); updateSolar(); });
$('#date').addEventListener('change', (event) => {
  stopPlayback();
  if (!event.target.validity.valid || !civilTimeToUtc(event.target.value, state.minutes)) { event.target.value = state.date; return; }
  state.date = event.target.value; updateSolar();
});
$('#play-day').addEventListener('click', () => {
  if (playback) return stopPlayback();
  if (state.minutes >= 1200) state.minutes = 540;
  updateSolar();
  $('#play-day').setAttribute('aria-pressed', 'true');
  $('#play-day').textContent = '❚❚ Pausar';
  playback = setInterval(() => {
    state.minutes = Math.min(1200, state.minutes + 10); updateSolar();
    if (state.minutes >= 1200) stopPlayback();
  }, 450);
});
$('#madrid-load').addEventListener('click', loadMadrid);
$('#shadows-retry').addEventListener('click', loadBuildings);
$('#map-retry').addEventListener('click', () => window.location.reload());
$('#map-rotate').addEventListener('click', () => activeMap?.rotate?.());
$('#map-pitch').addEventListener('click', () => {
  is3D = !is3D;
  $('#map-pitch').setAttribute('aria-pressed', String(is3D));
  $('#map-pitch').textContent = is3D ? 'Vista 3D' : 'Vista 2D';
  $('#map-dimension').hidden = !is3D;
  activeMap?.set3D?.(is3D);
});
const oldParams = new URLSearchParams(window.location.search);
if (['fecha', 'hora', 'filtro', 'terraza'].some((key) => oldParams.has(key))) $('#old-link-note').hidden = false;
updateSolar();
loadBuildings();
loadMadrid();
loadMap();
