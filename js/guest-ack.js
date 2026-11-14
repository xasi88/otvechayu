// Экран гостя: подтверждение вида для панели, секунды событий по часам планшета.
// Секундомер над вопросом: pause.js.
// Вынесено из guest.js (предел 20 КБ). Что и зачем: ack.js.
//
// Секунды по часам планшета (2026-11-14). Журнал монтажа раньше писал только время панели:
// «показ» стоял по касанию ведущего, а на экране гостя вопрос появлялся позже на задержку сети.
// Наклейка на монтаже вставала раньше кадра. Теперь планшет сам отмечает, на какой секунде
// от касания «Отвечаю» он показал вопрос, принял касание ответа, открыл ответ и показал итог.
// Касание «Отвечаю» видно на записи: это секунда 0, и сеть в этих секундах не участвует.
// Ноль и отметки лежат в памяти планшета: перезагрузка экрана их не стирает.
import { auth } from './fb.js';
import { put } from './guest-send.js';
import { viewKey } from './ack.js';
import { audible } from './sound.js';
import { rolikCount } from './rolik.js';

const KEY = 'otvechayu-zero';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
const store = () => {
  try { localStorage.setItem(KEY, JSON.stringify(zero)); } catch { /* памяти нет: отметки живут до перезагрузки */ }
};
let zero = load();  // { session, at: миг касания «Отвечаю», marks: { событие: секунда } }

// Гость нажал «Отвечаю»: секунда 0 выпуска
export function tapZero(session) {
  zero = { session, at: Date.now(), marks: { start: 0 } };
  store();
}

// Событие на экране: show:4 (вопрос 5 показан), opts:4 (варианты выехали после паузы на чтение),
// pick:4 (касание ответа), reveal:4, result
export function mark(session, key) {
  if (!zero || zero.session !== session) return;
  zero.marks[key] = Math.round((Date.now() - zero.at) / 100) / 10;
  store();
}

// Заряд планшета для экрана готовности у ведущего. Браузер его не даёт: null
let battery = null;
if (navigator.getBattery) {
  navigator.getBattery().then(b => {
    const set = () => { battery = Math.round(b.level * 100); };
    set();
    b.addEventListener('levelchange', set);
  }).catch(() => {});
}

// Подтверждение уходит, только когда в нём что-то поменялось. База его не приняла
// (правила базы ещё старые или экран не привязан к этому выпуску): в этом выпуске больше не шлём,
// касания гостя идут как раньше
let off = null;
let sent = '';
export function sendAck(state) {
  const session = state.session || null;
  if (off === (session || 'prep') || !auth.currentUser) return;
  const text = JSON.stringify({
    session, key: viewKey(state), rolik: rolikCount(), sound: audible(), battery,
    ...(zero && zero.session === session ? { marks: zero.marks } : {}),
  });
  if (text === sent) return;
  sent = text;
  put({ view: text }).catch(err => {
    sent = '';
    if (err.code === 'permission-denied') off = session || 'prep';
  });
}
