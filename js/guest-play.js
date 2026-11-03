// Экран вопроса у гостя: варианты и подсказки (hints.js). Только сборка экрана,
// нажатия обрабатывает guest.js по data-pick и data-hint.
import { esc, pointsWord, LETTERS, LEVELS } from './ui.js';
import { HINTS } from './hints.js';

// Подсказки: три значка вверху, видны весь вопрос и после ответа (просьба автора 2026-11-03).
// Взятая сразу перечёркнута: «Второй шанс» сгорает при касании, угадал гость или нет.
// Нажать можно, пока гость не ответил, со второго касания (guest.js). Окно телевизора их
// только показывает: зрители видят, что у гостя осталось
const ICONS = {
  // «50:50» рисунком: ширина надписи задана, с любым шрифтом она внутри круга и не касается края
  half: '<svg class="g-tip-50" viewBox="0 0 40 20" aria-hidden="true"><text x="20" y="15" text-anchor="middle" textLength="38" lengthAdjust="spacingAndGlyphs">50:50</text></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  second: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15.3 3.5 9.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.5 2.3c0 6-8.5 11.2-8.5 11.2z" fill="currentColor"/></svg>',
};
const SHORT = { half: '50 на 50', swap: 'Замена', second: 'Второй шанс' };

function tips(s, q) {
  const open = s.phase === 'question' && q.shown && q.pick === null && q.struck == null;
  const used = s.used || [];
  return `<span class="g-tips">${Object.entries(HINTS).map(([kind, name]) => {
    const was = used.includes(kind);
    return `<button class="g-tip g-tip-${kind}${was ? ' g-tip-used' : ''}" data-hint="${kind}" aria-label="${name}" ${was || !open ? 'disabled' : ''}>
      <span class="g-tip-ico">${ICONS[kind]}</span><span class="g-tip-name">${SHORT[kind]}</span></button>`;
  }).join('')}</span>`;
}

export function question(s, p) {
  const q = s.q;
  const top = `
    <header class="g-top">
      <span class="chip">${esc(q.topic)}</span>
      <span class="chip">Вопрос ${s.index + 1} из ${s.total}</span>
      <span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>
      ${tips(s, q)}
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
  else if (q.second) verdict = '<div class="g-taken pop">Второй шанс: ошибёшься, выберешь ещё раз</div>';

  // Справка после «Открыть ответ»: гость и телевизор видят её рядом с вердиктом (просьба автора 2026-11-03)
  // Длинная справка мельче. С ней вопрос и варианты ниже: всё влезает без прокрутки
  const long = q.why && q.why.length > 220 ? ' g-why-long' : '';
  const why = reveal && q.why ? `<div class="sticker g-why${long} ${p} pop-2"><b>Справка</b>${esc(q.why)}</div>` : '';

  return top + `
    <section class="g-play${why ? ' g-play-why' : ''}">
      <div class="sticker g-q ${p}">${esc(q.text)}</div>
      <div class="g-opts">${options}</div>
      ${why ? `<div class="g-after">${verdict}${why}</div>` : verdict}
    </section>`;
}
