// Раздел «История»: слева выпуски, справа открытый выпуск. Его вопросы по порядку с номерами:
// варианты, правильный, ответ гостя, время, подсказки, справка. Внизу журнал для монтажа.
// Скачать: текстом и копией JSON для монтажа (просьба автора 2026-11-03).
// Карточки строятся только для открытого выпуска. Нажатия обрабатывает host.js по data-do.
import { esc, pointsWord, LETTERS, LEVELS, dateText, clock } from './ui.js';
import { resultOf, timeOf, timeText } from './game.js';
import { HINTS } from './hints.js';
import { questionRows, topicsOf, secText, VERDICT } from './report.js';
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

function card(row, on) {
  const { q, a } = row;
  return `
    <article class="h-hq ${on ? 'h-hq-on' : ''}">
      <div class="h-hq-head">
        <span class="h-hq-n">${row.n}</span>
        <span class="chip ${TONE[row.status] || ''}">${VERDICT[row.status]}${a ? ' · ' + pointsWord(a.points) : ''}</span>
        ${row.time !== null ? `<span class="chip">${secText(row.time)}</span>` : ''}
        <span class="chip">${esc(q.topic)}</span>
        <span class="chip">${LEVELS[q.points]}${q.final && a ? ` · суперигра, ${a.rescue ? `второй шанс на ${a.rescue}` : `ставка ${a.stake}`}` : q.final ? ' · суперигра' : ''}</span>
        ${row.at !== null ? `<span class="chip">на записи ${clock(row.at)}</span>` : ''}
        ${row.hints.map(k => `<span class="chip chip-yellow">${HINTS[k]}</span>`).join('')}
      </div>
      <p class="h-hq-text">${esc(q.text)}</p>
      ${row.was ? `<p class="h-note">Замена вопроса: вместо «${esc(row.was)}»</p>` : ''}
      <ol class="h-qopts">${q.options.map((o, i) => option(row, o, i)).join('')}</ol>
      ${q.why ? `<p class="h-qwhy">${esc(q.why)}</p>` : ''}
    </article>`;
}

function detail(ep, f) {
  const r = resultOf(ep);
  const rows = questionRows(ep);
  // Шапка в две низкие строки: на список вопросов остаётся почти вся высота
  return `
    <div class="h-hq-top">
      <h2 class="h-h2">${esc(ep.guest)}, ${dateText(ep.id)}</h2>
      <span class="chip chip-yellow">${pointsWord(ep.score)}</span>
      <span class="chip">верно ${r.correct} из ${r.asked}</span>
      <span class="chip">время ${timeText(timeOf(ep))}</span>
      ${ep.finished ? '' : '<span class="chip">не закончен</span>'}
    </div>
    <div class="h-hq-top">
      <button class="btn h-hq-dl" data-do="report" data-id="${esc(ep.id)}">Скачать выпуск</button>
      <button class="h-small" data-do="journal" data-id="${esc(ep.id)}">Копия для монтажа</button>
      <button class="h-small" data-do="delEpisode" data-id="${esc(ep.id)}" data-confirm="Точно удалить?">Удалить выпуск</button>
    </div>
    <div class="h-list h-hq-list" data-keep="episode-${esc(ep.id)}">
      ${rows.map(row => card(row, row.q.id === f.epQ)).join('') || empty('Вопросов в выпуске не было.')}
      <h2 class="h-h2 h-hq-log">Журнал для монтажа</h2>
      <p class="h-note">0:00: гость нажал «Отвечаю». От этого касания идёт всё время.</p>
      <ol class="h-timeline">${timeline(ep)}</ol>
      <p class="h-note">Темы: ${esc(topicsOf(ep).join(', '))}.</p>
      <p class="h-note">«Скачать выпуск»: текстовый файл, его читают в Блокноте. «Копия для монтажа»: файл JSON со всеми секундами.</p>
      <p class="h-note">Удалить выпуск: его баллы уйдут из таблицы, вопросы вернутся в запас.</p>
    </div>`;
}

export function buildHistory(S, p) {
  const f = S.form;
  const list = S.episodes.map(e => episodeItem(e, f.epSel)).join('');
  const sel = S.episodes.find(e => e.id === f.epSel);
  return `
    ${head(S, 'История выпусков')}
    <section class="h-two h-two-hist">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Выпуски: ${S.episodes.length}</h2>
        <div class="h-list" data-keep="episodes">${list || empty('Выпусков пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col ${p} pop-1">${sel ? detail(sel, f) : empty('Нажмите на выпуск: здесь появятся все его вопросы по порядку.')}</div>
    </section>`;
}
