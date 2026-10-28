// Жребий места на экране гостя. Ведущий жмёт «Жребий места» (game.js, draw):
// карточка гостя прыгает по таблице всех участников, прыжки всё медленнее,
// строки расступаются перед ней, и карточка встаёт на своё место. Всего около 8 секунд.
// После перезагрузки экрана жребий не повторяется: сразу таблица (guest.js).
import { esc, pointsWord } from './ui.js';
import { drawPath, timeText } from './game.js';
import { play } from './sound.js';

const WAIT = 900;    // строки успевают появиться, потом первый прыжок
const FIRST = 90;    // пауза перед первым прыжком, мс
const LAST = 1000;   // пауза перед последним: прыжки замедляются

// Строка таблицы. y: строка в списке сверху, от 0. d: задержка появления, секунды
const row = (r, y, me, d) => `
  <li class="${me ? 'g-me' : ''}" style="--y: ${y}; --d: ${d}s">
    <b>${r.place}</b><span>${esc(r.name)}</span>
    <em>${pointsWord(r.points)}${r.time != null ? `<small>${timeText(r.time)}</small>` : ''}</em>
  </li>`;

// Экран жребия: слева итог гостя и наклейка места, справа таблица всех участников.
// spin: жребий идёт сейчас. Карточка гостя в первой строке, место пока «?»
export function drawScreen(s, total, spin, p) {
  const t = s.table;
  const m = t.findIndex(r => r.me);
  const k = spin ? 0 : m;
  const delay = y => (0.15 + Math.min(y, 10) * 0.05).toFixed(2);
  const others = t.filter(r => !r.me).map((r, i) => {
    const y = i < k ? i : i + 1;
    return row(spin ? { ...r, place: y + 1 } : r, y, false, delay(y));
  }).join('');
  const me = row(spin ? { ...t[m], place: '?' } : t[m], k, true, delay(k));
  return `
    <section class="g-final g-draw${spin ? ' g-spin' : ''}">
      <div class="g-center">
        ${total}
        <div class="sticker g-stamp ${p} pop-3${spin ? '' : ' g-stamp-on'}"><b>${spin ? '?' : t[m].place}</b> место</div>
      </div>
      <div class="sticker g-table ${p} pop-2">
        <h2 class="g-table-title">${spin ? 'Ищем твоё место' : 'Турнирная таблица'}</h2>
        <div class="g-rows" style="--n: ${t.length}"><ol class="g-list">${others}${me}</ol></div>
      </div>
    </section>`;
}

// Жребий на готовом экране drawScreen(…, spin). Каждый прыжок щёлкает, последний ставит
// карточку на место: удар и наклейка места. Экран сменился посреди жребия: прыжки молча
// останавливаются (isConnected). «Уменьшить движение»: сразу место, без прыжков.
// Без spin только подвинуть длинный список к строке гостя, сразу, без езды
export function runDraw(root, s, spin) {
  const t = s.table;
  const m = t.findIndex(r => r.me);
  const list = root.querySelector('.g-list');
  const view = root.querySelector('.g-rows');
  const items = [...list.children];
  const card = items.pop();
  const stamp = root.querySelector('.g-stamp');
  const cs = getComputedStyle(view);
  const step = parseFloat(cs.getPropertyValue('--step')) || 64;
  const room = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  // Длинный список едет так, чтобы карточка гостя была посередине окна.
  // Сдвиг на целые строки: верхняя строка в окне всегда целая
  const follow = k => {
    const last = Math.ceil((t.length * step - 8 - room) / step);
    const top = Math.max(0, Math.min(Math.round(k - (room - step) / 2 / step), last));
    list.style.setProperty('--shift', -top * step + 'px');
  };
  if (!spin) {
    list.style.transition = 'none';
    follow(m);
    void list.offsetHeight;
    list.style.transition = '';
    return;
  }
  // Карточка в строке k: строки от k и ниже сдвигаются на одну, номера идут по строкам
  const put = (k, ms) => {
    list.style.setProperty('--hop', Math.round(Math.min(420, Math.max(140, ms * 0.8))) + 'ms');
    items.forEach((li, j) => {
      const y = j < k ? j : j + 1;
      li.style.setProperty('--y', y);
      li.firstElementChild.textContent = y + 1;
    });
    card.style.setProperty('--y', k);
    card.firstElementChild.textContent = stamp.firstElementChild.textContent = k + 1;
    follow(k);
  };
  // Место найдено: настоящие места из таблицы (ничья делит место), удар и наклейка
  const land = () => {
    put(m, 400);
    items.forEach((li, j) => { li.firstElementChild.textContent = t[j < m ? j : j + 1].place; });
    card.firstElementChild.textContent = stamp.firstElementChild.textContent = t[m].place;
    root.classList.remove('g-spin');
    card.classList.add('g-landed');
    stamp.classList.add('g-stamp-on');
    root.querySelector('.g-table-title').textContent = 'Турнирная таблица';
    play('place');
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return land();
  const path = drawPath(t.length, m);
  let at = WAIT;
  path.forEach((k, i) => {
    const pause = FIRST + (LAST - FIRST) * (path.length > 1 ? i / (path.length - 1) : 1) ** 2.4;
    at += pause;
    setTimeout(() => {
      if (!root.isConnected) return;
      if (i === path.length - 1) return land();
      put(k, pause);
      play('tick');
    }, at);
  });
}
