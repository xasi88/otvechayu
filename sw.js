// Работа приложения как значка (PWA): оболочка лежит в памяти устройства.
// Сначала сеть, без сети копия. Данные базы сюда не попадают: их хранит Firebase.
// Хранилище копий общее у всех приложений на xasi88.github.io: удаляем только свои.
const PREFIX = 'otvechayu-';
const CACHE = PREFIX + 'v23';
const SHELL = [
  './', 'gost/', 'proba/', 'css/base.css', 'css/host.css', 'css/host-data.css', 'css/host-home.css', 'css/guest.css', 'css/final.css', 'css/draw.css', 'css/proba.css',
  'js/ui.js', 'js/fb.js', 'js/config.js', 'js/game.js', 'js/host.js', 'js/host-live.js', 'js/host-home.js', 'js/host-final.js',
  'js/host-data.js', 'js/host-history.js', 'js/report.js', 'js/host-menu.js', 'js/host-questions.js', 'js/host-db.js', 'js/tv.js',
  'js/guest.js', 'js/guest-play.js', 'js/hints.js', 'js/final.js', 'js/touch.js', 'js/draw.js', 'js/draw-path.js', 'js/rolik.js', 'js/table.js', 'js/sound.js', 'js/bank.js', 'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png',
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
  // Ролики (rolik/) браузер берёт кусками: их не копируем, они идут прямо из сети
  if (url.pathname.includes('/rolik/')) return;
  // no-cache: браузер сверяет файл с сервером, и после выкладки новые файлы не смешиваются со старыми
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(res => {
      // Копию держим только целого файла: страница с ошибкой без сети не нужна
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request)));
});
