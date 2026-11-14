// Runs after both builds: copies the single-file template into dist/,
// writes dist/sw.js with the list of files to keep offline, and prints sizes.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'dist';
copyFileSync('dist-template/pack-template.html', join(dist, 'pack-template.html'));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(dist)
  .map((path) => '/' + relative(dist, path).split('\\').join('/'))
  .filter((url) => url !== '/sw.js')
  .sort();

// Pages are cached by folder address ("/p/"), which is what the browser asks for.
const urls = files.map((url) => url.replace(/(^|\/)index\.html$/, '$1'));
const version = createHash('sha256')
  .update(files.map((url) => url + readFileSync(join(dist, url)).length).join('|'))
  .digest('hex')
  .slice(0, 10);

const sw = `const CACHE = 'passalong-${version}';
const FILES = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('passalong-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit =
        (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) ||
        (request.mode === 'navigate' && !url.pathname.endsWith('/')
          ? await cache.match(url.pathname + '/', { ignoreVary: true })
          : undefined);
      return hit || fetch(request);
    }),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);

const kb = (n) => (n / 1024).toFixed(1).padStart(6) + ' KB';
console.log('\nSizes (raw / gzip)');
for (const url of files) {
  const bytes = readFileSync(join(dist, url));
  console.log(kb(bytes.length), kb(gzipSync(bytes).length), url);
}
console.log(`\nsw.js keeps ${urls.length} files offline (cache passalong-${version})`);

// Size budget: the empty single-file player must stay small, or the whole idea fails.
const BUDGET_KB = 20;
const templateKb = readFileSync(join(dist, 'pack-template.html')).length / 1024;
if (templateKb > BUDGET_KB) {
  console.error(`\npack-template.html is ${templateKb.toFixed(1)} KB, over the ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
console.log(`pack-template.html is ${templateKb.toFixed(1)} KB (budget ${BUDGET_KB} KB)`);
