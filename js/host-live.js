// Вкладка «Выпуск» на экране ведущего: подготовка, приглашение, вопрос, ответ, итог.
// Только сборка экрана. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, LETTERS, LEVELS, clock } from './ui.js';
import { resultOf, standings, timeOf, timeText } from './game.js';
import { runs } from './bank.js';

export const GUEST_URL = new URL('gost/', location.href).href;

// Ключ экрана: экран строится заново, только когда ключ поменялся.
export function liveKey(S) {
  const ep = S.ep;
  if (!ep) return 'prep';
  return [ep.id, ep.phase, ep.index, ep.shown, ep.pick, ep.score, ep.chosen, ep.draw, ep.phase === 'invite' && S.guestOnline].join('|');
}
// Пружина играет при смене фазы или вопроса, а не при каждом выборе.
export const liveBase = S => (S.ep ? [S.ep.id, S.ep.phase, S.ep.index, S.ep.shown].join('|') : 'prep');

export function buildLive(S, p) {
  const ep = S.ep;
  if (!ep) return prep(S, p);
  if (ep.phase === 'invite') return invite(S, p);
  if (ep.phase === 'topics') return topicsScreen(ep, p);
  if (ep.phase === 'result') return result(ep, p);
  return play(ep, p);
}

export function ratingList(players, episodes, limit = 5) {
  if (!players.length) return '<p class="h-empty">Пока пусто. Первый гость откроет таблицу.</p>';
  const top = standings(players, episodes).slice(0, limit);
  return `<ol class="h-rating">${top.map(r => `
    <li><i>${r.place}</i><span>${esc(r.name)}</span><b>${pointsWord(r.points)}</b>
    <small>верно ${r.correct} из ${r.asked} · время ${timeText(r.time)} · ${plural(r.episodes, ['выпуск', 'выпуска', 'выпусков'])}</small></li>`).join('')}</ol>`;
}

function prep(S, p) {
  const f = S.form;
  const players = S.players.map(pl => `
    <button class="chip h-known ${f.playerId === pl.id ? 'chip-yellow' : ''}" data-do="pickPlayer" data-id="${esc(pl.id)}">${esc(pl.name)}</button>`).join('');
  const topics = S.topics.map(t => {
    const n = runs(t);
    return `
    <button class="h-topic ${f.topics.has(t.id) ? 'h-topic-on' : ''} ${n ? '' : 'h-topic-low'}" data-do="toggleTopic" data-id="${esc(t.id)}">
      ${esc(t.name)}<small>${n ? 'хватит на ' + plural(n, ['выпуск', 'выпуска', 'выпусков']) : 'мало новых вопросов'}</small>
    </button>`;
  }).join('');
  return `
    <section class="h-prep">
      <div class="sticker h-card ${p}">
        <h2 class="h-h2">Гость</h2>
        <input class="h-input" data-field="guest" placeholder="Имя гостя" maxlength="40" autocomplete="off" value="${esc(f.guest)}">
        ${players ? `<div class="h-row">${players}</div>` : ''}
        <h2 class="h-h2">Темы в игре</h2>
        <p class="h-note h-note-top">Гость сам выберет три темы из отмеченных. Тема с малым запасом вопросов в выбор не попадёт.</p>
        <div class="h-topics">${topics || '<p class="h-empty">Тем пока нет. Добавьте их во вкладке «Вопросы».</p>'}</div>
        <div class="h-go-row">
          <button class="btn btn-second" data-do="trial">Пробный выпуск</button>
          <button class="btn h-go" data-do="start">Пригласить гостя</button>
        </div>
        <p class="h-note">Пробный выпуск не сжигает вопросы и не попадает в таблицу и «Историю».</p>
      </div>
      <div class="h-side">
        <div class="sticker h-card h-tilt ${p} pop-1">
          <h2 class="h-h2">Экран гостя</h2>
          <p class="h-note">На Samsung откройте значок «Гость». Его адрес:</p>
          <b class="h-url">${esc(GUEST_URL.replace('https://', ''))}</b>
        </div>
        <div class="sticker h-card ${p} pop-2">
          <h2 class="h-h2">Лучшие</h2>
          ${ratingList(S.players, S.episodes)}
        </div>
      </div>
    </section>`;
}

function invite(S, p) {
  return `
    <section class="h-center">
      <div class="sticker h-invite ${p}"><span>${esc(S.ep.guest)},</span><b class="logo">отвечаешь?</b></div>
      <p class="h-wait ${p} pop-1">${S.guestOnline
        ? 'Ждём, пока гость нажмёт «Отвечаю» на Samsung'
        : 'Samsung не на связи. Откройте на нём значок «Гость»'}</p>
      <button class="btn btn-ghost ${p} pop-2" data-do="cancel">Отменить</button>
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
        <p class="h-note h-note-top">Темы пойдут в порядке выбора. Нажмите тему, чтобы выбрать или снять её за гостя.</p>
        <div class="h-topics">${choices}</div>
      </div>
      <div class="h-actions">
        <button class="btn btn-ghost" data-do="cancel">Отменить</button>
        <button class="btn h-main" data-do="begin" ${n === 3 ? '' : 'disabled'}>К вопросам</button>
      </div>
    </section>`;
}

const trialChip = ep => (ep.trial ? '<span class="chip chip-yellow h-trial">Пробный выпуск</span>' : '');

function play(ep, p) {
  const q = ep.questions[ep.index];
  const reveal = ep.phase === 'reveal';
  const last = ep.index + 1 >= ep.questions.length;
  const got = reveal ? ep.answers[ep.answers.length - 1].points : 0;
  const options = q.options.map((text, i) => {
    let cls = 'h-opt';
    if (reveal) cls += i === q.correct ? ' h-opt-right' : i === ep.pick ? ' h-opt-wrong' : '';
    else cls += (i === q.correct ? ' h-opt-correct' : '') + (i === ep.pick ? ' h-opt-pick' : '');
    const tags = (i === q.correct ? '<em class="h-tag h-tag-right">Правильный</em>' : '') +
      (i === ep.pick ? '<em class="h-tag">Выбор гостя</em>' : '');
    return `
      <button class="${cls} ${p} pop-${i}" data-do="pick" data-option="${i}" ${reveal || !ep.shown ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span>
        ${tags ? `<span class="h-tags">${tags}</span>` : ''}
      </button>`;
  }).join('');

  let actions;
  if (!ep.shown) {
    actions = '<button class="btn h-main" data-do="show">Показать гостю</button>';
  } else if (!reveal) {
    actions = `<span id="h-timer" class="h-timer"></span>
      ${ep.pick !== null ? '<button class="btn btn-second" data-do="clear_pick">Сбросить выбор</button>' : ''}
      <button class="btn h-main" data-do="reveal">Открыть ответ</button>`;
  } else {
    const verdict = got ? `Верно, +${pointsWord(got)}` : ep.pick === null ? 'Без ответа' : 'Неверно';
    actions = `<span class="h-verdict ${got ? 'h-verdict-right' : 'h-verdict-wrong'}">${verdict}</span>
      <button class="btn h-main" data-do="next">${last ? 'Итог' : 'Следующий вопрос'}</button>`;
  }

  return `
    <section class="h-play">
      <div class="h-meta">
        ${trialChip(ep)}
        <span class="chip">${esc(q.topic)}</span>
        <span class="chip">Вопрос ${ep.index + 1} из ${ep.questions.length}</span>
        <span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      <div class="sticker h-q ${p}">${esc(q.text)}${ep.shown ? '' : '<small>Прочитайте вопрос вслух, потом покажите варианты гостю</small>'}</div>
      <div class="h-opts">${options}</div>
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

// Итог: гость видит свой счёт. «Жребий места» запускает на Samsung поиск места в таблице,
// после жребия кнопка повторяет его, если камера пропустила момент
function result(ep, p) {
  const r = resultOf(ep);
  const me = (ep.table || []).find(row => row.me);
  const draw = !me ? '' : ep.draw
    ? '<button class="btn btn-second" data-do="draw">Повторить жребий</button>'
    : '<button class="btn h-main" data-do="draw">Жребий места</button>';
  return `
    <section class="h-result">
      <div class="h-result-head">
        ${trialChip(ep)}
        <div class="sticker h-total ${p}">${esc(ep.guest)}: <b>верно ${r.correct} из ${r.asked}</b></div>
        <span class="chip chip-yellow h-total-points ${p} pop-1">${pointsWord(ep.score)}</span>
        <span class="chip h-total-points ${p} pop-1">Время на ответы: ${timeText(timeOf(ep))}</span>
        ${me ? `<span class="chip h-total-points ${p} pop-2">Место в таблице: ${me.place}</span>` : ''}
      </div>
      <div class="sticker h-card h-log ${p} pop-2">
        <h2 class="h-h2">Журнал для монтажа</h2>
        <p class="h-note">0:00 на журнале: гость нажал «Отвечаю». Найдите это касание на записи, от него идёт всё время.</p>
        <ol>${timeline(ep)}</ol>
      </div>
      <div class="h-actions">
        <button class="btn btn-second" data-do="journal" data-id="${esc(ep.id)}">Скачать журнал</button>
        ${draw}
        <button class="btn ${me && !ep.draw ? 'btn-second' : 'h-main'}" data-do="new">Новый выпуск</button>
      </div>
    </section>`;
}
