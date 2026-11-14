// Турнирная таблица. Чистые функции без сети: их проверяют тесты (tests/table.test.mjs).
// game.js отдаёт их дальше.
// Таблица считается прямо из выпусков «Истории» (2026-11-14). Раньше у каждого участника была
// карточка в базе (players), итог выпуска в неё прибавлялся и из неё вычитался: два места
// для одних цифр могли разойтись. Теперь цифры живут только в выпуске: исправили итог вопроса
// или удалили выпуск, таблица сама другая.
import { resultOf, timeOf } from './game.js';

// Выпуск идёт в таблицу: закончен, в конкурсе, не убран из таблицы (out).
// Выпуск до 2026-11-14 (без v) идёт в таблицу, только пока цела карточка его участника:
// раньше «Удалить участника» стирало карточку, а выпуски оставались в «Истории»
const counts = (e, ids) => e.finished && !e.trial && !e.out && e.playerId && (e.v >= 2 || ids.has(e.playerId));

// episodes: выпуски «Истории». cards: старые карточки участников (id, name), только для выпусков без v.
// plus: выпуск, который кончается сейчас, его в «Истории» ещё нет. Он встаёт в таблицу всегда,
// и вне конкурса тоже: гость видит своё место в жребии.
// Выше тот, у кого больше баллов, при равных баллах тот, у кого больше верных ответов,
// потом тот, кто быстрее ответил (меньше время на ответы). Полная ничья делит место: 1, 2, 2, 4.
// Каждое участие отдельное (решение автора 2026-11-11): у нового выпуска свой участник.
// Старые выпуски одного участника складываются, как раньше в карточке
export function standings(episodes = [], cards = [], plus = null) {
  const ids = new Set(cards.map(c => c.id));
  const names = new Map(cards.map(c => [c.id, c.name]));
  const list = episodes.filter(e => counts(e, ids) && !(plus && e.id === plus.id));
  if (plus) list.push(plus);
  const by = new Map();
  for (const e of list) {
    const r = resultOf(e);
    const row = by.get(e.playerId) || { id: e.playerId, name: names.get(e.playerId) || e.guest,
      points: 0, correct: 0, asked: 0, episodes: 0, last: null, best: null, time: 0 };
    row.points += e.score || 0;
    row.correct += r.correct;
    row.asked += r.asked;
    row.episodes += 1;
    row.time = Math.round((row.time + timeOf(e)) * 10) / 10;
    row.best = Math.max(row.best ?? 0, e.score || 0);
    const day = String(e.id).slice(0, 10);
    if (!row.last || day > row.last) row.last = day;
    by.set(e.playerId, row);
  }
  const rows = [...by.values()].map(r => ({ ...r, share: r.asked ? Math.round(r.correct / r.asked * 100) : 0 }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.time - b.time || a.name.localeCompare(b.name, 'ru'));
  rows.forEach((r, i) => {
    const up = rows[i - 1];
    r.place = up && up.points === r.points && up.correct === r.correct && up.time === r.time ? up.place : i + 1;
  });
  return rows;
}

// Таблица для экрана гостя в конце выпуска: все участники, строка гостя помечена (me).
// В строке жребия баллы, верные ответы и время (просьба автора 2026-11-11)
export function guestTable(rows, playerId) {
  return rows.map(r => ({ place: r.place, name: r.name, points: r.points, correct: r.correct, time: r.time, me: r.id === playerId }));
}
