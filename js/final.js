// Суперигра и лестница выпуска (решения автора 2026-11-09).
// После 12 вопросов заставка «Суперигра» (фаза super), потом 3 сложных вопроса, по одному
// из тем гостя в порядке выбора. Подсказок нет. Перед каждым гость ставит баллы: «Ничего»,
// «Половина» или «Всё». Верно: ставка в плюс, неверно или без ответа: в минус.
// Спасение (rescue), один раз за суперигру: гость потерял все баллы и впереди есть вопрос.
// Следующий вопрос идёт без ставки, верно: потерянные баллы возвращаются, неверно: 0.
// Гость шлёт ставку как pick «вид:номер вопроса» с index -3 (touch.js): правила базы
// пропускают от гостя только эти поля. В коде суперигра зовётся final (поле вопроса final: true).
// Чистые функции без сети: их проверяют тесты (tests/final.test.mjs).
import { GameError } from './game.js';

export const STAKES = { zero: 'Ничего', half: 'Половина', all: 'Всё' };
export const SUPER = 'Суперигра';

// Сколько баллов в ставке при счёте score
export function stakeOf(score, kind) {
  const s = Math.max(0, score || 0);
  return kind === 'all' ? s : kind === 'half' ? Math.floor(s / 2) : 0;
}

// Вопросы суперигры: пятый вопрос каждой темы (bank.js, pickFour). Только целиком:
// у одной из тем нет второго сложного вопроса, суперигры нет
export function finalQuestions(topics, sets) {
  const fin = topics.map(t => (sets[t.id] || [])[4]).filter(Boolean);
  return fin.length === topics.length ? fin.map(q => ({ ...q, final: true })) : [];
}

// Номер вопроса в суперигре: 1, 2, 3. Не суперигра: 0
export function finalNo(ep, i = ep.index) {
  const qs = ep.questions || [];
  if (!qs[i] || !qs[i].final) return 0;
  return qs.slice(0, i + 1).filter(q => q.final).length;
}

// «Следующий вопрос» привёл в суперигру: перед первым вопросом заставка, дальше ставка.
// При спасении ставки нет: ставка 0, ведущий сразу может показать вопрос
export function enterFinal(ep, now, log) {
  ep.shown = false;
  ep.stake = ep.stakeKind = null;
  const n = finalNo(ep);
  if (n === 1) {
    ep.phase = 'super';
    log(ep, 'super', `${SUPER}: заставка, 3 вопроса со ставками, подсказок нет`, now);
    return;
  }
  ep.phase = 'stake';
  if (ep.rescue) {
    ep.stake = 0;
    ep.stakeKind = 'rescue';
    log(ep, 'final', `${SUPER}, вопрос ${n} из 3: второй шанс, верно: вернутся ${ep.rescue} баллов`, now);
  } else {
    log(ep, 'final', `${SUPER}, вопрос ${n} из 3: гость делает ставку`, now);
  }
}

// «К ставке» после заставки или «Показать вопрос» после ставки.
// true: пора показать вопрос (game.js, showQuestion)
export function goFinal(ep, now, log) {
  if (ep.phase === 'super') {
    ep.phase = 'stake';
    log(ep, 'final', `${SUPER}, вопрос 1 из 3: гость делает ставку`, now);
    return false;
  }
  if (ep.stake == null) throw new GameError('Гость ещё не сделал ставку');
  ep.phase = 'question';
  return true;
}

// Ставка гостя или ведущего за гостя. Менять можно, пока вопрос не показан
export function setStake(ep, kind, host, now, log) {
  if (ep.rescue) throw new GameError('Второй шанс: ставки нет');
  if (!STAKES[kind]) throw new GameError('Нет такой ставки');
  ep.stakeKind = kind;
  ep.stake = stakeOf(ep.score, kind);
  log(ep, 'stake', `${host ? 'Ведущий за гостя' : 'Гость'}: ставка «${STAKES[kind]}», ${ep.stake}`, now);
}

// Отметка в ответе: ставка или спасение (сколько баллов было на кону)
export const finalMark = ep => (ep.rescue ? { rescue: ep.rescue } : { stake: ep.stake });

// Баллы за вопрос суперигры при «Открыть ответ». Спасение тратится. Гость потерял все баллы,
// впереди вопрос и спасения ещё не было: следующий вопрос со спасением
export function finalPoints(ep, ok) {
  if (ep.rescue) {
    const back = ok ? ep.rescue : 0;
    ep.rescue = null;
    return back;
  }
  const points = ok ? ep.stake : -ep.stake;
  const more = (ep.questions[ep.index + 1] || {}).final;
  if (points < 0 && ep.score + points === 0 && more && !ep.rescueUsed) {
    ep.rescue = -points;
    ep.rescueUsed = true;
  }
  return points;
}

// Лестница: шаг на каждый вопрос. ok верно, bad неверно, none без ответа, now идёт, wait впереди.
// f: шаг суперигры
export function ladder(ep) {
  const answers = ep.answers || [];
  return (ep.questions || []).map((q, i) => {
    const a = answers[i];
    let s = 'wait';
    if (a) s = a.correct ? 'ok' : a.pick === null ? 'none' : 'bad';
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
