// Разбор после выпуска (2026-11-14): какие вопросы стоит посмотреть в банке.
// Раньше после съёмки надо было листать весь выпуск и вспоминать, где что случилось.
// Теперь в открытом выпуске «Истории» сверху список: где гость ошибся или промолчал, где ведущий
// заменил вопрос или исправил итог, какие вопросы ведущий отметил как спорные (undo.js, doubt).
// Тот же список идёт в текстовый файл выпуска (report.js).
// Чистая функция без сети: её проверяет tests/review.test.mjs.
import { questionRows } from './report.js';

export const WHY = {
  doubt: 'спорный', fixed: 'итог исправлен', swap: 'заменён ведущим', aloud: 'не годился для ответа вслух',
  wrong: 'гость ошибся', none: 'гость не ответил',
};

// Строки разбора по порядку выпуска: n номер вопроса, id и text вопроса, why: ключи WHY.
// Заменённый вопрос идёт своей строкой перед тем, что встал на его место: править надо его
export function reviewList(ep) {
  const doubts = new Set(ep.doubt || []);
  const out = [];
  for (const row of questionRows(ep)) {
    const i = row.n - 1;
    for (const s of (ep.swapped || []).filter(x => x.index === i && (x.host || x.aloud || doubts.has(x.id)))) {
      const why = [doubts.has(s.id) ? 'doubt' : null, s.host ? 'swap' : null, s.aloud ? 'aloud' : null].filter(Boolean);
      out.push({ n: row.n, id: s.id, text: s.text, why, gone: true });
    }
    const why = [];
    if (doubts.has(row.q.id)) why.push('doubt');
    if (row.a && row.a.fixed) why.push('fixed');
    if (row.status === 'wrong') why.push('wrong');
    if (row.status === 'none') why.push('none');
    if (why.length) out.push({ n: row.n, id: row.q.id, text: row.q.text, why });
  }
  return out;
}

// Строка разбора словами: «Вопрос 5: спорный, гость ошибся. Текст вопроса»
export const reviewText = r => `Вопрос ${r.n}${r.gone ? ' (до замены)' : ''}: ${r.why.map(k => WHY[k]).join(', ')}. ${r.text}`;
