// Итог выпуска числами: верные ответы, время на ответы. Вынесено из game.js 2026-11-14 (предел 20 КБ),
// game.js отдаёт эти функции дальше. Чистые функции без сети.
// Считают и полный выпуск (answers), и его короткую сводку из «Истории» (summary.js):
// у сводки ответов нет, в ней готовые числа correct, asked, time.

export function resultOf(ep) {
  if (!ep.answers) return { correct: ep.correct || 0, asked: ep.asked || 0 };
  return { correct: ep.answers.filter(a => a.correct).length, asked: ep.answers.length };
}

// Время на ответы за выпуск, секунды: сумма времени по вопросам.
// В выпусках до учёта времени есть только время до касания (think), его и берём.
export function timeOf(ep) {
  if (!ep.answers) return ep.time || 0;
  const sum = ep.answers.reduce((s, a) => s + (a.time ?? a.think ?? 0), 0);
  return Math.round(sum * 10) / 10;
}

// Время на ответы: «2:05,4», минуты, секунды и десятые
export function timeText(sec) {
  const t = Math.round(Math.max(0, sec || 0) * 10);
  return `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')},${t % 10}`;
}
