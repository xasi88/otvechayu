// Главный экран ведущего «Выпуск»: подготовка, приглашение, вопрос, ответ, итог.
// Только сборка экрана. Нажатия обрабатывает host.js по data-do.
import { esc, pointsWord, LETTERS, LEVELS, clock } from './ui.js';
import { resultOf, timeOf, timeText } from './game.js';
import { HINTS } from './hints.js';
import { finalNo, isFree, STAKES, SUPER } from './final.js';
import { stakeScreen, superScreen } from './host-final.js';
import { prep } from './host-home.js';

export const GUEST_URL = new URL('gost/', location.href).href;
// Проба без гостя (proba/index.html): панель слева, экран гостя справа, выпуск только вне конкурса.
// Главный экран без выпуска: host-home.js
export { PROBA } from './host-home.js';

// Ключ экрана: экран строится заново, только когда ключ поменялся.
// place: место гостя в таблице. Конец выпуска панель кладёт на экран сразу, без таблицы,
// таблицу считает база (host-db.js, change) и шлёт следом. Без места в ключе экран итога
// не перестраивался, и «Жребий места» не появлялся (баг 2026-11-08, tests/live.test.mjs)
export function liveKey(S) {
  const ep = S.ep;
  if (!ep) return 'prep';
  const hint = [Object.keys(ep.hints || {}).join(','), (ep.hidden || []).join(','), ep.struck, ep.second].join('/');
  const place = ((ep.table || []).find(r => r.me) || {}).place ?? '';
  return [ep.id, ep.phase, ep.index, ep.shown, ep.pick, ep.score, ep.chosen, ep.draw, ep.video && ep.video.at, hint, place, ep.stakeKind,
    ep.phase === 'invite' && S.guestOnline].join('|');
}
// Пружина играет при смене фазы или вопроса, а не при каждом выборе.
export const liveBase = S => (S.ep ? [S.ep.id, S.ep.phase, S.ep.index, S.ep.shown].join('|') : 'prep');

export function buildLive(S, p) {
  const ep = S.ep;
  if (!ep) return prep(S, p);
  if (ep.phase === 'invite') return invite(S, p);
  if (ep.phase === 'topics') return topicsScreen(ep, p);
  if (ep.phase === 'result') return result(ep, p);
  if (ep.phase === 'super') return superScreen(ep, p, trialChip(ep));
  if (ep.phase === 'stake') return stakeScreen(ep, p, trialChip(ep));
  return play(ep, p);
}

function invite(S, p) {
  return `
    <section class="h-center">
      <div class="sticker h-invite ${p}"><span>${esc(S.ep.guest)},</span><b class="logo">отвечаешь?</b></div>
      <p class="h-wait ${p} pop-1">${S.guestOnline
        ? 'Ждём, пока гость нажмёт «Отвечаю» на Samsung'
        : 'Samsung не на связи. Откройте на нём значок «Гость»'}</p>
      ${S.ep.video ? `<p class="chip chip-yellow ${p} pop-1">У гостя и на телевизоре ролик «Правила игры»</p>` : ''}
      <div class="h-actions ${p} pop-2">
        <button class="btn btn-ghost" data-do="cancel">Отменить</button>
        ${S.ep.video
          ? '<button class="btn btn-second" data-do="video" data-name="">Без правил</button>'
          : '<button class="btn btn-second" data-do="video" data-name="pravila">Правила ещё раз</button>'}
      </div>
    </section>`;
}

// Темы выпуска: гость выбирает три на Samsung, ведущий видит выбор сразу и может поправить.
// Номер у темы: её место в выпуске
function topicsScreen(ep, p) {
  const n = ep.chosen.length;
  const choices = ep.choices.map((t, i) => {
    const k = ep.chosen.indexOf(i);
    return `
    <button class="h-topic ${k >= 0 ? 'h-topic-on' : ''}" data-do="topic" data-option="${i}">${k >= 0 ? `<small>Тема ${k + 1}</small>` : ''}${esc(t.name)}</button>`;
  }).join('');
  return `
    <section class="h-center">
      <div class="sticker h-card h-topics-card ${p}">
        ${trialChip(ep)}
        <h2 class="h-h2">${n === 3 ? 'Гость выбрал три темы' : `Гость выбирает темы на Samsung: ${n} из 3`}</h2>
        <p class="h-note h-note-top">Вопросы пойдут по кругу тем, в порядке выбора. Нажмите тему, чтобы выбрать или снять её за гостя.</p>
        <div class="h-topics">${choices}</div>
      </div>
      <div class="h-actions">
        <button class="btn btn-ghost" data-do="cancel">Отменить</button>
        <button class="btn h-main" data-do="begin" ${n === 3 ? '' : 'disabled'}>К вопросам</button>
      </div>
    </section>`;
}

const trialChip = ep => (ep.trial ? '<span class="chip chip-yellow h-trial">Вне конкурса</span>' : '');

// Подсказки гостя (hints.js): ведущий видит, какие взяты, и может нажать за гостя.
// Взятая сразу перечёркнута, «Второй шанс» тоже (решение автора 2026-11-03)
function hintsRow(ep) {
  // В суперигре подсказок нет: ряд пустой, верх панели остаётся в одну строку
  if (ep.questions[ep.index].final) return '';
  const open = ep.phase === 'question' && ep.shown && ep.pick === null && ep.struck == null;
  const used = ep.hints || {};
  return `<span class="h-hints">${Object.entries(HINTS).map(([kind, name]) => {
    const was = kind in used;
    return `<button class="h-hint${was ? ' h-hint-used' : ''}" data-do="hint" data-hint="${kind}"
      data-confirm="Точно?" ${was || !open ? 'disabled' : ''}>${name}</button>`;
  }).join('')}</span>`;
}

// Замена вопроса ведущим до «Открыть ответ»: гостю подсказали (просьба автора 2026-11-10)
const SWAP = '<button class="btn btn-ghost" data-do="swap" data-confirm="Точно заменить?">Заменить вопрос</button>';

function play(ep, p) {
  const q = ep.questions[ep.index];
  const reveal = ep.phase === 'reveal';
  const last = ep.index + 1 >= ep.questions.length;
  const got = reveal ? ep.answers[ep.answers.length - 1].points : 0;
  const hidden = ep.hidden || [];
  // Суперигра без вариантов: гость отвечает вслух, ведущий жмёт «Верно» или «Неверно»
  const free = isFree(ep);
  const options = q.options.map((text, i) => {
    // Без вариантов ведущему до ответа нужен только правильный: экран не листается
    if (free && !reveal && i !== q.correct) return '';
    let cls = 'h-opt';
    const gone = hidden.includes(i) || i === ep.struck;
    if (hidden.includes(i)) cls += ' h-opt-gone';
    else if (reveal) cls += i === q.correct ? ' h-opt-right' : i === ep.pick ? ' h-opt-wrong' : '';
    else if (i === ep.struck) cls += ' h-opt-wrong';
    else cls += (i === q.correct ? ' h-opt-correct' : '') + (i === ep.pick ? ' h-opt-pick' : '');
    const tags = (i === q.correct ? '<em class="h-tag h-tag-right">Правильный</em>' : '') +
      (i === ep.pick ? '<em class="h-tag">Выбор гостя</em>' : '') +
      (i === ep.struck ? '<em class="h-tag">Первый ответ</em>' : '');
    return `
      <button class="${cls} ${p} pop-${i}" data-do="pick" data-option="${i}" ${reveal || !ep.shown || gone || free ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span>
        ${tags ? `<span class="h-tags">${tags}</span>` : ''}
      </button>`;
  }).join('');

  // Главная кнопка всегда справа внизу. Пока гость не ответил, она ждёт: ранний «Открыть ответ»
  // засчитывал вопрос без ответа. Гость молчит: «Без ответа» со второго касания (просьба автора 2026-11-03)
  let actions;
  if (!ep.shown) {
    actions = '<button class="btn h-main" data-do="show">Показать гостю</button>';
  } else if (!reveal && free) {
    actions = `<span id="h-timer" class="h-timer"></span>${SWAP}
      <button class="btn btn-ghost" data-do="noAnswer" data-confirm="Точно без ответа?">Без ответа</button>
      <button class="btn btn-second" data-do="judge" data-ok="0" data-confirm="Точно неверно?">Неверно</button>
      <button class="btn h-main" data-do="judge" data-ok="1" data-confirm="Точно верно?">Верно</button>`;
  } else if (!reveal && ep.pick === null) {
    actions = `<span id="h-timer" class="h-timer"></span>${SWAP}
      <button class="btn btn-ghost" data-do="noAnswer" data-confirm="Точно без ответа?">Без ответа</button>
      <button class="btn h-main" disabled>Ждём ответ гостя</button>`;
  } else if (!reveal) {
    actions = `<span id="h-timer" class="h-timer"></span>${SWAP}
      <button class="btn btn-second" data-do="clear_pick">Сбросить выбор</button>
      <button class="btn h-main" data-do="reveal">Открыть ответ</button>`;
  } else {
    const a = ep.answers[ep.answers.length - 1];
    const verdict = a.correct ? `Верно, +${pointsWord(got)}` : ep.pick === null && !a.said ? 'Без ответа' : 'Неверно';
    const ok = a.correct;
    actions = `<span class="h-verdict ${ok ? 'h-verdict-right' : 'h-verdict-wrong'}">${verdict}</span>
      <button class="btn h-main" data-do="next">${last ? 'Итог' : ep.questions[ep.index + 1].final ? (q.final ? 'Дальше' : SUPER) : 'Следующий вопрос'}</button>`;
  }

  return `
    <section class="h-play">
      <div class="h-meta">
        ${trialChip(ep)}
        <span class="chip">${esc(q.topic)}</span>
        <span class="chip">Вопрос ${ep.index + 1} из ${ep.questions.length}</span>
        ${q.final ? `<span class="chip chip-yellow">${SUPER} ${finalNo(ep)} из 3 · ${STAKES[ep.stakeKind] || ''}, верно +${ep.stake}</span>`
          : `<span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>`}
        ${hintsRow(ep)}
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      <div class="sticker h-q ${p}">${esc(q.text)}${ep.shown ? '' : '<small>Прочитайте вопрос вслух, потом покажите варианты гостю</small>'}</div>
      <div class="h-opts">${options}</div>
      ${q.why ? `<div class="sticker h-why${reveal ? '' : ' h-why-early'} ${p} pop-2"><b>${reveal ? 'Справка' : 'Справка: видите только вы'}</b>${esc(q.why)}</div>` : ''}
      <div class="h-actions">
        <button class="btn btn-ghost h-finish" data-do="finish" data-confirm="Точно закончить?">Закончить выпуск</button>
        ${actions}
      </div>
    </section>`;
}

export function timeline(ep) {
  return ep.log.filter(e => e.t !== null)
    .map(e => `<li><time>${clock(e.t)}</time><span>${esc(e.text)}</span></li>`).join('');
}

// Итог: гость видит свой счёт. Кнопка «Итог» уже запустила у гостя ролик итога и жребий места
// (game.js, finish). «Повторить жребий»: если камера пропустила момент, без ролика
function result(ep, p) {
  const r = resultOf(ep);
  const me = (ep.table || []).find(row => row.me);
  const draw = me ? '<button class="btn btn-second" data-do="draw">Повторить жребий</button>' : '';
  return `
    <section class="h-result">
      <div class="h-result-head">
        ${trialChip(ep)}
        <div class="sticker h-total ${p}">${esc(ep.guest)}: <b>верно ${r.correct} из ${r.asked}</b></div>
        <span class="chip chip-yellow h-total-points ${p} pop-1">${pointsWord(ep.score)}</span>
        <span class="chip h-total-points ${p} pop-1">Время на ответы: ${timeText(timeOf(ep))}</span>
        ${me ? `<span class="chip h-total-points ${p} pop-2">Место в таблице: ${me.place}</span>` : ''}
      </div>
      <div class="sticker h-card h-log ${p} pop-2" data-keep="log-${esc(ep.id)}">
        <div class="h-head-row">
          <h2 class="h-h2">Журнал для монтажа</h2>
          <button class="h-small" data-do="journal" data-id="${esc(ep.id)}">Копия для монтажа</button>
        </div>
        <p class="h-note">0:00 на журнале: гость нажал «Отвечаю». Найдите это касание на записи, от него идёт всё время.</p>
        <ol>${timeline(ep)}</ol>
      </div>
      <div class="h-actions">
        <button class="btn btn-second" data-do="report" data-id="${esc(ep.id)}">Скачать выпуск</button>
        ${draw}
        <button class="btn h-main" data-do="new">Новый выпуск</button>
      </div>
    </section>`;
}
