// Меню панели ведущего (значок шестерёнки): разделы, весь экран, проба, адрес экрана гостя, выход.
// Пока выпуск идёт, сверху «Закончить выпуск» и «Сменить экран гостя». Внизу сезон и адрес таблицы для зрителей.
// Разделы здесь, чтобы открыть их и во время выпуска: карточки с ними есть только на главном экране.
// Редкие дела лежат здесь, а не кнопками в полосе сверху (правило автора 2026-10-28).
import { auth, signOut } from './fb.js';
import { confirmed } from './ui.js';
import { GUEST_URL, PROBA } from './host-live.js';

const btn = document.getElementById('h-menu-btn');
const menu = document.getElementById('h-menu');
const fullEl = document.getElementById('h-full');
document.getElementById('h-guest-url').textContent = GUEST_URL.replace('https://', '');

function toggle(open = menu.hidden) {
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.classList.toggle('h-gear-on', open);
}

// Без входа меню нет: в нём только дела ведущего
export function showMenu(on) {
  btn.hidden = !on;
  if (!on) toggle(false);
}

btn.addEventListener('click', () => toggle());
// Раздел открывает host.js (data-do), меню при этом закрывается. Кнопка со вторым касанием
// («Закончить выпуск», «Начать новый сезон») после первого касания оставляет меню открытым
menu.addEventListener('click', e => {
  const b = e.target.closest('[data-do]');
  if (b && (!b.dataset.confirm || b.dataset.armed)) toggle(false);
});

// Меню по состоянию панели: дела идущего выпуска, текущий сезон (season.js).
// «Сменить экран гостя»: только когда планшет гостя привязан к выпуску (touch.js)
const liveEl = document.getElementById('h-menu-live');
const unbindEl = document.getElementById('h-unbind');
const seasonEl = document.getElementById('h-season');
document.getElementById('h-table-url').textContent = new URL('tablica/', location.href).href.replace('https://', '');
export function menuLive(S) {
  const ep = S.ep;
  liveEl.hidden = !ep || ep.finished || ep.phase === 'invite' || ep.phase === 'topics';
  unbindEl.hidden = !ep || !ep.dev;
  const text = `Сейчас сезон ${S.season}. Новый сезон: таблица начинается заново, прошлые сезоны остаются.`;
  if (seasonEl.textContent !== text) seasonEl.textContent = text;
}
// Касание мимо меню закрывает его
document.addEventListener('click', e => {
  if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) toggle(false);
});

// Проба без гостя: страница с панелью и экраном гостя рядом (proba/index.html).
// Внутри пробы кнопки нет: панель уже в ней
const probaEl = document.getElementById('h-proba');
probaEl.hidden = PROBA;
probaEl.addEventListener('click', () => { location.href = new URL('proba/', location.href).href; });

document.getElementById('h-out').addEventListener('click', e => {
  if (!confirmed(e.currentTarget)) return;
  toggle(false);
  signOut(auth);
});

// Весь экран: приложение разворачивается с первого касания.
// Кнопка в меню возвращает обычное окно и снова разворачивает.
// В пробе панель лежит в рамке: весь экран закрыл бы экран гостя
const root = document.documentElement;
if (root.requestFullscreen && !PROBA) {
  fullEl.hidden = false;
  fullEl.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen().catch(() => {});
    toggle(false);
  });
  document.addEventListener('fullscreenchange', () => {
    fullEl.textContent = document.fullscreenElement ? 'Обычный экран' : 'Весь экран';
  });
  document.addEventListener('click', e => {
    if (!document.fullscreenElement && !e.target.closest('#h-menu')) root.requestFullscreen().catch(() => {});
  }, { once: true });
}
