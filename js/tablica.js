// Открытая таблица для зрителей (страница tablica/, решение автора 2026-11-14).
// Зритель открывает страницу по ссылке без входа и видит то же, что ведущий в разделе «Таблица»:
// место, имя, номер выпуска, верные ответы, время и баллы, по сезонам.
// Таблицу готовит панель ведущего и кладёт в базу одной строкой JSON (public.js, документ public/table).
// Чтение без входа открывают новые правила базы (firestore.rules). Пока их нет: «Таблица скоро откроется».
import { db, doc, onSnapshot } from './fb.js';
import { esc } from './ui.js';
import { timeText } from './score.js';

const app = document.getElementById('t-app');
let data = null;
let season = null;  // сезон, который выбрал зритель. null: текущий

const note = text => `<p class="t-note">${text}</p>`;

// Только сборка страницы. Её проверяет выпуск в браузере (tests/browser/e2e.mjs)
export function tableHtml(d, sel) {
  // Название сезона: «Сезон 1 · Осень 2026» (season.js, seasonName)
  const title = n => `Сезон ${n}${(d.names || {})[n] ? ' · ' + esc(d.names[n]) : ''}`;
  const all = Object.keys(d.rows || {}).map(Number).sort((a, b) => a - b);
  const cur = all.includes(sel) ? sel : d.season;
  const rows = (d.rows || {})[cur] || [];
  const tabs = all.length < 2 ? '' : `<div class="t-seasons">${all.map(n =>
    `<button class="chip t-season ${n === cur ? 'chip-yellow' : ''}" data-season="${n}">${title(n)}</button>`).join('')}</div>`;
  if (!rows.length) return tabs + note('Таблица пока пустая. Она заполнится после первого выпуска сезона.');
  const body = rows.map(r => `
    <tr>
      <td class="t-place">${r.place}</td>
      <td class="t-name">${esc(r.name)}${r.no ? `<small>Выпуск ${r.no}</small>` : ''}</td>
      <td>${r.correct} из ${r.asked}</td>
      <td>${timeText(r.time)}</td>
      <td class="t-points">${r.points}</td>
    </tr>`).join('');
  return `${tabs}
    <div class="sticker t-card">
      <h2 class="t-h2">${title(cur)}</h2>
      <table class="t-table">
        <thead><tr><th>Место</th><th>Участник</th><th>Верно</th><th>Время</th><th>Баллы</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${note('Выше тот, у кого больше баллов, потом больше верных ответов, потом меньше время на ответы.')}`;
}

function render() {
  app.innerHTML = data ? tableHtml(data, season) : note('Таблица пока пустая. Она заполнится после первого выпуска.');
}

if (app) {
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-season]');
    if (!b) return;
    season = Number(b.dataset.season);
    render();
  });
  onSnapshot(doc(db, 'public', 'table'), snap => {
    try { data = JSON.parse((snap.data() || {}).json || 'null'); } catch { data = null; }
    render();
  }, err => {
    app.innerHTML = note(err.code === 'permission-denied' ? 'Таблица скоро откроется.' : 'Нет связи. Обновите страницу.');
  });
}
