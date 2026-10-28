// Вкладки «Таблица», «Участники», «Вопросы», «История»: всё, что есть в базе, в любое время,
// даже без гостя и без Samsung. Только сборка экранов. Нажатия обрабатывает host.js по data-do.
import { esc, plural, pointsWord, LETTERS, LEVELS, dateText } from './ui.js';
import { resultOf, standings } from './game.js';
import { left, runs } from './bank.js';
import { timeline } from './host-live.js';

const episodesWord = n => plural(n, ['выпуск', 'выпуска', 'выпусков']);
const questionsWord = n => plural(n, ['вопрос', 'вопроса', 'вопросов']);
const empty = text => `<p class="h-empty">${text}</p>`;

function episodeItem(e, selected, action = 'selEpisode') {
  const r = resultOf(e);
  return `
    <button class="h-item ${selected === e.id ? 'h-item-on' : ''}" data-do="${action}" data-id="${esc(e.id)}">
      <b>${esc(e.guest)}</b><span>${pointsWord(e.score)}</span>
      <small>${dateText(e.id)} · верно ${r.correct} из ${r.asked}${e.finished ? '' : ' · идёт'}</small>
    </button>`;
}

// Турнирная таблица: все участники по местам. Строка открывает выпуски участника.
export function buildTable(S, p) {
  const rows = standings(S.players, S.episodes);
  const body = rows.map(r => `
    <tr data-do="openPlayer" data-id="${esc(r.id)}">
      <td class="h-place">${r.place}</td>
      <td class="h-tname">${esc(r.name)}</td>
      <td>${r.episodes}</td>
      <td>${r.correct} из ${r.asked}</td>
      <td>${r.share}%</td>
      <td>${r.best === null ? '-' : r.best}</td>
      <td class="h-tpoints">${r.points}</td>
    </tr>`).join('');
  const table = `
    <div class="h-scroll">
      <table class="h-table">
        <thead><tr><th>Место</th><th>Участник</th><th>Выпуски</th><th>Верно</th><th>Точность</th><th>Лучший выпуск</th><th>Баллы</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="h-note">При равных баллах выше тот, у кого больше верных ответов. Нажмите на строку: откроются выпуски участника.</p>`;
  return `
    <section class="h-board">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Турнирная таблица: ${plural(rows.length, ['участник', 'участника', 'участников'])}</h2>
        ${rows.length ? table : empty('Таблица пустая. Она заполнится после первого выпуска.')}
      </div>
    </section>`;
}

export function buildPlayers(S, p) {
  const f = S.form;
  const list = standings(S.players).map(pl => `
    <button class="h-item ${f.playerSel === pl.id ? 'h-item-on' : ''}" data-do="selPlayer" data-id="${esc(pl.id)}">
      <b>${pl.place}. ${esc(pl.name)}</b><span>${pointsWord(pl.points)}</span>
      <small>верно ${pl.correct} из ${pl.asked} · ${episodesWord(pl.episodes)}${pl.last ? ' · последний ' + dateText(pl.last) : ''}</small>
    </button>`).join('');
  const sel = S.players.find(pl => pl.id === f.playerSel);
  let detail = empty('Нажмите на участника: здесь появятся его выпуски и ответы.');
  if (sel) {
    const eps = S.episodes.filter(e => e.playerId === sel.id);
    const share = sel.asked ? Math.round(sel.correct / sel.asked * 100) : 0;
    detail = `
      <div class="h-head-row">
        <h2 class="h-h2">${esc(sel.name)}</h2>
        <button class="h-small" data-do="delPlayer" data-id="${esc(sel.id)}" data-confirm="Точно удалить?">Удалить участника</button>
      </div>
      <div class="h-stats">
        <span class="chip chip-yellow">${pointsWord(sel.points)}</span>
        <span class="chip">верно ${sel.correct} из ${sel.asked} (${share}%)</span>
        <span class="chip">${episodesWord(sel.episodes)}</span>
      </div>
      <div class="h-list">${eps.map(e => episodeItem(e, null, 'openEpisode')).join('') || empty('Выпусков пока нет.')}</div>`;
  }
  return `
    <section class="h-two">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Новый участник</h2>
        <div class="h-inline">
          <input class="h-input" data-field="newPlayer" placeholder="Имя" maxlength="40" autocomplete="off" value="${esc(f.newPlayer)}">
          <button class="btn" data-do="addPlayer">Добавить</button>
        </div>
        <h2 class="h-h2">Участники: ${S.players.length}</h2>
        <div class="h-list">${list || empty('Пока никого. Добавьте участника или проведите выпуск.')}</div>
      </div>
      <div class="sticker h-card h-col ${p} pop-1">${detail}</div>
    </section>`;
}

function questionCard(t, q) {
  const opts = q.options.map((o, i) => `
    <li class="${i === q.correct ? 'h-qopt-right' : ''}"><span class="letter">${LETTERS[i]}</span>${esc(o)}</li>`).join('');
  return `
    <div class="h-qcard ${q.used ? 'h-qcard-used' : ''}">
      <div class="h-head-row">
        <b>${esc(q.text)}</b>
        <span class="chip">${LEVELS[q.points]} · ${q.points}</span>
      </div>
      ${q.used ? `<p class="h-note">Был в выпуске ${dateText(q.used)}: больше не выпадет</p>` : ''}
      <ol class="h-qopts">${opts}</ol>
      <button class="h-small" data-do="delQuestion" data-topic="${esc(t.id)}" data-id="${esc(q.id)}" data-confirm="Точно удалить?">Удалить вопрос</button>
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
        <div class="h-inline h-wrap"><span class="h-label">Сложность</span>${points}
          <button class="btn h-add" data-do="addQuestion">Добавить вопрос</button></div>
      </div>
      <div class="h-list">${(t.questions || []).map(x => questionCard(t, x)).join('') || empty('В теме пока нет вопросов.')}</div>`;
  }
  return `
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
        <button class="btn btn-second" data-do="journal" data-id="${esc(sel.id)}">Скачать журнал</button>
      </div>
      <div class="h-stats">
        <span class="chip chip-yellow">${pointsWord(sel.score)}</span>
        <span class="chip">верно ${r.correct} из ${r.asked}</span>
        ${sel.finished ? '' : '<span class="chip">идёт</span>'}
      </div>
      <p class="h-note">0:00: гость нажал «Отвечаю». От этого касания идёт всё время.</p>
      <ol class="h-timeline">${timeline(sel)}</ol>`;
  }
  return `
    <section class="h-two">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Выпуски: ${S.episodes.length}</h2>
        <div class="h-list">${list || empty('Выпусков пока нет.')}</div>
      </div>
      <div class="sticker h-card h-col ${p} pop-1">${detail}</div>
    </section>`;
}
