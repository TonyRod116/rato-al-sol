import { createBuildingShadowBuilder } from '../../frontend/map-shadows.mjs';

// Each batch yields to map gestures and other UI work. Cancelling a stale
// request prevents its result from replacing a newer scene.
export function startShadowGeometry(buildings, sun, area, onComplete, onError) {
  let cancelled = false, timer;
  try {
    const builder = createBuildingShadowBuilder(buildings, sun, area, { maxVertices: 120000, excludeRoofs: true });
    const advance = () => {
      if (cancelled) return;
      try {
        const deadline = Date.now() + 6;
        do {
          if (builder.step(10)) { onComplete(builder.result()); return; }
        } while (Date.now() < deadline);
        timer = setTimeout(advance, 0);
      } catch (error) { if (!cancelled) onError(error); }
    };
    timer = setTimeout(advance, 0);
  } catch (error) { onError(error); }
  return () => { cancelled = true; clearTimeout(timer); };
}
