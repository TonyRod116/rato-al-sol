import { createLightAtBuilder } from '../../frontend/shared/estimate.mjs';

// Yield between groups so dense scenes do not monopolize the UI thread.
export function startLightAtTask(scene, instant, onReady, onError, {
  schedule = setTimeout, unschedule = clearTimeout, now = Date.now,
} = {}) {
  let cancelled = false, timer;
  try {
    const builder = createLightAtBuilder(scene, instant);
    const advance = () => {
      if (cancelled) return;
      try {
        const deadline = now() + 6;
        do {
          if (builder.step(10)) { onReady(builder.result()); return; }
        } while (now() < deadline);
        timer = schedule(advance, 0);
      } catch (error) { if (!cancelled) onError(error); }
    };
    timer = schedule(advance, 0);
  } catch (error) { onError(error); }
  return () => { cancelled = true; unschedule(timer); };
}
