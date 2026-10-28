// Общие мелочи экранов: текст без опасных знаков, слова при числах, плашка ошибки, время.

export const LETTERS = ['А', 'Б', 'В', 'Г'];
// Сложность вопроса по его баллам
export const LEVELS = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' };

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Число со словом: 1 балл, 2 балла, 5 баллов
export function plural(n, [one, few, many]) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return n + ' ' + one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return n + ' ' + few;
  return n + ' ' + many;
}
export const pointsWord = n => plural(n, ['балл', 'балла', 'баллов']);

export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast pop';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2800);
}

// Секунды в «м:сс»
export function clock(t) {
  const sec = Math.max(0, Math.floor(t));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// «2026-10-28_15-30-12» в «28.10.2026, 15:30»
export function dateText(id) {
  const [d, t] = String(id).split('_');
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}${t ? ', ' + t.slice(0, 5).replace('-', ':') : ''}`;
}

// Файл в «Загрузки» прямо из браузера
export function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Опасная кнопка (удалить, закончить) просит второе касание за 3 секунды.
// Возвращает true, когда можно делать.
export function confirmed(button) {
  if (button.dataset.armed) return true;
  const text = button.textContent;
  button.dataset.armed = '1';
  button.textContent = button.dataset.confirm || 'Точно?';
  setTimeout(() => { delete button.dataset.armed; button.textContent = text; }, 3000);
  return false;
}
