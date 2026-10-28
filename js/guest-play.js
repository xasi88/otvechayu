// Экран вопроса у гостя: варианты и подсказки (hints.js). Только сборка экрана,
// нажатия обрабатывает guest.js по data-pick и data-hint.
import { esc, pointsWord, LETTERS, LEVELS } from './ui.js';
import { HINTS } from './hints.js';

// Подсказки под вопросом. Взятая перечёркнута. Нажать можно, пока гость не ответил.
// Окно телевизора их только показывает: зрители видят, что у гостя осталось
function hints(s, q) {
  const open = s.phase === 'question' && q.pick === null && q.struck == null;
  const used = s.used || [];
  return `<div class="g-hints">${Object.entries(HINTS).map(([kind, name]) => {
    const was = used.includes(kind);
    const on = kind === 'second' && q.second && s.phase === 'question';
    const cls = 'g-hint' + (was && !on ? ' g-hint-used' : '') + (on ? ' g-hint-on' : '');
    return `<button class="${cls}" data-hint="${kind}" data-confirm="Точно?" ${was || !open ? 'disabled' : ''}>${name}</button>`;
  }).join('')}</div>`;
}

export function question(s, p) {
  const q = s.q;
  const top = `
    <header class="g-top">
      <span class="chip">${esc(q.topic)}</span>
      <span class="chip">Вопрос ${s.index + 1} из ${s.total}</span>
      <span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>
      <span class="g-score">Баллы: ${s.score}</span>
    </header>`;
  if (!q.shown) return top + `
    <section class="g-center">
      <h1 class="logo g-listen ${p}">Слушай вопрос</h1>
    </section>`;

  const reveal = s.phase === 'reveal';
  const locked = reveal || q.pick !== null;
  const hidden = q.hidden || [];
  const options = q.options.map((text, i) => {
    let cls = 'g-opt';
    const gone = hidden.includes(i);
    if (gone) cls += ' g-opt-gone';
    else if (reveal) cls += i === q.correct ? ' g-opt-right' : i === q.pick ? ' g-opt-wrong' : ' g-opt-dim';
    else if (i === q.struck) cls += ' g-opt-wrong';
    else if (q.pick !== null) cls += i === q.pick ? ' g-opt-picked' : ' g-opt-dim';
    return `
      <button class="${cls} ${p} pop-${i}" data-pick="${i}" ${locked || gone || i === q.struck ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span>
      </button>`;
  }).join('');

  let verdict = '';
  if (reveal && q.got) verdict = `<div class="sticker g-verdict g-verdict-right pop">Верно! +${pointsWord(q.got)}</div>`;
  else if (reveal) verdict = `<div class="sticker g-verdict g-verdict-wrong pop shake">${q.pick === null ? 'Без ответа' : 'Мимо'}</div>`;
  else if (q.pick !== null) verdict = '<div class="g-taken pop">Ответ принят</div>';
  else if (q.struck != null) verdict = '<div class="g-taken pop">Мимо! Второй шанс: выбери ещё раз</div>';

  return top + `
    <section class="g-play">
      <div class="sticker g-q ${p}">${esc(q.text)}</div>
      <div class="g-opts">${options}</div>
      ${verdict}
      ${hints(s, q)}
    </section>`;
}
