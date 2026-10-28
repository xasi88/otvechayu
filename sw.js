// Работа приложения как значка (PWA): оболочка лежит в памяти устройства.
// Сначала сеть, без сети копия. Данные базы сюда не попадают: их хранит Firebase.
// Хранилище копий общее у всех приложений на xasi88.github.io: удаляем только свои.
const PREFIX = 'otvechayu-';
const CACHE = PREFIX + 'v3';
const SHELL = [
  './', 'gost/', 'css/base.css', 'css/host.css', 'css/host-data.css', 'css/guest.css',
  'js/ui.js', 'js/fb.js', 'js/config.js', 'js/game.js', 'js/host.js', 'js/host-live.js',
  'js/host-data.js', 'js/guest.js', 'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })
    .catch(() => caches.match(e.request)));
});
