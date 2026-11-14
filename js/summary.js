// Короткая сводка выпуска (2026-11-14). Раньше панель при старте читала все выпуски «Истории»
// целиком, с вопросами и журналом: около 30 КБ на выпуск, к 200 выпускам это 6 МБ на каждый запуск.
// Теперь у выпуска два документа: полный (episodes) и сводка (sums) на несколько строк.
// Панель слушает только сводки: по ним считается таблица, строится список «Истории» и идёт сверка
// сгорания вопросов. Полный выпуск с журналом панель читает, когда ведущий его открыл (host-listen.js).
// Сводку пишет та же транзакция, что и полный выпуск (host-db.js). Старые выпуски получают сводки
// один раз, сами: панель сверяет число выпусков и сводок при запуске (host-listen.js, heal).
// Чистые функции без сети: их проверяет tests/summary.test.mjs.
import { resultOf, timeOf } from './score.js';

// Вопросы выпуска, которые гость увидел: ответил, заменил или видел в конце. Они сгорают в банке
// (host-db.js, burn). Замена для ответа вслух (aloud): гость прежний вопрос не видел, он не сгорает
export function burnIds(ep) {
  const ids = (ep.answers || []).map(a => a.id).concat((ep.swapped || []).filter(s => !s.aloud).map(s => s.id));
  if (ep.shown && ep.questions && ep.questions[ep.index]) ids.push(ep.questions[ep.index].id);
  return [...new Set(ids.filter(Boolean))];
}

// База не принимает поле без значения: пустые поля в сводку не идут
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

// Сводка: всё, что нужно таблице (table.js), списку «Истории» и сверке сгорания
export function summaryOf(ep) {
  const r = resultOf(ep);
  return clean({
    id: ep.id, guest: ep.guest, playerId: ep.playerId, score: ep.score || 0, finished: !!ep.finished,
    v: ep.v, out: ep.out || undefined, trial: ep.trial || undefined, season: ep.season, no: ep.no,
    correct: r.correct, asked: r.asked, time: timeOf(ep),
    burn: burnIds(ep), doubt: ep.doubt && ep.doubt.length ? ep.doubt : undefined,
  });
}

// Полный выпуск для «Истории»: без снимка «Назад на шаг» (undo.js), он нужен только идущему выпуску
export function stored(ep) {
  const { undo, sync, ...rest } = ep;
  return rest;
}
