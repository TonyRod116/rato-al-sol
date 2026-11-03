import { shadowOffset } from './solar.mjs';
import { AYALA_CENTER } from './madrid-buildings.mjs';

// Local metres-per-degree approximation is suitable for this small fixed area.
const METRES_PER_DEGREE = 111319.49079327358;
const EAST_PER_DEGREE = METRES_PER_DEGREE * Math.cos(AYALA_CENTER.lat * Math.PI / 180);
const shift = (point, dx, dy) => [point[0] + dx / EAST_PER_DEGREE, point[1] - dy / METRES_PER_DEGREE];

// Sweep each boundary, including courtyard boundaries, and the translated roof.
// Geometry remains a visual estimate; it is not used to classify a terrace.
export function buildingShadows(buildings, sun) {
  const features = [];
  for (const building of buildings?.features ?? []) {
    const offset = shadowOffset(sun, building.properties.height);
    if (!offset) continue;
    const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
    const shapes = [];
    for (const polygon of polygons) {
      const shifted = polygon.map((ring) => ring.map((point) => shift(point, ...offset)));
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
