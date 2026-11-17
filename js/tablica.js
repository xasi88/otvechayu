// Открытая таблица для зрителей (страница tablica/, решение автора 2026-11-14).
// Зритель открывает страницу по ссылке без входа и видит то же, что ведущий в разделе «Таблица»:
// место, имя, номер выпуска, верные ответы, время и баллы, по сезонам.
// Таблицу готовит панель ведущего и кладёт в базу одной строкой JSON (public.js, документ public/table).
// Вид табло общий у зрителя, ведущего и гостя (tablo.js). Его же показывает ссылка ведущего без входа.
import { db, doc, onSnapshot } from './fb.js';
import { tableHtml, note } from './tablo.js';

const app = document.getElementById('t-app');
let data = null;
let season = null;  // сезон, который выбрал зритель. null: текущий

const render = () => { app.innerHTML = tableHtml(data, season); };

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
