import { classifyLight, pointInOrOnPolygon, shadowOffset, sunPosition } from '../solar.mjs';
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
  if (sun.altitude < 5) return 'unknown';
  const known = [], uncertain = [];
  for (const building of scene.buildings) {
    if (Number.isFinite(building.height) && building.height > 0) known.push(building);
    else uncertain.push({ ...building, height: 10000 });
  }
  const args = { sun, point: [0, 0], coverage: true };
  const actual = classifyLight({ ...args, buildings: known });
  const missing = classifyLight({ ...args, buildings: uncertain });
  if (actual === 'unknown' || missing === 'unknown') return 'unknown';
  // A known obstruction establishes shade even if the sun is low and there
  // might be additional buildings beyond the area that was retrieved.
  if (actual === 'shade') return 'shade';
  // Sunshine still needs enough surrounding coverage for a 100 m building,
  // plus a margin; a farther obstruction could otherwise be missed.
  const assumedMaximum = Math.max(100, ...scene.buildings.map((building) => building.height || 0));
  if (assumedMaximum / Math.tan(sun.altitude * Math.PI / 180) > (scene.radius ?? 400) - 50) return 'unknown';
  return missing === 'shade' ? 'unknown' : 'sun';
}

export function sceneInsideBuilding(scene) {
  return !!scene?.buildings?.some((building) => pointInOrOnPolygon([0, 0], building.footprint));
}

// A selected point can lie inside a building. Offer several explicitly
// approximate exterior references rather than silently choosing a sidewalk.
export function nearbyOutdoorScenes(scene, buildings) {
  if (!sceneInsideBuilding(scene) || !Array.isArray(buildings)) return [];
  const directions = [
    { direction: 'Norte', east: 0, north: 1 }, { direction: 'Este', east: 1, north: 0 },
    { direction: 'Sur', east: 0, north: -1 }, { direction: 'Oeste', east: -1, north: 0 },
  ];
  const east = METRES_PER_DEGREE * Math.cos(scene.point.latitude * Math.PI / 180);
  const choices = [];
  for (const entry of directions) {
    let outside = false;
    for (let metres = 5; metres <= 40; metres += 5) {
      const point = { latitude: scene.point.latitude + entry.north * metres / METRES_PER_DEGREE,
        longitude: scene.point.longitude + entry.east * metres / east };
      const candidate = prepareScene(point, buildings, scene.radius - metres);
      if (!candidate || sceneInsideBuilding(candidate)) { outside = false; continue; }
      // Leave a small buffer beyond the estimated building outline.
      if (!outside && metres < 40) { outside = true; continue; }
      choices.push({ direction: entry.direction, metres, point, scene: candidate });
      break;
    }
  }
  return choices;
}

export function atMinutes(day, minutes) {
  const date = new Date(day);
  if (!Number.isFinite(date.valueOf()) || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getHours() === Math.floor(minutes / 60) && date.getMinutes() === minutes % 60 ? date : null;
}

export function solarWindows(scene, day, instantAt = atMinutes) {
  if (!scene) return [];
  const result = [];
  // Approximate 30-minute samples; deliberately do not imply exact transitions.
  for (let minutes = 0; minutes < 1440; minutes += 30) {
    const state = lightAt(scene, instantAt(day, minutes));
    const last = result.at(-1);
    if (last?.state === state) last.to = minutes + 30;
    else result.push({ state, from: minutes, to: minutes + 30 });
  }
  return result;
}

// A range matches only when every sampled segment covering it is sunny.
// An absent segment, an unknown state, or a night segment cannot count as sun.
export function sunnyInRange(windows, from, to = from) {
  if (!Array.isArray(windows) || !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= 1440 || to < from || to > 1440) return false;
  const end = to === from ? from + 1 : to;
  let cursor = from;
  for (const segment of windows) {
    if (segment.to <= cursor) continue;
    if (segment.from > cursor || segment.state !== 'sun') return false;
    cursor = Math.min(end, segment.to);
    if (cursor >= end) return true;
  }
  return false;
}

// Return a conservative classification for one moment or a sampled interval.
export function lightForInterval(scene, day, from, to = from, instantAt = atMinutes) {
  if (!scene || !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= 1440 || to < from || to > 1440) return 'unknown';
  if (from === to) return lightAt(scene, instantAt(day, from));
  const windows = solarWindows(scene, day, instantAt);
  const edges = [from, to - 1].map((minute) => lightAt(scene, instantAt(day, minute)));
  if (sunnyInRange(windows, from, to) && edges.every((state) => state === 'sun')) return 'sun';
  const relevant = windows.filter((window) => window.from < to && window.to > from);
  return relevant.some((window) => window.state === 'shade' || window.state === 'night') ||
    edges.some((state) => state === 'shade' || state === 'night') ? 'shade' : 'unknown';
}

export function shadowShapes(buildings, point, instant) {
  if (!validCoordinate(point) || !Array.isArray(buildings)) return [];
  const sun = sunPosition(instant, point.latitude, point.longitude);
  const east = METRES_PER_DEGREE * Math.cos(point.latitude * Math.PI / 180);
  const nearby = buildings.filter((b) => b.height).map((building) => ({ building,
    distance: building.footprint.reduce((min, vertex) => Math.min(min, distanceMetres(point, vertex)), Infinity) }))
    .filter((entry) => entry.distance < 250).sort((a, b) => a.distance - b.distance).slice(0, 45).map((entry) => entry.building);
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
