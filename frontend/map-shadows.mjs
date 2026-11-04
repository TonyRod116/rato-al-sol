import { shadowOffset } from './solar.mjs';
// Local metres-per-degree approximation follows the latitude of the view.
const METRES_PER_DEGREE = 111319.49079327358;
const shift = (point, dx, dy, east) => [point[0] + dx / east, point[1] - dy / METRES_PER_DEGREE];
const boundsCache = new WeakMap();

function footprintBounds(building) {
  if (boundsCache.has(building)) return boundsCache.get(building);
  const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat);
  }
  boundsCache.set(building, bounds);
  return bounds;
}

function mayReachView(building, offset, view, eastPerDegree) {
  if (!Array.isArray(view) || view.length !== 4 || !view.every(Number.isFinite)) return true;
  const [west, south, east, north] = footprintBounds(building);
  const dx = offset[0] / eastPerDegree, dy = -offset[1] / METRES_PER_DEGREE;
  // Include the swept area, even when the casting building is off screen.
  return Math.min(west, west + dx) <= view[2] && Math.max(east, east + dx) >= view[0] &&
    Math.min(south, south + dy) <= view[3] && Math.max(north, north + dy) >= view[1];
}

// Sweep each boundary, including courtyard boundaries, and the translated roof.
// Geometry remains a visual estimate; it is not used to classify a terrace.
export function buildingShadows(buildings, sun, view = null, { maxVertices = Infinity } = {}) {
  if (maxVertices !== Infinity && (!Number.isSafeInteger(maxVertices) || maxVertices < 0)) {
    throw new RangeError('Invalid shadow vertex limit');
  }
  const features = [];
  let vertices = 0;
  for (const building of buildings?.features ?? []) {
    const offset = shadowOffset(sun, building.properties.height);
    if (!offset) continue;
    const buildingBounds = footprintBounds(building);
    const east = METRES_PER_DEGREE * Math.cos((buildingBounds[1] + buildingBounds[3]) / 2 * Math.PI / 180);
    if (!mayReachView(building, offset, view, east)) continue;
    const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
    if (maxVertices !== Infinity) {
      // Count the translated rings and each five-vertex swept edge before
      // allocating them. If the next building would cross the budget, return
      // no shapes at all: a partial shadow mask could imply false sunshine.
      for (const polygon of polygons) for (const ring of polygon) {
        vertices += ring.length;
        if (vertices > maxVertices) return { type: 'FeatureCollection', features: [], limitExceeded: true };
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i], b = ring[i + 1];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          vertices += 5;
          if (vertices > maxVertices) return { type: 'FeatureCollection', features: [], limitExceeded: true };
        }
      }
    }
    const shapes = [];
    for (const polygon of polygons) {
      const shifted = polygon.map((ring) => ring.map((point) => shift(point, ...offset, east)));
      shapes.push(shifted);
      for (let r = 0; r < polygon.length; r++) {
        const ring = polygon[r];
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i], b = ring[i + 1];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          shapes.push([[a, b, shifted[r][i + 1], shifted[r][i], a]]);
        }
      }
    }
    if (shapes.length) features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: shapes } });
  }
  return { type: 'FeatureCollection', features };
}

const DIRECTIONS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
export function shadowDirection(sun) {
  if (!shadowOffset(sun, 1)) return null;
  const bearing = (sun.azimuth + 180) % 360;
  return { bearing, label: DIRECTIONS[Math.round(bearing / 45) % 8] };
}
