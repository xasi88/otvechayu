// Раздел «История»: слева выпуски, справа открытый выпуск. Его вопросы по порядку с номерами:
// варианты, правильный, ответ гостя, время, подсказки, справка. Внизу журнал для монтажа.
// Скачать: текстом и копией JSON для монтажа (просьба автора 2026-11-03).
// Карточки строятся только для открытого выпуска. Нажатия обрабатывает host.js по data-do.
import { esc, pointsWord, LETTERS, LEVELS, dateText, clock } from './ui.js';
import { resultOf, timeOf, timeText } from './game.js';
import { HINTS } from './hints.js';
import { finalLabel } from './final.js';
import { questionRows, topicsOf, secText, VERDICT } from './report.js';
import { reviewList, WHY } from './review.js';
import { numbers, label, seasonOf, allSeasons, seasonName } from './season.js';
import { timeline } from './host-live.js';
import { head, empty, episodeItem } from './host-data.js';

const TONE = { right: 'h-chip-right', wrong: 'h-chip-wrong', live: 'chip-yellow' };

// Вариант: правильный зелёный, неверный ответ гостя красный, убранный «50 на 50» бледный.
// Метка «ответ гостя» у ответа гостя, «первый ответ» у погасшего при «Втором шансе»
function option(row, o, i) {
  const { q, a } = row;
  const pick = a && i === a.pick;
  const cls = [i === q.correct ? 'h-qopt-right' : pick || i === row.struck ? 'h-qopt-wrong' : '',
    row.hidden.includes(i) ? 'h-qopt-gone' : ''].join(' ');
  const tag = pick ? '<em>ответ гостя</em>' : i === row.struck ? '<em>первый ответ</em>' : '';
  return `<li class="${cls}"><span class="letter">${LETTERS[i]}</span><span>${esc(o)}${tag}</span></li>`;
}

function card(row, on, id) {
  const { q, a } = row;
  return `
    <article class="h-hq ${on ? 'h-hq-on' : ''}">
      <div class="h-hq-head">
        <span class="h-hq-n">${row.n}</span>
        <span class="chip ${TONE[row.status] || ''}">${VERDICT[row.status]}${a ? ' · ' + pointsWord(a.points) : ''}</span>
        ${row.time !== null ? `<span class="chip">${secText(row.time)}</span>` : ''}
        <span class="chip">${esc(q.topic)}</span>
        <span class="chip">${LEVELS[q.points]}${q.final ? ` · ${finalLabel(a)}` : ''}</span>
        ${row.at !== null ? `<span class="chip">на записи ${clock(row.at)}</span>` : ''}
        ${row.hints.map(k => `<span class="chip chip-yellow">${HINTS[k]}</span>`).join('')}
        ${a && a.fixed ? '<span class="chip chip-yellow">итог исправлен</span>' : ''}
        ${row.doubt ? '<span class="chip chip-yellow">спорный</span>' : ''}
        <button class="h-small" data-do="doubtEp" data-id="${esc(id)}" data-q="${esc(q.id)}">${row.doubt ? 'Снять «спорный»' : 'Спорный?'}</button>
        ${a ? `<button class="h-small" data-do="fixEp" data-id="${esc(id)}" data-q="${row.n - 1}" data-confirm="Точно исправить?">Исправить: ${a.correct ? 'не засчитать' : 'засчитать'}</button>` : ''}
      </div>
      <p class="h-hq-text">${esc(q.text)}</p>
      ${row.was ? `<p class="h-note">Замена вопроса: вместо «${esc(row.was)}»</p>` : ''}
      <ol class="h-qopts">${q.options.map((o, i) => option(row, o, i)).join('')}</ol>
      ${q.why ? `<p class="h-qwhy">${esc(q.why)}</p>` : ''}
    </article>`;
}

// Разбор после выпуска (review.js): вопросы, которые стоит посмотреть в банке
function review(ep) {
  const list = reviewList(ep);
  if (!list.length) return '';
  return `
      <h2 class="h-h2 h-hq-log">Разобрать после выпуска: ${list.length}</h2>
      <ul class="h-review">${list.map(r => `<li><b>Вопрос ${r.n}${r.gone ? ', до замены' : ''}</b>
        ${r.why.map(k => `<span class="chip ${k === 'doubt' ? 'chip-yellow' : ''}">${WHY[k]}</span>`).join('')}
        <span>${esc(r.text)}</span></li>`).join('')}</ul>`;
}

// Перенос выпуска в другой сезон (просьба автора 2026-11-14): кнопка на каждый другой сезон
function move(ep, S) {
  const list = allSeasons(S.episodes, S.season).filter(n => n !== seasonOf(ep));
  if (!list.length || ep.trial) return '';
  return `
    <div class="h-hq-top">
      <span class="h-note">Перенести выпуск:</span>
      ${list.map(n => `<button class="h-small" data-do="moveEpisode" data-id="${esc(ep.id)}" data-s="${n}" data-confirm="Точно перенести?">в ${esc(seasonName(n, S.names))}</button>`).join('')}
    </div>`;
}

function detail(ep, f, nums, S) {
  const r = resultOf(ep);
  const rows = questionRows(ep);
  // Шапка в две низкие строки: на список вопросов остаётся почти вся высота
  return `
    <div class="h-hq-top">
      <h2 class="h-h2">${esc(ep.guest)}, ${dateText(ep.id)}</h2>
      <span class="chip">${label(ep, nums)}</span>
      <span class="chip chip-yellow">${pointsWord(ep.score)}</span>
      <span class="chip">верно ${r.correct} из ${r.asked}</span>
      <span class="chip">время ${timeText(timeOf(ep))}</span>
      ${ep.finished ? '' : '<span class="chip">не закончен</span>'}
    </div>
    <div class="h-hq-top">
      <button class="btn h-hq-dl" data-do="report" data-id="${esc(ep.id)}">Скачать выпуск</button>
      <button class="h-small" data-do="journal" data-id="${esc(ep.id)}">Копия для монтажа</button>
      <button class="h-small" data-do="delEpisode" data-id="${esc(ep.id)}" data-confirm="Точно удалить?">Удалить выпуск</button>
    </div>${move(ep, S)}
    <div class="h-list h-hq-list" data-keep="episode-${esc(ep.id)}">
      ${review(ep)}
      ${rows.map(row => card(row, row.q.id === f.epQ, ep.id)).join('') || empty('Вопросов в выпуске не было.')}
      <h2 class="h-h2 h-hq-log">Журнал для монтажа</h2>
      <p class="h-note">0:00: гость нажал «Отвечаю». От этого касания идёт всё время.</p>
      <ol class="h-timeline">${timeline(ep)}</ol>
      <p class="h-note">Темы: ${esc(topicsOf(ep).join(', '))}.</p>
      <p class="h-note">«Скачать выпуск»: текстовый файл, его читают в Блокноте. «Копия для монтажа»: файл JSON со всеми секундами.</p>
      <p class="h-note">Удалить выпуск: его баллы уйдут из таблицы, вопросы вернутся в запас.</p>
      <p class="h-note">Перенести выпуск: он уходит в таблицу другого сезона и получает там следующий номер.</p>
      <p class="h-note">«Исправить» у вопроса: итог меняется на обратный, баллы выпуска и таблица пересчитаны.</p>
      <p class="h-note">«Спорный?»: вопрос попадает в разбор после выпуска и получает метку в разделе «Вопросы».</p>
    </div>`;
}

export function buildHistory(S, p) {
  const f = S.form;
  const nums = numbers(S.episodes);
  const list = S.episodes.map(e => episodeItem(e, f.epSel, 'selEpisode', nums)).join('');
  // В списке короткие сводки (summary.js). Полный выпуск панель читает, когда он открыт (host-listen.js)
  const sel = S.full && S.full.id === f.epSel ? S.full : null;
  const wait = f.epSel && S.episodes.some(e => e.id === f.epSel) ? 'Загружаю выпуск.' : 'Нажмите на выпуск: здесь появятся все его вопросы по порядку.';
  return `
    ${head(S, 'История выпусков')}
    <section class="h-two h-two-hist">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Выпуски: ${S.episodes.length}</h2>
        <div class="h-list" data-keep="episodes">${list || empty('Выпусков пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col ${p} pop-1">${sel ? detail(sel, f, nums, S) : empty(wait)}</div>
    </section>`;
}
