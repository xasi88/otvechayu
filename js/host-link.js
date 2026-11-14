// Метка связи в полосе панели: Samsung на связи или нет, и отстаёт ли экран гостя.
// Панель меняется в миг касания, а в базу действия идут по очереди (host.js, run). На слабом Wi-Fi
// очередь растёт: у ведущего всё идёт, а гость ещё видит прошлый экран (жалоба автора 2026-11-13).
// Действие ждёт базу дольше 2 секунд: метка жёлтая, «отстаёт», и число шагов в очереди
const SLOW = 2000;
let shown = '';

// mine: действия ведущего, которых в базе ещё нет (id, at: миг касания)
export function linkBadge(el, on, mine, now = Date.now()) {
  const lag = mine.filter(m => now - m.at > SLOW).length;
  const key = [on, lag].join('|');
  if (key === shown) return;
  shown = key;
  el.innerHTML = `<span class="dot ${on ? 'dot-on' : ''}"></span>Samsung` + (lag ? `: отстаёт на ${lag}` : '');
  el.classList.toggle('h-samsung-off', !on);
  el.classList.toggle('h-samsung-lag', on && lag > 0);
  el.title = (on ? 'Samsung на связи' : 'Samsung не на связи') +
    (lag ? `. База ещё не приняла действий: ${lag}. Подождите, экран гостя догонит` : '');
}
