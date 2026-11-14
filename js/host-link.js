// Метка связи в полосе панели. Что в ней написано, решает ack.js (linkState): планшет на связи
// или нет, сколько действий ждут базу, что сейчас видит гость. Здесь только сама метка на странице.
// Панель меняется в миг касания, а в базу действия идут по очереди (queue.js). На слабом Wi-Fi
// очередь растёт: у ведущего всё идёт, а гость ещё видит прошлый экран (жалоба автора 2026-11-13)
let shown = '';

// st: { cls: '' | 'lag' | 'off' | 'down', text, title }
export function linkBadge(el, st) {
  const key = st.cls + '|' + st.text;
  if (key === shown) return;
  shown = key;
  const bad = st.cls === 'off' || st.cls === 'down';
  el.innerHTML = `<span class="dot ${bad ? '' : 'dot-on'}"></span>${st.text}`;
  el.classList.toggle('h-samsung-off', bad);
  el.classList.toggle('h-samsung-lag', st.cls === 'lag');
  el.title = st.title;
}
