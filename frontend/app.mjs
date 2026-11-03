import { buildings, places, demoSun, outcomeFor, visiblePlaces, intervalsFor, parseSharedState, shareUrl } from './demo-data.mjs';
import { shadowOffset, shadowPolygons } from './solar.mjs';
import { getMadridTerraces } from './madrid.mjs';

const $ = (selector) => document.querySelector(selector);
const time = $('#time');
const date = $('#date');
const list = $('#place-list');
const pins = $('#map-pins');
const timeValue = $('#time-value');
const details = $('#details');
const sharePanel = $('#share-panel');
const shareLink = $('#share-link');

const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const localDate = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
const state = parseSharedState(window.location.search, { date: localDate, minutes: 750, filter: 'all', selected: 'la-parra' });
const labels = { sun: 'Sol de ejemplo', shade: 'Sombra de ejemplo', night: 'De noche', unknown: 'Sin datos' };
const shortLabels = { sun: 'Sol', shade: 'Sombra', night: 'De noche', unknown: 'Sin datos' };
const icons = { sun: '☀', shade: '◒', night: '☾', unknown: '?' };

const svgNamespace = 'http://www.w3.org/2000/svg';
const project = ([x, y], z = 0) => [35 + .95 * x + .34 * y, 78 + .64 * y - 1.15 * z];
const points = (vertices, z = 0) => vertices.map((point) => project(point, z).map((n) => n.toFixed(2)).join(',')).join(' ');
function svgPolygon(vertices, className) {
  const polygon = document.createElementNS(svgNamespace, 'polygon');
  polygon.setAttribute('points', vertices.map((point) => point.map((n) => n.toFixed(2)).join(',')).join(' '));
  if (className) polygon.setAttribute('class', className);
  return polygon;
}

// The architectural illustration uses the very same footprints and heights as the model.
for (const building of [...buildings].sort((a, b) => Math.max(...a.footprint.map((p) => p[1])) - Math.max(...b.footprint.map((p) => p[1])))) {
  const group = document.createElementNS(svgNamespace, 'g');
  for (let i = 0; i < building.footprint.length; i++) {
    const a = building.footprint[i];
    const b = building.footprint[(i + 1) % building.footprint.length];
    if (project(b)[0] >= project(a)[0]) continue;
    group.append(svgPolygon([project(a), project(b), project(b, building.height), project(a, building.height)], 'building-wall'));
    const edgeLength = Math.hypot(project(b)[0] - project(a)[0], project(b)[1] - project(a)[1]);
    const windows = Math.max(1, Math.floor(edgeLength / 18));
    const floors = Math.max(1, Math.floor(building.height / 12));
    const along = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let floor = 0; floor < floors; floor++) {
      const bottom = building.height * (floor + .27) / floors;
      const top = building.height * (floor + .66) / floors;
      for (let window = 0; window < windows; window++) {
        const left = along((window + .35) / windows), right = along((window + .65) / windows);
        group.append(svgPolygon([project(left, bottom), project(right, bottom), project(right, top), project(left, top)], 'building-window'));
      }
    }
  }
  const roof = document.createElementNS(svgNamespace, 'polygon');
  roof.setAttribute('points', points(building.footprint, building.height));
  roof.setAttribute('class', 'building-roof');
  group.append(roof);
  const centre = building.footprint.reduce((sum, point) => [sum[0] + point[0] / building.footprint.length, sum[1] + point[1] / building.footprint.length], [0, 0]);
  const parapet = building.footprint.map(([x, y]) => [centre[0] + (x - centre[0]) * .9, centre[1] + (y - centre[1]) * .9]);
  group.append(svgPolygon(parapet.map((point) => project(point, building.height)), 'building-parapet'));
  $('#map-buildings').append(group);
}

function renderShadows(sun) {
  const shadows = $('#shadow-shapes');
  shadows.replaceChildren();
  for (const building of buildings) {
    for (const polygon of shadowPolygons(sun, building)) shadows.append(svgPolygon(polygon.map((point) => project(point))));
  }
  const available = shadowOffset(sun, 1) !== null;
  const night = sun && sun.altitude < -1;
  $('.map').dataset.light = available ? 'day' : night ? 'night' : 'low';
  $('#scene-caption').textContent = available ? 'DIRECCIÓN DEL SOL' : night ? 'DE NOCHE' : 'SOL BAJO · SIN DATOS';
  const direction = $('#sun-direction');
  const dot = $('#sun-dot');
  direction.toggleAttribute('hidden', !available);
  dot.toggleAttribute('hidden', !available);
  if (available) {
    const radians = sun.azimuth * Math.PI / 180;
    const dx = Math.sin(radians), dy = -Math.cos(radians);
    const px = .95 * dx + .34 * dy, py = .64 * dy;
    const length = Math.hypot(px, py);
    const x = 36 + 23 * px / length, y = 36 + 23 * py / length;
    direction.setAttribute('x2', x); direction.setAttribute('y2', y);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  }
}

let timelineKey = '';
function renderTimeline(place) {
  const key = `${place.id}:${state.date}`;
  if (timelineKey === key) return;
  timelineKey = key;
  const intervals = intervalsFor(place, state.date);
  const timeline = $('#day-timeline');
  timeline.replaceChildren();
  for (const interval of intervals) {
    const segment = document.createElement('span');
    segment.className = `timeline-${interval.outcome}`;
    segment.style.flexGrow = String(interval.end - interval.start);
    timeline.append(segment);
  }
  const plainLabels = { sun: 'sol', shade: 'sombra', night: 'noche', unknown: 'sin datos' };
  timeline.setAttribute('aria-label', `Día de ejemplo: ${intervals.map(({ start, end, outcome }) => `${plainLabels[outcome]} de ${formattedTime(start)} a ${formattedTime(end)}`).join('; ')}. Horas aproximadas.`);
  const sunny = intervals.filter((interval) => interval.outcome === 'sun');
  $('#sun-intervals').textContent = sunny.length
    ? sunny.map(({ start, end }) => `${formattedTime(start)} – ${formattedTime(end)}`).join(' · ')
    : intervals.some((interval) => interval.outcome === 'unknown')
      ? 'Sin datos suficientes para calcular los tramos de sol.'
      : 'No hay tramos de sol en el horario mostrado.';
}

function formattedTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

for (const place of places) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'place';
  item.dataset.place = place.id;
  item.innerHTML = '<span class="place-number"></span><span class="place-text"><strong></strong><small></small></span><span class="place-status status"></span><span class="place-arrow" aria-hidden="true">↗</span>';
  item.querySelector('.place-number').textContent = place.number;
  item.querySelector('strong').textContent = place.name;
  item.querySelector('small').textContent = place.description;
  item.addEventListener('click', () => selectPlace(place.id));
  list.append(item);

  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'map-pin';
  pin.dataset.place = place.id;
  pin.dataset.number = place.number;
  const [x, y] = project([place.x * 6, place.y * 5.2]);
  pin.style.left = `${x / 850 * 100}%`;
  pin.style.top = `${y / 490 * 100}%`;
  pin.textContent = place.number;
  pin.addEventListener('click', () => selectPlace(place.id));
  pins.append(pin);
}

function selectPlace(id) {
  state.selected = id;
  sharePanel.hidden = true;
  render();
}

function render() {
  const sun = demoSun(state.date, state.minutes);
  renderShadows(sun);
  const visible = visiblePlaces(state.filter, sun);
  if (!visible.some((place) => place.id === state.selected)) state.selected = visible[0]?.id ?? '';
  const selected = places.find((place) => place.id === state.selected);
  const clock = formattedTime(state.minutes);

  date.value = state.date;
  time.value = state.minutes;
  timeValue.value = clock;
  time.setAttribute('aria-valuetext', clock);
  time.style.setProperty('--progress', `${(state.minutes - 540) / 660 * 100}%`);
  $('#day-timeline').style.setProperty('--current', `${(state.minutes - 540) / 660 * 100}%`);
  document.querySelector(`input[name="filter"][value="${state.filter}"]`).checked = true;
  const resultCount = `${visible.length} ${visible.length === 1 ? 'opción' : 'opciones'}`;
  if ($('#result-count').textContent !== resultCount) $('#result-count').textContent = resultCount;
  $('#empty').hidden = visible.length !== 0;
  $('#unknown-note').hidden = state.filter === 'all';

  for (const place of places) {
    const outcome = outcomeFor(place, sun);
    const shown = visible.some((entry) => entry.id === place.id);
    const active = place.id === state.selected;
    const item = list.querySelector(`[data-place="${place.id}"]`);
    const pin = pins.querySelector(`[data-place="${place.id}"]`);
    const status = item.querySelector('.place-status');
    item.hidden = pin.hidden = !shown;
    item.classList.toggle('is-selected', active);
    item.setAttribute('aria-pressed', String(active));
    status.className = `place-status status status-${outcome}`;
    status.textContent = `${icons[outcome]} ${shortLabels[outcome]}`;
    pin.className = `map-pin pin-${outcome}${active ? ' is-selected' : ''}`;
    pin.setAttribute('aria-pressed', String(active));
    pin.setAttribute('aria-label', `Seleccionar ${place.name}, ${labels[outcome].toLowerCase()}`);
  }

  details.hidden = !selected;
  if (selected) {
    const outcome = outcomeFor(selected, sun);
    $('#detail-title').textContent = selected.name;
    $('#detail-status').className = `status status-${outcome}`;
    $('#detail-status').textContent = `${icons[outcome]} ${labels[outcome]}`;
    const descriptions = {
      sun: 'El cálculo encuentra sol en este lugar imaginario. No incluye nubes, toldos ni árboles.',
      shade: 'Un edificio simulado tapa el sol en este lugar imaginario. No incluye nubes, toldos ni árboles.',
      night: 'A esta hora el sol está bajo el horizonte. Este lugar es imaginario.',
      unknown: !selected.hasTables
        ? 'No conocemos la posición de las mesas de este lugar imaginario, así que no podemos calcular su sombra.'
        : 'El sol está demasiado cerca del horizonte o faltan datos para calcular el resultado con confianza.',
    };
    $('#detail-copy').textContent = descriptions[outcome];
    renderTimeline(selected);
    if (!sharePanel.hidden) shareLink.value = shareUrl(window.location.href, state);
  }
}

let playback;
function stopPlayback() {
  clearInterval(playback);
  playback = undefined;
  $('#play-day').setAttribute('aria-pressed', 'false');
  $('#play-day').textContent = '▶ Ver pasar el día';
}

$('#play-day').addEventListener('click', () => {
  if (playback) return stopPlayback();
  if (state.minutes >= 1200) state.minutes = 540;
  render();
  $('#play-day').setAttribute('aria-pressed', 'true');
  $('#play-day').textContent = '❚❚ Pausar';
  playback = setInterval(() => {
    state.minutes = Math.min(1200, state.minutes + 10);
    render();
    if (state.minutes >= 1200) stopPlayback();
  }, 250);
});

time.addEventListener('input', () => {
  stopPlayback();
  state.minutes = Number(time.value);
  render();
});

date.addEventListener('change', () => {
  stopPlayback();
  if (!date.validity.valid || !date.value) {
    date.value = state.date;
    return;
  }
  state.date = date.value;
  render();
});

document.querySelectorAll('input[name="filter"]').forEach((input) => {
  input.addEventListener('change', () => {
    state.filter = input.value;
    sharePanel.hidden = true;
    render();
  });
});

$('#share').addEventListener('click', () => {
  sharePanel.hidden = !sharePanel.hidden;
  if (!sharePanel.hidden) {
    shareLink.value = shareUrl(window.location.href, state);
    $('#share-message').textContent = 'El enlace solo incluye esta selección de ejemplo.';
    shareLink.focus();
    shareLink.select();
  }
});

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    $('#share-message').textContent = 'Enlace copiado.';
  } catch {
    shareLink.focus();
    shareLink.select();
    $('#share-message').textContent = 'Copia el enlace seleccionado para compartirlo.';
  }
});

$('#madrid-load').addEventListener('click', async () => {
  const button = $('#madrid-load');
  const status = $('#madrid-status');
  const results = $('#madrid-list');
  button.disabled = true;
  results.replaceChildren();
  status.textContent = 'Consultando el censo municipal…';
  try {
    const terraces = await getMadridTerraces();
    if (!terraces.length) {
      status.textContent = 'El censo no devuelve terrazas para esta selección. Prueba de nuevo más tarde.';
    } else {
      for (const terrace of terraces) {
        const item = document.createElement('li');
        const identity = document.createElement('span');
        const name = document.createElement('strong');
        const address = document.createElement('small');
        const light = document.createElement('span');
        name.textContent = terrace.name;
        address.textContent = terrace.address;
        identity.append(name, address);
        light.className = 'status status-unknown';
        light.textContent = '? Sin datos de sol';
        item.append(identity, light);
        results.append(item);
      }
      const consulted = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
      }).format(new Date());
      status.textContent = `${terraces.length} ${terraces.length === 1 ? 'registro' : 'registros'} · Consulta: ${consulted}, hora de Madrid.`;
    }
    button.textContent = 'Actualizar consulta ↗';
  } catch {
    status.textContent = 'Ahora no podemos consultar el censo de Madrid. Comprueba tu conexión y vuelve a intentarlo.';
    button.textContent = 'Reintentar consulta ↗';
  } finally {
    button.disabled = false;
  }
});

render();
