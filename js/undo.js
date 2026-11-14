// Шаг ведущего над выпуском и «Назад на шаг» (2026-11-14). Раньше ошибочное касание ведущего
// (открыл ответ раньше времени, ушёл на следующий вопрос, взял подсказку за гостя, заменил вопрос)
// было не вернуть: была только кнопка «Исправить итог» (fix.js).
// Теперь перед таким действием в выпуск ложится снимок «как было» (ep.undo), а кнопка «Назад на шаг»
// со второго касания возвращает его. Шаг один: вернули, и снимка больше нет.
// После «Итога» шага назад нет: там уже ролик итога, жребий и запись в таблицу.
// Здесь же метка «спорный вопрос» (doubt) и смена экрана гостя (bind.js): это тоже действия ведущего,
// а в game.js места нет (предел 20 КБ).
// Чистые функции без сети: их проверяет tests/undo.test.mjs.
import { act, log, GameError } from './game.js';

// Действия, которые можно вернуть, и как их назвать в журнале и на кнопке
export const UNDO = {
  begin: 'переход к вопросам', reveal: 'открытый ответ', next: 'следующий вопрос', go: 'шаг суперигры',
  hint: 'подсказку за гостя', swap: 'замену вопроса', clear_pick: 'сброс выбора',
};

// Действие ведущего для очереди (queue.js): функция над выпуском. Время касания now
export function hostStep(action, data, now) {
  if (action === 'back') return ep => back(ep, now);
  if (action === 'doubt') return ep => doubt(ep, now);
  if (action === 'unbind') return ep => unbind(ep, now);
  return ep => {
    const was = UNDO[action] ? snapshot(ep) : null;
    act(ep, action, data, true, now);
    if (ep.finished) delete ep.undo;
    else if (was) ep.undo = { was, what: UNDO[action], at: now };
  };
}

// Снимок выпуска без прошлого снимка: они не вкладываются друг в друга
function snapshot(ep) {
  const { undo, ...rest } = ep;
  return structuredClone(rest);
}

// «Назад на шаг»: выпуск снова такой, каким был до последнего действия ведущего.
// Касания гостя после этого действия тоже уходят: они были ответом на то, чего больше нет.
// lastN остаётся: последнее касание гостя панель второй раз не примет. Секунды планшета (marks),
// привязка экрана гостя (dev) и метки «спорный» остаются как есть.
// sync: копию в «Истории» надо переписать, в ней остался ответ, которого больше нет (commit.js)
export function back(ep, now) {
  const u = ep.undo;
  if (!u || ep.finished) throw new GameError('Возвращать нечего');
  const keep = { lastN: ep.lastN, marks: ep.marks, dev: ep.dev, doubt: ep.doubt };
  const qid = ep.questions[ep.index] && ep.questions[ep.index].id;
  for (const k of Object.keys(ep)) delete ep[k];
  Object.assign(ep, u.was);
  for (const [k, v] of Object.entries(keep)) if (v !== undefined) ep[k] = v;
  // Вернулся другой вопрос (отменили замену), и гость на него ещё не ответил: он на экране заново,
  // время на ответ идёт с этого мига, после паузы на чтение
  const q = ep.questions[ep.index];
  if (ep.phase === 'question' && ep.shown && ep.pick === null && q && q.id !== qid) ep.shownAt = now + (ep.wait || 0);
  log(ep, 'back', `Ведущий вернул шаг назад: отменил ${u.what}`, now);
  ep.sync = true;
}

// Метка «спорный вопрос» одним касанием: вопрос на экране помечен для разбора после съёмки.
// Второе касание снимает метку. Метка видна в «Истории» и уходит в банк вместе со сгоранием (host-db.js)
export function doubt(ep, now) {
  const q = ep.questions[ep.index];
  if (!q || !['question', 'reveal'].includes(ep.phase)) throw new GameError('Сейчас вопроса на экране нет');
  const list = ep.doubt || [];
  const on = !list.includes(q.id);
  ep.doubt = on ? [...list, q.id] : list.filter(id => id !== q.id);
  log(ep, 'doubt', on ? `Ведущий отметил вопрос ${ep.index + 1} как спорный` : `Ведущий снял метку «спорный» с вопроса ${ep.index + 1}`, now);
  ep.sync = true;
}

// «Сменить экран гостя»: планшет сломался или сел. Привязка снята, первый экран гостя,
// который коснётся выпуска, станет его экраном (bind.js)
export function unbind(ep, now) {
  if (!ep.dev) throw new GameError('Экран гостя не привязан');
  ep.dev = null;
  log(ep, 'unbind', 'Ведущий снял привязку экрана гостя: выпуск примет касание с другого планшета', now);
}
