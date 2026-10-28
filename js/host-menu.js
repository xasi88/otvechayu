// Меню панели ведущего (значок шестерёнки): разделы, весь экран, телевизор, адрес экрана гостя, выход.
// Разделы здесь, чтобы открыть их и во время выпуска: карточки с ними есть только на главном экране.
// Редкие дела лежат здесь, а не кнопками в полосе сверху (правило автора 2026-10-28).
import { auth, signOut } from './fb.js';
import { confirmed } from './ui.js';
import { GUEST_URL } from './host-live.js';

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
// Раздел открывает host.js (data-do), меню при этом закрывается
menu.addEventListener('click', e => { if (e.target.closest('[data-do]')) toggle(false); });
// Касание мимо меню закрывает его
document.addEventListener('click', e => {
  if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) toggle(false);
});

// Окно гостя на телевизоре (guest.js, «На телевизор») выходит из полного экрана
document.getElementById('h-tv-off').addEventListener('click', () => {
  if (window.BroadcastChannel) new BroadcastChannel('otvechayu-tv').postMessage('off');
  toggle(false);
});

document.getElementById('h-out').addEventListener('click', e => {
  if (!confirmed(e.currentTarget)) return;
  toggle(false);
  signOut(auth);
});

// Весь экран: приложение разворачивается с первого касания.
// Кнопка в меню возвращает обычное окно и снова разворачивает.
const root = document.documentElement;
if (root.requestFullscreen) {
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
