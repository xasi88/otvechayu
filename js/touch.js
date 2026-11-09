// Касание гостя из live/guest: какое действие выпуска оно значит (game.js, act).
// Правила базы пропускают от гостя только поля session, ready, pick, index, n, seen, think,
// поэтому вид касания задаёт index: -1 темы, -2 подсказка, -3 ставка суперигры (final.js).
// Нет действия: null. Чистая функция без сети: её проверяют тесты (tests/live.test.mjs).
import { act } from './game.js';

export function touchAction(ep, g, now) {
  if (ep.phase === 'invite' && g.ready) return e => act(e, 'ready', {}, false, now);
  // Новый экран гостя шлёт весь выбор тем списком, старый одну тему числом
  if (ep.phase === 'topics' && g.index === -1 && (Array.isArray(g.pick) || Number.isInteger(g.pick))) {
    const data = Array.isArray(g.pick) ? { topics: g.pick } : { option: g.pick };
    return e => act(e, 'topic', data, false, now);
  }
  // think: сколько гость думал, его меряет сам Samsung (guest.js)
  if (ep.phase === 'question' && Number.isInteger(g.pick) && g.index === ep.index) {
    return e => act(e, 'pick', { option: g.pick, think: g.think }, false, now);
  }
  // Подсказка и ставка: pick «вид:номер вопроса». Касание к прошлому вопросу не действует
  const code = { question: -2, stake: -3 }[ep.phase];
  if (code && g.index === code && typeof g.pick === 'string') {
    const [kind, at] = g.pick.split(':');
    if (Number(at) !== ep.index) return null;
    return code === -2 ? e => act(e, 'hint', { hint: kind }, false, now)
      : e => act(e, 'stake', { stake: kind }, false, now);
  }
  return null;
}
