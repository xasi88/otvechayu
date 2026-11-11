// Логика выпуска «Отвечаю»: фазы, баллы, журнал, вид для экрана гостя.
// Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// Идущий выпуск лежит в базе (live/host), каждое действие пишет его одной транзакцией (host-db.js).

import { takeHint, hostSwap, secondTry, gone, clearHints } from './hints.js';
import { finalQuestions, setStake, ladder, finalNo, enterFinal, goFinal, finalMark, finalPoints, freeVerdict, isFree } from './final.js';

export class GameError extends Error {}

// Действия ведущего. Гость может только нажать «Отвечаю», выбрать тему, вариант и подсказку.
const HOST_ONLY = new Set(['begin', 'show', 'go', 'clear_pick', 'reveal', 'next', 'finish', 'draw', 'swap', 'video']);
const GUEST_OK = new Set(['ready', 'topic', 'pick', 'hint', 'stake']);

const pad = n => String(n).padStart(2, '0');
function stamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
const clockOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Новый выпуск: имя гостя и темы на выбор (bank.js, offerTopics), по четыре вопроса на каждую.
// Гость выбирает три темы, chosen: номера тем в порядке выбора.
// Вопросы копируются в выпуск: правка банка не меняет прошедшие выпуски.
// Выпуск вне конкурса (trial) не сжигает вопросы конкурса и не попадает в таблицу и «Историю».
// Подсказки и запасные вопросы для них: hints.js.
export function newEpisode({ guest, playerId = null, offer, now, trial = false }) {
  const name = String(guest || '').split(/\s+/).filter(Boolean).join(' ').slice(0, 40);
  if (!name) throw new GameError('Впишите имя гостя');
  return {
    id: stamp(now), created: now, guest: name, playerId, trial, phase: 'invite',
    choices: offer.choices, sets: offer.sets, spares: offer.spares || {}, chosen: [], questions: [],
    index: 0, shown: false, shownAt: null, pick: null, pickAt: null,
    hints: {}, hidden: [], second: false, struck: null,
    answers: [], score: 0, start: null, log: [], finished: false,
    // Ролик с правилами игры у гостя и на телевизоре сразу после приглашения (rolik.js)
    video: { name: 'pravila', at: now },
  };
}

// q: номер вопроса от 0, пока идут вопросы. По нему «История» находит секунду показа (report.js)
function log(ep, event, text, now) {
  ep.log.push({
    t: ep.start ? Math.round((now - ep.start) / 100) / 10 : null,
    clock: clockOf(now), event, text,
    ...(ep.phase === 'question' || ep.phase === 'reveal' ? { q: ep.index } : {}),
  });
}

// Вопрос на экране гостя. «К вопросам», «Следующий вопрос» и «Замена вопроса» показывают его сразу,
// без отдельного «Показать гостю» (просьба автора 2026-11-03). От этого мига идёт время на ответ
export function showQuestion(ep, now) {
  ep.shown = true;
  ep.shownAt = now;
  log(ep, 'show', `Вопрос ${ep.index + 1} на экране гостя: ${ep.questions[ep.index].text}`, now);
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
      ep.video = null;
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
      // Темы по кругу в порядке выбора гостя: 1, 2, 3, снова 1. Одна тема два раза подряд не идёт.
      // Круг 1 лёгкий, круги 2 и 3 средние, круг 4 сложный (решение автора 2026-10-28)
      const topics = ep.chosen.map(i => ep.choices[i]);
      // Суперигра: по вопросу из каждой темы (final.js)
      ep.questions = [0, 1, 2, 3].flatMap(k => topics.map(t => ep.sets[t.id][k]))
        .concat(finalQuestions(topics, ep.sets));
      log(ep, 'begin', `Темы выпуска: ${topics.map(t => t.name).join(', ')}`, now);
      ep.sets = null;
      ep.spares = Object.fromEntries(topics.map(t => [t.id, (ep.spares || {})[t.id] || {}]));
      ep.phase = 'question';
      showQuestion(ep, now);
      break;
    }
    case 'show':
      // Только для выпуска, начатого до 2026-11-03: тогда вопрос показывала отдельная кнопка
      need(ep, 'question');
      if (ep.shown) throw new GameError('Вопрос уже на экране гостя');
      showQuestion(ep, now);
      break;
    case 'pick': {
      need(ep, 'question');
      if (!ep.shown) throw new GameError('Вопрос ещё не показан');
      if (ep.pick !== null && !host) throw new GameError('Ответ уже принят');
      const option = data.option;
      if (!Number.isInteger(option) || option < 0 || option >= q.options.length) throw new GameError('Нет такого варианта');
      if (gone(ep, option)) throw new GameError('Этот вариант убран');
      if (isFree(ep, q)) throw new GameError('Ответ вслух: отмечает ведущий');
      ep.pick = option;
      // think: сколько гость думал, мс, от появления вариантов на Samsung до касания.
      // Его меряет сам Samsung: в нём нет задержки сети. Нет его (ведущий отметил за гостя,
      // экран гостя перезагрузили посреди вопроса): время прихода касания
      ep.pickAt = Number.isFinite(data.think) && data.think >= 0 ? Math.min(now, ep.shownAt + data.think) : now;
      const who = host ? 'Ведущий отметил за гостя' : 'Гость выбрал';
      log(ep, 'pick', `${who}: ${q.options[option]} (через ${((ep.pickAt - ep.shownAt) / 1000).toFixed(1)} с)`, ep.pickAt);
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
      // Ответ открывается после ответа гостя. Гость молчит: ведущий жмёт «Без ответа» (none).
      // Так ранний «Открыть ответ» не засчитает вопрос без ответа (просьба автора 2026-11-03)
      // Суперигра без вариантов: ответ вслух засчитывает ведущий (final.js)
      const free = freeVerdict(ep, q, data);
      if (free === null && ep.pick === null && !data.none) throw new GameError('Гость ещё не ответил');
      if (secondTry(ep, q, now, log)) break;
      const ok = free ?? ep.pick === q.correct;
      const mark = q.final ? finalMark(ep, data) : {};
      const points = q.final ? finalPoints(ep, ok) : ok ? q.points : 0;
      ep.score += points;
      // time: время на ответ для таблицы. Без ответа время идёт до «Открыть ответ».
      // hidden: варианты, убранные «50 на 50», для «Истории»
      ep.answers.push({
        id: q.id, pick: ep.pick, correct: ok, points, ...mark, ...(ep.struck != null ? { struck: ep.struck } : {}),
        ...(ep.hidden && ep.hidden.length ? { hidden: ep.hidden.slice() } : {}),
        think: ep.pick === null ? null : Math.round((ep.pickAt - ep.shownAt) / 100) / 10,
        time: Math.round(((ep.pick === null ? now : ep.pickAt) - ep.shownAt) / 100) / 10,
      });
      ep.phase = 'reveal';
      const verdict = ok ? 'верно' : ep.pick === null && !mark.said ? 'без ответа' : 'неверно';
      log(ep, 'reveal', `Ответ открыт: ${verdict}. Правильный: ${q.options[q.correct]}. Баллы: ${points < 0 ? '' : '+'}${points}`, now);
      break;
    }
    case 'next':
      need(ep, 'reveal');
      if (ep.index + 1 >= ep.questions.length) return finish(ep, now);
      ep.index += 1;
      ep.pick = ep.pickAt = null;
      clearHints(ep);
      // Суперигра: заставка или выбор, с вариантами или без, вопрос покажет ведущий (go, final.js)
      if (ep.questions[ep.index].final) { enterFinal(ep, now, log); break; }
      ep.phase = 'question';
      showQuestion(ep, now);
      break;
    case 'stake':
      need(ep, 'stake');
      setStake(ep, data.stake, host, now, log);
      break;
    case 'go':
      need(ep, 'super', 'stake');
      if (goFinal(ep, now, log)) showQuestion(ep, now);
      break;
    case 'hint':
      need(ep, 'question');
      if (q.final) throw new GameError('В суперигре подсказок нет');
      takeHint(ep, data.hint, host, now, log);
      break;
    case 'swap':
      need(ep, 'question');
      hostSwap(ep, data.question, data.was, now, log);
      break;
    case 'finish':
      need(ep, 'question', 'reveal', 'stake', 'super');
      finish(ep, now);
      break;
    case 'draw': {
      // Повтор жребия, если камера пропустила момент: без ролика итога, сразу прыжки (draw.js).
      // draw: время нажатия, от него зерно прыжков
      need(ep, 'result');
      const me = (ep.table || []).find(r => r.me);
      if (!me) throw new GameError('Таблицы нет');
      ep.draw = now;
      ep.video = null;
      log(ep, 'draw', `Жребий места на экране гостя ещё раз: ${me.place} место`, now);
      break;
    }
    case 'video': {
      // Ролик на экране гостя ещё раз или без ролика (name: null). Свой ролик у каждой фазы
      const name = data.name ?? null;
      if (name !== null && VIDEO[ep.phase] !== name) throw new GameError('Этот ролик сейчас не к месту');
      if (name === null && !VIDEO[ep.phase]) throw new GameError('Сейчас ролика нет');
      ep.video = name ? { name, at: now } : null;
      log(ep, 'video', name ? `Ролик «${VIDEO_TITLE[name]}» на экране гостя` : 'Ведущий убрал ролик с экрана гостя', now);
      break;
    }
  }
}

// Кнопка «Итог»: у гостя ролик итога, следом сам жребий места (решение автора 2026-11-11,
// раньше жребий запускала отдельная кнопка). draw: зерно прыжков. Вне конкурса и в пробе
// всё как в настоящем выпуске: таблица с гостем считается, но никуда не пишется (host-db.js)
function finish(ep, now) {
  ep.phase = 'result';
  ep.finished = true;
  ep.time = timeOf(ep);
  ep.video = { name: 'itog', at: now };
  ep.draw = now;
  const r = resultOf(ep);
  log(ep, 'result', `Итог: ${r.correct} из ${r.asked}, баллов ${ep.score}, время на ответы ${timeText(ep.time)}`, now);
  if (ep.draw) log(ep, 'draw', 'Ролик итога и жребий места на экране гостя', now);
}

// Ролики на экране гостя: какой ролик у какой фазы (rolik.js, файлы в rolik/)
export const VIDEO = { invite: 'pravila', super: 'super', result: 'itog' };
export const VIDEO_TITLE = { pravila: 'Правила игры', super: 'Правила суперигры', itog: 'Итог' };

export function resultOf(ep) {
  return { correct: ep.answers.filter(a => a.correct).length, asked: ep.answers.length };
}

// Время на ответы за выпуск, секунды: сумма времени по вопросам.
// В выпусках до учёта времени есть только время до касания (think), его и берём.
export function timeOf(ep) {
  const sum = (ep.answers || []).reduce((s, a) => s + (a.time ?? a.think ?? 0), 0);
  return Math.round(sum * 10) / 10;
}

// Карточка игрока и турнирная таблица: в своём файле, game.js упёрся в предел 20 КБ
export { addToPlayer, removeFromPlayer, standings, guestTable } from './table.js';

// Путь карточки в жребии места: в своём файле, game.js упёрся в предел 20 КБ
export { drawPath } from './draw-path.js';

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

// Что видит гость. Правильный вариант и справка только после «Открыть ответ»,
// текст и варианты только после «Показать гостю». trial: проба гостя играет только вне конкурса (proba).
export function guestView(ep) {
  if (!ep) return { phase: 'prep' };
  const v = { phase: ep.phase, session: ep.id, guest: ep.guest, index: ep.index,
    total: ep.questions.length, score: ep.score };
  if (ep.questions.length) v.ladder = ladder(ep);
  if (ep.phase === 'stake') v.stake = { n: finalNo(ep), kind: ep.stakeKind || null, points: ep.questions[ep.index].points };
  // Звук идёт с телевизора: Samsung молчит (tv.js)
  if (ep.tv) v.tv = true;
  if (ep.trial) v.trial = true;
  if (ep.phase === 'topics') {
    v.topics = { choices: ep.choices.map(t => t.name), chosen: ep.chosen.slice() };
  }
  if (ep.phase === 'question' || ep.phase === 'reveal') {
    const q = ep.questions[ep.index];
    const cur = { topic: q.topic, points: q.points, shown: ep.shown, pick: ep.pick,
      ...(q.final ? { final: finalNo(ep), stake: ep.stake, free: isFree(ep) } : {}),
      hidden: ep.hidden || [], struck: ep.struck ?? null, second: !!ep.second };
    if (ep.shown) cur.text = q.text;
    // Без вариантов гость видит варианты только после «Открыть ответ»
    if (ep.shown && (!cur.free || ep.phase === 'reveal')) cur.options = q.options;
    v.used = Object.keys(ep.hints || {});
    if (ep.phase === 'reveal') {
      const last = ep.answers[ep.answers.length - 1];
      cur.correct = q.correct;
      cur.got = last.points;
      // ok: итог ответа. Без вариантов гость не выбирает вариант, «Верно» жмёт ведущий
      cur.ok = !!last.correct;
      if (q.why) cur.why = q.why;
    }
    v.q = cur;
  }
  if (ep.video && VIDEO[ep.phase] === ep.video.name) v.video = ep.video;
  if (ep.phase === 'result') {
    v.result = resultOf(ep);
    v.time = timeOf(ep);
    if (ep.table) v.table = ep.table;
    if (ep.draw) v.draw = ep.draw;
  }
  return v;
}

// Копия выпуска для монтажа (JSON): секунда 0 там, где гость нажал «Отвечаю».
// Читает её Claude при монтаже. Автору текстовый файл (report.js, reportText)
export function journal(ep) {
  return {
    guest: ep.guest, created: ep.id, score: ep.score, time: timeOf(ep),
    zero: 'Секунда 0: гость нажал «Отвечаю». Это касание видно на записи.',
    questions: ep.questions, answers: ep.answers, hints: ep.hints || {}, log: ep.log,
    ...(ep.swapped ? { swapped: ep.swapped } : {}),
  };
}
