// Суперигра и лестница выпуска. Ставка на знание, а не на баллы (решение автора 2026-11-11,
// раньше ставили баллы: азарт ломал итог 12 вопросов). После 12 вопросов заставка «Суперигра»
// (фаза super), потом 3 сложных вопроса, по одному из тем гостя в порядке выбора (решение автора
// 2026-11-14: суперигра только для самых трудных, раньше средний, подвох, сложный). Подсказок нет. Перед каждым гость выбирает, как отвечать (фаза stake):
// «С вариантами»: цена вопроса, «Без вариантов»: ответ вслух, двойная цена.
// Неверно или без ответа: 0, баллы не сгорают. Без вариантов ответ засчитывает ведущий
// кнопками «Верно» и «Неверно» (reveal с ok), гость вариантов не видит до «Открыть ответ».
// В коде выбор зовётся ставкой: фаза и действие stake, ep.stakeKind (opt, free), ep.stake: цена.
// Гость шлёт выбор как pick «вид:номер вопроса» с index -3 (touch.js): правила базы
// пропускают от гостя только эти поля. В коде суперигра зовётся final (поле вопроса final: true).
// Чистые функции без сети: их проверяют тесты (tests/final.test.mjs).
import { GameError } from './game.js';

export const STAKES = { opt: 'С вариантами', free: 'Без вариантов' };
export const SUPER = 'Суперигра';

// Цена вопроса суперигры: без вариантов вдвое
export const priceOf = (q, kind) => (kind === 'free' ? 2 : 1) * q.points;

// Ответ вслух: вопрос суперигры без вариантов
export const isFree = (ep, q = ep.questions[ep.index]) => !!(q && q.final && ep.stakeKind === 'free');

// Вопросы суперигры: у каждой темы три кандидата (bank.js, pickFour), все сложные.
// Тема k по порядку выбора даёт своего k-го кандидата.
// Только целиком: у одной из тем нет кандидата, суперигры нет
export function finalQuestions(topics, sets) {
  const fin = topics.map((t, k) => (sets[t.id] || [])[4 + k]).filter(Boolean);
  return fin.length === topics.length ? fin.map(q => ({ ...q, final: true })) : [];
}

// Номер вопроса в суперигре: 1, 2, 3. Не суперигра: 0
export function finalNo(ep, i = ep.index) {
  const qs = ep.questions || [];
  if (!qs[i] || !qs[i].final) return 0;
  return qs.slice(0, i + 1).filter(q => q.final).length;
}

// «Следующий вопрос» привёл в суперигру: перед первым вопросом заставка, дальше выбор
export function enterFinal(ep, now, log) {
  ep.shown = false;
  ep.stake = ep.stakeKind = null;
  const n = finalNo(ep);
  if (n === 1) {
    ep.phase = 'super';
    // Ролик с правилами суперигры у гостя и на телевизоре (rolik.js)
    ep.video = { name: 'super', at: now };
    log(ep, 'super', `${SUPER}: заставка, 3 вопроса, с вариантами или без, подсказок нет`, now);
    return;
  }
  ep.phase = 'stake';
  log(ep, 'final', `${SUPER}, вопрос ${n} из 3: гость выбирает, как отвечать`, now);
}

// «К выбору» после заставки или «Показать вопрос» после выбора.
// true: пора показать вопрос (game.js, showQuestion)
export function goFinal(ep, now, log) {
  if (ep.phase === 'super') {
    ep.phase = 'stake';
    ep.video = null;
    log(ep, 'final', `${SUPER}, вопрос 1 из 3: гость выбирает, как отвечать`, now);
    return false;
  }
  if (ep.stake == null) throw new GameError('Гость ещё не выбрал, как отвечать');
  ep.phase = 'question';
  return true;
}

// Суперигра без вариантов (решение автора 2026-11-12): подвох и вопрос «какой из этих» вслух не задать.
// Панель при «Показать вопрос» шлёт замену (bank.js, loudSpare), гость прежний вопрос не видел.
// ep.loud: номер вопроса и ok, есть ли замена. Замены нет: вопрос прежний, ведущий видит пометку
export function loudSwap(ep, data, now, log) {
  const q = ep.questions[ep.index];
  if (!data.was || data.was !== q.id || !isFree(ep)) return;
  if (!data.question || !data.question.id) {
    ep.loud = { i: ep.index, ok: false };
    log(ep, 'aloud', `Ответ вслух: замены нет, вопрос прежний «${q.text}»`, now);
    return;
  }
  (ep.swapped = ep.swapped || []).push({ index: ep.index, id: q.id, text: q.text, aloud: true });
  ep.questions[ep.index] = { ...data.question, final: true };
  ep.loud = { i: ep.index, ok: true };
  log(ep, 'aloud', `Ответ вслух: вместо «${q.text}» вопрос с коротким ответом «${data.question.text}»`, now);
}

// Выбор гостя или ведущего за гостя. Менять можно, пока вопрос не показан
export function setStake(ep, kind, host, now, log) {
  if (!STAKES[kind]) throw new GameError('Нет такого выбора');
  ep.stakeKind = kind;
  ep.stake = priceOf(ep.questions[ep.index], kind);
  log(ep, 'stake', `${host ? 'Ведущий за гостя' : 'Гость'}: «${STAKES[kind]}», верно: +${ep.stake}`, now);
}

// Ответ вслух засчитывает ведущий: ok true или false, «Без ответа»: none.
// Не без вариантов: null, ответ по выбору гостя
export function freeVerdict(ep, q, data) {
  if (!isFree(ep, q)) return null;
  if (data.none) return false;
  if (typeof data.ok !== 'boolean') throw new GameError('Ответ вслух: отметьте «Верно» или «Неверно»');
  return data.ok;
}

// Отметка в ответе: как отвечал гость. said: ответил вслух неверно (не «без ответа»)
export const finalMark = (ep, data) => ({ mode: ep.stakeKind, ...(isFree(ep) && !data.none ? { said: true } : {}) });

// Баллы за вопрос суперигры при «Открыть ответ»: верно цена выбора, иначе 0
export const finalPoints = (ep, ok) => (ok ? ep.stake : 0);

// Подпись вопроса суперигры в «Истории» и отчёте. Старые выпуски: ставка баллов и второй шанс
export function finalLabel(a) {
  if (!a) return 'суперигра';
  if (a.mode) return `суперигра, ${STAKES[a.mode].toLowerCase()}`;
  return `суперигра, ${a.rescue ? `второй шанс на ${a.rescue}` : `ставка ${a.stake}`}`;
}

// Лестница: шаг на каждый вопрос. ok верно, bad неверно, none без ответа, now идёт, wait впереди.
// f: шаг суперигры
export function ladder(ep) {
  const answers = ep.answers || [];
  return (ep.questions || []).map((q, i) => {
    const a = answers[i];
    let s = 'wait';
    if (a) s = a.correct ? 'ok' : a.pick === null && !a.said ? 'none' : 'bad';
    else if (i === ep.index && ep.phase !== 'result') s = 'now';
    return q.final ? { s, f: 1 } : { s };
  });
}

// Лестница на экране гостя и телевизора: узкая полоска над вопросом
export function ladderHtml(steps) {
  if (!steps || !steps.length) return '';
  return `<ol class="ladder" aria-label="Лестница выпуска">${steps.map((x, i) =>
    `<li class="ladder-${x.s}${x.f ? ' ladder-f' : ''}"><span>${i + 1}</span></li>`).join('')}</ol>`;
}
