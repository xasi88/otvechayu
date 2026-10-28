// Разделы «Таблица и участники», «Вопросы», «История»: всё, что есть в базе, в любое время,
// даже без гостя и без Samsung. Открываются из карточек главного экрана.
// Только сборка экранов. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, LETTERS, LEVELS, dateText } from './ui.js';
import { resultOf, standings, timeOf, timeText } from './game.js';
import { left, runs, WHY_MAX } from './bank.js';
import { timeline } from './host-live.js';

const episodesWord = n => plural(n, ['выпуск', 'выпуска', 'выпусков']);
const questionsWord = n => plural(n, ['вопрос', 'вопроса', 'вопросов']);
const empty = text => `<p class="h-empty">${text}</p>`;

function episodeItem(e, selected, action = 'selEpisode') {
  const r = resultOf(e);
  return `
    <button class="h-item ${selected === e.id ? 'h-item-on' : ''}" data-do="${action}" data-id="${esc(e.id)}">
      <b>${esc(e.guest)}</b><span>${pointsWord(e.score)}</span>
      <small>${dateText(e.id)} · верно ${r.correct} из ${r.asked}${e.finished ? '' : ' · не закончен'}</small>
    </button>`;
}

// Раздел открыт из карточки главного экрана: сверху «Назад» и название раздела.
// Красная точка на «Назад»: выпуск идёт
function head(S, title) {
  const live = S.ep && !S.ep.finished ? '<span class="h-live-dot"></span>' : '';
  return `
    <div class="h-back-row">
      <button class="btn btn-second h-back" data-do="tab" data-tab="live">← Назад${live}</button>
      <h1 class="h-h1">${title}</h1>
    </div>`;
}

// Таблица и участники на одном экране: слева все по местам, справа новый участник и выбранный.
// Строка таблицы выбирает участника: его выпуски, удаление
export function buildPlayers(S, p) {
  const f = S.form;
  const rows = standings(S.players, S.episodes);
  const body = rows.map(r => `
    <tr class="${f.playerSel === r.id ? 'h-tr-on' : ''}" data-do="selPlayer" data-id="${esc(r.id)}">
      <td class="h-place">${r.place}</td>
      <td class="h-tname">${esc(r.name)}</td>
      <td>${r.correct} из ${r.asked}</td>
      <td>${timeText(r.time)}</td>
      <td class="h-tpoints">${r.points}</td>
    </tr>`).join('');
  const table = `
    <div class="h-scroll">
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
        <button class="h-small" data-do="delPlayer" data-id="${esc(sel.id)}" data-confirm="Точно удалить?">Удалить участника</button>
      </div>
      <div class="h-stats">
        <span class="chip chip-yellow">${pointsWord(sel.points)}</span>
        <span class="chip">верно ${sel.correct} из ${sel.asked} (${sel.share}%)</span>
        <span class="chip">время ${timeText(sel.time)}</span>
        <span class="chip">${episodesWord(sel.episodes)}</span>
        <span class="chip">лучший выпуск: ${sel.best === null ? 'нет' : pointsWord(sel.best)}</span>
      </div>
      <div class="h-list">${eps.map(e => episodeItem(e, null, 'openEpisode')).join('') || empty('Выпусков пока нет.')}</div>`;
  }
  return `
    ${head(S, 'Таблица и участники')}
    <section class="h-two h-two-table">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Турнирная таблица: ${plural(rows.length, ['участник', 'участника', 'участников'])}</h2>
        ${rows.length ? table : empty('Таблица пустая. Она заполнится после первого выпуска.')}
      </div>
      <div class="sticker h-card h-col ${p} pop-1">
        <h2 class="h-h2">Новый участник</h2>
        <div class="h-inline">
          <input class="h-input" data-field="newPlayer" placeholder="Имя" maxlength="40" autocomplete="off" value="${esc(f.newPlayer)}">
          <button class="btn" data-do="addPlayer">Добавить</button>
        </div>
        <div class="h-sel">${detail}</div>
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
        <span class="chip">${LEVELS[q.points]} · ${q.points}</span>
      </div>
      ${q.used ? `<p class="h-note">Был в выпуске ${dateText(q.used)}: больше не выпадет</p>` : ''}
      <ol class="h-qopts">${opts}</ol>
      ${why}
      <div class="h-inline h-wrap">
        ${f.whyEdit === q.id ? '' : `<button class="h-small" data-do="editWhy" ${ids}>${q.why ? 'Изменить справку' : 'Добавить справку'}</button>`}
        <button class="h-small" data-do="delQuestion" ${ids} data-confirm="Точно удалить?">Удалить вопрос</button>
      </div>
    </div>`;
}

export function buildQuestions(S, p) {
  const f = S.form;
  // Запас темы: новые вопросы по сложности и на сколько выпусков их хватит
  const topics = S.topics.map(t => {
    const n = left(t);
    return `
    <button class="h-item ${f.topicSel === t.id ? 'h-item-on' : ''}" data-do="selTopic" data-id="${esc(t.id)}">
      <b>${esc(t.name)}</b><span>${questionsWord((t.questions || []).length)}</span>
      <small>новых: ${n[1]} лёгких · ${n[2]} средних · ${n[3]} сложных · хватит на ${episodesWord(runs(t))}</small>
    </button>`;
  }).join('');
  const t = S.topics.find(x => x.id === f.topicSel);
  let right = empty('Выберите тему слева или добавьте новую.');
  if (t) {
    const q = f.q;
    const optionRows = [0, 1, 2, 3].map(i => `
      <div class="h-inline">
        <button class="letter h-mark ${q.correct === i ? 'h-mark-on' : ''}" data-do="markCorrect" data-option="${i}" aria-label="Правильный ответ ${LETTERS[i]}">${LETTERS[i]}</button>
        <input class="h-input" data-field="qOpt" data-option="${i}" placeholder="Вариант ${LETTERS[i]}" maxlength="120" autocomplete="off" value="${esc(q.options[i])}">
      </div>`).join('');
    const points = [1, 2, 3].map(n => `
      <button class="chip h-pts ${q.points === n ? 'chip-yellow' : ''}" data-do="setPoints" data-n="${n}">${LEVELS[n]} · ${n}</button>`).join('');
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
        <div class="h-list">${topics || empty('Тем пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col h-col-scroll ${p} pop-1">${right}</div>
    </section>`;
}

export function buildHistory(S, p) {
  const f = S.form;
  const list = S.episodes.map(e => episodeItem(e, f.epSel)).join('');
  const sel = S.episodes.find(e => e.id === f.epSel);
  let detail = empty('Нажмите на выпуск: здесь появится журнал для монтажа.');
  if (sel) {
    const r = resultOf(sel);
    detail = `
      <div class="h-head-row">
        <h2 class="h-h2">${esc(sel.guest)}, ${dateText(sel.id)}</h2>
        <div class="h-btns">
          <button class="btn btn-second" data-do="journal" data-id="${esc(sel.id)}">Скачать журнал</button>
          <button class="h-small" data-do="delEpisode" data-id="${esc(sel.id)}" data-confirm="Точно удалить?">Удалить выпуск</button>
        </div>
      </div>
      <div class="h-stats">
        <span class="chip chip-yellow">${pointsWord(sel.score)}</span>
        <span class="chip">верно ${r.correct} из ${r.asked}</span>
        <span class="chip">время ${timeText(timeOf(sel))}</span>
        ${sel.finished ? '' : '<span class="chip">не закончен</span>'}
      </div>
      <p class="h-note">0:00: гость нажал «Отвечаю». От этого касания идёт всё время.</p>
      <p class="h-note">Удалить выпуск: его баллы уйдут из таблицы, вопросы вернутся в запас.</p>
      <ol class="h-timeline">${timeline(sel)}</ol>`;
  }
  return `
    ${head(S, 'История выпусков')}
    <section class="h-two">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Выпуски: ${S.episodes.length}</h2>
        <div class="h-list">${list || empty('Выпусков пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col ${p} pop-1">${detail}</div>
    </section>`;
}
