// Вкладка «Выпуск» на экране ведущего: подготовка, приглашение, вопрос, ответ, итог.
// Только сборка экрана. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, LETTERS, clock } from './ui.js';
import { resultOf } from './game.js';

export const GUEST_URL = new URL('gost/', location.href).href;

// Ключ экрана: экран строится заново, только когда ключ поменялся.
export function liveKey(S) {
  const ep = S.ep;
  if (!ep) return 'prep';
  return [ep.id, ep.phase, ep.index, ep.shown, ep.pick, ep.score, ep.phase === 'invite' && S.guestOnline].join('|');
}
// Пружина играет при смене фазы или вопроса, а не при каждом выборе.
export const liveBase = S => (S.ep ? [S.ep.id, S.ep.phase, S.ep.index, S.ep.shown].join('|') : 'prep');

export function buildLive(S, p) {
  const ep = S.ep;
  if (!ep) return prep(S, p);
  if (ep.phase === 'invite') return invite(S, p);
  if (ep.phase === 'result') return result(ep, p);
  return play(ep, p);
}

export function ratingList(players, limit = 5) {
  if (!players.length) return '<p class="h-empty">Пока пусто. Первый гость откроет рейтинг.</p>';
  const top = players.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, limit);
  return `<ol class="h-rating">${top.map(r => `
    <li><span>${esc(r.name)}</span><b>${pointsWord(r.points)}</b>
    <small>верно ${r.correct} из ${r.asked} · ${plural(r.episodes, ['выпуск', 'выпуска', 'выпусков'])}</small></li>`).join('')}</ol>`;
}

function prep(S, p) {
  const f = S.form;
  const players = S.players.map(pl => `
    <button class="chip h-known ${f.playerId === pl.id ? 'chip-yellow' : ''}" data-do="pickPlayer" data-id="${esc(pl.id)}">${esc(pl.name)}</button>`).join('');
  const topics = S.topics.map(t => `
    <button class="h-topic ${f.topics.has(t.id) ? 'h-topic-on' : ''}" data-do="toggleTopic" data-id="${esc(t.id)}">
      ${esc(t.name)}<small>${plural((t.questions || []).length, ['вопрос', 'вопроса', 'вопросов'])}</small>
    </button>`).join('');
  return `
    <section class="h-prep">
      <div class="sticker h-card ${p}">
        <h2 class="h-h2">Гость</h2>
        <input class="h-input" data-field="guest" placeholder="Имя гостя" maxlength="40" autocomplete="off" value="${esc(f.guest)}">
        ${players ? `<div class="h-row">${players}</div>` : ''}
        <h2 class="h-h2">Темы</h2>
        <div class="h-topics">${topics || '<p class="h-empty">Тем пока нет. Добавьте их во вкладке «Вопросы».</p>'}</div>
        <button class="btn h-go" data-do="start">Пригласить гостя</button>
      </div>
      <div class="h-side">
        <div class="sticker h-card h-tilt ${p} pop-1">
          <h2 class="h-h2">Экран гостя</h2>
          <p class="h-note">На Samsung откройте значок «Отвечаю: гость». Его адрес:</p>
          <b class="h-url">${esc(GUEST_URL.replace('https://', ''))}</b>
        </div>
        <div class="sticker h-card ${p} pop-2">
          <h2 class="h-h2">Лучшие</h2>
          ${ratingList(S.players)}
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
        : 'Samsung не на связи. Откройте на нём значок «Отвечаю: гость»'}</p>
      <button class="btn btn-ghost ${p} pop-2" data-do="cancel">Отменить</button>
    </section>`;
}

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
      <button class="${cls} ${p} pop-${i}" style="--c: var(--opt-${i})" data-do="pick" data-option="${i}" ${reveal || !ep.shown ? 'disabled' : ''}>
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
        <span class="chip chip-sky">${esc(q.topic)}</span>
        <span class="chip">Вопрос ${ep.index + 1} из ${ep.questions.length}</span>
        <span class="chip chip-yellow">${pointsWord(q.points)}</span>
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

function result(ep, p) {
  const r = resultOf(ep);
  return `
    <section class="h-result">
      <div class="h-result-head">
        <div class="sticker h-total ${p}">${esc(ep.guest)}: <b>верно ${r.correct} из ${r.asked}</b></div>
        <span class="chip chip-yellow h-total-points ${p} pop-1">${pointsWord(ep.score)}</span>
      </div>
      <div class="sticker h-card h-log ${p} pop-2">
        <h2 class="h-h2">Журнал для монтажа</h2>
        <p class="h-note">0:00 на журнале: гость нажал «Отвечаю». Найдите это касание на записи, от него идёт всё время.</p>
        <ol>${timeline(ep)}</ol>
      </div>
      <div class="h-actions">
        <button class="btn btn-second" data-do="journal" data-id="${esc(ep.id)}">Скачать журнал</button>
        <button class="btn h-main" data-do="new">Новый выпуск</button>
      </div>
    </section>`;
}
