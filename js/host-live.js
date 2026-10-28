// Главный экран ведущего «Выпуск»: подготовка, приглашение, вопрос, ответ, итог.
// Только сборка экрана. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, LETTERS, LEVELS, clock, dateText } from './ui.js';
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

// Главный экран без выпуска. Слева новый выпуск, справа три карточки: каждая открывает свой раздел.
// Вкладок и кнопок сверху нет, всё влезает в экран Surface (правило автора 2026-10-28)
function prep(S, p) {
  const f = S.form;
  // Быстрый выбор гостя: восемь последних участников, остальных можно вписать
  const recent = [...S.players].sort((a, b) => String(b.last || '').localeCompare(String(a.last || ''))).slice(0, 8);
  const players = recent.map(pl => `
    <button class="chip h-known ${f.playerId === pl.id ? 'chip-yellow' : ''}" data-do="pickPlayer" data-id="${esc(pl.id)}">${esc(pl.name)}</button>`).join('');
  const topics = S.topics.map(t => `
    <button class="h-topic ${f.topics.has(t.id) ? 'h-topic-on' : ''} ${runs(t) ? '' : 'h-topic-low'}" data-do="toggleTopic" data-id="${esc(t.id)}">
      ${esc(t.name)}${runs(t) ? '' : '<small>мало вопросов</small>'}</button>`).join('');
  return `
    <section class="h-home">
      <div class="sticker h-card ${p}">
        <h2 class="h-h2">Новый выпуск</h2>
        <input class="h-input" data-field="guest" placeholder="Имя гостя" maxlength="40" autocomplete="off" value="${esc(f.guest)}">
        ${players ? `<div class="h-row">${players}</div>` : ''}
        <h2 class="h-h2">Темы в игре <small>гость выберет три</small></h2>
        <div class="h-topics">${topics || '<p class="h-empty">Тем пока нет. Добавьте их в разделе «Вопросы».</p>'}</div>
        <div class="h-go-row">
          <button class="btn btn-second" data-do="trial">Пробный выпуск</button>
          <button class="btn h-go" data-do="start">Пригласить гостя</button>
        </div>
      </div>
      <div class="h-side">
        ${mini(p, 'pop-1', 'Лучшие', 'players', 'Таблица', best(S))}
        ${mini(p, 'pop-2', 'Прошлые выпуски', 'history', 'История', lastEpisodes(S))}
        ${mini(p, 'pop-3', 'Вопросы', 'questions', 'Вопросы', stock(S))}
      </div>
    </section>`;
}

// Карточка справа: заголовок, кнопка в свой раздел, коротко главное
const mini = (p, pop, title, tab, go, body) => `
  <div class="sticker h-card h-mini ${p} ${pop}">
    <div class="h-head-row"><h2 class="h-h2">${title}</h2><button class="h-small" data-do="tab" data-tab="${tab}">${go} →</button></div>
    ${body}
  </div>`;

function best(S) {
  if (!S.players.length) return '<p class="h-empty">Пока пусто. Первый гость откроет таблицу.</p>';
  return `<div class="h-lines">${standings(S.players, S.episodes).slice(0, 3).map(r => `
    <button class="h-line" data-do="openPlayer" data-id="${esc(r.id)}"><i>${r.place}</i><span>${esc(r.name)}</span><b>${pointsWord(r.points)}</b></button>`).join('')}</div>`;
}

function lastEpisodes(S) {
  const eps = S.episodes.slice(0, 2);
  if (!eps.length) return '<p class="h-empty">Выпусков пока нет.</p>';
  return `<div class="h-lines">${eps.map(e => `
    <button class="h-line" data-do="openEpisode" data-id="${esc(e.id)}"><i>${dateText(e.id).slice(0, 5)}</i><span>${esc(e.guest)}</span><b>${e.finished ? pointsWord(e.score) : 'не закончен'}</b></button>`).join('')}</div>`;
}

// Запас вопросов коротко: сколько новых и у каких тем мало
function stock(S) {
  const fresh = S.topics.reduce((n, t) => n + (t.questions || []).filter(q => !q.used).length, 0);
  const low = S.topics.filter(t => !runs(t)).map(t => esc(t.name));
  return `<p class="h-note">${plural(S.topics.length, ['тема', 'темы', 'тем'])}, новых вопросов ${fresh}.${low.length ? ' Мало вопросов: ' + low.join(', ') + '.' : ''}</p>`;
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
        <p class="h-note h-note-top">Вопросы пойдут по кругу тем, в порядке выбора. Нажмите тему, чтобы выбрать или снять её за гостя.</p>
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
      ${reveal && q.why ? `<div class="sticker h-why ${p} pop-2"><b>Справка</b>${esc(q.why)}</div>` : ''}
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
      <div class="sticker h-card h-log ${p} pop-2" data-keep="log-${esc(ep.id)}">
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
