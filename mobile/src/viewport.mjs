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
  const entirelyMadrid = ([w, s, e, n]) => inMadridArea({ longitude: w, latitude: s }) && inMadridArea({ longitude: e, latitude: n });
  function incrementalBase(bounds) {
    if (!entirelyMadrid(bounds)) return null;
    const [w, s, e, n] = bounds, area = (e - w) * (n - s), time = now();
    let best = null, bestArea = 0;
    for (const entry of recent) {
      if (entry.expires <= time || entry.value.source !== 'madrid') continue;
      const [ow, os, oe, on] = entry.bounds;
      const intersection = [Math.max(w, ow), Math.max(s, os), Math.min(e, oe), Math.min(n, on)];
      const overlap = Math.max(0, intersection[2] - intersection[0]) * Math.max(0, intersection[3] - intersection[1]);
      if (overlap > bestArea && overlap >= area * .35) { best = { entry, intersection }; bestArea = overlap; }
    }
    return best;
  }
  async function loadIncrementally(bounds, base) {
    const [w, s, e, n] = bounds, [iw, is, ie, inn] = base.intersection;
    // Rectangles outside the already complete cached area. Never mark the
    // resulting viewport complete until every missing strip succeeds.
    const strips = [[w, s, iw, n], [ie, s, e, n], [iw, s, ie, is], [iw, inn, ie, n]]
      .filter(([left, bottom, right, top]) => right > left && top > bottom);
    // The municipal server can return geometry just outside the requested
    // envelope due to its spatial index. Query a small overlap around each
    // strip so shadows from boundary buildings are not lost at the seams.
    const expanded = strips.map(([left, bottom, right, top]) => [left - .0002, bottom - .0002, right + .0002, top + .0002]);
    if (expanded.some((strip) => !entirelyMadrid(strip))) return { value: await load(bounds), expires: now() + 120000 };
    const additions = await Promise.all(expanded.map((strip) => load(strip, undefined, { allowEmpty: true })));
    if (additions.some((item, i) => item?.source !== 'madrid' || !Array.isArray(item.features) || !covers(item.bounds, expanded[i]))) {
      throw new Error('Geometría de edificios incompleta.');
    }
    if (base.entry.expires <= now()) return { value: await load(bounds), expires: now() + 120000 };
    const features = [], seen = new Set();
    let vertices = 0;
    for (const value of [base.entry.value, ...additions]) for (const feature of value.features) {
      const id = feature?.properties?.id;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      features.push(feature);
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) vertices += ring.length;
      if (features.length > 8000 || vertices > 200000) {
        // The combined views must obey the same resource limits as a single
        // Madrid response, even when each individual strip was under budget.
        return { value: await load(bounds), expires: now() + 120000 };
      }
    }
    const omitted = [base.entry.value, ...additions].reduce((sum, item) => sum + (item.omitted || 0), 0);
    return { value: { type: 'FeatureCollection', source: 'madrid', features, bounds, omitted }, expires: base.entry.expires };
  }
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
    const base = incrementalBase(entry.bounds);
    entry.promise = Promise.resolve().then(() => base ? loadIncrementally(entry.bounds, base)
      : Promise.resolve(load(entry.bounds)).then((value) => ({ value, expires: now() + 120000 }))).then(({ value, expires }) => {
      if (covers(value?.bounds, entry.bounds)) {
        recent.push({ bounds: value.bounds, value, expires });
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
