// Экраны гостя: вопрос с вариантами и подсказками (hints.js), выбор тем, суперигра. Только сборка
// экрана, нажатия обрабатывает guest.js по data-pick, data-hint, data-topic и data-stake.
import { esc, pointsWord, LETTERS, LEVELS } from './ui.js';
import { HINTS } from './hints.js';
import { STAKES, ladderHtml, SUPER } from './final.js';
import './sboi.js';  // журнал ошибок и пропажи связи у гостя

// Подсказки: три значка вверху, видны весь вопрос и после ответа (просьба автора 2026-11-03).
// Взятая сразу перечёркнута: «Второй шанс» сгорает при касании, угадал гость или нет.
// Нажать можно, пока гость не ответил, со второго касания (guest.js)
const ICONS = {
  // «50:50» рисунком: ширина надписи задана, с любым шрифтом она внутри круга и не касается края
  half: '<svg class="g-tip-50" viewBox="0 0 40 20" aria-hidden="true"><text x="20" y="15" text-anchor="middle" textLength="38" lengthAdjust="spacingAndGlyphs">50:50</text></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  second: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15.3 3.5 9.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.5 2.3c0 6-8.5 11.2-8.5 11.2z" fill="currentColor"/></svg>',
};
const SHORT = { half: '50 на 50', swap: 'Замена', second: 'Второй шанс' };

function tips(s, q) {
  if (q.final) return '';
  const open = s.phase === 'question' && q.shown && q.pick === null && q.struck == null;
  const used = s.used || [];
  return `<span class="g-tips">${Object.entries(HINTS).map(([kind, name]) => {
    const was = used.includes(kind);
    return `<button class="g-tip g-tip-${kind}${was ? ' g-tip-used' : ''}" data-hint="${kind}" aria-label="${name}" ${was || !open ? 'disabled' : ''}>
      <span class="g-tip-ico">${ICONS[kind]}</span><span class="g-tip-name">${SHORT[kind]}</span></button>`;
  }).join('')}</span>`;
}

// o.open: пауза на чтение кончилась, варианты на экране (pause.js). Пока она идёт, варианты
// держат своё место, но не видны: вопрос не прыгает, когда они выезжают. o.fresh: варианты
// только что выехали, пружина у них. o.wait: вариант, который гость нажал, а панель ещё
// не приняла (guest-send.js): он жёлтый, остальные не нажимаются
export function question(s, p, o = { open: true }) {
  const q = s.q;
  const waiting = !o.open && s.phase === 'question';
  const mine = s.phase === 'question' && q.pick === null && o.wait != null ? o.wait : null;
  const top = `
    <header class="g-top">
      <span class="chip">${esc(q.topic)}</span>
      <span class="chip">Вопрос ${s.index + 1} из ${s.total}</span>
      ${q.final ? `<span class="chip chip-yellow">${SUPER} ${q.final} из 3 · ${q.free ? 'без вариантов' : 'с вариантами'}, +${q.stake}</span>`
        : `<span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>`}
      <span id="g-timer" class="chip g-timer" aria-label="Время на ответ"></span>
      ${tips(s, q)}
    </header>${ladderHtml(s.ladder, s.phase === 'reveal' ? s.index : -1)}`;
  const reveal = s.phase === 'reveal';
  const locked = reveal || q.pick !== null || mine !== null || waiting;
  const hidden = q.hidden || [];
  // Суперигра без вариантов: до «Открыть ответ» только вопрос, гость отвечает вслух
  if (!q.options) return top + `
    <section class="g-play">
      <div class="sticker g-q ${p}">${esc(q.text)}</div>
      <div class="sticker g-super-card g-say ${p} pop-1">Отвечай вслух<small>Без вариантов. Верно: +${pointsWord(q.stake)}</small></div>
    </section>`;
  const options = q.options.map((text, i) => {
    let cls = 'g-opt';
    const gone = hidden.includes(i);
    if (gone) cls += ' g-opt-gone';
    else if (reveal) cls += i === q.correct ? ' g-opt-right' : i === q.pick ? ' g-opt-wrong' : ' g-opt-dim';
    else if (i === q.struck) cls += ' g-opt-wrong';
    else if (q.pick !== null) cls += i === q.pick ? ' g-opt-picked' : ' g-opt-dim';
    else if (mine !== null) cls += i === mine ? ' g-opt-picked' : ' g-opt-dim';
    if (waiting) cls += ' g-opt-wait';
    return `
      <button class="${cls} ${o.fresh ? 'pop' : p} pop-${i}" data-pick="${i}" ${locked || gone || i === q.struck ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span>
      </button>`;
  }).join('');

  let verdict = '';
  // Верно: по выбору гостя, без вариантов по отметке ведущего (баллы больше 0)
  if (reveal && (q.ok ?? q.pick === q.correct)) verdict = '<div class="sticker g-verdict g-verdict-right pop">Верно!</div>';
  else if (reveal) verdict = `<div class="sticker g-verdict g-verdict-wrong pop shake">${q.pick === null && !q.free ? 'Без ответа' : 'Мимо'}</div>`;
  else if (q.pick !== null) verdict = '<div class="g-taken pop">Ответ принят</div>';
  else if (q.struck != null) verdict = '<div class="g-taken pop">Мимо! Второй шанс: выбери ещё раз</div>';
  else if (waiting) verdict = '<div class="g-taken">Слушай вопрос</div>';
  else if (q.second) verdict = '<div class="g-taken pop">Второй шанс: ошибёшься, выберешь ещё раз</div>';

  // Справка после «Открыть ответ»: гость видит её рядом с вердиктом (просьба автора 2026-11-03)
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

// Выбор перед вопросом суперигры (final.js): с вариантами или без. Гость может передумать,
// пока ведущий не покажет вопрос. Нажатие обрабатывает guest.js по data-stake
export function stakeScreen(s, p) {
  const st = s.stake;
  const opts = Object.entries(STAKES).map(([kind, name], i) => `
      <button class="g-opt${st.kind === kind ? ' g-opt-picked' : st.kind ? ' g-opt-dim' : ''} ${p} pop-${i}" data-stake="${kind}">
        <span class="letter">${i + 1}</span><span>${name}: +${pointsWord((kind === 'free' ? 2 : 1) * st.points)}</span>
      </button>`).join('');
  return `
    <header class="g-top">
      <span class="chip chip-yellow">${SUPER} ${st.n} из 3</span>
      <span class="chip">${LEVELS[st.points]}</span>
    </header>${ladderHtml(s.ladder)}
    <section class="g-play g-stake">
      <div class="sticker g-q ${p}">С вариантами или без?<small>Без вариантов отвечаешь вслух, баллы вдвое. Ошибка: 0, твои баллы не сгорают</small></div>
      <div class="g-opts">${opts}</div>
      ${st.kind ? '<div class="g-taken pop">Выбор принят. Можно передумать, пока нет вопроса</div>' : ''}
    </section>`;
}

// Заставка суперигры у гостя: надпись и правила, пока ведущий их рассказывает
export function superScreen(s, p) {
  return `${ladderHtml(s.ladder)}
    <section class="g-center g-super">
      <h1 class="logo g-super-title ${p}">${SUPER}</h1>
      <div class="sticker g-super-card ${p} pop-1">
        <p>3 сложных вопроса. Перед каждым выбор: <b>с вариантами или без</b>.</p>
        <p>Без вариантов отвечаешь вслух, баллы вдвое.</p>
        <p>Ошибка: 0, твои баллы не сгорают.</p>
        <p>Подсказок нет.</p>
      </div>
    </section>`;
}

// Выбранные темы гостя: номера в порядке выбора. Старый вид выпуска хранил одно число
export const chosenOf = t => [].concat(t && t.chosen != null ? t.chosen : []);

// Темы выпуска: гость сам выбирает три. Выбранная тема жёлтая, как выбор ответа,
// с номером: в таком порядке пойдут вопросы. Повторное касание снимает тему
export function topicsScreen(t, p) {
  const chosen = chosenOf(t);
  const full = chosen.length >= 3;
  const choices = t.choices.map((name, i) => {
    const k = chosen.indexOf(i);
    const cls = k >= 0 ? ' g-opt-picked' : full ? ' g-opt-dim' : '';
    return `<button class="g-choice${cls} ${p} pop-${i % 4}" data-topic="${i}" ${k < 0 && full ? 'disabled' : ''}>
      ${k >= 0 ? `<span class="letter">${k + 1}</span>` : ''}<span>${esc(name)}</span></button>`;
  }).join('');
  return `
    <section class="g-center">
      <h1 class="logo g-pick-title ${p}">${full ? 'Твои темы' : 'Выбери 3 темы'}</h1>
      <p class="g-name g-name-sm ${p} pop-1">${full ? 'Ждём ведущего' : `Выбрано ${chosen.length} из 3`}</p>
      <div class="g-choices">${choices}</div>
    </section>`;
}
