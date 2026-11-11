// Главный экран ведущего без выпуска (решение автора 2026-11-11): Surface лёжа, 16:9, на весь экран.
// Слева турнирная таблица, справа темы в игре, внизу «Вне конкурса» и «Пригласить гостя».
// Разделы (Таблица, История, Вопросы, проба) только в меню ⚙. Имя гостя спрашивает окно после кнопки.
// Только сборка экрана. Нажатия обрабатывает host.js по data-do.
import { esc, episodesWord } from './ui.js';
import { standings, timeText } from './game.js';
import { runs, LOW } from './bank.js';

export const PROBA = new URLSearchParams(location.search).has('proba');

export function prep(S, p) {
  const f = S.form;
  // Под темой: на сколько выпусков её хватит. Тема кончается: красная точка (bank.js, LOW)
  const topics = S.topics.map(t => {
    const n = runs(t);
    return `
    <button class="h-topic ${f.topics.has(t.id) ? 'h-topic-on' : ''} ${n ? '' : 'h-topic-low'}" data-do="toggleTopic" data-id="${esc(t.id)}">
      ${esc(t.name)}<small class="${n <= LOW ? 'h-end' : ''}">${n ? 'ещё на ' + episodesWord(n) : 'мало вопросов'}</small></button>`;
  }).join('');
  const right = `
      <div class="sticker h-card h-home-topics ${p} pop-1">
        <h2 class="h-h2">Темы в игре <small>гость выберет три</small></h2>
        <div class="h-topics">${topics || '<p class="h-empty">Тем пока нет. Добавьте их в разделе «Вопросы» (меню ⚙).</p>'}</div>
      </div>`;
  const go = PROBA ? '<button class="btn h-go" data-do="ask" data-ask="trial">Начать пробу</button>' : `
      <button class="btn btn-second" data-do="ask" data-ask="trial">Вне конкурса</button>
      <button class="btn h-go" data-do="ask" data-ask="start">Пригласить гостя</button>`;
  return `
    <section class="h-home${PROBA ? ' h-home-proba' : ''}">
      ${PROBA ? '' : table(S, p)}
      ${right}
      <div class="h-go-row h-home-go ${p} pop-2">${go}</div>
      ${f.ask ? ask(f) : ''}
    </section>`;
}

// Таблица участников: место, имя, верно, время, баллы. Касание строки открывает участника в разделе «Таблица»
function table(S, p) {
  const rows = standings(S.players, S.episodes);
  const body = rows.map(r => `
      <tr data-do="openPlayer" data-id="${esc(r.id)}">
        <td>${r.place}</td><td class="h-tname">${esc(r.name)}</td>
        <td>${r.correct} из ${r.asked}</td><td>${timeText(r.time)}</td><td class="h-tpoints">${r.points}</td>
      </tr>`).join('');
  return `
      <div class="sticker h-card h-home-table ${p}">
        <h2 class="h-h2">Таблица участников</h2>
        ${rows.length ? `<div class="h-scroll" data-keep="home-table">
          <table class="h-table">
            <thead><tr><th>Место</th><th>Участник</th><th>Верно</th><th>Время</th><th>Баллы</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>` : '<p class="h-empty">Таблица пустая. Она заполнится после первого выпуска.</p>'}
      </div>`;
}

// Окно имени гостя. Каждое участие отдельное: баллы прошлых выпусков не складываются.
// Гость пришёл второй раз: ведущий дописывает номер (решение автора 2026-11-11)
function ask(f) {
  const trial = f.ask === 'trial';
  return `
      <div class="h-ask" role="dialog" aria-modal="true">
        <div class="sticker h-card h-ask-card pop">
          <h2 class="h-h2">${trial ? 'Вне конкурса: как зовут гостя?' : 'Как зовут гостя?'}</h2>
          <input class="h-input" data-field="guest" placeholder="Имя и фамилия" maxlength="40" autocomplete="off" value="${esc(f.guest)}">
          <p class="h-note">${trial
            ? 'Выпуск как настоящий, но ничего не сохраняется, вопросы не тратятся.'
            : 'Каждое участие отдельное. Гость пришёл второй раз: допишите номер, например «Атам Хасиев 2».'}</p>
          <div class="h-go-row">
            <button class="btn btn-ghost" data-do="askCancel">Отмена</button>
            <button class="btn h-go" data-do="${trial ? 'trial' : 'start'}">${trial ? 'Начать' : 'Пригласить'}</button>
          </div>
        </div>
      </div>`;
}
