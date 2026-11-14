// Одно действие над выпуском из базы: что меняется в выпуске и что надо записать.
// Вынесено из host-db.js 2026-11-14, чтобы проверять без базы (tests/commit.test.mjs).
// Транзакция (host-db.js, save) читает выпуск, зовёт commit и пишет то, что он вернул.
import { GameError } from './game.js';
import { standings, guestTable } from './table.js';
import { inSeason, seasonOf } from './season.js';

// fn: действие (game.js, act). n: касание гостя, по нему касание принимается один раз.
// id: номер действия ведущего, again: это повтор после сбоя связи. Первая попытка могла дойти
// до базы, хотя ответ потерялся: тогда выпуск уже с этим номером, второй раз действие не делаем.
// episodes и cards: выпуски «Истории» и старые карточки участников для таблицы (table.js).
// marks: секунды событий по часам планшета гостя (ack.js).
// Вернёт { dup } (действие уже в базе) или { history }: писать ли копию в «Историю»
export function commit(ep, fn, { n = null, id = null, again = false, episodes = [], cards = [], marks = null } = {}) {
  if (!ep) throw new GameError('Выпуска нет');
  if (n && ep.lastN === n) throw new GameError('');
  if (again && id && (ep.hostN || 0) >= id) return { dup: true };
  fn(ep);
  if (n) ep.lastN = n;
  if (id) ep.hostN = id;
  if (marks && Object.keys(marks).length) ep.marks = { ...(ep.marks || {}), ...marks };
  // Конец выпуска: в него ложится турнирная таблица с гостем на своём месте. Её видит гость (жребий),
  // она остаётся в «Истории». Вне конкурса таблица тоже считается, но выпуск никуда не пишется
  if (ep.finished && !ep.counted) {
    ep.counted = true;
    // Место гостя: в таблице его сезона (season.js)
    ep.table = guestTable(standings(inSeason(episodes, seasonOf(ep)), cards, ep), ep.playerId);
  }
  // Копию в «Истории» пишут «Открыть ответ», исправление итога, «Итог» и жребий, а не каждое действие:
  // выпуск целиком лежит в live/host, панель после сбоя продолжит с него.
  // sync: «Назад на шаг» или метка «спорный» (undo.js): копия в «Истории» устарела
  const sync = !!ep.sync;
  delete ep.sync;
  return { history: !!ep.start && !ep.trial && !n && (ep.phase === 'reveal' || !!ep.finished || sync) };
}
