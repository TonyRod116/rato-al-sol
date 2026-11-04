import { inMadridArea } from '../../frontend/shared/madrid-scene.mjs';

// Include a margin so shadows from buildings just outside the map can reach it.
export function paddedViewport(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north || south < -85 || north > 85) return null;
  const latitude = (south + north) / 2;
  const padY = Math.max((north - south) * .2, 100 / 111319.49);
  const padX = Math.max((east - west) * .2, padY / Math.cos(latitude * Math.PI / 180));
  const result = [west - padX, south - padY, east + padX, north + padY];
  return result[0] >= -180 && result[2] <= 180 && result[1] >= -85 && result[3] <= 85 ? result : null;
}

export function nativeVisibleViewport(region, boundary) {
  const sw = boundary?.southWest, ne = boundary?.northEast;
  const visible = sw && ne && [sw.longitude, sw.latitude, ne.longitude, ne.latitude];
  if (paddedViewport(visible)) return visible;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region || {};
  if (![latitude, longitude, latitudeDelta, longitudeDelta].every(Number.isFinite)) return null;
  const fallback = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2,
    longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
  return paddedViewport(fallback) ? fallback : null;
}

export function nativeViewport(region, boundary) {
  return paddedViewport(nativeVisibleViewport(region, boundary));
}

// After a local pan, request one additional 0.001-degree strip in the
// direction of movement. Do not increase the first request or distant jumps,
// and retain the existing tighter Overpass limits outside Madrid.
export function expandedMadridViewport(bounds, previous) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      !Array.isArray(previous) || previous.length !== 4 || !previous.every(Number.isFinite)) return bounds;
  const center = { latitude: (bounds[1] + bounds[3]) / 2, longitude: (bounds[0] + bounds[2]) / 2 };
  const prior = { latitude: (previous[1] + previous[3]) / 2, longitude: (previous[0] + previous[2]) / 2 };
  if (!inMadridArea(center) || !inMadridArea(prior)) return bounds;
  const dx = center.longitude - prior.longitude, dy = center.latitude - prior.latitude;
  if (Math.abs(dx) > (bounds[2] - bounds[0]) * 2 || Math.abs(dy) > (bounds[3] - bounds[1]) * 2) return bounds;
  const expanded = [...bounds];
  if (Math.abs(dx) > 1e-8) { const side = dx > 0 ? 2 : 0; expanded[side] = Math.round((expanded[side] + Math.sign(dx) * .001) * 1000) / 1000; }
  if (Math.abs(dy) > 1e-8) { const side = dy > 0 ? 3 : 1; expanded[side] = Math.round((expanded[side] + Math.sign(dy) * .001) * 1000) / 1000; }
  if (expanded[0] < -3.94 || expanded[2] > -3.50 || expanded[1] < 40.28 || expanded[3] > 40.62 ||
      expanded[2] - expanded[0] > .04 || expanded[3] - expanded[1] > .03) return bounds;
  return expanded;
}

// Reuse only complete areas: a nearby viewport may be served from a wider
// request, but never present partial building coverage as a complete result.
export function createViewportLoader(load, now = Date.now, requestBounds = (bounds) => bounds) {
  const recent = [];
  const pending = [];
  let previousBounds = null;
  const covers = (outer, inner) => Array.isArray(outer) && Array.isArray(inner) &&
    outer.length === 4 && inner.length === 4 && outer.every(Number.isFinite) && inner.every(Number.isFinite) &&
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
  function find(bounds) {
    const time = now();
    return recent.find((entry) => entry.expires > time && covers(entry.bounds, bounds))?.value || null;
  }
  function get(bounds) {
    const cached = find(bounds);
    if (cached) return Promise.resolve(cached);
    const underway = pending.find((entry) => covers(entry.bounds, bounds));
    if (underway) return underway.promise;
    const requested = requestBounds(bounds, previousBounds);
    previousBounds = [...bounds];
    const entry = { bounds: [...(covers(requested, bounds) ? requested : bounds)] };
    entry.promise = Promise.resolve().then(() => load(entry.bounds)).then((value) => {
      if (covers(value?.bounds, entry.bounds)) {
        recent.push({ bounds: value.bounds, value, expires: now() + 120000 });
        if (recent.length > 6) recent.shift();
      }
      return value;
    }).finally(() => {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
    });
    pending.push(entry);
    return entry.promise;
  }
  return { find, get };
}
