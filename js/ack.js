// Подтверждение экрана гостя (2026-11-14). Раньше панель знала только, что база приняла действие,
// а дошло ли оно до планшета гостя, не знала. Теперь экран гостя после каждой смены вида пишет
// в live/guest поле view: какой вид он показал (key), секунды событий по своим часам (marks),
// готовы ли ролики, включён ли звук, заряд. Панель сравнивает key с тем, что должно быть на экране.
// view идёт одной строкой JSON: запись с дополнением (merge) не оставит в нём хвостов прошлого выпуска.
// Поле view есть в правилах базы (firestore.rules). Пока новые правила не опубликованы, база такую
// запись не примет: экран гостя перестаёт её слать, панель работает по-старому, без подтверждения.
// Чистые функции без сети: их проверяет tests/ack.test.mjs.

const hash = text => {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h.toString(36);
};

// Ключ вида гостя (game.js, guestView): один и тот же на панели и на планшете.
// Текст вопроса в ключе: замена вопроса оставляет тот же номер
export function viewKey(s) {
  if (!s || !s.phase || s.phase === 'prep') return 'prep';
  const q = s.q && s.q.shown ? hash(s.q.text) : '';
  return [s.session, s.phase, s.index, q, s.video ? s.video.at : '', s.draw || ''].join('|');
}

// Что сейчас у гостя, словами для полосы панели
export function viewLabel(s) {
  if (!s || !s.phase || s.phase === 'prep') return 'заставку';
  if (s.video) return 'ролик';
  return {
    invite: 'приглашение', topics: 'выбор тем', question: `вопрос ${s.index + 1}`, reveal: `ответ ${s.index + 1}`,
    super: 'заставку суперигры', stake: 'выбор в суперигре', result: 'итог',
  }[s.phase] || s.phase;
}

// Поле view из live/guest: строка JSON. Нет или испорчено: null
export function parseAck(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

// Секунды событий по часам планшета для выпуска session. Чужой выпуск: null
export function marksOf(ack, session) {
  return ack && ack.session === session && ack.marks && typeof ack.marks === 'object' ? ack.marks : null;
}

// Метка связи в полосе панели. on: планшет шлёт отметку «на связи», off: сколько секунд её нет.
// lag: действий ведущего, которых база не приняла дольше 2 секунд. down: база не отвечает.
// ack: подтверждение гостя, want: вид, который должен быть на его экране, behind: сколько секунд
// экран гостя показывает не его. Вернёт текст, вид метки (cls) и пояснение
export function linkState({ on, off = 0, lag = 0, down = false, waiting = 0, ack = null, want = null, behind = 0 }) {
  if (down) {
    return { cls: 'down', text: `Нет связи с базой: ждут ${waiting}`,
      title: 'База не отвечает. Действия не пропали: панель шлёт их снова. Подождите, пока метка погаснет' };
  }
  if (!on) return { cls: 'off', text: off ? `Samsung не на связи: ${off} с` : 'Samsung не на связи', title: 'Samsung не на связи' };
  if (lag) {
    return { cls: 'lag', text: `Samsung: отстаёт на ${lag}`,
      title: `База ещё не приняла действий: ${lag}. Подождите, экран гостя догонит` };
  }
  if (!ack || !want) return { cls: '', text: 'Samsung', title: 'Samsung на связи' };
  if (ack.key !== viewKey(want)) {
    return behind >= 2 ? { cls: 'lag', text: `Гость отстал: ${behind} с`, title: 'Экран гостя ещё показывает прошлый вид. Подождите' }
      : { cls: '', text: 'Samsung', title: 'Samsung на связи' };
  }
  return { cls: '', text: `Гость видит ${viewLabel(want)}`, title: 'Экран гостя подтвердил, что показал этот вид' };
}
