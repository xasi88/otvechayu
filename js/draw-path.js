// Чистая функция без сети: её проверяют тесты (tests/game.test.mjs). game.js отдаёт её дальше
// Путь карточки в жребии места (draw.js): строки прыжков от 0 сверху. Прыжки куда попало,
// последние рядом с местом m, но не на него, последний на место. Подряд в одну строку нельзя
export function drawPath(n, m, rand = Math.random, hops = 20) {
  const pick = (lo, hi, ban) => {
    const ok = [];
    for (let x = lo; x <= hi; x++) if (!ban.includes(x)) ok.push(x);
    return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
  };
  const path = [];
  let k = 0;
  for (let i = 1; n > 1 && i < hops; i++) {
    const near = i >= hops - 4 ? pick(Math.max(0, m - 2), Math.min(n - 1, m + 2), [k, m]) : null;
    k = near ?? pick(0, n - 1, [k]);
    path.push(k);
  }
  if (path[path.length - 1] === m) path.pop();
  path.push(m);
  return path;
}

// Строки жребия: десятка лучших (решение автора 2026-11-11, раньше вся таблица).
// Гость в десятке: строки t[0..9], карточка гостя среди них, место m.
// Гость ниже: десять лучших, карточка прыгает по ним и в конце уезжает вниз,
// в отдельную строку под чертой с настоящим местом (out). hop: сколько строк для прыжков
export function drawRows(t, top = 10) {
  const m = t.findIndex(r => r.me);
  const out = m >= top;
  const others = t.filter(r => !r.me).slice(0, out ? top : top - 1);
  const hop = out ? top : Math.min(t.length, top);
  return { m, out, others, me: t[m], hop, land: out ? top : m, slots: hop + (out ? 1.4 : 0) };
}

// Путь карточки по строкам жребия: гость ниже десятки прыгает до десятой строки,
// последний шаг резко вниз под черту
export function drawRoute(rows, rand) {
  if (!rows.out) return drawPath(rows.hop, rows.m, rand);
  return [...drawPath(rows.hop, rows.hop - 1, rand), rows.land];
}
