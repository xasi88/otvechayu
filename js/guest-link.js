// Экран гостя: связь с базой пропала (вынесено из guest.js 2026-11-14, предел 20 КБ).
// Связи нет дольше 3 секунд: экран говорит об этом и сам подталкивает базу.
// Раньше красная полоса «Нет связи с ведущим» во весь верх экрана попадала в кадр посреди вопроса.
// Теперь полоса только на экране ожидания («Скоро начнём»). Пока идёт выпуск, вместо неё
// маленький красный значок в левом нижнем углу: ведущий и гость его видят, а кадр он не портит.
import { db, enableNetwork, disableNetwork } from './fb.js';

const bar = document.getElementById('g-link');
const seen = () => document.visibilityState === 'visible';
let live = true;
let timer = null;

// on: снимок пришёл с сервера, а не из памяти устройства
export function showLink(on) {
  live = on;
  clearTimeout(timer);
  if (on) bar.hidden = true;
  else timer = setTimeout(() => { bar.hidden = false; kick(); }, 3000);
}

// mini: идёт выпуск, вместо полосы значок в углу
export function linkMode(mini) {
  bar.classList.toggle('g-link-mini', mini);
}

// Сама база возвращается с растущими паузами, до минуты. Экран подталкивает её: рвёт и сразу
// поднимает связь. Не чаще раза в 5 секунд, пока связи нет, и сразу, когда вернулась сеть
// или экран снова на виду. Касания гостя при этом не теряются
let kicked = 0;
function kick() {
  if (live || bar.hidden || Date.now() - kicked < 5000) return;
  kicked = Date.now();
  disableNetwork(db).then(() => enableNetwork(db)).catch(() => {});
}
setInterval(kick, 5000);
addEventListener('online', kick);
document.addEventListener('visibilitychange', () => seen() && kick());
