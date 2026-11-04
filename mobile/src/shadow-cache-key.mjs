// The digest covers all provider geometry and attributes, plus rendering
// parameters. A changed building must never reuse an older rendered mask.
const signatures = new WeakMap();
function digest() {
  const state = [2166136261, 2246822519, 3266489917, 668265263];
  const primes = [16777619, 2246822519, 3266489917, 668265263];
  return {
    add(value) {
      const text = `${value}\u0000`;
      for (let i = 0; i < text.length; i++) for (let j = 0; j < state.length; j++) {
        state[j] = Math.imul(state[j] ^ text.charCodeAt(i), primes[j]);
      }
    },
    value() { return state.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join(''); },
  };
}

// Bound uninterrupted work so even a dense provider response remains
// responsive. The result is memoized only after a complete, uncancelled pass.
export async function geometrySignature(buildings, cancelled = () => false, yieldWork = () => new Promise((resolve) => setTimeout(resolve, 0))) {
  if (!buildings || !Array.isArray(buildings.features)) return null;
  if (signatures.has(buildings)) return signatures.get(buildings);
  const hash = digest();
  const { features } = buildings;
  // Fixed field order makes equivalent geometry loaded from disk match even
  // when object properties were reconstructed in a different order.
  hash.add(JSON.stringify([buildings.source, buildings.bounds, buildings.fetchedAt, buildings.omitted, features.length]));
  for (let i = 0; i < features.length; i++) {
    if (cancelled()) return null;
    const feature = features[i], geometry = feature?.geometry, properties = feature?.properties;
    hash.add(JSON.stringify([properties?.id, properties?.height, geometry?.type, geometry?.coordinates]));
    if (i % 20 === 19) await yieldWork();
  }
  if (cancelled()) return null;
  const value = hash.value();
  signatures.set(buildings, value);
  return value;
}

export function renderedShadowKey(signature, { area, latitude, longitude, timeKey }) {
  if (!signature || !Array.isArray(area) || area.length !== 4 || !area.every(Number.isFinite) ||
      ![latitude, longitude, timeKey].every(Number.isFinite)) return null;
  const hash = digest();
  hash.add(JSON.stringify({ area, latitude, longitude, timeKey }));
  return `mask-v10-${signature}-${hash.value()}`;
}

export function localFrameDay(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local calendar arithmetic handles daylight-saving transitions correctly.
export function millisecondsUntilNextDay(date) {
  const midnight = new Date(date);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - date.getTime());
}
