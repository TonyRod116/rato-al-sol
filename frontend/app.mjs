import { buildings, places, demoSun, outcomeFor, visiblePlaces, parseSharedState, shareUrl } from './demo-data.mjs';
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
const icons = { sun: '☀', shade: '◒', night: '☾', unknown: '?' };

// Use the very same footprints for the illustration and the shadow calculation.
for (const building of buildings) {
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', building.footprint.map((point) => point.join(',')).join(' '));
  $('#map-buildings').append(polygon);
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
  pin.style.left = `${place.x}%`;
  pin.style.top = `${place.y}%`;
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
  const visible = visiblePlaces(state.filter, sun);
  if (!visible.some((place) => place.id === state.selected)) state.selected = visible[0]?.id ?? '';
  const selected = places.find((place) => place.id === state.selected);
  const clock = formattedTime(state.minutes);

  date.value = state.date;
  time.value = state.minutes;
  timeValue.value = clock;
  time.setAttribute('aria-valuetext', clock);
  document.querySelector(`input[name="filter"][value="${state.filter}"]`).checked = true;
  $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'opción' : 'opciones'}`;
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
    status.textContent = `${icons[outcome]} ${labels[outcome]}`;
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
    if (!sharePanel.hidden) shareLink.value = shareUrl(window.location.href, state);
  }
}

time.addEventListener('input', () => {
  state.minutes = Number(time.value);
  render();
});

date.addEventListener('change', () => {
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
