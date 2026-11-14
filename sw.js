// Работа приложения как значка (PWA): оболочка лежит в памяти устройства.
// Сначала сеть, без сети копия. Данные базы сюда не попадают: их хранит Firebase.
// Хранилище копий общее у всех приложений на xasi88.github.io: удаляем только свои.
const PREFIX = 'otvechayu-';
const CACHE = PREFIX + 'v28';
// Список ведёт проверка tests/sw.test.mjs: новый файл в js/ или css/ без строки здесь роняет тесты
const SHELL = [
  './', 'gost/', 'proba/', 'tablica/', 'css/base.css', 'css/draw.css', 'css/final.css', 'css/guest.css', 'css/host-data.css', 'css/host-home.css',
  'css/host.css', 'css/proba.css', 'css/tablica.css', 'js/ack.js', 'js/bank.js', 'js/commit.js', 'js/config.js', 'js/draw-path.js', 'js/draw.js',
  'js/fb.js', 'js/final.js', 'js/fix.js', 'js/game.js', 'js/guest-ack.js', 'js/guest-link.js', 'js/guest-play.js', 'js/guest-send.js', 'js/guest.js',
  'js/hints.js', 'js/host-data-actions.js', 'js/host-data.js', 'js/host-db.js', 'js/host-final.js', 'js/host-history.js', 'js/host-home.js',
  'js/host-link.js', 'js/host-listen.js', 'js/host-live.js', 'js/host-menu.js', 'js/host-questions.js', 'js/host-ready.js', 'js/host-seasons.js', 'js/host.js',
  'js/pause.js', 'js/public.js', 'js/queue.js', 'js/report.js', 'js/review.js', 'js/rolik.js', 'js/sboi.js', 'js/score.js', 'js/season.js',
  'js/sound.js', 'js/summary.js', 'js/table.js', 'js/tablica.js', 'js/topics-db.js', 'js/touch.js', 'js/ui.js', 'js/undo.js', 'img/icon.svg',
  'img/icon-192.png', 'img/icon-512.png',
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
  // Ролики (rolik/) сюда не попадают: их заранее качает и хранит сам экран гостя (js/rolik.js)
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
