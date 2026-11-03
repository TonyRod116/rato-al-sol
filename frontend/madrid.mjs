const ENDPOINT = 'https://datos.madrid.es/api/3/action/datastore_search';
const RESOURCE = '200085-6-censo-locales';
const FILTERS = {
  desc_barrio_local: 'RECOLETOS', desc_vial_edificio: 'AYALA',
  desc_situacion_terraza: 'Abierta', desc_situacion_local: 'Abierto',
};
const FIELDS = [
  'id_terraza', 'rotulo', 'desc_barrio_local', 'clase_vial_edificio',
  'desc_vial_edificio', 'num_edificio', 'cal_edificio',
  'desc_situacion_local', 'desc_situacion_terraza',
];

function normalize(record) {
  if (!record || typeof record !== 'object' || !/^\d{1,12}$/.test(record.id_terraza ?? '') ||
      typeof record.rotulo !== 'string' || !record.rotulo.trim() || record.rotulo.length > 120 ||
      record.clase_vial_edificio !== 'CALLE' ||
      Object.entries(FILTERS).some(([key, value]) => record[key] !== value) ||
      typeof record.num_edificio !== 'string' || !/^\d{1,6}$/.test(record.num_edificio) ||
      Number(record.num_edificio) === 0) return null;
  const suffix = record.cal_edificio ?? '';
  if (typeof suffix !== 'string' || !/^[a-zA-Z0-9]{0,6}$/.test(suffix)) return null;
  return {
    id: record.id_terraza,
    name: record.rotulo.trim(),
    address: `Calle de Ayala, ${Number(record.num_edificio)}${suffix}`,
  };
}

// A single, explicit, bounded lookup. No personal location or plan is sent.
export async function getMadridTerraces(fetchFn = fetch) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    resource_id: RESOURCE, limit: '10', fields: FIELDS.join(','), filters: JSON.stringify(FILTERS),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchFn(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Madrid census unavailable');
    const data = await response.json();
    if (data?.success !== true || !Array.isArray(data?.result?.records) || data.result.records.length > 10) {
      throw new Error('Unexpected Madrid census response');
    }
    const records = data.result.records.map(normalize).filter(Boolean);
    if (data.result.records.length && !records.length) throw new Error('No valid Madrid census records');
    return records;
  } finally {
    clearTimeout(timeout);
  }
}
