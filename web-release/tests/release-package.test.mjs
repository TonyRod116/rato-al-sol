import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildWeb } from '../scripts/build-web.mjs';

test('release HTML and local module imports resolve within a versioned directory', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rato-web-release-test-'));
  try {
    const first = buildWeb(join(temp, 'first'));
    const second = buildWeb(join(temp, 'second'));
    const html = readFileSync(join(first, 'index.html'), 'utf8');
    const releases = [...html.matchAll(/\.\/releases\/([a-f0-9]{16})\/(app\.mjs|styles\.css|favicon\.svg)/g)];
    assert.equal(releases.length, 3);
    assert.equal(new Set(releases.map((match) => match[1])).size, 1);
    assert.equal(html, readFileSync(join(second, 'index.html'), 'utf8'));
    const releaseRoot = join(first, 'releases', releases[0][1]);
    for (const match of releases) assert.ok(statSync(join(releaseRoot, match[2])).isFile());
    const pending = [join(releaseRoot, 'app.mjs')], visited = new Set();
    while (pending.length) {
      const module = pending.pop();
      if (visited.has(module)) continue;
      visited.add(module);
      const content = readFileSync(module, 'utf8');
      for (const match of content.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const dependency = resolve(dirname(module), match[1].split('?')[0]);
        assert.ok(dependency.startsWith(releaseRoot + sep), `Outside release: ${dependency}`);
        assert.ok(statSync(dependency).isFile());
        pending.push(dependency);
      }
    }
    assert.ok(visited.size > 15);
    assert.deepEqual(readdirSync(first).sort(), ['index.html', 'releases']);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('the web package reads only the required byte ranges for Madrid and Barcelona', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'rato-web-shadow-'));
  try {
    const packageRoot = buildWeb(join(temp, 'web'));
    const [release] = readdirSync(join(packageRoot, 'releases'));
    const module = pathToFileURL(join(packageRoot, 'releases', release, 'shared/web-shadow-data.mjs'));
    const { createWebShadowData } = await import(module.href);
    let reads = 0, transferred = 0;
    const data = createWebShadowData(async (url, options) => {
      const file = fileURLToPath(url);
      if (file.endsWith('.json')) return new Response(readFileSync(file));
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      const bytes = Buffer.alloc(Number(end) - Number(start) + 1);
      const handle = openSync(file, 'r');
      try { assert.equal(readSync(handle, bytes, 0, bytes.length, Number(start)), bytes.length); }
      finally { closeSync(handle); }
      reads++; transferred += bytes.length;
      return new Response(bytes, {
        status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${statSync(file).size}` },
      });
    });
    const madrid = [-3.705, 40.4155, -3.702, 40.418];
    const barcelona = [2.1437, 41.3859, 2.1475, 41.3885];
    assert.equal((await data.get(madrid)).source, 'madrid-local');
    const map = await data.get(barcelona);
    assert.equal(map.source, 'barcelona-local');
    assert.ok(map.features.some((item) => item.properties.height >= 18));
    const beforePan = reads;
    assert.equal((await data.get([barcelona[0] + .0001, ...barcelona.slice(1)])).source, 'barcelona-local');
    assert.equal(reads, beforePan);
    assert.equal((await data.scenes([{ longitude: 2.1453, latitude: 41.38704 }])).source, 'barcelona-local');
    assert.ok(transferred > 0 && transferred < 2_000_000);
    assert.equal(await data.get([0, 0, .003, .003]), null);

    let cancelled = false;
    const unavailable = createWebShadowData(async (url) => url.pathname.endsWith('.json')
      ? new Response(readFileSync(fileURLToPath(url)))
      : new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    await assert.rejects(unavailable.get(madrid), /Invalid shadow byte range/);
    assert.ok(cancelled, 'a server returning a whole city must not be downloaded');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
