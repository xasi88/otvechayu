// Жребий места на экране гостя. «Итог» у ведущего: ролик итога (rolik.js), потом жребий сам.
// Таблица: десятка лучших на всю высоту экрана (draw-path.js, drawRows). Карточка гостя прыгает
// по строкам, прыжки всё медленнее, строки расступаются перед ней, и карточка встаёт на своё место.
// Гость ниже десятки: карточка прыгает по десятке и в конце резко уезжает вниз, под черту,
// с настоящим местом (решение автора 2026-11-11). Всего около 8 секунд.
// После перезагрузки экрана жребий не повторяется: сразу таблица (guest.js).
import { esc, pointsWord, plural } from './ui.js';
import { seededRand, timeText } from './game.js';
import { drawRows, drawRoute } from './draw-path.js';
import { play } from './sound.js';

const WAIT = 900;    // строки успевают появиться, потом первый прыжок
const FIRST = 90;    // пауза перед первым прыжком, мс
const LAST = 1000;   // пауза перед последним: прыжки замедляются

// Строка таблицы. y: строка в списке сверху, от 0. d: задержка появления, секунды
const row = (r, y, me, d, out) => `
  <li class="${me ? 'g-me' : ''}${out ? ' g-out' : ''}" style="--y: ${y}; --d: ${d}s">
    <b>${r.place}</b><span>${esc(r.name)}</span>
    <em>${pointsWord(r.points)}${stats(r)}</em>
  </li>`;

// Под баллами: верные ответы и время на ответы. Старые таблицы без верных: только время
const stats = r => {
  const s = [r.correct != null ? correctWord(r.correct) : '', r.time != null ? timeText(r.time) : '']
    .filter(Boolean).join(' · ');
  return s ? `<small>${s}</small>` : '';
};
const correctWord = n => plural(n, ['верный', 'верных', 'верных']);

// Экран жребия: слева (сверху, если экран стоит) итог гостя и наклейка места,
// справа таблица лучших. spin: жребий идёт сейчас. Карточка гостя в первой строке, место «?»
export function drawScreen(s, total, spin, p) {
  const R = drawRows(s.table);
  const k = spin ? 0 : R.land;
  const delay = y => (0.15 + Math.min(y, 10) * 0.05).toFixed(2);
  const others = R.others.map((r, i) => {
    const y = i < k ? i : i + 1;
    return row(spin ? { ...r, place: y + 1 } : r, y, false, delay(y));
  }).join('');
  const me = row(spin ? { ...R.me, place: '?' } : R.me, k, true, delay(k), R.out && !spin);
  const cut = R.out ? `<li class="g-cut${spin ? '' : ' g-cut-on'}" aria-hidden="true"></li>` : '';
  return `
    <section class="g-final g-draw${spin ? ' g-spin' : ''}">
      <div class="g-center">
        ${total}
        <div class="sticker g-stamp ${p} pop-3${spin ? '' : ' g-stamp-on'}"><b>${spin ? '?' : R.me.place}</b> место</div>
      </div>
      <div class="sticker g-table ${p} pop-2">
        <h2 class="g-table-title">${spin ? 'Ищем твоё место' : 'Лучшие участники'}</h2>
        <div class="g-rows" style="--n: ${R.slots}"><ol class="g-list">${cut}${others}${me}</ol></div>
      </div>
    </section>`;
}

// Шаг строки по высоте окна: десять строк (и строка под чертой) занимают всю высоту.
// Низкие строки: верные и время встают в строку рядом с баллами, мельче (draw.css)
export function fitRows(root) {
  const view = root && root.querySelector('.g-rows');
  if (!view) return;
  const cs = getComputedStyle(view);
  const room = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const n = parseFloat(cs.getPropertyValue('--n')) || 1;
  // Мало строк: строка не выше восьмой части окна (и не ниже 56), чтобы не раздувалась
  const step = Math.max(24, Math.min(110, Math.max(room / 8, 56), Math.floor(room / n)));
  view.style.setProperty('--step', step + 'px');
  view.classList.toggle('g-rows-tight', step < 44);
}

// Жребий на готовом экране drawScreen(…, spin). Каждый прыжок щёлкает, последний ставит
// карточку на место: удар и наклейка места. Экран сменился посреди жребия: прыжки молча
// останавливаются (isConnected). «Уменьшить движение»: сразу место, без прыжков
export function runDraw(root, s, spin) {
  fitRows(root);
  if (!spin) return;
  const R = drawRows(s.table);
  const list = root.querySelector('.g-list');
  const items = [...list.querySelectorAll('li:not(.g-cut)')];
  const card = items.pop();
  const stamp = root.querySelector('.g-stamp');

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
  };
  // Место найдено: настоящие места из таблицы (ничья делит место), удар и наклейка.
  // Гость ниже десятки: карточка резко уезжает под черту
  const land = () => {
    if (R.out) {
      list.style.setProperty('--hop', '260ms');
      items.forEach((li, j) => li.style.setProperty('--y', j));
      card.style.setProperty('--y', R.land);
      card.classList.add('g-out');
      root.querySelector('.g-cut').classList.add('g-cut-on');
    } else put(R.m, 400);
    items.forEach((li, j) => { li.firstElementChild.textContent = R.others[j].place; });
    card.firstElementChild.textContent = stamp.firstElementChild.textContent = R.me.place;
    root.classList.remove('g-spin');
    card.classList.add('g-landed');
    stamp.classList.add('g-stamp-on');
    root.querySelector('.g-table-title').textContent = 'Лучшие участники';
    play('place');
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return land();
  // Зерно от времени «Итога»: на Samsung и на телевизоре один и тот же путь
  const path = drawRoute(R, seededRand(s.draw));
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
