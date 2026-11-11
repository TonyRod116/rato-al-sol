const LAST_CENTER = 'rato.web-map-center.v1';
const getStorage = () => globalThis.localStorage;
const validCenter = (center) => Number.isFinite(center?.lat) && Number.isFinite(center?.lng) &&
  Math.abs(center.lat) <= 85 && Math.abs(center.lng) <= 180;
const fromPosition = (position) => ({ lat: position?.coords?.latitude, lng: position?.coords?.longitude });

export function savedMapCenter(storage = getStorage) {
  try {
    const point = JSON.parse(storage().getItem(LAST_CENTER));
    return validCenter(point) ? point : null;
  } catch { return null; }
}

export function rememberMapCenter(center, storage = getStorage) {
  if (!validCenter(center)) return;
  try {
    storage().setItem(LAST_CENTER, JSON.stringify({
      lat: Number(center.lat.toFixed(4)), lng: Number(center.lng.toFixed(4)),
    }));
  } catch { /* The map also works without browser storage. */ }
}

// Only ask the browser at startup when its permission has already been granted.
export async function startupMapCenter({ fallback, getPermission, geolocation, timeoutMs = 2500 }) {
  let timer;
  let expired = false;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve(fallback);
    }, timeoutMs);
  });
  const locate = async () => {
    if ((await getPermission())?.state !== 'granted' || expired) return fallback;
    return new Promise((resolve) => {
      const service = geolocation();
      if (!service?.getCurrentPosition) return resolve(fallback);
      service.getCurrentPosition((position) => {
        const center = fromPosition(position);
        resolve(validCenter(center) ? center : fallback);
      }, () => resolve(fallback), { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 });
    });
  };
  try { return await Promise.race([locate().catch(() => fallback), deadline]); }
  finally { clearTimeout(timer); }
}

// A later city selection cancels the result of a manual location request.
export function createLocationControl({ button, status, geolocation, onFound, showMessage }) {
  let request = 0;

  const show = (es, en) => {
    status.hidden = false;
    showMessage(status, es, en);
  };

  function cancel() {
    request++;
    button.disabled = false;
    status.hidden = true;
  }

  function start() {
    let service;
    try { service = geolocation(); } catch { service = null; }
    if (!service?.getCurrentPosition) {
      show('Tu navegador no ofrece ubicación. Elige Madrid o Barcelona en el selector.', 'Your browser does not provide location. Choose Madrid or Barcelona in the selector.');
      return;
    }
    const current = ++request;
    button.disabled = true;
    show('Buscando tu ubicación…', 'Finding your location…');
    const fail = (error) => {
      if (current !== request) return;
      button.disabled = false;
      if (error?.code === 1) show('Permite la ubicación en tu navegador o elige Madrid o Barcelona.', 'Allow location in your browser or choose Madrid or Barcelona.');
      else show('No hemos podido obtener tu ubicación. Elige Madrid o Barcelona o inténtalo de nuevo.', 'Could not find your location. Choose Madrid or Barcelona, or try again.');
    };
    try {
      service.getCurrentPosition((position) => {
        if (current !== request) return;
        const center = fromPosition(position);
        if (!validCenter(center)) return fail();
        button.disabled = false;
        const withinMainCoverage = onFound(center);
        if (withinMainCoverage === false) show('Mapa centrado en tu ubicación. Fuera de Madrid y Barcelona, la cobertura de datos puede variar.', 'Map centred on your location. Data coverage may vary outside Madrid and Barcelona.');
        else show('Mapa centrado en tu ubicación. Puedes buscar lugares cercanos.', 'Map centred on your location. You can search for nearby places.');
      }, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    } catch { fail(); }
  }

  return { start, cancel };
}
