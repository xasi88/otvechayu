// Вопросы выпуска по порядку: карточки в «Истории» (host-history.js) и текстовый файл выпуска.
// Один источник для экрана и файла (просьба автора 2026-11-03).
// Чистые функции без сети: их проверяют тесты (tests/report.test.mjs).
import { resultOf, timeOf, timeText } from './game.js';
import { HINTS } from './hints.js';
import { finalLabel } from './final.js';
import { LETTERS, LEVELS, pointsWord, clock, dateText } from './ui.js';
import { reviewList, reviewText } from './review.js';

export const VERDICT = {
  right: 'Верно', wrong: 'Неверно', none: 'Без ответа',
  stopped: 'Выпуск закончен на этом вопросе', live: 'Вопрос идёт',
};

// Время на ответ: «6,4 с», минута и больше «1:05,4»
export const secText = s => (s < 60 ? `${s.toFixed(1).replace('.', ',')} с` : timeText(s));

// Секунда записи, когда вопрос появился у гостя. Замена вопроса показывает его заново: берём
// последний показ. В выпусках до 2026-11-03 у записи журнала нет q, номер есть в тексте
function shownAt(ep) {
  const at = {};
  for (const e of ep.log || []) {
    if (e.event !== 'show' || e.t === null) continue;
    const i = e.q ?? Number((/^Вопрос (\d+) /.exec(e.text) || [])[1]) - 1;
    if (i >= 0) at[i] = e.t;
  }
  return at;
}

// В выпусках до 2026-11-03 убранные «50 на 50» варианты есть только в журнале: «убраны X, Y»
function oldHidden(ep, q) {
  const e = (ep.log || []).find(x => x.event === 'hint' && x.text.includes(`«${HINTS.half}»: убраны `));
  if (!e) return [];
  const gone = e.text.split(': убраны ')[1];
  const wrong = q.options.map((_, i) => i).filter(i => i !== q.correct);
  for (const i of wrong) for (const j of wrong) if (i < j && `${q.options[i]}, ${q.options[j]}` === gone) return [i, j];
  return [];
}

// Секунда записи с десятыми: «1:05,4». Так пишутся секунды по часам планшета гостя
const exactText = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')},${Math.round(s * 10) % 10}`;

// Вопросы, которые прозвучали: с ответом и тот, на котором выпуск закончили или который идёт.
// marks: секунды по часам планшета гостя (guest-ack.js): show, pick, reveal по номеру вопроса.
// Они точнее журнала панели: в них нет задержки сети. exact: секунда показа взята у планшета
// n: номер в выпуске, a: ответ (game.js, reveal), status: ключ VERDICT, at: секунда записи,
// time: время на ответ, hints: подсказки на этом вопросе, was: текст заменённого вопроса
export function questionRows(ep) {
  const answers = ep.answers || [];
  const questions = ep.questions || [];
  const now = ep.shown && ep.index === answers.length && questions[ep.index] ? 1 : 0;
  const at = shownAt(ep);
  const marks = ep.marks || {};
  return questions.slice(0, answers.length + now).map((q, i) => {
    const a = answers[i] || null;
    const hints = Object.keys(HINTS).filter(k => (ep.hints || {})[k] === i);
    const swap = (ep.swapped || []).find(s => s.index === i);
    return {
      n: i + 1, q, a, hints,
      status: !a ? (ep.finished ? 'stopped' : 'live') : a.correct ? 'right' : a.pick === null && !a.said ? 'none' : 'wrong',
      at: marks['show:' + i] ?? at[i] ?? null,
      exact: ('show:' + i) in marks,
      pickAt: marks['pick:' + i] ?? null,
      revealAt: marks['reveal:' + i] ?? null,
      // Ответ вслух во время не идёт (game.js, reveal)
      time: a && a.mode !== 'free' ? a.time ?? a.think ?? null : null,
      hidden: a && a.hidden ? a.hidden : hints.includes('half') ? oldHidden(ep, q) : [],
      struck: a && a.struck != null ? a.struck : null,
      was: swap ? swap.text : null,
      // Ведущий отметил вопрос как спорный (undo.js, doubt)
      doubt: (ep.doubt || []).includes(q.id),
    };
  });
}

// Темы в порядке выбора гостя
export function topicsOf(ep) {
  const names = (ep.chosen || []).map(i => ((ep.choices || [])[i] || {}).name).filter(Boolean);
  return names.length ? names : [...new Set((ep.questions || []).map(q => q.topic))];
}

function rowText(row) {
  const { q, a } = row;
  // Суперигра (final.js): вместо баллов вопроса как отвечал гость (старые выпуски: ставка)
  const head = [`${row.n}. ${q.topic}`, LEVELS[q.points],
    q.final ? finalLabel(a) : pointsWord(q.points)];
  if (row.at !== null) head.push(`на записи ${row.exact ? exactText(row.at) : clock(row.at)}`);
  const lines = [head.join(' · '), `Вопрос: ${q.text}`];
  if (row.was) lines.push(`Замена вопроса: вместо «${row.was}»`);
  q.options.forEach((o, i) => {
    const marks = [];
    if (i === q.correct) marks.push('правильный');
    if (a && i === a.pick) marks.push(i === q.correct ? 'ответ гостя' : 'ответ гостя, неверно');
    if (i === row.struck) marks.push('первый ответ, неверно');
    if (row.hidden.includes(i)) marks.push(`убран «${HINTS.half}»`);
    lines.push(`   ${LETTERS[i]}) ${o}${marks.length ? `   [${marks.join(', ')}]` : ''}`);
  });
  lines.push(`Результат: ${VERDICT[row.status].toLowerCase()}${a ? `, ${pointsWord(a.points)}` : ''}`);
  if (row.time !== null) lines.push(`Время на ответ: ${secText(row.time)}`);
  if (row.pickAt !== null) lines.push(`Касание ответа на записи: ${exactText(row.pickAt)}`);
  if (row.revealAt !== null) lines.push(`Ответ открыт на записи: ${exactText(row.revealAt)}`);
  if (a && a.fixed) lines.push('Итог исправлен ведущим');
  if (row.doubt) lines.push('Отмечен как спорный');
  if (row.hints.length) lines.push(`Подсказка: ${row.hints.map(k => `«${HINTS[k]}»`).join(', ')}`);
  if (q.why) lines.push(`Справка: ${q.why}`);
  return lines;
}

// Текстовый файл выпуска: шапка, вопросы по порядку, журнал для монтажа.
// Знак BOM и переносы Windows: файл читается в Блокноте на Surface и на Samsung
export function reportText(ep) {
  const r = resultOf(ep);
  const hints = Object.entries(HINTS)
    .map(([k, name]) => `«${name}» ${k in (ep.hints || {}) ? `на вопросе ${ep.hints[k] + 1}` : 'не взята'}`);
  const out = [
    'ОТВЕЧАЮ',
    `Выпуск: ${dateText(ep.id)}${ep.finished ? '' : ' (не закончен)'}`,
    `Гость: ${ep.guest}`,
    ...(ep.no ? [`Сезон ${ep.season || 1}, выпуск ${ep.no}`] : []),
    `Темы: ${topicsOf(ep).join(', ')}`,
    `Итог: верно ${r.correct} из ${r.asked}, ${pointsWord(ep.score)}`,
    `Время на ответы: ${timeText(timeOf(ep))}`,
    `Подсказки: ${hints.join(', ')}`,
    '',
    'ВОПРОСЫ ПО ПОРЯДКУ',
    'На записи: время от касания «Отвечаю», это 0:00.',
    ...(ep.marks ? ['Секунды с десятыми: по часам планшета гостя, без задержки сети. По ним ставить наклейки.'] : []),
  ];
  for (const row of questionRows(ep)) out.push('', ...rowText(row));
  // Что посмотреть в банке после съёмки (review.js)
  const review = reviewList(ep);
  if (review.length) out.push('', 'РАЗОБРАТЬ ПОСЛЕ ВЫПУСКА', ...review.map(reviewText));
  out.push('', 'ЖУРНАЛ ДЛЯ МОНТАЖА');
  for (const e of ep.log || []) if (e.t !== null) out.push(`${clock(e.t)}   ${e.text}`);
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}

// «Отвечаю Магомед 2026-11-03 15-30.txt»: знаки, запрещённые в имени файла Windows, убраны
export function fileName(ep, ext) {
  const name = String(ep.guest).replace(/[\\/:*?"<>|]/g, '').trim() || 'Гость';
  return `Отвечаю ${name} ${ep.id.slice(0, 10)} ${ep.id.slice(11, 16)}.${ext}`;
}
