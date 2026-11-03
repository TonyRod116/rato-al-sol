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

// Each shape becomes a native map overlay. Never leave a misleading partial
// set of shadows visible if an unusually dense view would overload the phone.
export function shadowsFitNativeBudget(shadows, limit = 4000) {
  let count = 0;
  for (const feature of shadows.features) {
    count += feature.geometry.coordinates.length;
    if (count > limit) return false;
  }
  return true;
}
