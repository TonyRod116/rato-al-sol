import { searchNearby, searchPlaces, validCoordinate } from './shared/places.mjs';
import { getAyalaFallback, searchMadridFallback, searchMadridParks } from './shared/ayala-fallback.mjs';
import { inMadridArea } from './shared/madrid-scene.mjs';
import { getScenes } from './shared/scene-provider.mjs';
import { lightAt, lightForInterval, prepareScene, solarWindows } from './shared/estimate.mjs';
import { civilTimeToUtc } from './solar.mjs';

const $ = (id) => document.getElementById(id);
const MAX_ANALYSED = 4;
const labels = { sun: 'Sol estimado', shade: 'Sombra estimada', night: 'Noche', unknown: 'Sin datos suficientes' };
const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const parseTime = (value) => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
const distance = (metres) => metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', ',')} km`;

export function createExplorer({ getCenter, getDate, getTime, onPlaces, onPoint }) {
  let selected = null, pointRequest = 0, placeRequest = 0, nearbyRequest = 0;
  let places = [], nearby = [], criteria = null, sceneByPlace = new Map(), pending = new Set();
  let hasSearch = false;

  function mapPlaces(items) {
    onPlaces(items.map((place) => ({ ...place, position: { lat: place.latitude, lng: place.longitude },
      pinLabel: `${place.name}, ubicación aproximada` })), (id) => {
      const place = items.find((item) => item.id === id);
      if (place) selectPoint(place, true);
    });
  }

  function pointNote(point, source) {
    const position = point.kind === 'business' ? 'Es la posición aproximada del local, no de sus mesas. Para una terraza, marca en el mapa dónde están las mesas. ' :
      point.kind === 'public' ? 'Es un punto de referencia, no una estimación para todo el parque o plaza. ' :
      point.kind === 'place' ? 'Es una ubicación aproximada; para mayor precisión marca el punto exterior en el mapa. ' : '';
    const attribution = source === 'madrid' ? 'Alturas: Ayuntamiento de Madrid (CC BY 4.0).' : 'Edificios: OpenStreetMap y colaboradores.';
    return `${position}Muestras cada 30 minutos; horas aproximadas, hora de Madrid. No incluye nubes, árboles, toldos ni sombrillas. ${attribution}`;
  }

  function renderPoint() {
    if (!selected) return;
    $('point-title').textContent = selected.name;
    const list = $('point-windows'); list.replaceChildren();
    if (!selected.scene) return;
    if (selected.windowsDate !== getDate()) {
      selected.windows = solarWindows(selected.scene, getDate(), civilTimeToUtc);
      selected.windowsDate = getDate();
    }
    const windows = selected.windows;
    const current = lightAt(selected.scene, civilTimeToUtc(getDate(), getTime()));
    $('point-status').textContent = `${labels[current]} a las ${time(getTime())} · transiciones aproximadas`;
    for (const window of windows) {
      const item = document.createElement('li');
      item.className = `light-window is-${window.state}`;
      if (window.from <= getTime() && window.to > getTime()) item.classList.add('is-current');
      const name = document.createElement('span'), hours = document.createElement('strong');
      name.textContent = labels[window.state];
      hours.textContent = `≈ ${time(window.from)} – ${time(window.to)}`;
      item.append(name, hours); list.append(item);
    }
    $('point-note').hidden = false;
    $('point-note').textContent = pointNote(selected, selected.source);
  }

  async function selectPoint(point, focus = false) {
    if (!validCoordinate(point)) return;
    const request = ++pointRequest;
    selected = { ...point, name: point.name || 'Punto elegido en el mapa', kind: point.kind || 'point', scene: null };
    onPoint(selected, focus);
    $('map-selection').hidden = false;
    $('point-title').textContent = selected.name;
    $('point-status').textContent = 'Consultando los edificios de alrededor…';
    $('point-windows').replaceChildren();
    $('point-note').hidden = false;
    $('point-note').textContent = selected.kind === 'business' ? 'La marca es la ubicación aproximada del local; puedes tocar las mesas en el mapa.' : 'Calculamos la luz de este punto, no de toda la zona.';
    try {
      const geometry = await getScenes([selected]);
      if (request !== pointRequest) return;
      selected.scene = prepareScene(selected, geometry.buildings, geometry.radius);
      selected.source = geometry.source;
      if (!selected.scene) throw new Error('Sin geometría');
      renderPoint();
    } catch {
      if (request !== pointRequest) return;
      $('point-status').textContent = 'No hay datos suficientes de edificios para calcular la luz de este punto.';
      $('point-note').hidden = false;
      $('point-note').textContent = 'Prueba otro punto o vuelve a intentarlo. Las nubes, los árboles y los toldos no están incluidos.';
    }
  }

  function addPlaces(current, incoming) {
    const merged = [...current];
    for (const item of incoming) {
      if (!validCoordinate(item) || !Number.isFinite(item.distance)) continue;
      if (!merged.some((other) => other.id === item.id || (other.name.toLocaleLowerCase('es') === item.name.toLocaleLowerCase('es') && Math.abs(other.latitude - item.latitude) < .0002 && Math.abs(other.longitude - item.longitude) < .0002))) merged.push(item);
    }
    return merged.sort((a, b) => a.distance - b.distance).slice(0, 80);
  }

  function placeButton(place, detail) {
    const item = document.createElement('li'), button = document.createElement('button');
    const icon = document.createElement('span'), text = document.createElement('span');
    const title = document.createElement('strong'), subtitle = document.createElement('small');
    button.type = 'button'; icon.className = 'result-icon'; icon.textContent = place.kind === 'public' ? '✳' : '↗';
    title.textContent = place.name; subtitle.textContent = `${distance(place.distance)} · ${detail}`;
    text.append(title, subtitle); button.append(icon, text); item.append(button);
    button.addEventListener('click', () => selectPoint(place, true));
    return item;
  }

  function renderPlaces() {
    const list = $('place-results'); list.replaceChildren();
    for (const place of places.slice(0, 20)) list.append(placeButton(place, place.kind === 'business' ? 'Local · mesas sin localizar' : 'Ubicación aproximada'));
    if (places.length) mapPlaces(places.slice(0, 20));
  }

  function rangeState(scene) {
    if (!scene || !criteria) return 'unknown';
    return lightForInterval(scene, getDate(), criteria.from, criteria.to, civilTimeToUtc);
  }

  function renderNearby() {
    const list = $('nearby-results'); list.replaceChildren();
    if (!criteria) return;
    const sunny = [], uncertain = [];
    for (const place of nearby) {
      const scene = sceneByPlace.get(place.id);
      const state = place.kind === 'public' && scene ? rangeState(scene) : 'unknown';
      if (state === 'sun') sunny.push(place);
      else if (state === 'unknown') uncertain.push(place);
    }
    const heading = (text) => { const li = document.createElement('li'); li.className = 'result-group'; li.textContent = text; list.append(li); };
    if (sunny.length) {
      heading('CON SOL ESTIMADO');
      for (const place of sunny.slice(0, 20)) list.append(placeButton(place, 'Sol estimado en este punto'));
    }
    if (uncertain.length) {
      heading('AÚN SIN PODER CONFIRMAR');
      for (const place of uncertain.slice(0, 20)) list.append(placeButton(place,
        place.kind === 'business' ? 'Local · mesas sin localizar' : pending.has(place.id) ? 'Calculando este punto…' : 'Sin datos suficientes'));
    }
    const analysed = [...sceneByPlace.values()].filter(Boolean).length;
    $('nearby-status').textContent = nearby.length
      ? `${sunny.length} con sol estimado · ${analysed} puntos de espacios exteriores analizados. Distancias desde donde buscaste. Hora de Madrid; muestras cada 30 min.`
      : 'Todavía no hay resultados. Mueve el mapa, cambia la distancia o vuelve a intentarlo.';
    if (nearby.length) mapPlaces([...sunny, ...uncertain].slice(0, 20));
  }

  function analyseNearby(request) {
    for (const place of nearby) {
      if (place.kind !== 'public' || sceneByPlace.has(place.id) || pending.has(place.id)) continue;
      if (sceneByPlace.size + pending.size >= MAX_ANALYSED) break;
      pending.add(place.id);
      getScenes([place]).then((geometry) => {
        if (request !== nearbyRequest) return;
        const scene = prepareScene(place, geometry.buildings, geometry.radius);
        sceneByPlace.set(place.id, scene);
      }).catch(() => {
        if (request === nearbyRequest) sceneByPlace.set(place.id, null);
      }).finally(() => {
        if (request !== nearbyRequest) return;
        pending.delete(place.id); renderNearby();
      });
    }
    renderNearby();
  }

  $('place-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('place-query').value.trim(), center = getCenter();
    if (query.length < 2 || query.length > 80 || /[\x00-\x1f]/.test(query) || !validCoordinate(center)) {
      $('place-status').textContent = 'Escribe entre 2 y 80 caracteres y sitúa el mapa en la zona que buscas.'; return;
    }
    const request = ++placeRequest; ++nearbyRequest; criteria = null;
    hasSearch = true; places = []; nearby = []; sceneByPlace = new Map(); pending = new Set();
    $('place-results').replaceChildren(); $('nearby-results').replaceChildren();
    $('nearby-status').textContent = 'Busca parques y terrazas para la fecha seleccionada.';
    onPlaces([], () => {});
    $('place-status').textContent = 'Buscando lugares cerca del mapa…';
    const sources = [searchPlaces(query, center)];
    if (inMadridArea(center)) sources.push(searchMadridFallback(center, 5000, query), searchMadridParks(center, 5000, query));
    let waiting = sources.length, successes = 0;
    for (const source of sources) source.then((found) => {
      if (request !== placeRequest) return;
      successes++; places = addPlaces(places, found); renderPlaces();
    }).catch(() => {}).finally(() => {
      if (request !== placeRequest) return;
      waiting--;
      $('place-status').textContent = places.length ? `${places.length > 20 ? `Mostramos 20 de ${places.length}` : `${places.length}`} lugares cerca del mapa${waiting ? ' · buscando más…' : ''}. Selecciona uno.` :
        waiting ? 'Buscando lugares cerca del mapa…' : successes ? 'No hemos encontrado coincidencias cerca. Prueba otro nombre o mueve el mapa.' : 'No hemos podido consultar los lugares. Vuelve a intentarlo.';
    });
  });

  $('nearby-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const center = getCenter(), radius = Math.round($('nearby-radius').valueAsNumber * 1000);
    const from = parseTime($('nearby-start').value), endValue = $('nearby-end').value, to = endValue ? parseTime(endValue) : from;
    if (!validCoordinate(center) || !Number.isInteger(radius) || radius < 100 || radius > 5000 || !Number.isInteger(from) || !Number.isInteger(to) || to < from || (endValue && to === from)) {
      $('nearby-status').textContent = 'Elige una distancia de 0,1 a 5 km y, si añades una hora final, que sea posterior a la inicial.'; return;
    }
    const request = ++nearbyRequest; ++placeRequest;
    hasSearch = true; places = []; nearby = []; criteria = { from, to }; sceneByPlace = new Map(); pending = new Set();
    $('place-results').replaceChildren();
    $('place-status').textContent = 'Buscamos cerca del centro del mapa, hasta 5 km.';
    onPlaces([], () => {});
    $('nearby-results').replaceChildren(); $('nearby-status').textContent = 'Buscando lugares y consultando edificios…';
    const sources = [searchNearby(center, radius)];
    if (inMadridArea(center)) sources.push(searchMadridParks(center, radius), getAyalaFallback(center, radius));
    let waiting = sources.length, successes = 0;
    for (const source of sources) source.then((found) => {
      if (request !== nearbyRequest) return;
      successes++; nearby = addPlaces(nearby, found); analyseNearby(request);
    }).catch(() => {}).finally(() => {
      if (request !== nearbyRequest) return;
      waiting--;
      if (!waiting && !nearby.length) $('nearby-status').textContent = successes ? 'No hemos encontrado lugares en esta zona. Prueba otra distancia.' : 'No hemos podido consultar los lugares. Vuelve a intentarlo.';
    });
  });

  return {
    selectPoint,
    updateDate() { renderPoint(); renderNearby(); },
    updateTime() { renderPoint(); },
    hasSearch() { return hasSearch; },
    getSelected() { return selected; },
  };
}
