// Запись выпуска в базу. Каждое действие ведущего и каждое касание гостя идёт одной транзакцией:
// выпуск (live/host), вид гостя (live/state), журнал (episodes), карточка участника, банк вопросов.
// Показанный гостю вопрос сгорает в банке (bank.js, markUsed) и больше не выпадает.
// В конце выпуска в него ложится турнирная таблица: её видит гость, она остаётся в «Истории».
// Выпуск вне конкурса не сжигает вопросы конкурса и не пишет ни в участников, ни в «Историю»:
// показанный вопрос только уходит в конец круга вне конкурса (bank.js, markOff).
// Две открытые панели не примут одно касание дважды: вторая увидит, что оно уже принято.
import { db, doc, runTransaction } from './fb.js';
import { guestView, addToPlayer, removeFromPlayer, standings, guestTable, GameError } from './game.js';
import { markUsed, markOff, release } from './bank.js';
import { toast } from './ui.js';

const fail = err => toast('Не сохранилось: ' + (err.code || err.message));

// Что действие трогает кроме выпуска: тему, если вопрос показан сейчас (он сгорает),
// и карточку участника, если выпуск закончен сейчас. was: выпуск до действия, ep: после
function refsOf(was, ep) {
  const q = !was.shown && ep.shown ? ep.questions[ep.index] : null;
  return {
    q,
    topic: q && q.topicId ? doc(db, 'topics', q.topicId) : null,
    player: !ep.trial && ep.finished && !ep.counted && ep.playerId ? doc(db, 'players', ep.playerId) : null,
  };
}

// Пробный ход по выпуску на экране: какие документы понадобятся. Их транзакция читает
// вместе с выпуском, одним обменом с базой. Догадка не сбылась: транзакция дочитает сама
function guess(S, fn) {
  if (!S.ep) return [];
  const dry = structuredClone(S.ep);
  try { fn(dry); } catch { return []; }
  const r = refsOf(S.ep, dry);
  return [r.topic, r.player].filter(Boolean);
}

// fn: действие над выпуском (game.js, act). n: касание гостя, по нему касание принимается один раз.
// Вернёт false, только если подвела связь: такое касание можно принять снова
export async function change(S, fn, n = null) {
  const hostRef = doc(db, 'live', 'host');
  const pre = guess(S, fn);
  try {
    await runTransaction(db, async tx => {
      // Все чтения до первой записи: так требует транзакция Firestore
      const [snap, ...got] = await Promise.all([tx.get(hostRef), ...pre.map(r => tx.get(r))]);
      const ready = new Map(pre.map((r, i) => [r.path, got[i]]));
      const ep = (snap.data() || {}).ep;
      if (!ep) throw new GameError('Выпуска нет');
      if (n && ep.lastN === n) throw new GameError('');
      const was = structuredClone(ep);
      fn(ep);
      if (n) ep.lastN = n;
      const r = refsOf(was, ep);
      const read = ref => (ref ? ready.get(ref.path) || tx.get(ref) : null);
      const [topic, player] = await Promise.all([read(r.topic), read(r.player)]);
      if (topic && topic.exists()) {
        const t = topic.data();
        tx.set(r.topic, { ...t, questions: (ep.trial ? markOff : markUsed)(t.questions || [], r.q.id, ep.id) });
      }
      if (ep.finished && !ep.counted) {
        ep.counted = true;
        const past = S.episodes.filter(e => e.playerId === ep.playerId && e.finished && e.id !== ep.id);
        const card = addToPlayer(player && player.exists() ? player.data() : null, ep, past);
        if (r.player) tx.set(r.player, card);
        const others = S.players.filter(pl => pl.id !== ep.playerId);
        ep.table = guestTable(standings([...others, { id: ep.playerId, ...card }], S.episodes), ep.playerId);
      }
      tx.set(hostRef, { ep });
      tx.set(doc(db, 'live', 'state'), guestView(ep));
      if (ep.start && !ep.trial) tx.set(doc(db, 'episodes', ep.id), ep);
    });
  } catch (err) {
    if (!(err instanceof GameError)) {
      fail(err);
      return false;
    }
    if (!n && err.message) toast(err.message);  // касания гостя без всплывающих ошибок
  }
  return true;
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
// вопросов гость ещё не видел, пустой выпуск «0 из 0» там не нужен. tv: звук на телевизоре
export async function close(tv) {
  try {
    await runTransaction(db, async tx => {
      const hostRef = doc(db, 'live', 'host');
      const ep = ((await tx.get(hostRef)).data() || {}).ep;
      if (ep && !ep.finished && (ep.phase === 'invite' || ep.phase === 'topics')) tx.delete(doc(db, 'episodes', ep.id));
      tx.set(hostRef, { ep: null });
      tx.set(doc(db, 'live', 'state'), tv ? { ...guestView(null), tv: true } : guestView(null));
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
