// オフラインでも動くように、アプリのファイルをiPhoneにしまっておく係
// ファイルを直したら VERSION の数字を上げる(新しいものに入れかわる)
const VERSION = 'v2.1.0';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './core.js',
  './patient.js',
  './stage2.js',
  './avatar.js',
  './stroke.js',
  './strokeui.js',
  './db.js',
  './dates.js',
  './logic.js',
  './messages.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// ネットがつながれば新しいものを使い、つながらなければしまってあるものを使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
