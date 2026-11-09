// Финал «Ставка» и лестница выпуска (решения автора 2026-11-09).
// После 12 вопросов идут 3 сложных, по одному из тем гостя в порядке выбора.
// Перед каждым гость ставит баллы: «Ничего», «Половина» или «Всё». Верно: ставка в плюс,
// неверно или без ответа: в минус. Подсказок в финале нет. Ставку можно менять,
// пока ведущий не показал вопрос. Гость шлёт ставку как pick «вид:номер вопроса» с index -3:
// правила базы пропускают от гостя только эти поля (guest.js, host.js).
// Чистые функции без сети: их проверяют тесты (tests/final.test.mjs).

export const STAKES = { zero: 'Ничего', half: 'Половина', all: 'Всё' };

// Сколько баллов в ставке при счёте score
export function stakeOf(score, kind) {
  const s = Math.max(0, score || 0);
  return kind === 'all' ? s : kind === 'half' ? Math.floor(s / 2) : 0;
}

// Вопросы финала: пятый вопрос каждой темы (bank.js, pickFour). Финал только целиком:
// у одной из тем нет сложного вопроса в запасе, финала нет
export function finalQuestions(topics, sets) {
  const fin = topics.map(t => (sets[t.id] || [])[4]).filter(Boolean);
  return fin.length === topics.length ? fin.map(q => ({ ...q, final: true })) : [];
}

// Номер вопроса в финале: 1, 2, 3. Не финал: 0
export function finalNo(ep, i = ep.index) {
  const qs = ep.questions || [];
  if (!qs[i] || !qs[i].final) return 0;
  return qs.slice(0, i + 1).filter(q => q.final).length;
}

// Ставка гостя или ведущего за гостя
export function setStake(ep, kind, host, now, log) {
  if (!STAKES[kind]) throw new Error('Нет такой ставки');
  ep.stakeKind = kind;
  ep.stake = stakeOf(ep.score, kind);
  log(ep, 'stake', `${host ? 'Ведущий за гостя' : 'Гость'}: ставка «${STAKES[kind]}», ${ep.stake}`, now);
}

// Лестница: шаг на каждый вопрос. ok верно, bad неверно, none без ответа, now идёт, wait впереди.
// f: шаг финала
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
