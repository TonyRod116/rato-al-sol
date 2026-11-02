import { places, outcomeFor, visiblePlaces, parseSharedState, shareUrl } from './demo-data.mjs';

const $ = (selector) => document.querySelector(selector);
const time = $('#time');
const date = $('#date');
const list = $('#place-list');
const pins = $('#map-pins');
const timeValue = $('#time-value');
const details = $('#details');
const sharePanel = $('#share-panel');
const shareLink = $('#share-link');

const today = new Date();
const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const state = parseSharedState(window.location.search, { date: localDate, minutes: 750, filter: 'all', selected: 'la-parra' });
const labels = { sun: 'Sol de ejemplo', shade: 'Sombra de ejemplo', unknown: 'Sin datos' };
const icons = { sun: '☀', shade: '◒', unknown: '?' };

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
  const visible = visiblePlaces(state.filter, state.minutes);
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
    const outcome = outcomeFor(place, state.minutes);
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
    const outcome = outcomeFor(selected, state.minutes);
    $('#detail-title').textContent = selected.name;
    $('#detail-status').className = `status status-${outcome}`;
    $('#detail-status').textContent = `${icons[outcome]} ${labels[outcome]}`;
    $('#detail-copy').textContent = outcome === 'unknown'
      ? 'Este ejemplo muestra qué ocurre cuando no tenemos información suficiente para decir si habrá sol o sombra.'
      : 'Este estado está inventado para mostrar el funcionamiento de la app. No describe una terraza real.';
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

render();
