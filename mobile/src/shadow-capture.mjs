// Capture callbacks can arrive after a viewport change, or never arrive at
// all if the native SVG view is not in the registry yet. Never deliver a
// result from an obsolete attempt and release any file written after cancel.
export function captureShadow({ capture, write, discard, onReady, onError,
  schedule = setTimeout, unschedule = clearTimeout, timeout = 4000, attempts = 2 }) {
  let stopped = false, active = 0, timer, writing = false;
  function fail(reason) {
    if (stopped) return;
    stopped = true;
    unschedule(timer);
    onError(reason);
  }
  function start() {
    if (stopped) return;
    const id = ++active;
    timer = schedule(() => {
      if (stopped || active !== id || writing) return;
      if (id < attempts) start(); else fail('timeout');
    }, timeout);
    try {
      capture((data) => {
        if (stopped || active !== id || writing) return;
        unschedule(timer);
        if (!data) { fail('raster'); return; }
        writing = true;
        timer = schedule(() => fail('storage_timeout'), timeout);
        Promise.resolve().then(() => write(data)).then((uri) => {
          if (stopped || active !== id) { if (uri) discard(uri); return; }
          if (!uri) { fail('storage'); return; }
          stopped = true;
          unschedule(timer);
          onReady(uri);
        }, () => fail('storage'));
      });
    } catch {
      if (stopped || active !== id || writing) return;
      unschedule(timer);
      if (id < attempts) start(); else fail('raster');
    }
  }
  start();
  return () => { stopped = true; unschedule(timer); };
}
