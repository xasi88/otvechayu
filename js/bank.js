// Банк вопросов: сложность, вопросы без повторов, темы выпуска, загрузка файлом.
// Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// Сложность это баллы вопроса: 1 лёгкий, 2 средний, 3 сложный.
// Средний с подвохом (trap): тема знакома всем, но очевидный ответ неверный. Баллы как у среднего.
import { GameError } from './game.js';

// Четыре вопроса темы по нарастающей: лёгкий, средний, средний с подвохом, сложный (TAKE).
// Ещё три кандидата в суперигру: средний, подвох, сложный, выпуск берёт один (final.js)
const TAKE = { 1: 1, 2: 2, 3: 1 };

// Сколько вопросов темы ещё не было в выпусках, по сложности
export function left(topic) {
  const n = { 1: 0, 2: 0, 3: 0 };
  for (const q of topic.questions || []) if (!q.used && q.points in n) n[q.points] += 1;
  return n;
}

// На сколько выпусков ещё хватит темы: выпуск берёт лёгкий, 2 средних, сложный
// и один вопрос в суперигру, средний или сложный (решение автора 2026-11-11)
export function runs(topic) {
  const n = left(topic);
  return Math.min(n[1], Math.floor(n[2] / 2), n[3], Math.floor((n[2] + n[3]) / 4));
}

// Тема кончается: её хватит на столько выпусков или меньше. Ведущий видит красную точку
export const LOW = 2;

// Сколько вопросов темы сгорело и в скольких выпусках тема была. Выпуск вне конкурса не в счёт:
// он вопросы не сжигает
export function spent(topic) {
  const used = (topic.questions || []).filter(q => q.used);
  return { questions: used.length, episodes: new Set(used.map(q => q.used)).size };
}

// На сколько выпусков хватит всех тем вместе, если гости берут темы поровну.
// Выпуск берёт три разные темы, поэтому тема идёт в выпуск не больше одного раза:
// хватит на e выпусков, если сумма min(runs, e) по темам не меньше 3e
export function capacity(topics) {
  const r = topics.map(runs);
  const fits = e => r.reduce((s, n) => s + Math.min(n, e), 0) >= 3 * e;
  let e = 0;
  while (fits(e + 1)) e += 1;
  return e;
}

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// why: справка для ведущего, почему ответ верный. На экран гостя не идёт (game.js, guestView)
const copy = (q, topic) => ({
  id: q.id, topicId: topic.id, topic: topic.name, text: q.text,
  options: q.options.slice(), correct: q.correct, points: q.points, ...(q.why ? { why: q.why } : {}),
  ...(q.trap ? { trap: true } : {}),
});

// Средние по порядку: обычный, потом с подвохом (просьба автора 2026-11-03).
// Подвохи кончились: второй тоже обычный. Обычные кончились: оба с подвохом.
// Потом так же пара в суперигру (fin) и запасные для «Замены вопроса»
function middle(mine) {
  const rest = mine.slice();
  const take = trap => {
    const i = rest.findIndex(q => !q.trap === !trap);
    return rest.length ? rest.splice(i < 0 ? 0 : i, 1)[0] : null;
  };
  const two = [take(false), take(true)].filter(Boolean);
  const fin = [take(false), take(true)];
  const plain = take(false);
  return { two, fin, plain, trap: take(true) || plain };
}

// Четыре вопроса темы по плану и запасной каждой сложности для «Замены вопроса» (hints.js).
// Конкурс берёт только новые вопросы. Вне конкурса (trial) свой круг по всем вопросам:
// сначала те, что вне конкурса ещё не шли, потом давно шедшие (поле off, markOff).
// Так вне конкурса вопрос не повторится, пока не пройдут все (решение автора 2026-10-28).
// Вне конкурса хватает любых четырёх вопросов, если по плану не набирается.
function pickFour(topic, trial, rand) {
  const qs = topic.questions || [];
  let four = [];
  let fin = [];
  const spare = {};
  for (const level of [1, 2, 3]) {
    const mine = shuffle(qs.filter(q => q.points === level && (trial || !q.used)), rand);
    if (trial) mine.sort((a, b) => (a.off || '').localeCompare(b.off || ''));
    if (level === 2) {
      const mid = middle(mine);
      four.push(...mid.two);
      fin.push(...mid.fin);
      if (mid.plain) spare[2] = copy(mid.plain, topic);
      if (mid.trap) spare.trap = copy(mid.trap, topic);
      continue;
    }
    four.push(...mine.slice(0, TAKE[level]));
    // Сложный: второй в суперигру, третий запасной для «Замены вопроса»
    if (level === 3) {
      fin.push(mine[1] || null);
      if (mine[2]) spare[3] = copy(mine[2], topic);
    } else if (mine[TAKE[level]]) spare[level] = copy(mine[TAKE[level]], topic);
  }
  if (four.length < 4) {
    if (!trial || qs.length < 4) return null;
    four = shuffle(qs, rand).slice(0, 4).sort((a, b) => a.points - b.points);
    fin = [];
  }
  // С пятого в наборе темы: кандидаты в суперигру, только все три (game.js, begin)
  const sup = fin.length === 3 && fin.every(Boolean) ? fin : [];
  return { four: four.concat(sup).map(q => copy(q, topic)), spare };
}

// Новый вопрос для замены ведущим (hints.js, hostSwap): та же тема и сложность, подвох на подвох,
// если есть. Не берёт вопросы выпуска, заменённые и запасные для подсказки гостя.
// Конкурс берёт только несгоревшие, вне конкурса сначала давно шедшие (off). Нет: null
export function freshQuestion(topics, ep, rand = Math.random) {
  const q = ep.questions[ep.index];
  const topic = topics.find(t => t.id === q.topicId);
  if (!topic) return null;
  const spare = Object.values((ep.spares || {})[q.topicId] || {});
  const taken = new Set([...ep.questions, ...(ep.swapped || []), ...spare].map(x => x.id));
  const pool = shuffle((topic.questions || []).filter(x => x.points === q.points && !taken.has(x.id) && (ep.trial || !x.used)), rand);
  if (ep.trial) pool.sort((a, b) => (a.off || '').localeCompare(b.off || ''));
  const pick = pool.find(x => !x.trap === !q.trap) || pool[0];
  return pick ? { ...copy(pick, topic), ...(q.final ? { final: true } : {}) } : null;
}

// Темы на выбор гостю: все отмеченные ведущим, где хватает вопросов. Гость сам выбирает три.
// Четвёрки вопросов и запасные набираются сразу.
export function offerTopics(topics, { trial = false, rand = Math.random } = {}) {
  const sets = {};
  const spares = {};
  for (const t of topics) {
    const got = pickFour(t, trial, rand);
    if (got) { sets[t.id] = got.four; spares[t.id] = got.spare; }
  }
  const ready = topics.filter(t => sets[t.id]);
  if (ready.length < 3) {
    throw new GameError('Мало вопросов: нужны три темы, где есть новые 1 лёгкий, 2 средних и 1 сложный вопрос');
  }
  return { choices: ready.map(t => ({ id: t.id, name: t.name })), sets, spares };
}

// Вопрос показан гостю в обычном выпуске: больше он не выпадет никому
export function markUsed(questions, id, episode) {
  return questions.map(q => (q.id === id ? { ...q, used: episode } : q));
}

// Вопрос показан вне конкурса: он уходит в конец круга вне конкурса. Конкурс его не теряет
export function markOff(questions, id, episode) {
  return questions.map(q => (q.id === id ? { ...q, off: episode } : q));
}

// Выпуск удалён из «Истории»: его вопросы снова в запасе (решение автора 2026-10-28)
export function release(questions, episode) {
  return questions.map(q => {
    if (q.used !== episode) return q;
    const { used, ...rest } = q;
    return rest;
  });
}

const norm = text => String(text).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
// Один и тот же текст: большие буквы, «ё» и знаки не важны. Так узнаются повторы тем и вопросов
export const sameText = (a, b) => norm(a) === norm(b);

// Справка: почему ответ верный. Ведущий читает её вслух за 10-15 секунд
export const WHY_MAX = 400;

function checkQuestion(q) {
  const text = String(q.text || '').trim();
  const where = `Вопрос «${text.slice(0, 40) || 'без текста'}»`;
  const options = Array.isArray(q.options) ? q.options.map(o => String(o).trim()) : [];
  if (!text || text.length > 300) throw new GameError(`${where}: нужен текст до 300 знаков`);
  if (options.length !== 4 || options.some(o => !o || o.length > 120)) throw new GameError(`${where}: нужны 4 варианта до 120 знаков`);
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) throw new GameError(`${where}: правильный ответ от 0 до 3`);
  if (![1, 2, 3].includes(q.points)) throw new GameError(`${where}: сложность 1, 2 или 3`);
  const why = String(q.why || '').trim();
  if (why.length > WHY_MAX) throw new GameError(`${where}: справка длиннее ${WHY_MAX} знаков`);
  const trap = q.trap === true && q.points === 2;
  return { text, options, correct: q.correct, points: q.points, ...(why ? { why } : {}), ...(trap ? { trap } : {}) };
}

// Файл вопросов: { topics: [{ name, questions: [{ text, options, correct, points, why }] }] }.
// Тема с тем же именем пополняется. Вопрос с тем же текстом второй раз не добавляется,
// но получает справку из файла: так справки дописываются к уже загруженным вопросам.
// Бывший в выпуске вопрос так и остаётся бывшим.
// Ошибка в любом вопросе останавливает всю загрузку: в базу не попадает половина файла.
export function mergeBank(topics, file, newId, now) {
  if (!file || !Array.isArray(file.topics) || !file.topics.length) throw new GameError('В файле нет тем');
  const changed = [];
  let added = 0;
  let skipped = 0;
  let notes = 0;
  for (const ft of file.topics) {
    const name = String(ft.name || '').trim();
    if (!name) throw new GameError('В файле есть тема без имени');
    const same = t => norm(t.name) === norm(name);
    const base = changed.find(same) || topics.find(same);
    const t = base
      ? { ...base, questions: (base.questions || []).slice() }
      : { id: newId('t'), name, order: now + changed.length, questions: [] };
    const seen = new Map(t.questions.map((q, i) => [norm(q.text), i]));
    for (const q of ft.questions || []) {
      const v = checkQuestion(q);
      const k = seen.get(norm(v.text));
      if (k === undefined) {
        seen.set(norm(v.text), t.questions.length);
        t.questions.push({ id: newId('q'), ...v });
        added += 1;
      } else if ((v.why && t.questions[k].why !== v.why) || (v.trap && !t.questions[k].trap)) {
        // Файл дописывает справку и отметку «подвох» к уже загруженному вопросу
        t.questions[k] = { ...t.questions[k], ...(v.why ? { why: v.why } : {}), ...(v.trap ? { trap: true } : {}) };
        notes += 1;
      } else skipped += 1;
    }
    const i = changed.findIndex(same);
    if (i >= 0) changed[i] = t; else changed.push(t);
  }
  return { changed, added, skipped, notes };
}
