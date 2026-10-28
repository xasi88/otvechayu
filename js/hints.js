// Подсказки гостя: «50 на 50», «Замена вопроса», «Второй шанс» (решения автора 2026-10-28).
// Каждая один раз за выпуск, баллы за вопрос полные. Взять можно, когда вопрос на экране
// и гость ещё не ответил. Гость жмёт подсказку на Samsung, ведущий может нажать её за гостя.
// Поля выпуска: hints (какая подсказка на каком вопросе), hidden (убранные «50 на 50» варианты),
// second (на вопросе взят «Второй шанс»), struck (первый неверный ответ при втором шансе),
// spares (запасные вопросы тем для замены, bank.js), swapped (заменённые вопросы для журнала).
import { GameError, seededRand } from './game.js';

export const HINTS = { half: '50 на 50', swap: 'Замена вопроса', second: 'Второй шанс' };

// log: журнал выпуска (game.js). Подсказка видна в журнале для монтажа
export function takeHint(ep, kind, host, now, log) {
  if (!HINTS[kind]) throw new GameError('Нет такой подсказки');
  if (!ep.shown) throw new GameError('Вопрос ещё не показан');
  if (ep.pick !== null) throw new GameError('Гость уже ответил');
  if (ep.struck != null) throw new GameError('Идёт второй шанс');
  ep.hints = ep.hints || {};
  if (kind in ep.hints) throw new GameError('Эта подсказка уже взята');
  const q = ep.questions[ep.index];
  let more = '';
  if (kind === 'half') {
    // Остаются правильный и один неверный. Случай от времени касания: тесты повторяемы
    const rand = seededRand(now);
    const wrong = q.options.map((_, i) => i).filter(i => i !== q.correct);
    const stay = wrong[Math.floor(rand() * wrong.length)];
    ep.hidden = wrong.filter(i => i !== stay);
    more = `: убраны ${ep.hidden.map(i => q.options[i]).join(', ')}`;
  } else if (kind === 'swap') {
    // Новый вопрос той же темы и сложности. Ведущий читает его и снова жмёт «Показать гостю»
    const spares = (ep.spares || {})[q.topicId] || {};
    const spare = spares[q.points];
    if (!spare) throw new GameError('Замены нет: в теме кончились вопросы этой сложности');
    delete spares[q.points];
    (ep.swapped = ep.swapped || []).push({ index: ep.index, id: q.id, text: q.text });
    ep.questions[ep.index] = spare;
    ep.shown = false;
    ep.shownAt = null;
    ep.hidden = [];
    more = `: вместо «${q.text}» вопрос «${spare.text}»`;
  } else {
    ep.second = true;
  }
  ep.hints[kind] = ep.index;
  log(ep, 'hint', `${host ? 'Ведущий за гостя взял' : 'Гость взял'} подсказку «${HINTS[kind]}»${more}`, now);
}

// «Второй шанс» при «Открыть ответ»: первый неверный ответ гаснет, гость отвечает ещё раз.
// true: ответ не открыт, вопрос идёт дальше
export function secondTry(ep, q, now, log) {
  if (!ep.second || ep.struck != null || ep.pick === null || ep.pick === q.correct) return false;
  ep.struck = ep.pick;
  ep.pick = ep.pickAt = null;
  log(ep, 'second', `Второй шанс: «${q.options[ep.struck]}» неверно, гость отвечает ещё раз`, now);
  return true;
}

// Вариант убран «50 на 50» или погас при втором шансе: его не выбрать
export const gone = (ep, option) => (ep.hidden || []).includes(option) || ep.struck === option;

// Следующий вопрос начинается без убранных вариантов
export function clearHints(ep) {
  ep.hidden = [];
  ep.second = false;
  ep.struck = null;
}
