// Ролики на экране гостя (решение автора 2026-11-11): правила игры после приглашения,
// правила суперигры на её заставке, итог перед жребием места. Ролик выбирает ведущий (game.js, VIDEO),
// экран играет его поверх всего. Формат по экрану: лежит 16:9, стоит 9:16, повернули посреди
// ролика: другой файл с той же секунды. Ролик играет только на глазах: после перезагрузки
// экрана его нет, как и жребия. Файла нет или не играет: экран идёт дальше без ролика.
// Файлы в rolik/ собирает video/obyasnenie/render.mjs, в git их нет: тяжёлые.
//
// Память устройства (жалоба автора 2026-11-13: ролики грузились туго и зависали). Файл весит
// около 15 МБ. Раньше он качался в миг показа, по тому же Wi-Fi, что и выпуск. Теперь экран гостя
// качает три ролика своего формата заранее, по одному, пока выпуска нет (warm), и хранит их
// в памяти устройства (Cache API). Показ идёт из памяти. Ролика в памяти нет: он идёт из сети,
// как раньше. Сторож: ролик стоит на месте 8 секунд, экран идёт дальше без него
const FILES = {
  pravila: { wide: new URL('../rolik/pravila-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/pravila-9x16.mp4', import.meta.url).href },
  super: { wide: new URL('../rolik/super-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/super-9x16.mp4', import.meta.url).href },
  itog: { wide: new URL('../rolik/itog-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/itog-9x16.mp4', import.meta.url).href },
};
// Имя не с «otvechayu-»: sw.js при новой версии удаляет такие копии, а ролики должны остаться
const STORE = 'rolik-otvechayu';
const STUCK = 8000;
const tall = matchMedia('(orientation: portrait)');

let key = null;     // выпуск и миг ролика: тот же ролик второй раз не начинается
let box = null;     // слой с роликом поверх экрана
let after = [];     // что сделать, когда ролик кончится (жребий места)
let seen = false;   // первый вид после загрузки экрана: ролик не начинается
let guard = null;   // сторож зависшего ролика
let blobUrl = null;

// Сейчас идёт ролик: fn ждёт его конца, иначе сразу
export function afterRolik(fn) {
  if (box) after.push(fn);
  else fn();
}

function src(name) {
  return FILES[name][tall.matches ? 'tall' : 'wide'];
}

// ---------- память устройства ----------

let calm = false;      // выпуска нет или он не начался: можно качать
let loading = null;    // идёт загрузка: её можно оборвать
let ready = 0;         // сколько роликов этого формата уже в памяти
let onReady = () => {};
const open = () => (window.caches ? caches.open(STORE) : Promise.reject(new Error('no cache')));
const stampOf = r => (r ? r.headers.get('etag') || r.headers.get('last-modified') || '' : '');

// Подпись под «Скоро начнём»: ведущий видит, что ролики уже на устройстве
export const rolikReady = () => (ready >= 3 ? 'Ролики готовы' : `Ролики загружаются: ${ready} из 3`);
export function watchRolik(cb) { onReady = cb; }

// Качает ролики этого формата по одному. Файл на сайте поменялся (другая метка): качает заново.
// Начался выпуск: загрузка обрывается и не мешает вопросам, после выпуска продолжается
async function warm() {
  if (loading || !calm || box) return;
  const stop = loading = new AbortController();
  try {
    const store = await open();
    let n = 0;
    for (const name of Object.keys(FILES)) {
      const url = src(name);
      const have = await store.match(url);
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: stop.signal }).catch(() => null);
      if (stop.signal.aborted) return;
      // Нет сети: верим тому, что уже лежит в памяти
      const same = have && (!head || !head.ok || stampOf(head) === stampOf(have));
      if (!same) {
        const res = await fetch(url, { cache: 'no-store', signal: stop.signal });
        if (!res.ok) continue;
        await store.put(url, res);
      }
      ready = ++n;
      onReady();
    }
  } catch { /* нет сети или памяти: ролик пойдёт из сети, как раньше */ }
  finally { if (loading === stop) loading = null; }
}

// Ролик из памяти устройства: адрес для <video>. Нет в памяти: адрес сайта
async function local(name) {
  try {
    const res = await (await open()).match(src(name));
    if (res) return URL.createObjectURL(await res.blob());
  } catch { /* памяти нет */ }
  return null;
}

// ---------- показ ----------

function stop() {
  clearInterval(guard);
  if (!box) return;
  // Загрузку ролика надо оборвать: убранный с экрана <video> иначе качает файл дальше
  const v = box.querySelector('video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
  box.remove();
  box = null;
  tall.removeEventListener('change', turn);
  removeEventListener('resize', fit);
  const fns = after;
  after = [];
  fns.forEach(fn => fn());
  // Ролик ушёл с экрана: добираем в память, чего в ней нет
  setTimeout(warm, 0);
}

// Ролик по размеру экрана (жалоба автора 2026-11-12: телефон боком и телевизор показывали
// тёмные полосы). Ролик растёт не больше чем на 5 %: заголовки и подписи у краёв не режутся.
// Поля вокруг: тот же синий с точками, что в ролике (video/obyasnenie/film.html, #dots: шаг 48, точка 3.5)
const GROW = 1.05;
function fit() {
  const v = box && box.querySelector('video');
  if (!v || !v.videoWidth) return;
  const W = innerWidth, H = innerHeight, vw = v.videoWidth, vh = v.videoHeight;
  const k = Math.min(Math.max(W / vw, H / vh), Math.min(W / vw, H / vh) * GROW);
  const w = vw * k, h = vh * k, x = (W - w) / 2, y = (H - h) / 2, d = 48 * k;
  v.style.width = w + 'px';
  v.style.height = h + 'px';
  box.style.backgroundSize = d + 'px ' + d + 'px';
  box.style.backgroundPosition = (x - d / 2) + 'px ' + (y - d / 2) + 'px';
}

// Файл в <video>: из памяти устройства, иначе с сайта. at: с какой секунды
async function load(v, name, at = 0) {
  const mine = box;
  const url = await local(name);
  if (box !== mine) { if (url) URL.revokeObjectURL(url); return; }  // ролик уже убрали
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = url;
  v.src = url || src(name);
  if (at) v.addEventListener('loadedmetadata', () => { v.currentTime = at; }, { once: true });
  // Браузер не дал звук без касания: ролик идёт без звука, но идёт
  v.play().catch(() => { v.muted = true; return v.play(); }).catch(() => box === mine && stop());
}

// Экран повернули: тот же ролик в другом формате с той же секунды
function turn() {
  const v = box && box.querySelector('video');
  if (v) load(v, box.dataset.name, v.currentTime);
}

function start(name) {
  stop();
  // Ролику из сети нужен весь канал: загрузка в память подождёт его конца
  if (loading) loading.abort();
  box = document.createElement('div');
  box.className = 'g-rolik';
  box.dataset.name = name;
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.addEventListener('loadedmetadata', fit);
  v.addEventListener('ended', stop);
  v.addEventListener('error', stop);
  box.append(v);
  document.body.append(box);
  tall.addEventListener('change', turn);
  addEventListener('resize', fit);
  // Сторож: секунда ролика не меняется 8 секунд (слабая сеть), экран идёт дальше без ролика
  let was = -1, since = Date.now();
  guard = setInterval(() => {
    if (v.currentTime !== was) { was = v.currentTime; since = Date.now(); }
    else if (Date.now() - since > STUCK) stop();
  }, 1000);
  load(v, name);
}

// Новый вид гостя из базы
export function rolikSync(s) {
  const live = seen;
  seen = true;
  // Качать можно до выпуска, на приглашении и после итога: вопросам загрузка не мешает
  calm = !s.phase || s.phase === 'prep' || s.phase === 'invite' || s.phase === 'result';
  if (!calm && loading) loading.abort();
  // Пока ролик на экране, загрузку не начинаем: если он идёт из сети, ей нужен весь канал
  const v = s.video;
  if (!v || !FILES[v.name]) {
    key = null;
    stop();
    return void warm();
  }
  const k = s.session + '|' + v.at;
  if (k === key) return;
  key = k;
  if (live) start(v.name);
  else warm();
}

// Экран повернули: нужны ролики другого формата
tall.addEventListener('change', () => { ready = 0; if (loading) loading.abort(); setTimeout(warm, 500); });
