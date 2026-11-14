// Сезон и номер выпуска (решение автора 2026-11-14). Каждое участие отдельное, и раньше выпуски
// различались только именем гостя с номером: «Атам Хасиев 2». Теперь у выпуска подпись
// «Сезон 1 · Выпуск 7», таблица показывает текущий сезон, рядом переключатель «Все сезоны».
// Номер ставится сам, по порядку внутри сезона, и лежит в выпуске (no): удалили старый выпуск,
// номера остальных не съехали. Сезоны ведёт раздел «Сезоны» в меню ⚙ (host-seasons.js, просьба автора
// 2026-11-14 «больше свободы»): своё название, любой сезон можно сделать текущим (шаг назад),
// новый сезон, перенос выпуска в другой сезон из «Истории».
// Выпуски до 2026-11-14 без сезона и номера: сезон 1, номер по порядку дат.
// Здесь же открытая таблица для зрителей (tablica/, public.js): что в неё идёт.
// Чистые функции без сети: их проверяет tests/season.test.mjs.
import { standings } from './table.js';

export const seasonOf = e => (e && e.season) || 1;

// Выпуски одного сезона. Сезон не задан (0, null): все
export const inSeason = (episodes, season) => (season ? episodes.filter(e => seasonOf(e) === season) : episodes);

// Номера выпусков: Map код выпуска → номер. У старого выпуска без номера место по порядку дат
export function numbers(episodes) {
  const out = new Map();
  const count = {};
  for (const e of episodes.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const s = seasonOf(e);
    const no = e.no || (count[s] || 0) + 1;
    count[s] = Math.max(count[s] || 0, no);
    out.set(e.id, no);
  }
  return out;
}

// Номер нового выпуска в сезоне
export function nextNo(episodes, season) {
  const nums = numbers(episodes);
  return Math.max(0, ...inSeason(episodes, season).map(e => nums.get(e.id))) + 1;
}

// Все номера сезонов подряд, от 1 до самого большого: любой можно сделать текущим.
// Пустой сезон, с которого ушли назад, из списка пропадает сам
export function allSeasons(episodes, current = 1) {
  const max = Math.max(...seasons(episodes, current));
  return Array.from({ length: max }, (_, i) => i + 1);
}

// Номер нового сезона: после самого большого. Самый большой ещё пустой: null, новый начинать рано
export function newSeasonNo(episodes, current = 1) {
  const max = Math.max(...seasons(episodes, current));
  return inSeason(episodes, max).length ? max + 1 : null;
}

// Название сезона: «Сезон 1» или «Сезон 1 · Осень 2026». names: { номер: название }
export const NAME_MAX = 30;
export function seasonName(n, names) {
  const s = String((names || {})[n] || '').trim();
  return `Сезон ${n}${s ? ' · ' + s : ''}`;
}

// Названия после перемены: новое название (пустое убирает), и только у сезонов из списка
export function keepNames(names, episodes, current, n = null, name = '') {
  const all = { ...(names || {}) };
  if (n) all[n] = String(name).trim().slice(0, NAME_MAX);
  const out = {};
  for (const k of allSeasons(episodes, current)) if (all[k]) out[k] = all[k];
  return out;
}

// Перенос выпуска в другой сезон: номер встаёт в конец нового сезона
export const moved = (episodes, id, season) => ({ season, no: nextNo(episodes.filter(e => e.id !== id), season) });

// Подпись выпуска: «Сезон 1 · Выпуск 7»
export const label = (e, nums) => `Сезон ${seasonOf(e)} · Выпуск ${e.no || (nums && nums.get(e.id)) || '?'}`;

// Все сезоны, в которых есть выпуски, и текущий: по возрастанию
export function seasons(episodes, current = 1) {
  return [...new Set([...episodes.map(seasonOf), current])].sort((a, b) => a - b);
}

// Таблица сезона для панели: строки standings и номер выпуска участника (no).
// У старого участника с несколькими выпусками номера нет
export function seasonTable(episodes, cards, season) {
  const list = inSeason(episodes, season);
  const nums = numbers(episodes);
  return standings(list, cards).map(r => {
    const mine = list.filter(e => e.playerId === r.id);
    return { ...r, season: mine.length ? seasonOf(mine[0]) : 1, no: mine.length === 1 ? nums.get(mine[0].id) : null };
  });
}

// Открытая таблица для зрителей: по сезонам, в строке всё, что видит ведущий (решение автора
// 2026-11-14: «все гости», «всё, как у ведущего»). Кодов участников и выпусков в ней нет
// names: названия сезонов, в таблицу идут, только если они есть
export function publicTable(episodes, cards, current = 1, names = null) {
  const rows = {};
  for (const s of seasons(episodes, current)) {
    rows[s] = seasonTable(episodes, cards, s).map(r => ({
      place: r.place, name: r.name, correct: r.correct, asked: r.asked, time: r.time, points: r.points, no: r.no,
    }));
  }
  const keep = keepNames(names, episodes, current);
  return { season: current, rows, ...(Object.keys(keep).length ? { names: keep } : {}) };
}
