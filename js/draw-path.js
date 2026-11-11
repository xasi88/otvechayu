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
