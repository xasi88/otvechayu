// Ролики на экране гостя и телевизора (решение автора 2026-11-11): правила игры после приглашения,
// правила суперигры на её заставке, итог перед жребием места. Ролик выбирает ведущий (game.js, VIDEO),
// экран играет его поверх всего. Формат по экрану: лежит 16:9, стоит 9:16, повернули посреди
// ролика: другой файл с той же секунды. Ролик играет только на глазах: после перезагрузки
// экрана его нет, как и жребия. Файла нет или не играет: экран идёт дальше без ролика.
// Звук как у всего экрана: телевизор на связи со звуком, Samsung молчит (guest.js, soundHere).
// Файлы в rolik/ собирает video/rolik-app (render.mjs), в git их нет: тяжёлые
const FILES = {
  pravila: { wide: new URL('../rolik/pravila-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/pravila-9x16.mp4', import.meta.url).href },
  super: { wide: new URL('../rolik/super-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/super-9x16.mp4', import.meta.url).href },
  itog: { wide: new URL('../rolik/itog-16x9.mp4', import.meta.url).href, tall: new URL('../rolik/itog-9x16.mp4', import.meta.url).href },
};
const tall = matchMedia('(orientation: portrait)');

let key = null;     // выпуск и миг ролика: тот же ролик второй раз не начинается
let box = null;     // слой с роликом поверх экрана
let after = [];     // что сделать, когда ролик кончится (жребий места)
let quiet = true;
let seen = false;  // первый вид после загрузки экрана: ролик не начинается

// Звук ролика: false, когда звук этого экрана играет другой экран
export function rolikSound(on) {
  quiet = !on;
  const v = box && box.querySelector('video');
  if (v) v.muted = quiet;
}

// Сейчас идёт ролик: fn ждёт его конца, иначе сразу
export function afterRolik(fn) {
  if (box) after.push(fn);
  else fn();
}

function stop() {
  if (!box) return;
  box.remove();
  box = null;
  tall.removeEventListener('change', turn);
  const fns = after;
  after = [];
  fns.forEach(fn => fn());
}

function src(name) {
  return FILES[name][tall.matches ? 'tall' : 'wide'];
}

// Экран повернули: тот же ролик в другом формате с той же секунды
function turn() {
  const v = box && box.querySelector('video');
  if (!v) return;
  const t = v.currentTime;
  v.src = src(box.dataset.name);
  v.addEventListener('loadedmetadata', () => { v.currentTime = t; v.play().catch(() => {}); }, { once: true });
}

function start(name) {
  stop();
  box = document.createElement('div');
  box.className = 'g-rolik';
  box.dataset.name = name;
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.muted = quiet;
  v.src = src(name);
  v.addEventListener('ended', stop);
  v.addEventListener('error', stop);
  box.append(v);
  document.body.append(box);
  tall.addEventListener('change', turn);
  // Браузер не дал звук без касания: ролик идёт без звука, но идёт
  v.play().catch(() => { v.muted = true; return v.play(); }).catch(stop);
}

// Новый вид гостя из базы
export function rolikSync(s) {
  const live = seen;
  seen = true;
  const v = s.video;
  if (!v || !FILES[v.name]) {
    key = null;
    return stop();
  }
  const k = s.session + '|' + v.at;
  if (k === key) return;
  key = k;
  if (live) start(v.name);
}
