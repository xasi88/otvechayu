// Где звучит выпуск. Окно гостя в роли «Телевизор» на этом же Surface каждые 2 секунды
// шлёт панели по BroadcastChannel: «я на связи, звук включён». Панель кладёт это в выпуск (ep.tv)
// и в вид гостя (live/state, tv). Телевизор на связи и со звуком: Samsung молчит.
// Телевизора нет или звук на нём не включён: звук играет Samsung (решение автора 2026-10-28).
// Пишет только панель, которая слышит телевизор: панель на другом устройстве ничего не меняет.
import { db, doc, runTransaction } from './fb.js';
import { guestView } from './game.js';

const ALIVE = 6000;  // без вести от телевизора дольше 6 секунд: телевизора нет
let last = 0;        // когда телевизор последний раз сказал «на связи со звуком»
let heard = false;   // эта панель хоть раз слышала окно телевизора
let on = false;
let ep;              // выпуск из базы (live/host), null: выпуска нет
let prep;            // что эта панель записала в вид гостя без выпуска
let busy = false;
let onChange = () => {};

export const tvOn = () => on;

export function watchTv(cb) {
  onChange = cb;
  if (!window.BroadcastChannel) return;
  new BroadcastChannel('otvechayu-tv').onmessage = e => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;  // строка 'off' идёт окну телевизора, не панели
    heard = true;
    last = m.tv && m.sound ? Date.now() : 0;
    check();
  };
  setInterval(check, 2000);
}

function check() {
  const now = Date.now() - last < ALIVE;
  if (now !== on) {
    on = now;
    onChange(on);
  }
  sync();
}

// Новый вид выпуска из базы. Выпуск закрыли: вид гостя снова без отметки, её надо записать
export function tvSeen(e) {
  if (!e && ep) prep = undefined;
  ep = e || null;
  sync();
}

// Отметка в базе расходится с тем, что слышит панель: одна транзакция её правит.
// Выпуск есть: ep.tv, и его копируют все панели. Выпуска нет: только вид гостя
async function sync() {
  if (!heard || busy || ep === undefined) return;
  if (ep ? !!ep.tv === on : prep === on) return;
  busy = true;
  const want = on;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'live', 'host');
      const cur = ((await tx.get(ref)).data() || {}).ep || null;
      if (cur) {
        cur.tv = want;
        tx.set(ref, { ep: cur });
      }
      tx.set(doc(db, 'live', 'state'), cur ? guestView(cur) : { ...guestView(null), tv: want });
      if (!cur) prep = want;
    });
  } catch { /* следующая проверка через 2 секунды повторит */ }
  busy = false;
}
