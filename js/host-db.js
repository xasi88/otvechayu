// Запись выпуска в базу. Каждое действие ведущего и каждое касание гостя идёт одной транзакцией:
// выпуск (live/host), вид гостя (live/state), копия в «Историю» (episodes).
// Что меняется в выпуске и что писать, решает commit.js: его проверяют тесты без базы.
// Показанный гостю вопрос сгорает в банке (bank.js, markUsed) и больше не выпадает. Отметки идут
// одной записью на тему после «Итога» (burn), а не после каждого вопроса: тема весит около 200 КБ,
// и её запись посреди выпуска делила слабый Wi-Fi с записью выпуска (зависания гостя, 2026-11-14).
// Турнирная таблица считается из выпусков «Истории» (table.js), карточек участников в базе больше нет.
// Выпуск вне конкурса не сжигает вопросы конкурса и не пишет в «Историю»:
// показанный вопрос только уходит в конец круга вне конкурса (bank.js, markOff).
// Две открытые панели не примут одно касание дважды: вторая увидит, что оно уже принято.
// У выпуска в «Истории» два документа: полный (episodes) и короткая сводка (sums, summary.js).
import { db, doc, runTransaction, setDoc, deleteDoc } from './fb.js';
import { guestView, GameError } from './game.js';
import { markUsed, markOff, markDoubt, release } from './bank.js';
import { summaryOf, stored, burnIds } from './summary.js';
import { commit } from './commit.js';
import { marksOf } from './ack.js';
import { fixAnswer } from './fix.js';
import { toast } from './ui.js';
import { sboi } from './sboi.js';

const fail = (err, quiet) => {
  sboi('fail', { code: String(err.code || err.message) });
  if (!quiet) toast('Не сохранилось: ' + (err.code || err.message));
};

// fn: действие над выпуском (game.js, act). n: касание гостя, по нему касание принимается один раз.
// id: номер действия ведущего (queue.js): по hostN экран видит, что действие уже в базе.
// again: повтор после сбоя связи, без всплывающей ошибки (её показывает метка в полосе).
// Вернёт 'done' (записано), 'no' (база не приняла) или false: подвела связь, очередь пошлёт снова.
// В журнал сбоев (sboi.js): время сохранения и число попыток транзакции
export async function change(S, fn, n = null, id = null, again = false) {
  const t0 = performance.now();
  const box = { tries: 0 };
  const res = await save(S, fn, n, id, again, box);
  sboi('save', { ms: Math.round(performance.now() - t0), tries: box.tries, res, guest: !!n, again });
  return res;
}

async function save(S, fn, n, id, again, box) {
  const hostRef = doc(db, 'live', 'host');
  let after = null;
  try {
    await runTransaction(db, async tx => {
      box.tries++;
      const ep = ((await tx.get(hostRef)).data() || {}).ep;
      const out = commit(ep, fn, { n, id, again, episodes: S.episodes, cards: S.players, marks: marksOf(S.ack, ep && ep.id) });
      if (out.dup) return;
      tx.set(hostRef, { ep });
      tx.set(doc(db, 'live', 'state'), guestView(ep));
      if (out.history) history(tx, ep);
      after = ep;
    });
  } catch (err) {
    if (!(err instanceof GameError)) {
      fail(err, again);
      return false;
    }
    if (!n && err.message) toast(err.message);  // касания гостя без всплывающих ошибок
    return 'no';
  }
  burn(S, after);
  return 'done';
}

// Копия выпуска в «Историю»: полный выпуск и его сводка одной транзакцией
function history(tx, ep) {
  tx.set(doc(db, 'episodes', ep.id), stored(ep));
  tx.set(doc(db, 'sums', ep.id), summaryOf(ep));
}

// Сгорание показанных вопросов: вопрос, который гость увидел (ответил, заменил или видел в конце),
// получает в банке used (вне конкурса off) с кодом выпуска. Отметки идут после «Итога», одной
// транзакцией на тему. Пока выпуск идёт, его вопросы никому не выпадут: новый выпуск не начать.
// Панель сверяет законченный выпуск и три последних выпуска «Истории» с банком при каждом
// новом виде из базы: пропала связь или закрылось окно, отметку допишет следующая сверка
const burning = new Set();  // отметки в пути или уже в базе: второй раз не пишем
// ep: идущий выпуск или сводка выпуска из «Истории» (в ней список burn готовый).
// Спорный вопрос (undo.js, doubt) получает в банке метку doubt с кодом выпуска. Ведущий снял её
// в разделе «Вопросы»: в вопросе остаётся doubt: false, сверка метку не возвращает
export function burn(S, ep) {
  if (!ep || !ep.finished) return;
  const field = ep.trial ? 'off' : 'used';
  const doubts = new Set(ep.doubt || []);
  const todo = {};
  for (const id of ep.burn || burnIds(ep)) {
    const key = ep.id + '/' + id + (doubts.has(id) ? '?' : '');
    const t = S.topics.find(x => (x.questions || []).some(q => q.id === id));
    const q = t && t.questions.find(x => x.id === id);
    if (!t || burning.has(key) || (q[field] === ep.id && (!doubts.has(id) || 'doubt' in q))) continue;
    burning.add(key);
    (todo[t.id] = todo[t.id] || []).push([id, key]);
  }
  for (const [topic, list] of Object.entries(todo)) {
    const ref = doc(db, 'topics', topic);
    runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const t = snap.data();
      const mark = (qs, [id]) => {
        const out = (ep.trial ? markOff : markUsed)(qs, id, ep.id);
        return doubts.has(id) ? markDoubt(out, id, ep.id) : out;
      };
      tx.set(ref, { ...t, questions: list.reduce(mark, t.questions || []) });
    }).catch(() => list.forEach(([, key]) => burning.delete(key)));
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
// вопросов гость ещё не видел, пустой выпуск «0 из 0» там не нужен.
// Законченный выпуск получает последние секунды по часам планшета гостя (итог пришёл после «Итога»)
export async function close(S) {
  try {
    await runTransaction(db, async tx => {
      const hostRef = doc(db, 'live', 'host');
      const ep = ((await tx.get(hostRef)).data() || {}).ep;
      if (ep && !ep.finished && (ep.phase === 'invite' || ep.phase === 'topics')) {
        tx.delete(doc(db, 'episodes', ep.id));
        tx.delete(doc(db, 'sums', ep.id));
      }
      const marks = ep && ep.finished && !ep.trial ? marksOf(S.ack, ep.id) : null;
      if (marks) history(tx, { ...ep, marks: { ...(ep.marks || {}), ...marks } });
      tx.set(hostRef, { ep: null });
      tx.set(doc(db, 'live', 'state'), guestView(null));
    });
  } catch (err) {
    fail(err);
  }
}

// Удаление выпуска из «Истории» одной транзакцией: вопросы выпуска снова в запасе
// (решения автора 2026-10-28). Таблица считается из выпусков: его баллы уходят из неё сами
export async function drop(S, id) {
  const ep = S.episodes.find(e => e.id === id);
  if (!ep) return;
  const refs = S.topics.filter(t => (t.questions || []).some(q => q.used === id)).map(t => doc(db, 'topics', t.id));
  try {
    await runTransaction(db, async tx => {
      const topics = await Promise.all(refs.map(r => tx.get(r)));
      topics.forEach(t => t.exists() && tx.set(t.ref, { ...t.data(), questions: release(t.data().questions || [], id) }));
      tx.delete(doc(db, 'episodes', id));
      tx.delete(doc(db, 'sums', id));
    });
  } catch (err) {
    toast('Не удалилось: ' + (err.code || err.message));
  }
}

// Правка закрытого выпуска «Истории» одной транзакцией над выпуском и его сводкой.
// fn меняет выпуск на месте: исправление итога вопроса (fix.js), метка «спорный» (undo.js)
export async function editEpisode(id, fn) {
  const ref = doc(db, 'episodes', id);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new GameError('Выпуска нет');
      const ep = snap.data();
      fn(ep);
      history(tx, ep);
    });
    return true;
  } catch (err) {
    toast(err instanceof GameError ? err.message : 'Не сохранилось: ' + (err.code || err.message));
    return false;
  }
}
export const fixEpisode = (id, i) => editEpisode(id, ep => fixAnswer(ep, i, Date.now()));

// Участник убран из таблицы: его выпуски остаются в «Истории» с отметкой out (table.js).
// Старая карточка участника тоже уходит: по ней шли в таблицу выпуски до 2026-11-14
export async function hidePlayer(S, playerId) {
  try {
    await Promise.all(S.episodes.filter(e => e.playerId === playerId).flatMap(e => ['episodes', 'sums']
      .map(c => setDoc(doc(db, c, e.id), { out: true }, { merge: true }))));
    if (S.players.some(pl => pl.id === playerId)) await deleteDoc(doc(db, 'players', playerId));
  } catch (err) {
    toast('Не удалилось: ' + (err.code || err.message));
  }
}
