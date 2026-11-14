// Исправление итога вопроса (2026-11-14): ведущий ошибся кнопкой «Верно» или «Неверно»,
// или в банке неверно отмечен правильный вариант. «Верно» становится «Неверно» и обратно,
// баллы выпуска пересчитаны. Раньше открытый ответ исправить было нельзя.
// В выпуске: сразу после «Открыть ответ» (game.js, действие fix). В «Истории»: любой вопрос
// закрытого выпуска (host-data-actions.js). Таблица считается из выпусков и меняется сама (table.js).
// Чистая функция без сети: её проверяет tests/fix.test.mjs.
import { GameError } from './game.js';
import { priceOf } from './final.js';

const pad = n => String(n).padStart(2, '0');

// i: номер вопроса от 0. log: журнал идущего выпуска (game.js). Без него запись в журнал
// идёт без секунды записи: выпуск давно закончен
export function fixAnswer(ep, i, now, log = null) {
  const a = (ep.answers || [])[i];
  const q = (ep.questions || [])[i];
  if (!a || !q) throw new GameError('У этого вопроса нет ответа');
  // Выпуски до 2026-11-11: в суперигре ставили баллы, их цену не восстановить
  if (q.final && !a.mode) throw new GameError('Старый выпуск: итог суперигры не исправить');
  const ok = !a.correct;
  const points = ok ? (q.final ? priceOf(q, a.mode) : q.points) : 0;
  ep.score = (ep.score || 0) + points - (a.points || 0);
  a.correct = ok;
  a.points = points;
  a.fixed = true;
  const text = `Ведущий исправил итог вопроса ${i + 1}: ${ok ? 'верно' : 'неверно'}. Баллы: ${points}, всего ${ep.score}`;
  if (log) return log(ep, 'fix', text, now);
  const d = new Date(now);
  (ep.log = ep.log || []).push({ t: null, clock: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, event: 'fix', text, q: i });
}
