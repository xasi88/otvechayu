// Запись выпуска в базу. Каждое действие ведущего и каждое касание гостя идёт одной транзакцией:
// выпуск (live/host), вид гостя (live/state), журнал (episodes), карточка участника.
// Показанный гостю вопрос сгорает в банке (bank.js, markUsed) и больше не выпадает. Отметки идут
// одной записью на тему после «Итога» (burn), а не после каждого вопроса: тема весит около 200 КБ,
// и её запись посреди выпуска делила слабый Wi-Fi с записью выпуска (зависания гостя, 2026-11-14).
// В конце выпуска в него ложится турнирная таблица: её видит гость, она остаётся в «Истории».
// Вне конкурса и в пробе таблица тоже считается (гость в ней на своём месте, для жребия), но никуда не пишется.
// Выпуск вне конкурса не сжигает вопросы конкурса и не пишет ни в участников, ни в «Историю»:
// показанный вопрос только уходит в конец круга вне конкурса (bank.js, markOff).
// Две открытые панели не примут одно касание дважды: вторая увидит, что оно уже принято.
import { db, doc, runTransaction } from './fb.js';
import { guestView, addToPlayer, removeFromPlayer, standings, guestTable, GameError } from './game.js';
import { markUsed, markOff, release } from './bank.js';
import { toast } from './ui.js';
import { sboi } from './sboi.js';

const fail = err => {
  sboi('fail', { code: String(err.code || err.message) });
  toast('Не сохранилось: ' + (err.code || err.message));
};

// Карточка участника, если выпуск закончен сейчас: её транзакция тоже пишет
const playerOf = ep => (!ep.trial && ep.finished && !ep.counted && ep.playerId ? doc(db, 'players', ep.playerId) : null);

// Пробный ход по выпуску из базы (S.base, host.js): нужна ли карточка участника. Её транзакция читает
// вместе с выпуском, одним обменом с базой. Догадка не сбылась: транзакция дочитает сама
function guess(S, fn) {
  if (!S.base) return [];
  const dry = structuredClone(S.base);
  try { fn(dry); } catch { return []; }
  return [playerOf(dry)].filter(Boolean);
}

// fn: действие над выпуском (game.js, act). n: касание гостя, по нему касание принимается один раз.
// id: номер действия ведущего (host.js, run): по hostN экран видит, что действие уже в базе.
// Вернёт 'done' (записано), 'no' (база не приняла) или false: подвела связь, касание можно принять снова
// В журнал сбоев (sboi.js): время сохранения и число попыток транзакции
export async function change(S, fn, n = null, id = null) {
  const t0 = performance.now();
  const box = { tries: 0 };
  const res = await save(S, fn, n, id, box);
  sboi('save', { ms: Math.round(performance.now() - t0), tries: box.tries, res, guest: !!n });
  return res;
}

async function save(S, fn, n, id, box) {
  const hostRef = doc(db, 'live', 'host');
  const pre = guess(S, fn);
  let after = null;
  try {
    await runTransaction(db, async tx => {
      box.tries++;
      // Все чтения до первой записи: так требует транзакция Firestore
      const [snap, ...got] = await Promise.all([tx.get(hostRef), ...pre.map(r => tx.get(r))]);
      const ready = new Map(pre.map((r, i) => [r.path, got[i]]));
      const ep = (snap.data() || {}).ep;
      if (!ep) throw new GameError('Выпуска нет');
      if (n && ep.lastN === n) throw new GameError('');
      fn(ep);
      if (n) ep.lastN = n;
      if (id) ep.hostN = id;
      const ref = playerOf(ep);
      const player = ref ? await (ready.get(ref.path) || tx.get(ref)) : null;
      if (ep.finished && !ep.counted) {
        ep.counted = true;
        const past = S.episodes.filter(e => e.playerId === ep.playerId && e.finished && e.id !== ep.id);
        const card = addToPlayer(player && player.exists() ? player.data() : null, ep, past);
        if (ref) tx.set(ref, card);
        const others = S.players.filter(pl => pl.id !== ep.playerId);
        ep.table = guestTable(standings([...others, { id: ep.playerId, ...card }], S.episodes), ep.playerId);
      }
      tx.set(hostRef, { ep });
      tx.set(doc(db, 'live', 'state'), guestView(ep));
      // Копию в «Истории» пишут «Открыть ответ», «Итог» и жребий, а не каждое действие (20 КБ):
      // выпуск целиком лежит в live/host, панель после сбоя продолжит с него
      if (ep.start && !ep.trial && !n && (ep.phase === 'reveal' || ep.finished)) tx.set(doc(db, 'episodes', ep.id), ep);
      after = ep;
    });
  } catch (err) {
    if (!(err instanceof GameError)) {
      fail(err);
      return false;
    }
    if (!n && err.message) toast(err.message);  // касания гостя без всплывающих ошибок
    return 'no';
  }
  burn(S, after);
  return 'done';
}

// Сгорание показанных вопросов: вопрос, который гость увидел (ответил, заменил или видел в конце),
// получает в банке used (вне конкурса off) с кодом выпуска. Отметки идут после «Итога», одной
// транзакцией на тему. Пока выпуск идёт, его вопросы никому не выпадут: новый выпуск не начать.
// Панель сверяет законченный выпуск и три последних выпуска «Истории» с банком при каждом
// новом виде из базы: пропала связь или закрылось окно, отметку допишет следующая сверка
const burning = new Set();  // отметки в пути или уже в базе: второй раз не пишем
export function burn(S, ep) {
  if (!ep || !ep.finished || !ep.questions || !ep.questions.length) return;
  const field = ep.trial ? 'off' : 'used';
  // Замена для ответа вслух (aloud): гость прежний вопрос не видел, он не сгорает
  const ids = (ep.answers || []).map(a => a.id).concat((ep.swapped || []).filter(s => !s.aloud).map(s => s.id));
  if (ep.shown && ep.questions[ep.index]) ids.push(ep.questions[ep.index].id);
  const todo = {};
  for (const id of ids) {
    const key = ep.id + '/' + id;
    const t = S.topics.find(x => (x.questions || []).some(q => q.id === id));
    if (!t || burning.has(key) || t.questions.find(q => q.id === id)[field] === ep.id) continue;
    burning.add(key);
    (todo[t.id] = todo[t.id] || []).push(id);
  }
  for (const [topic, list] of Object.entries(todo)) {
    const ref = doc(db, 'topics', topic);
    runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const t = snap.data();
      const mark = (qs, id) => (ep.trial ? markOff : markUsed)(qs, id, ep.id);
      tx.set(ref, { ...t, questions: list.reduce(mark, t.questions || []) });
    }).catch(() => list.forEach(id => burning.delete(ep.id + '/' + id)));
  }
}

// Новый выпуск. Другая панель уже начала свой: этот не начинается
export async function open(ep) {
  try {
    await runTransaction(db, async tx => {
      const hostRef = doc(db, 'live', 'host');
      const cur = ((await tx.get(hostRef)).data() || {}).ep;
      if (cur && !cur.finished) throw new GameError('Выпуск уже идёт');
      tx.set(hostRef, { ep });
      tx.set(doc(db, 'live', 'state'), guestView(ep));
    });
  } catch (err) {
    if (err instanceof GameError) toast(err.message); else fail(err);
  }
}

// Закрыть выпуск. Отменённый до вопросов (приглашение, выбор тем) уходит и из «Истории»:
// вопросов гость ещё не видел, пустой выпуск «0 из 0» там не нужен
export async function close() {
  try {
    await runTransaction(db, async tx => {
      const hostRef = doc(db, 'live', 'host');
      const ep = ((await tx.get(hostRef)).data() || {}).ep;
      if (ep && !ep.finished && (ep.phase === 'invite' || ep.phase === 'topics')) tx.delete(doc(db, 'episodes', ep.id));
      tx.set(hostRef, { ep: null });
      tx.set(doc(db, 'live', 'state'), guestView(null));
    });
  } catch (err) {
    fail(err);
  }
}

// Удаление выпуска из «Истории» одной транзакцией: итог уходит из карточки участника,
// вопросы выпуска снова в запасе (решения автора 2026-10-28).
export async function drop(S, id) {
  const ep = S.episodes.find(e => e.id === id);
  if (!ep) return;
  const rest = S.episodes.filter(e => e.playerId === ep.playerId && e.finished && e.id !== id);
  const refs = S.topics.filter(t => (t.questions || []).some(q => q.used === id)).map(t => doc(db, 'topics', t.id));
  try {
    await runTransaction(db, async tx => {
      const playerRef = doc(db, 'players', ep.playerId);
      const [player, ...topics] = await Promise.all([ep.counted ? tx.get(playerRef) : null, ...refs.map(r => tx.get(r))]);
      if (player && player.exists()) tx.set(playerRef, removeFromPlayer(player.data(), ep, rest));
      topics.forEach(t => t.exists() && tx.set(t.ref, { ...t.data(), questions: release(t.data().questions || [], id) }));
      tx.delete(doc(db, 'episodes', id));
    });
  } catch (err) {
    toast('Не удалилось: ' + (err.code || err.message));
  }
}
