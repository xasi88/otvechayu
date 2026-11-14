// Разделы «Таблица и участники» и «Вопросы» («История» в host-history.js): всё, что есть
// в базе, в любое время, даже без гостя и без Samsung. Открываются из карточек главного экрана.
// Только сборка экранов. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, episodesWord, LETTERS, LEVELS, dateText } from './ui.js';
import { resultOf, timeText } from './game.js';
import { numbers, label, seasons, seasonTable, seasonName } from './season.js';
import { left, runs, spent, capacity, LOW, WHY_MAX } from './bank.js';

const questionsWord = n => plural(n, ['вопрос', 'вопроса', 'вопросов']);
export const empty = text => `<p class="h-empty">${text}</p>`;

// nums: номера выпусков (season.js). Подпись: «Сезон 1 · Выпуск 7»
export function episodeItem(e, selected, action = 'selEpisode', nums = null) {
  const r = resultOf(e);
  return `
    <button class="h-item ${selected === e.id ? 'h-item-on' : ''}" data-do="${action}" data-id="${esc(e.id)}">
      <b>${esc(e.guest)}</b><span>${pointsWord(e.score)}</span>
      <small>${label(e, nums)} · ${dateText(e.id)} · верно ${r.correct} из ${r.asked}${e.finished ? '' : ' · не закончен'}</small>
    </button>`;
}

// Раздел открыт из карточки главного экрана: сверху «Назад» и название раздела.
// Красная точка на «Назад»: выпуск идёт
export function head(S, title) {
  const live = S.ep && !S.ep.finished ? '<span class="h-live-dot"></span>' : '';
  return `
    <div class="h-back-row">
      <button class="btn btn-second h-back" data-do="tab" data-tab="live">← Назад${live}</button>
      <h1 class="h-h1">${title}</h1>
    </div>`;
}

// Таблица и участники на одном экране: слева все по местам, справа выбранный участник.
// Строка таблицы выбирает участника: его выпуски, «Убрать из таблицы».
// Таблица считается из выпусков (table.js): участник появляется с первым законченным выпуском
export function buildPlayers(S, p) {
  const f = S.form;
  // Таблица показывает текущий сезон, рядом переключатель: другой сезон или все (season.js).
  // seasonSel: выбранный сезон, 0 все сезоны, null текущий
  const cur = f.seasonSel ?? S.season;
  const rows = seasonTable(S.episodes, S.players, cur);
  const nums = numbers(S.episodes);
  const list = seasons(S.episodes, S.season);
  const pick = list.length < 2 ? '' : `<div class="h-inline h-wrap h-seasons">${list.map(n =>
    `<button class="chip h-pts ${cur === n ? 'chip-yellow' : ''}" data-do="selSeason" data-s="${n}">${esc(seasonName(n, S.names))}</button>`).join('')}
      <button class="chip h-pts ${cur === 0 ? 'chip-yellow' : ''}" data-do="selSeason" data-s="0">Все сезоны</button></div>`;
  const body = rows.map(r => `
    <tr class="${f.playerSel === r.id ? 'h-tr-on' : ''}" data-do="selPlayer" data-id="${esc(r.id)}">
      <td class="h-place">${r.place}</td>
      <td class="h-tname">${esc(r.name)}${r.no ? `<small>Сезон ${r.season} · Выпуск ${r.no}</small>` : ''}</td>
      <td>${r.correct} из ${r.asked}</td>
      <td>${timeText(r.time)}</td>
      <td class="h-tpoints">${r.points}</td>
    </tr>`).join('');
  const table = `
    <div class="h-scroll" data-keep="table">
      <table class="h-table">
        <thead><tr><th>Место</th><th>Участник</th><th>Верно</th><th>Время</th><th>Баллы</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="h-note">Выше тот, у кого больше баллов, потом больше верных ответов, потом меньше время.</p>`;
  const sel = rows.find(r => r.id === f.playerSel);
  let detail = empty('Нажмите на участника в таблице: здесь появятся его выпуски.');
  if (sel) {
    const eps = S.episodes.filter(e => e.playerId === sel.id);
    detail = `
      <div class="h-head-row">
        <h2 class="h-h2">${sel.place}. ${esc(sel.name)}</h2>
        <button class="h-small" data-do="delPlayer" data-id="${esc(sel.id)}" data-confirm="Точно убрать?">Убрать из таблицы</button>
      </div>
      <div class="h-stats">
        <span class="chip chip-yellow">${pointsWord(sel.points)}</span>
        <span class="chip">верно ${sel.correct} из ${sel.asked} (${sel.share}%)</span>
        <span class="chip">время ${timeText(sel.time)}</span>
        <span class="chip">${episodesWord(sel.episodes)}</span>
        <span class="chip">лучший выпуск: ${sel.best === null ? 'нет' : pointsWord(sel.best)}</span>
      </div>
      <div class="h-list" data-keep="player-${esc(sel.id)}">${eps.map(e => episodeItem(e, null, 'openEpisode', nums)).join('') || empty('Выпусков пока нет.')}</div>`;
  }
  return `
    ${head(S, 'Таблица и участники')}
    <section class="h-two h-two-table">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">${cur ? esc(seasonName(cur, S.names)) : 'Все сезоны'}: ${plural(rows.length, ['участник', 'участника', 'участников'])}</h2>
        ${pick}
        ${rows.length ? table : empty('Таблица пустая. Она заполнится после первого выпуска.')}
      </div>
      <div class="sticker h-card h-col ${p} pop-1">
        <div class="h-sel">${detail}</div>
        <p class="h-note">Участник появляется в таблице после своего выпуска. «Убрать из таблицы»: выпуски останутся в «Истории».</p>
      </div>
    </section>`;
}

// Карточка вопроса. Справка: почему ответ верный, ведущий видит её после «Открыть ответ».
// «Справка» открывает поле прямо в карточке (host-questions.js)
function questionCard(t, q, f) {
  const opts = q.options.map((o, i) => `
    <li class="${i === q.correct ? 'h-qopt-right' : ''}"><span class="letter">${LETTERS[i]}</span>${esc(o)}</li>`).join('');
  const ids = `data-topic="${esc(t.id)}" data-id="${esc(q.id)}"`;
  const why = f.whyEdit === q.id ? `
      <textarea class="h-input h-area" data-field="whyText" placeholder="Почему ответ верный: что, где, когда" maxlength="${WHY_MAX}">${esc(f.whyText)}</textarea>
      <div class="h-inline"><button class="btn" data-do="saveWhy" ${ids}>Сохранить справку</button>
        <button class="btn btn-ghost" data-do="cancelWhy">Отмена</button></div>`
    : q.why ? `<p class="h-qwhy">${esc(q.why)}</p>` : '';
  return `
    <div class="h-qcard ${q.used ? 'h-qcard-used' : ''}">
      <div class="h-head-row">
        <b>${esc(q.text)}</b>
        <span class="chip">${q.trap ? 'Подвох' : LEVELS[q.points]} · ${q.points}</span>
      </div>
      ${q.used ? `<p class="h-note">Был в выпуске ${dateText(q.used)}: больше не выпадет</p>` : ''}
      ${q.doubt ? `<p class="h-note"><span class="chip chip-yellow">Спорный</span> Отмечен в выпуске ${dateText(q.doubt)}: проверьте текст, варианты и ответ</p>` : ''}
      <ol class="h-qopts">${opts}</ol>
      ${why}
      <div class="h-inline h-wrap">
        ${q.used ? `<button class="h-small" data-do="openEpisode" data-id="${esc(q.used)}" data-q="${esc(q.id)}">Открыть выпуск</button>` : ''}
        ${f.whyEdit === q.id ? '' : `<button class="h-small" data-do="editWhy" ${ids}>${q.why ? 'Изменить справку' : 'Добавить справку'}</button>`}
        ${q.doubt ? `<button class="h-small" data-do="clearDoubt" ${ids}>Снять «спорный»</button>` : ''}
        <button class="h-small" data-do="delQuestion" ${ids} data-confirm="Точно удалить?">Удалить вопрос</button>
      </div>
    </div>`;
}

// Запас по темам: в скольких выпусках тема была, сколько вопросов сгорело, сколько новых
// и на сколько выпусков хватит. Строка открывает тему. Внизу всего (bank.js, capacity).
// Виден, пока тема не выбрана (просьба автора 2026-10-29)
function stockTable(S, used) {
  if (!S.topics.length) return empty('Тем пока нет. Добавьте тему слева или загрузите вопросы файлом.');
  let fresh = 0;
  const body = S.topics.map(t => {
    const s = spent(t);
    const n = left(t);
    const r = runs(t);
    fresh += n[1] + n[2] + n[3];
    return `
      <tr data-do="selTopic" data-id="${esc(t.id)}">
        <td class="h-tname">${esc(t.name)}</td><td>${s.episodes}</td><td>${s.questions}</td><td>${n[1] + n[2] + n[3]}</td>
        <td class="h-tpoints"><span class="${r <= LOW ? 'h-end' : ''}">${r}</span></td>
      </tr>`;
  }).join('');
  return `
    <h2 class="h-h2">Запас по темам</h2>
    <table class="h-table h-stock-table">
      <thead><tr><th>Тема</th><th>Вы&shy;пуски</th><th>Потра&shy;чено</th><th>Новых</th><th>Хватит на</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td class="h-tname">Всего</td><td>${S.episodes.length}</td><td>${used}</td><td>${fresh}</td><td class="h-tpoints">${capacity(S.topics)}</td></tr></tfoot>
    </table>
    <p class="h-note">Выпуски: в скольких выпусках тема уже была. Потрачено: сколько вопросов уже показано гостям. Хватит на: на сколько ещё выпусков хватит темы. Красная точка: тема кончается.</p>
    <p class="h-note">Строка «Всего» считает примерно: выпуск берёт три разные темы, а гости берут темы поровну. Выпуски вне конкурса вопросы не тратят. Нажмите на тему, чтобы открыть её вопросы.</p>`;
}

export function buildQuestions(S, p) {
  const f = S.form;
  const t = S.topics.find(x => x.id === f.topicSel);
  const used = S.topics.reduce((n, x) => n + spent(x).questions, 0);
  // Первая строка списка: запас по всем темам. Она же открыта, пока тема не выбрана
  const all = `
    <button class="h-item ${t ? '' : 'h-item-on'}" data-do="selTopic" data-id="">
      <b>Запас по темам</b><span>на ${episodesWord(capacity(S.topics))}</span>
      <small>снято выпусков ${S.episodes.length} · потрачено вопросов ${used}</small>
    </button>`;
  // Запас темы: новые вопросы по сложности и на сколько выпусков их хватит
  const topics = S.topics.map(t => {
    const n = left(t);
    const traps = (t.questions || []).filter(q => q.trap && !q.used).length;
    const doubts = (t.questions || []).filter(q => q.doubt).length;
    return `
    <button class="h-item ${f.topicSel === t.id ? 'h-item-on' : ''}" data-do="selTopic" data-id="${esc(t.id)}">
      <b>${esc(t.name)}</b><span>${questionsWord((t.questions || []).length)}</span>
      <small>новых: ${n[1]} лёгких · ${n[2]} средних (с подвохом ${traps}) · ${n[3]} сложных · хватит на ${episodesWord(runs(t))}${doubts ? ` · спорных: ${doubts}` : ''}</small>
    </button>`;
  }).join('');
  let right = stockTable(S, used);
  if (t) {
    const q = f.q;
    const optionRows = [0, 1, 2, 3].map(i => `
      <div class="h-inline">
        <button class="letter h-mark ${q.correct === i ? 'h-mark-on' : ''}" data-do="markCorrect" data-option="${i}" aria-label="Правильный ответ ${LETTERS[i]}">${LETTERS[i]}</button>
        <input class="h-input" data-field="qOpt" data-option="${i}" placeholder="Вариант ${LETTERS[i]}" maxlength="120" autocomplete="off" value="${esc(q.options[i])}">
      </div>`).join('');
    // Подвох: средний вопрос, где знакомый ответ неверный. В выпуске он идёт третьим в теме
    const points = [[1, 0, LEVELS[1]], [2, 0, LEVELS[2]], [2, 1, 'Подвох'], [3, 0, LEVELS[3]]].map(([n, trap, name]) => `
      <button class="chip h-pts ${q.points === n && !!q.trap === !!trap ? 'chip-yellow' : ''}" data-do="setPoints" data-n="${n}" data-trap="${trap}">${name} · ${n}</button>`).join('');
    right = `
      <div class="h-head-row">
        <h2 class="h-h2">${esc(t.name)}</h2>
        <button class="h-small" data-do="delTopic" data-id="${esc(t.id)}" data-confirm="Точно удалить тему?">Удалить тему</button>
      </div>
      <div class="h-form">
        <textarea class="h-input h-area" data-field="qText" placeholder="Текст вопроса" maxlength="300">${esc(q.text)}</textarea>
        ${optionRows}
        <p class="h-note">Зелёная буква: правильный ответ. Нажмите на букву, чтобы выбрать её.</p>
        <textarea class="h-input h-area" data-field="qWhy" placeholder="Справка: почему ответ верный. Её видит только ведущий" maxlength="${WHY_MAX}">${esc(q.why || '')}</textarea>
        <div class="h-inline h-wrap"><span class="h-label">Сложность</span>${points}
          <button class="btn h-add" data-do="addQuestion">Добавить вопрос</button></div>
      </div>
      <div class="h-list">${(t.questions || []).map(x => questionCard(t, x, f)).join('') || empty('В теме пока нет вопросов.')}</div>`;
  }
  return `
    ${head(S, 'Вопросы')}
    <section class="h-two h-two-wide">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Новая тема</h2>
        <div class="h-inline">
          <input class="h-input" data-field="newTopic" placeholder="Название темы" maxlength="40" autocomplete="off" value="${esc(f.newTopic)}">
          <button class="btn" data-do="addTopic">Добавить</button>
        </div>
        <div class="h-head-row">
          <h2 class="h-h2">Темы: ${S.topics.length}</h2>
          <button class="h-small" data-do="importFile">Загрузить вопросы</button>
        </div>
        <div class="h-list" data-keep="topics">${all}${topics || empty('Тем пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col h-col-scroll ${p} pop-1" data-keep="topic-${esc(f.topicSel || '')}">${right}</div>
    </section>`;
}
