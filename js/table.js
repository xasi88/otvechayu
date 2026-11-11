// Карточка игрока и турнирная таблица. Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// game.js отдаёт их дальше
import { resultOf, timeOf } from './game.js';

const sumTime = eps => Math.round(eps.reduce((s, e) => s + timeOf(e), 0) * 10) / 10;

// Итог выпуска в карточку игрока. player: старая карточка или null.
// past: прошлые выпуски игрока, из них время, если в карточке его ещё нет.
export function addToPlayer(player, ep, past = []) {
  const p = { name: ep.guest, episodes: 0, points: 0, correct: 0, asked: 0, ...(player || {}) };
  const r = resultOf(ep);
  const before = Number.isFinite(p.time) ? p.time : sumTime(past);
  return { ...p, episodes: p.episodes + 1, points: p.points + ep.score,
    correct: p.correct + r.correct, asked: p.asked + r.asked, last: ep.id.slice(0, 10),
    time: Math.round((before + timeOf(ep)) * 10) / 10 };
}

// Выпуск удалён из «Истории»: его итог уходит из карточки игрока (обратно addToPlayer).
// rest: оставшиеся законченные выпуски игрока, из них дата последнего выпуска.
export function removeFromPlayer(player, ep, rest = []) {
  const r = resultOf(ep);
  const minus = (a, b) => Math.max(0, (a || 0) - b);
  const p = { ...player, episodes: minus(player.episodes, 1), points: minus(player.points, ep.score),
    correct: minus(player.correct, r.correct), asked: minus(player.asked, r.asked),
    last: rest.length ? rest.map(e => e.id).sort().pop().slice(0, 10) : null };
  if (Number.isFinite(player.time)) p.time = Math.round(minus(player.time, timeOf(ep)) * 10) / 10;
  return p;
}

// Турнирная таблица всех участников. Выше тот, у кого больше баллов, при равных баллах
// тот, у кого больше верных ответов, потом тот, кто быстрее ответил (меньше время на ответы).
// Полная ничья делит место: 1, 2, 2, 4.
// Лучший выпуск: наибольшие баллы участника за один законченный выпуск.
// Время участника из карточки, у старых карточек без времени из их выпусков.
export function standings(players, episodes = []) {
  const best = {};
  const done = {};
  for (const e of episodes) {
    if (!e.finished || !e.playerId) continue;
    best[e.playerId] = Math.max(best[e.playerId] ?? 0, e.score);
    (done[e.playerId] = done[e.playerId] || []).push(e);
  }
  const rows = players.map(p => ({
    id: p.id, name: p.name, points: p.points || 0, correct: p.correct || 0, asked: p.asked || 0,
    episodes: p.episodes || 0, last: p.last || null, best: best[p.id] ?? null,
    share: p.asked ? Math.round(p.correct / p.asked * 100) : 0,
    time: Number.isFinite(p.time) ? p.time : sumTime(done[p.id] || []),
  })).sort((a, b) => b.points - a.points || b.correct - a.correct || a.time - b.time ||
    a.name.localeCompare(b.name, 'ru'));
  rows.forEach((r, i) => {
    const up = rows[i - 1];
    r.place = up && up.points === r.points && up.correct === r.correct && up.time === r.time ? up.place : i + 1;
  });
  return rows;
}

// Таблица для экрана гостя в конце выпуска: все участники, строка гостя помечена (me).
export function guestTable(rows, playerId) {
  return rows.map(r => ({ place: r.place, name: r.name, points: r.points, time: r.time, me: r.id === playerId }));
}
