// Логика выпуска «Отвечаю»: фазы, баллы, журнал, вид для экрана гостя.
// Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// Экран ведущего держит выпуск у себя и сохраняет его в базу после каждого действия.

export class GameError extends Error {}

// Действия ведущего. Гость может только нажать «Отвечаю», выбрать тему и вариант.
const HOST_ONLY = new Set(['begin', 'show', 'clear_pick', 'reveal', 'next', 'finish', 'draw']);
const GUEST_OK = new Set(['ready', 'topic', 'pick']);

const pad = n => String(n).padStart(2, '0');
function stamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
const clockOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Новый выпуск: имя гостя и темы на выбор (bank.js, offerTopics), по четыре вопроса на каждую.
// Гость выбирает три темы, chosen: номера тем в порядке выбора.
// Вопросы копируются в выпуск: правка банка не меняет прошедшие выпуски.
// Пробный выпуск (trial) не сжигает вопросы и не попадает в таблицу и «Историю».
export function newEpisode({ guest, playerId = null, offer, now, trial = false }) {
  const name = String(guest || '').split(/\s+/).filter(Boolean).join(' ').slice(0, 40);
  if (!name) throw new GameError('Впишите имя гостя');
  return {
    id: stamp(now), created: now, guest: name, playerId, trial, phase: 'invite',
    choices: offer.choices, sets: offer.sets, chosen: [], questions: [],
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
      ep.phase = 'topics';
      log(ep, 'start', `Гость ${ep.guest} нажал «Отвечаю»: начало выпуска`, now);
      break;
    case 'topic': {
      // Гость присылает весь свой выбор списком (topics). Одна тема (option) встаёт в конец
      // или снимается: так нажимает ведущий. Менять можно до «К вопросам»
      need(ep, 'topics');
      const was = ep.chosen;
      const list = Array.isArray(data.topics) ? data.topics
        : was.includes(data.option) ? was.filter(i => i !== data.option) : [...was, data.option];
      if (!list.every(i => Number.isInteger(i) && ep.choices[i]) || new Set(list).size !== list.length) {
        throw new GameError('Нет такой темы');
      }
      if (list.length > 3) throw new GameError('Уже три темы: снимите одну');
      ep.chosen = list;
      const names = list.map(i => ep.choices[i].name).join(', ') || 'пока ни одной';
      log(ep, 'topic', `${host ? 'Ведущий за гостя' : 'Гость'}: темы ${names}`, now);
      break;
    }
    case 'begin': {
      need(ep, 'topics');
      if (ep.chosen.length !== 3) throw new GameError('Гость выбрал ещё не все три темы');
      // Темы в порядке выбора гостя. В теме лёгкий, средний, средний, сложный
      const topics = ep.chosen.map(i => ep.choices[i]);
      ep.questions = topics.flatMap(t => ep.sets[t.id]);
      log(ep, 'begin', `Темы выпуска: ${topics.map(t => t.name).join(', ')}`, now);
      ep.sets = null;
      ep.phase = 'question';
      break;
    }
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
      // time: время на ответ для таблицы. Без ответа время идёт до «Открыть ответ»
      ep.answers.push({
        id: q.id, pick: ep.pick, correct: ok, points,
        think: ep.pick === null ? null : Math.round((ep.pickAt - ep.shownAt) / 100) / 10,
        time: Math.round(((ep.pick === null ? now : ep.pickAt) - ep.shownAt) / 100) / 10,
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
    case 'draw': {
      // Жребий места: карточка гостя прыгает по таблице и встаёт на своё место (draw.js).
      // draw: время нажатия. Новое нажатие запускает жребий на экране гостя ещё раз
      need(ep, 'result');
      const me = (ep.table || []).find(r => r.me);
      if (!me) throw new GameError('Таблицы нет');
      ep.draw = now;
      log(ep, 'draw', `Жребий места на экране гостя: ${me.place} место`, now);
      break;
    }
  }
}

function finish(ep, now) {
  ep.phase = 'result';
  ep.finished = true;
  ep.time = timeOf(ep);
  const r = resultOf(ep);
  log(ep, 'result', `Итог: ${r.correct} из ${r.asked}, баллов ${ep.score}, время на ответы ${timeText(ep.time)}`, now);
}

export function resultOf(ep) {
  return { correct: ep.answers.filter(a => a.correct).length, asked: ep.answers.length };
}

// Время на ответы за выпуск, секунды: сумма времени по вопросам.
// В выпусках до учёта времени есть только время до касания (think), его и берём.
export function timeOf(ep) {
  const sum = (ep.answers || []).reduce((s, a) => s + (a.time ?? a.think ?? 0), 0);
  return Math.round(sum * 10) / 10;
}
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

// Путь карточки гостя в жребии места (draw.js): строки по порядку прыжков, от 0 сверху.
// Карточка начинает с первой строки, прыгает куда попало, последние прыжки рядом со своим
// местом m, но не на него, последний прыжок на место. Два прыжка подряд в одну строку не попадают
export function drawPath(n, m, rand = Math.random, hops = 20) {
  const pick = (lo, hi, ban) => {
    const ok = [];
    for (let x = lo; x <= hi; x++) if (!ban.includes(x)) ok.push(x);
    return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
  };
  const path = [];
  let k = 0;
  for (let i = 1; n > 1 && i < hops; i++) {
    const near = i >= hops - 4 ? pick(Math.max(0, m - 2), Math.min(n - 1, m + 2), [k, m]) : null;
    k = near ?? pick(0, n - 1, [k]);
    path.push(k);
  }
  if (path[path.length - 1] === m) path.pop();
  path.push(m);
  return path;
}

// Случайные числа от зерна: одно зерно даёт один ряд на любом устройстве.
// Жребий берёт зерно от времени нажатия (draw), поэтому Samsung и телевизор прыгают одинаково
export function seededRand(seed) {
  let a = Math.floor(Number(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Время на ответы: «2:05,4», минуты, секунды и десятые
export function timeText(sec) {
  const t = Math.round(Math.max(0, sec || 0) * 10);
  return `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')},${t % 10}`;
}

// Что видит гость. Правильный вариант только после «Открыть ответ»,
// текст и варианты только после «Показать гостю».
export function guestView(ep) {
  if (!ep) return { phase: 'prep' };
  const v = { phase: ep.phase, session: ep.id, guest: ep.guest, index: ep.index,
    total: ep.questions.length, score: ep.score };
  // Звук идёт с телевизора: Samsung молчит (tv.js)
  if (ep.tv) v.tv = true;
  if (ep.phase === 'topics') {
    v.topics = { choices: ep.choices.map(t => t.name), chosen: ep.chosen.slice() };
  }
  if (ep.phase === 'question' || ep.phase === 'reveal') {
    const q = ep.questions[ep.index];
    const cur = { topic: q.topic, points: q.points, shown: ep.shown, pick: ep.pick };
    if (ep.shown) { cur.text = q.text; cur.options = q.options; }
    if (ep.phase === 'reveal') { cur.correct = q.correct; cur.got = ep.answers[ep.answers.length - 1].points; }
    v.q = cur;
  }
  if (ep.phase === 'result') {
    v.result = resultOf(ep);
    v.time = timeOf(ep);
    if (ep.table) v.table = ep.table;
    if (ep.draw) v.draw = ep.draw;
  }
  return v;
}

// Журнал для монтажа: секунда 0 там, где гость нажал «Отвечаю».
export function journal(ep) {
  return {
    guest: ep.guest, created: ep.id, score: ep.score, time: timeOf(ep),
    zero: 'Секунда 0: гость нажал «Отвечаю». Это касание видно на записи.',
    questions: ep.questions, answers: ep.answers, log: ep.log,
  };
}
