// Пауза на чтение вопроса (решение автора 2026-11-14, вместо «вопрос и варианты сразу» от 2026-11-03).
// Раньше варианты появлялись вместе с вопросом: гость отвечал, пока ведущий ещё читал вопрос вслух,
// и время на ответ шло с показа. Теперь текст вопроса виден сразу, а варианты выезжают сами после
// паузы по длине вопроса, без лишнего касания ведущего. Время на ответ идёт от появления вариантов.
// Чистые функции без сети и страницы: их проверяет tests/guest.test.mjs.

// Чтение вслух: около 14 знаков в секунду. Короткий вопрос 3 секунды, длинный не больше 10
export const PER_CHAR = 70;
export const MIN = 3000;
export const MAX = 10000;

// Пауза в миллисекундах, с точностью до 0,1 с
export function readPause(text) {
  const ms = String(text || '').length * PER_CHAR;
  return Math.round(Math.min(MAX, Math.max(MIN, ms)) / 100) * 100;
}

// Варианты уже на экране гостя? here: когда экран показал этот вопрос (guest.js, shownHere),
// at: миг появления вариантов по часам экрана. Экран перезагрузили посреди вопроса (here нет):
// паузы он не знает и показывает варианты сразу
export function optsOpen(state, here, now) {
  const q = state.q;
  if (!q || !q.shown) return false;
  if (state.phase !== 'question' || q.pick != null || q.struck != null) return true;
  if (!here || here.session !== state.session || here.index !== state.index) return true;
  return now >= here.at;
}

// Секундомер над вопросом: время на ответ решает место при равных баллах, гость и зритель его видят.
// Идёт от появления вариантов на этом экране (here.at), встаёт на касании ответа (thought).
// Пока варианты не выехали, секундомера нет. Ответ вслух во время не идёт: секундомера нет.
// Экран перезагрузили посреди вопроса или ответ отметил ведущий: секундомера нет, время считает панель.
// thought: касание ответа на этом экране (guest.js). now: часы экрана (performance.now)
export function timerText(state, here, thought, now) {
  const q = state.q;
  if (!q || !q.shown || q.free || !here || here.session !== state.session || here.index !== state.index) return '';
  const mine = thought && thought.session === state.session && thought.index === state.index;
  let ms = null;
  // Касание ещё идёт к ведущему или уже принято: время стоит
  if (mine) ms = thought.ms;
  else if (state.phase === 'question' && q.pick === null) ms = now - here.at;
  return ms === null || ms < 0 ? '' : (ms / 1000).toFixed(1).replace('.', ',') + ' с';
}
