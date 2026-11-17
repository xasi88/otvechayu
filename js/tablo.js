// Табло: турнирная таблица в одном виде для всех (решение автора 2026-11-17).
// Один и тот же вид у зрителя по ссылке ведущего без входа (host.js), на странице tablica/
// (tablica.js), у ведущего в итоге выпуска (host-live.js) и у гостя после жребия (draw.js).
// Цвета приложения (просьба автора 2026-11-17: «не белый фон и чёрный текст»): тёмно-синяя
// наклейка, строки синие наклейки, строка гостя жёлтая (me), как его выбор в игре. Классы t-, вид в css/tablica.css.
// Только сборка, без сети. Сборку проверяет выпуск в браузере (tests/browser/e2e.mjs).
import { esc } from './ui.js';
import { timeText } from './score.js';

export const note = text => `<p class="t-note">${text}</p>`;
export const ORDER = 'Выше тот, у кого больше баллов, потом больше верных ответов, потом меньше время на ответы.';

// Карточка с таблицей. rows: place, name, correct, asked, time, points, no, me.
// Старые таблицы выпуска без asked: только число верных
export function tabloCard(rows, title, p = '') {
  // Значок места: тройка лучших жёлтая. Верно зелёным, как верный ответ в игре. Баллы жёлтой меткой
  const body = rows.map(r => `
      <tr class="${r.me ? 't-me' : ''}${r.place <= 3 ? ' t-top' : ''}">
        <td class="t-place"><b class="t-badge">${r.place}</b></td>
        <td class="t-name">${esc(r.name)}${r.no ? `<small>Выпуск ${r.no}</small>` : ''}</td>
        <td><span class="t-ok">${r.correct}${r.asked != null ? ' из ' + r.asked : ''}</span></td>
        <td class="t-time">${timeText(r.time)}</td>
        <td class="t-points"><span class="t-pts">${r.points}</span></td>
      </tr>`).join('');
  return `
    <div class="sticker t-card ${p}">
      ${title ? `<h2 class="t-h2">${title}</h2>` : ''}
      <div class="t-scroll" data-keep="tablo">
        <table class="t-table">
          <thead><tr><th>Место</th><th>Участник</th><th>Верно</th><th>Время</th><th>Баллы</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

// Табло зрителя по сезонам: таблица из базы (public/table, public.js). sel: сезон, который выбрал
// зритель, null: текущий. Название сезона: «Сезон 1 · Осень 2026» (season.js, seasonName)
export function tableHtml(d, sel, p = '') {
  if (!d) return note('Таблица пока пустая. Она заполнится после первого выпуска.');
  const title = n => `Сезон ${n}${(d.names || {})[n] ? ' · ' + esc(d.names[n]) : ''}`;
  const all = Object.keys(d.rows || {}).map(Number).sort((a, b) => a - b);
  const cur = all.includes(sel) ? sel : d.season;
  const rows = (d.rows || {})[cur] || [];
  const tabs = all.length < 2 ? '' : `<div class="t-seasons">${all.map(n =>
    `<button class="chip t-season ${n === cur ? 'chip-yellow' : ''}" data-season="${n}">${title(n)}</button>`).join('')}</div>`;
  if (!rows.length) return tabs + note('Таблица пока пустая. Она заполнится после первого выпуска сезона.');
  return tabs + tabloCard(rows, title(cur), p) + note(ORDER);
}

// Строка гостя посреди окна таблицы: участников много, своё место видно без прокрутки
export function showMe(root) {
  const box = root && root.querySelector('.t-scroll');
  const me = box && box.querySelector('.t-me');
  if (!me) return;
  const a = box.getBoundingClientRect();
  const b = me.getBoundingClientRect();
  box.scrollTop += b.top - a.top - (box.clientHeight - b.height) / 2;
}
