const files = new URL('../shadow-data/', import.meta.url);
const cities = ['madrid', 'barcelona'];

export function createWebShadowData(fetchFile = fetch) {
  let coverage, loading;
  const failedRanges = new Set();

  async function loadFile(file, range = null) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetchFile(new URL(file, files), {
        signal: controller.signal,
        headers: range ? { Range: `bytes=${range}` } : undefined,
      });
      if (!range) {
        if (!response.ok) throw new Error('Shadow index unavailable');
        return await response.json();
      }
      if (response.status !== 206 || !response.headers.get('content-range')?.startsWith(`bytes ${range}/`)) {
        if (response.status === 200) failedRanges.add(file);
        await response.body?.cancel().catch(() => {});
        throw new Error('Invalid shadow byte range');
      }
      return new Uint8Array(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  function readTile(city, offset, length) {
    const file = `${city}.bin`;
    if (failedRanges.has(file) || !Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(length) || length < 1 || length > 1000000) {
      throw new Error('Shadow tile unavailable');
    }
    return loadFile(file, `${offset}-${offset + length - 1}`);
  }

  function ready() {
    loading ??= Promise.all([
      import('./shadow-coverage.mjs'),
      Promise.allSettled(cities.map((city) => loadFile(`${city}.json`))),
    ]).then(([{ createShadowCoverage }, results]) => {
      const indexes = Object.fromEntries(results.flatMap((result, i) =>
        result.status === 'fulfilled' && result.value && typeof result.value === 'object'
          ? [[cities[i], result.value]] : []));
      coverage = createShadowCoverage(indexes, readTile, { parallelReads: 6 });
      return coverage;
    }).catch(() => null);
    return loading;
  }

  return {
    ready,
    has: (bounds) => Boolean(coverage?.has(bounds)),
    get: async (bounds) => (await ready())?.get(bounds) ?? null,
    scenes: async (points) => (await ready())?.scenes(points) ?? null,
  };
}

export const webShadowData = createWebShadowData();
