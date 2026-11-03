import { searchNearby, searchPlaces, validCoordinate } from './shared/places.mjs';
import { searchMadridFallback, searchMadridParks } from './shared/ayala-fallback.mjs';
import { inMadridArea } from './shared/madrid-scene.mjs';
import { getScenes } from './shared/scene-provider.mjs';
import { lightAt, lightForInterval, nearbyOutdoorScenes, prepareScene, sceneInsideBuilding, solarWindows } from './shared/estimate.mjs?v=20261103-10';
import { civilTimeToUtc } from './solar.mjs';

const $ = (id) => document.getElementById(id);
const MAX_ANALYSED = 4;
const labels = { sun: 'Sol estimado', shade: 'Sombra estimada', night: 'Noche', unknown: 'Sin datos suficientes' };
const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const distance = (metres) => metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1).replace('.', ',')} km`;

export function createExplorer({ getCenter, getDate, getTime, onPlaces, onPoint }) {
  let selected = null, pointRequest = 0, placeRequest = 0, nearbyRequest = 0;
  let places = [], nearby = [], criteria = null, sceneByPlace = new Map(), pending = new Set();

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
      point.kind === 'place' ? 'Es una ubicación aproximada; para mayor precisión marca el punto exterior en el mapa. ' :
      point.kind === 'approx' ? 'Es un punto exterior aproximado, no la posición confirmada de las mesas. ' : '';
    const attribution = source === 'madrid' ? 'Alturas: Ayuntamiento de Madrid (CC BY 4.0).' : 'Edificios: OpenStreetMap y colaboradores.';
    return `${position}Muestras cada 30 minutos; horas aproximadas, hora de Madrid. No incluye nubes, árboles, toldos ni sombrillas. ${attribution}`;
  }

  function resetTimeline(message) {
    $('daylight-place').textContent = message;
    $('daylight-segments').replaceChildren(); $('daylight-readable').replaceChildren(); $('daylight-highlights').replaceChildren();
    $('daylight-highlights').hidden = true;
    $('daylight-now').hidden = true; $('outdoor-options').hidden = true;
    $('outdoor-list').replaceChildren();
  }

  function renderPoint() {
    if (!selected) return;
    $('point-title').textContent = selected.name;
    const list = $('point-windows'); list.replaceChildren();
    if (!selected.scene) return;
    if (selected.windowsDate !== getDate()) {
      selected.windows = solarWindows(selected.scene, getDate(), civilTimeToUtc);
      for (const choice of selected.choices || []) choice.windows = solarWindows(choice.scene, getDate(), civilTimeToUtc);
      selected.windowsDate = getDate();
    }
    const windows = selected.windows;
    const current = lightAt(selected.scene, civilTimeToUtc(getDate(), getTime()));
    const inside = sceneInsideBuilding(selected.scene);
    $('point-status').textContent = inside ? 'La referencia cae dentro de un edificio. Elige un punto exterior.' : `${labels[current]} a las ${time(getTime())} · transiciones aproximadas`;
    $('daylight-place').textContent = inside ? `${selected.name} · Elige un punto exterior para consultar su luz.` : `${selected.name} · ${labels[current]} a las ${time(getTime())}`;
    const bar = $('daylight-segments'), readable = $('daylight-readable'), highlights = $('daylight-highlights');
    bar.replaceChildren(); readable.replaceChildren(); highlights.replaceChildren(); highlights.hidden = true;
    $('daylight-now').hidden = false;
    $('daylight-now').style.left = `${getTime() / 1440 * 100}%`;
    for (const window of windows) {
      const item = document.createElement('li');
      item.className = `light-window is-${window.state}`;
      if (window.from <= getTime() && window.to > getTime()) item.classList.add('is-current');
      const name = document.createElement('span'), hours = document.createElement('strong');
      name.textContent = labels[window.state];
      hours.textContent = `≈ ${time(window.from)} – ${time(window.to)}`;
      item.append(name, hours); list.append(item);
      const segment = document.createElement('span');
      segment.className = `daylight-segment is-${window.state}`;
      segment.style.flexGrow = String(window.to - window.from);
      segment.style.flexBasis = '0';
      bar.append(segment);
      const description = document.createElement('li');
      description.textContent = `${labels[window.state]} aproximadamente de ${time(window.from)} a ${time(window.to)}.`;
      readable.append(description);
      if (window.state === 'sun' || window.state === 'shade') {
        const highlight = document.createElement('li'), name = document.createElement('span'), hours = document.createElement('strong');
        highlight.className = `is-${window.state}`;
        name.textContent = window.state === 'sun' ? '☼ Sol' : '◒ Sombra';
        hours.textContent = `≈ ${time(window.from)} – ${time(window.to)}`;
        highlight.append(name, hours); highlights.append(highlight); highlights.hidden = false;
      }
    }
    const choices = $('outdoor-list'); choices.replaceChildren();
    $('outdoor-options').hidden = !inside || !(selected.choices?.length);
    for (const choice of selected.choices || []) {
      const item = document.createElement('li'), button = document.createElement('button');
      const title = document.createElement('strong'), detail = document.createElement('small');
      button.type = 'button';
      title.textContent = `${choice.direction} · a unos ${choice.metres} m`;
      const useful = choice.windows.filter((window) => window.state === 'sun' || window.state === 'shade');
      detail.textContent = useful.length ? useful.map((window) => `${labels[window.state]} ${time(window.from)}–${time(window.to)}`).join(' · ') : 'Sin horas suficientes para estimar';
      button.append(title, detail); item.append(button); choices.append(item);
      button.addEventListener('click', () => selectPoint({ ...choice.point, name: `Punto al ${choice.direction.toLocaleLowerCase('es')} de ${selected.name}`, kind: 'approx' }, true, { scene: choice.scene, source: selected.source }));
    }
    $('point-note').hidden = false;
    $('point-note').textContent = pointNote(selected, selected.source);
  }

  async function selectPoint(point, focus = false, prepared = null) {
    if (!validCoordinate(point)) return;
    const request = ++pointRequest;
    selected = { ...point, name: point.name || 'Punto elegido en el mapa', kind: point.kind || 'point', scene: null };
    onPoint(selected, focus);
    $('point-title').textContent = selected.name;
    $('point-status').textContent = 'Consultando los edificios de alrededor…';
    $('point-windows').replaceChildren();
    resetTimeline('Consultando los edificios de este punto…');
    $('point-note').hidden = false;
    $('point-note').textContent = selected.kind === 'business' ? 'La marca es la ubicación aproximada del local; puedes tocar las mesas en el mapa.' : 'Calculamos la luz de este punto, no de toda la zona.';
    try {
      const geometry = prepared || await getScenes([selected]);
      if (request !== pointRequest) return;
      selected.scene = geometry.scene || prepareScene(selected, geometry.buildings, geometry.radius);
      selected.source = geometry.source;
      if (!selected.scene) throw new Error('Sin geometría');
      selected.choices = geometry.buildings ? nearbyOutdoorScenes(selected.scene, geometry.buildings) : [];
      renderPoint();
    } catch {
      if (request !== pointRequest) return;
      $('point-status').textContent = 'No hay datos suficientes de edificios para calcular la luz de este punto.';
      resetTimeline('No hay datos suficientes de edificios para calcular este punto.');
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
    button.addEventListener('click', () => {
      selectPoint(place, true);
      const searchPanel = document.querySelector('.search-panel');
      const map = document.querySelector('.map-figure');
      if (searchPanel && map && searchPanel.getBoundingClientRect().bottom <= map.getBoundingClientRect().top) {
        map.focus({ preventScroll: true });
        map.scrollIntoView({ block: 'start' });
      }
    });
    return item;
  }

  function renderPlaces() {
    const list = $('place-results'); list.replaceChildren();
    for (const place of places.slice(0, 20)) list.append(placeButton(place, place.categoryUnknown ? 'Terraza registrada · tipo sin confirmar' : place.kind === 'business' ? 'Local · mesas sin localizar' : 'Ubicación aproximada'));
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
    places = []; nearby = []; sceneByPlace = new Map(); pending = new Set();
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
    const center = getCenter(), radius = $('nearby-radius').valueAsNumber;
    const from = $('nearby-start').valueAsNumber, to = $('nearby-end-enabled').checked ? $('nearby-end').valueAsNumber : from;
    if (!validCoordinate(center) || !Number.isInteger(radius) || radius < 500 || radius > 5000 || !Number.isInteger(from) || !Number.isInteger(to) || to < from || ($('nearby-end-enabled').checked && to === from)) {
      $('nearby-status').textContent = 'Elige una distancia de 500 m a 5 km y una hora final posterior al inicio.'; return;
    }
    const request = ++nearbyRequest; ++placeRequest;
    places = []; nearby = []; criteria = { from, to }; sceneByPlace = new Map(); pending = new Set();
    $('place-results').replaceChildren();
    $('place-status').textContent = 'Buscamos cerca del centro del mapa, hasta 5 km.';
    onPlaces([], () => {});
    $('nearby-results').replaceChildren(); $('nearby-status').textContent = 'Buscando lugares y consultando edificios…';
    const sources = [searchNearby(center, radius)];
    if (inMadridArea(center)) sources.push(searchMadridParks(center, radius), searchMadridFallback(center, radius, ''));
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
    getSelected() { return selected; },
  };
}
