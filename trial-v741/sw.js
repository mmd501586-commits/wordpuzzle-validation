// WordPuzzle Service Worker — 离线缓存 app shell
// 升级 app 时改这个版本号即可让所有设备拉取新版（不动用户数据，数据在 localStorage）
importScripts('./audio-index.js');
const CACHE = 'wordpuzzle-v741-trial-20260911';
const ASSETS = [
  './',
  './index.html',
  './round.js',
  './reset-learning.js',
  './learning-clock.js',
  './word-sounds.js',
  './sound-map.js',
  './CMUDICT-LICENSE.txt',
  './audio-index.js',
  './word-sounds.css',
  './iteration.css',
  './version.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  ...AUDIO_WORDS.map(word=>'./audio/'+encodeURIComponent(word)+'.mp3')
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('wordpuzzle-v741-trial-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(cache => cache.match(e.request)).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() => caches.open(CACHE).then(cache => cache.match('./index.html')));
    })
  );
});
