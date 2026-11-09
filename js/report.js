// Вопросы выпуска по порядку: карточки в «Истории» (host-history.js) и текстовый файл выпуска.
// Один источник для экрана и файла (просьба автора 2026-11-03).
// Чистые функции без сети: их проверяют тесты (tests/report.test.mjs).
import { resultOf, timeOf, timeText } from './game.js';
import { HINTS } from './hints.js';
import { LETTERS, LEVELS, pointsWord, clock, dateText } from './ui.js';

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

// Вопросы, которые прозвучали: с ответом и тот, на котором выпуск закончили или который идёт.
// n: номер в выпуске, a: ответ (game.js, reveal), status: ключ VERDICT, at: секунда записи,
// time: время на ответ, hints: подсказки на этом вопросе, was: текст заменённого вопроса
export function questionRows(ep) {
  const answers = ep.answers || [];
  const questions = ep.questions || [];
  const now = ep.shown && ep.index === answers.length && questions[ep.index] ? 1 : 0;
  const at = shownAt(ep);
  return questions.slice(0, answers.length + now).map((q, i) => {
    const a = answers[i] || null;
    const hints = Object.keys(HINTS).filter(k => (ep.hints || {})[k] === i);
    const swap = (ep.swapped || []).find(s => s.index === i);
    return {
      n: i + 1, q, a, hints,
      status: !a ? (ep.finished ? 'stopped' : 'live') : a.correct ? 'right' : a.pick === null ? 'none' : 'wrong',
      at: at[i] ?? null,
      time: a ? a.time ?? a.think ?? null : null,
      hidden: a && a.hidden ? a.hidden : hints.includes('half') ? oldHidden(ep, q) : [],
      struck: a && a.struck != null ? a.struck : null,
      was: swap ? swap.text : null,
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
  // Финал «Ставка» (final.js): вместо баллов вопроса ставка гостя
  const head = [`${row.n}. ${q.topic}`, LEVELS[q.points],
    q.final ? `финал, ставка ${a ? a.stake : '?'}` : pointsWord(q.points)];
  if (row.at !== null) head.push(`на записи ${clock(row.at)}`);
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
    `Темы: ${topicsOf(ep).join(', ')}`,
    `Итог: верно ${r.correct} из ${r.asked}, ${pointsWord(ep.score)}`,
    `Время на ответы: ${timeText(timeOf(ep))}`,
    `Подсказки: ${hints.join(', ')}`,
    '',
    'ВОПРОСЫ ПО ПОРЯДКУ',
    'На записи: время от касания «Отвечаю», это 0:00.',
  ];
  for (const row of questionRows(ep)) out.push('', ...rowText(row));
  out.push('', 'ЖУРНАЛ ДЛЯ МОНТАЖА');
  for (const e of ep.log || []) if (e.t !== null) out.push(`${clock(e.t)}   ${e.text}`);
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}

// «Отвечаю Магомед 2026-11-03 15-30.txt»: знаки, запрещённые в имени файла Windows, убраны
export function fileName(ep, ext) {
  const name = String(ep.guest).replace(/[\\/:*?"<>|]/g, '').trim() || 'Гость';
  return `Отвечаю ${name} ${ep.id.slice(0, 10)} ${ep.id.slice(11, 16)}.${ext}`;
}
