// Estos intervalos son inventados para probar la interfaz; no son un modelo solar.
export const places = [
  { id: 'la-parra', number: 1, name: 'La Parra', description: 'Junto a la plaza', x: 25, y: 25,
    windows: [[540, 900, 'sun'], [900, 1230, 'shade']] },
  { id: 'el-mirador', number: 2, name: 'El Mirador', description: 'En la calle tranquila', x: 72, y: 33,
    windows: [[540, 780, 'shade'], [780, 1140, 'sun'], [1140, 1230, 'shade']] },
  { id: 'la-plaza', number: 3, name: 'La Plaza', description: 'Frente al jardín', x: 38, y: 69,
    windows: [[540, 960, 'shade'], [960, 1170, 'sun'], [1170, 1230, 'shade']] },
  { id: 'el-olivo', number: 4, name: 'El Olivo', description: 'Al final del paseo', x: 78, y: 76,
    windows: [] },
];

export function outcomeFor(place, minutes) {
  if (!Number.isInteger(minutes) || minutes < 540 || minutes > 1200) return 'unknown';
  return place?.windows?.find(([start, end]) => minutes >= start && minutes < end)?.[2] ?? 'unknown';
}

export function visiblePlaces(filter, minutes) {
  return places.filter((place) => filter === 'all' || outcomeFor(place, minutes) === filter);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseSharedState(search, defaults) {
  const params = new URLSearchParams(search);
  const date = params.get('fecha');
  const time = params.get('hora');
  const minutes = /^\d{3,4}$/.test(time ?? '') ? Number(time) : NaN;
  const filter = params.get('filtro');
  const selected = params.get('terraza');
  return {
    date: validDate(date ?? '') ? date : defaults.date,
    minutes: Number.isInteger(minutes) && minutes >= 540 && minutes <= 1200 && minutes % 30 === 0 ? minutes : defaults.minutes,
    filter: ['all', 'sun', 'shade'].includes(filter) ? filter : defaults.filter,
    selected: places.some((place) => place.id === selected) ? selected : defaults.selected,
  };
}

export function shareUrl(currentUrl, state) {
  const url = new URL(currentUrl);
  url.username = '';
  url.password = '';
  url.search = new URLSearchParams({ fecha: state.date, hora: String(state.minutes), filtro: state.filter, terraza: state.selected });
  url.hash = '';
  return url.href;
}
