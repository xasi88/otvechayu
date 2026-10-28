// Логика выпуска «Отвечаю»: фазы, баллы, журнал, вид для экрана гостя.
// Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// Экран ведущего держит выпуск у себя и сохраняет его в базу после каждого действия.

export class GameError extends Error {}

// Действия ведущего. Гость может только нажать «Отвечаю» и выбрать вариант.
const HOST_ONLY = new Set(['show', 'clear_pick', 'reveal', 'next', 'finish']);
const GUEST_OK = new Set(['ready', 'pick']);

const pad = n => String(n).padStart(2, '0');
function stamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
const clockOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Новый выпуск: имя гостя и выбранные темы. Вопросы копируются в выпуск:
// правка вопросов потом не меняет прошедшие выпуски.
export function newEpisode({ guest, playerId = null, topics, now }) {
  const name = String(guest || '').split(/\s+/).filter(Boolean).join(' ').slice(0, 40);
  if (!name) throw new GameError('Впишите имя гостя');
  const questions = topics.flatMap(t => (t.questions || []).map(q => ({
    id: q.id, topic: t.name, text: q.text, options: q.options.slice(), correct: q.correct, points: q.points,
  })));
  if (!questions.length) throw new GameError('Выберите хотя бы одну тему с вопросами');
  return {
    id: stamp(now), created: now, guest: name, playerId, phase: 'invite', questions,
    index: 0, shown: false, shownAt: null, pick: null, pickAt: null,
    answers: [], score: 0, start: null, log: [], finished: false,
  };
}

function log(ep, event, text, now) {
  ep.log.push({
    t: ep.start ? Math.round((now - ep.start) / 100) / 10 : null,
    clock: clockOf(now), event, text,
  });
}

function need(ep, ...phases) {
  if (!phases.includes(ep.phase)) throw new GameError('Сейчас это сделать нельзя');
}

// Действие над выпуском. Меняет ep на месте. host: действие пришло от ведущего.
export function act(ep, action, data = {}, host, now) {
  if (!HOST_ONLY.has(action) && !GUEST_OK.has(action)) throw new GameError('Нет такого действия');
  if (HOST_ONLY.has(action) && !host) throw new GameError('Это делает только ведущий');
  const q = ep.questions[ep.index];
  switch (action) {
    case 'ready':
      need(ep, 'invite');
      ep.start = now;
      ep.phase = 'question';
      log(ep, 'start', `Гость ${ep.guest} нажал «Отвечаю»: начало выпуска`, now);
      break;
    case 'show':
      need(ep, 'question');
      if (ep.shown) throw new GameError('Вопрос уже на экране гостя');
      ep.shown = true;
      ep.shownAt = now;
      log(ep, 'show', `Вопрос ${ep.index + 1} на экране гостя: ${q.text}`, now);
      break;
    case 'pick': {
      need(ep, 'question');
      if (!ep.shown) throw new GameError('Вопрос ещё не показан');
      if (ep.pick !== null && !host) throw new GameError('Ответ уже принят');
      const option = data.option;
      if (!Number.isInteger(option) || option < 0 || option >= q.options.length) throw new GameError('Нет такого варианта');
      ep.pick = option;
      ep.pickAt = now;
      const who = host ? 'Ведущий отметил за гостя' : 'Гость выбрал';
      log(ep, 'pick', `${who}: ${q.options[option]} (через ${((now - ep.shownAt) / 1000).toFixed(1)} с)`, now);
      break;
    }
    case 'clear_pick':
      need(ep, 'question');
      ep.pick = ep.pickAt = null;
      log(ep, 'clear', 'Ведущий сбросил выбор', now);
      break;
    case 'reveal': {
      need(ep, 'question');
      if (!ep.shown) throw new GameError('Сначала покажите вопрос гостю');
      const ok = ep.pick === q.correct;
      const points = ok ? q.points : 0;
      ep.score += points;
      ep.answers.push({
        id: q.id, pick: ep.pick, correct: ok, points,
        think: ep.pick === null ? null : Math.round((ep.pickAt - ep.shownAt) / 100) / 10,
      });
      ep.phase = 'reveal';
      const verdict = ok ? 'верно' : ep.pick === null ? 'без ответа' : 'неверно';
      log(ep, 'reveal', `Ответ открыт: ${verdict}. Правильный: ${q.options[q.correct]}. Баллы: +${points}`, now);
      break;
    }
    case 'next':
      need(ep, 'reveal');
      if (ep.index + 1 >= ep.questions.length) return finish(ep, now);
      ep.index += 1;
      ep.phase = 'question';
      ep.shown = false;
      ep.shownAt = ep.pick = ep.pickAt = null;
      break;
    case 'finish':
      need(ep, 'question', 'reveal');
      finish(ep, now);
      break;
  }
}

function finish(ep, now) {
  ep.phase = 'result';
  ep.finished = true;
  const r = resultOf(ep);
  log(ep, 'result', `Итог: ${r.correct} из ${r.asked}, баллов ${ep.score}`, now);
}

export function resultOf(ep) {
  return { correct: ep.answers.filter(a => a.correct).length, asked: ep.answers.length };
}

// Итог выпуска в карточку игрока. player: старая карточка или null.
export function addToPlayer(player, ep) {
  const p = { name: ep.guest, episodes: 0, points: 0, correct: 0, asked: 0, ...(player || {}) };
  const r = resultOf(ep);
  return { ...p, episodes: p.episodes + 1, points: p.points + ep.score,
    correct: p.correct + r.correct, asked: p.asked + r.asked, last: ep.id.slice(0, 10) };
}

// Турнирная таблица всех участников. Выше тот, у кого больше баллов,
// при равных баллах тот, у кого больше верных ответов. Полная ничья делит место: 1, 2, 2, 4.
// Лучший выпуск: наибольшие баллы участника за один законченный выпуск.
export function standings(players, episodes = []) {
  const best = {};
  for (const e of episodes) {
    if (e.finished && e.playerId) best[e.playerId] = Math.max(best[e.playerId] ?? 0, e.score);
  }
  const rows = players.map(p => ({
    id: p.id, name: p.name, points: p.points || 0, correct: p.correct || 0, asked: p.asked || 0,
    episodes: p.episodes || 0, last: p.last || null, best: best[p.id] ?? null,
    share: p.asked ? Math.round(p.correct / p.asked * 100) : 0,
  })).sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'ru'));
  rows.forEach((r, i) => {
    const up = rows[i - 1];
    r.place = up && up.points === r.points && up.correct === r.correct ? up.place : i + 1;
  });
  return rows;
}

// Таблица для экрана гостя в конце выпуска: первые места и строка гостя, даже если он ниже.
export function guestTable(rows, playerId, limit = 6) {
  const top = rows.slice(0, limit);
  const me = rows.find(r => r.id === playerId);
  if (me && !top.includes(me)) top.push(me);
  return top.map(r => ({ place: r.place, name: r.name, points: r.points, me: r.id === playerId }));
}

// Что видит гость. Правильный вариант только после «Открыть ответ»,
// текст и варианты только после «Показать гостю».
export function guestView(ep) {
  if (!ep) return { phase: 'prep' };
  const v = { phase: ep.phase, session: ep.id, guest: ep.guest, index: ep.index,
    total: ep.questions.length, score: ep.score };
  if (ep.phase === 'question' || ep.phase === 'reveal') {
    const q = ep.questions[ep.index];
    const cur = { topic: q.topic, points: q.points, shown: ep.shown, pick: ep.pick };
    if (ep.shown) { cur.text = q.text; cur.options = q.options; }
    if (ep.phase === 'reveal') { cur.correct = q.correct; cur.got = ep.answers[ep.answers.length - 1].points; }
    v.q = cur;
  }
  if (ep.phase === 'result') {
    v.result = resultOf(ep);
    if (ep.table) v.table = ep.table;
  }
  return v;
}

// Журнал для монтажа: секунда 0 там, где гость нажал «Отвечаю».
export function journal(ep) {
  return {
    guest: ep.guest, created: ep.id, score: ep.score,
    zero: 'Секунда 0: гость нажал «Отвечаю». Это касание видно на записи.',
    questions: ep.questions, answers: ep.answers, log: ep.log,
  };
}
