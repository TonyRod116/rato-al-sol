import { classifyLight, shadowOffset, sunPosition } from '../../frontend/solar.mjs';
import { distanceMetres, validCoordinate } from './places.mjs';

const METRES_PER_DEGREE = 111319.49079327358;
export function prepareScene(point, buildings, radius = 400) {
  if (!validCoordinate(point) || !Array.isArray(buildings) || !buildings.length) return null;
  if (!Number.isFinite(radius) || radius < 100) return null;
  const east = METRES_PER_DEGREE * Math.cos(point.latitude * Math.PI / 180);
  const scene = [];
  for (const b of buildings) {
    if (!Array.isArray(b.footprint) || b.footprint.length < 4 || !b.footprint.every(validCoordinate)) return null;
    const footprint = b.footprint.map((p) => [(p.longitude - point.longitude) * east, (point.latitude - p.latitude) * METRES_PER_DEGREE]);
    const xs = footprint.map((p) => p[0]), ys = footprint.map((p) => p[1]);
    // Keep large footprints that surround the point even if their vertices are far away.
    const encompasses = Math.min(...xs) <= 0 && Math.max(...xs) >= 0 && Math.min(...ys) <= 0 && Math.max(...ys) >= 0;
    if (!encompasses && !footprint.some(([x, y]) => x * x + y * y < (radius + 30) ** 2)) continue;
    scene.push({ footprint, height: b.height, heightSource: b.heightSource });
  }
  return scene.length ? { point, buildings: scene, radius } : null;
}

export function lightAt(scene, instant) {
  if (!scene) return 'unknown';
  const sun = sunPosition(instant, scene.point.latitude, scene.point.longitude);
  if (!sun) return 'unknown';
  if (sun.altitude < -1) return 'night';
  // Leave room for a 100 m building and a margin. Low sun can
  // cast longer shadows from outside the retrieved area, so it stays unknown.
  const assumedMaximum = Math.max(100, ...scene.buildings.map((building) => building.height || 0));
  if (sun.altitude < 5 || assumedMaximum / Math.tan(sun.altitude * Math.PI / 180) > (scene.radius ?? 400) - 50) return 'unknown';
  const known = [], uncertain = [];
  for (const building of scene.buildings) {
    if (Number.isFinite(building.height) && building.height > 0) known.push(building);
    else uncertain.push({ ...building, height: 10000 });
  }
  const args = { sun, point: [0, 0], coverage: true };
  const actual = classifyLight({ ...args, buildings: known });
  const missing = classifyLight({ ...args, buildings: uncertain });
  if (actual === 'unknown' || missing === 'unknown') return 'unknown';
  if (actual === 'shade') return 'shade';
  return missing === 'shade' ? 'unknown' : 'sun';
}

export function atMinutes(day, minutes) {
  const date = new Date(day);
  if (!Number.isFinite(date.valueOf()) || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getHours() === Math.floor(minutes / 60) && date.getMinutes() === minutes % 60 ? date : null;
}

export function solarWindows(scene, day) {
  if (!scene) return [];
  const result = [];
  // Approximate 30-minute samples; deliberately do not imply exact transitions.
  for (let minutes = 0; minutes < 1440; minutes += 30) {
    const state = lightAt(scene, atMinutes(day, minutes));
    const last = result.at(-1);
    if (last?.state === state) last.to = minutes + 30;
    else result.push({ state, from: minutes, to: minutes + 30 });
  }
  return result;
}

export function shadowShapes(buildings, point, instant) {
  if (!validCoordinate(point) || !Array.isArray(buildings)) return [];
  const sun = sunPosition(instant, point.latitude, point.longitude);
  const east = METRES_PER_DEGREE * Math.cos(point.latitude * Math.PI / 180);
  const nearby = buildings.filter((b) => b.height && b.footprint.some((p) => distanceMetres(point, p) < 250)).slice(0, 45);
  const shapes = [];
  for (const building of nearby) {
    const offset = shadowOffset(sun, building.height);
    if (!offset) continue;
    const roof = building.footprint.map((p) => ({ latitude: p.latitude - offset[1] / METRES_PER_DEGREE, longitude: p.longitude + offset[0] / east }));
    shapes.push(roof);
    for (let i = 0; i < building.footprint.length - 1; i++) {
      shapes.push([building.footprint[i], building.footprint[i + 1], roof[i + 1], roof[i]]);
    }
  }
  return shapes.slice(0, 300);
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
