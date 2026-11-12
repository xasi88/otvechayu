// Журнал сбоев (жалоба автора 2026-11-12: «иногда зависает, с чем связано, не понять»).
// Каждое сохранение выпуска (host-db.js, change): сколько миллисекунд, сколько попыток транзакции,
// чем кончилось. Попыток больше одной: две панели писали выпуск одновременно. Плюс ошибки страницы
// и пропажа связи. Журнал живёт только в этом браузере (localStorage), последние 300 записей.
// Прочитать после выпуска: в консоли страницы otvechayuSboi()
const KEY = 'otvechayu-sboi';
const MAX = 300;

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

export function sboi(kind, data = {}) {
  try {
    const list = read();
    list.push({ t: new Date().toISOString(), kind, ...data });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* хранилище недоступно: без журнала */ }
}

// В тестах (Node) окна нет: журнал без слушателей
const text = x => String((x && (x.code || x.message)) || x).slice(0, 200);

if (typeof window !== 'undefined') {
  addEventListener('error', e => sboi('error', { msg: text(e.message), at: `${e.filename}:${e.lineno}` }));
  addEventListener('unhandledrejection', e => sboi('reject', { msg: text(e.reason) }));
  addEventListener('offline', () => sboi('offline'));
  addEventListener('online', () => sboi('online'));
  window.otvechayuSboi = read;
}
