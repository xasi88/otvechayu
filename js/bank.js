// Банк вопросов: сложность, вопросы без повторов, темы выпуска, загрузка файлом.
// Чистые функции без сети: их проверяют тесты (tests/game.test.mjs).
// Сложность это баллы вопроса: 1 лёгкий, 2 средний, 3 сложный.
import { GameError } from './game.js';

// Четыре вопроса темы по нарастающей: лёгкий, средний, средний, сложный
const NEED = { 1: 1, 2: 2, 3: 1 };

// Сколько вопросов темы ещё не было в выпусках, по сложности
export function left(topic) {
  const n = { 1: 0, 2: 0, 3: 0 };
  for (const q of topic.questions || []) if (!q.used && q.points in n) n[q.points] += 1;
  return n;
}

// На сколько выпусков ещё хватит темы
export function runs(topic) {
  const n = left(topic);
  return Math.min(Math.floor(n[1] / NEED[1]), Math.floor(n[2] / NEED[2]), Math.floor(n[3] / NEED[3]));
}

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Четыре вопроса темы по плану. Обычный выпуск берёт только новые вопросы.
// Пробный берёт сначала уже бывшие, чтобы новые никто не видел до выпуска.
// Пробному хватает любых четырёх вопросов, если по плану не набирается.
function pickFour(topic, trial, rand) {
  const qs = topic.questions || [];
  let four = [];
  for (const level of [1, 2, 3]) {
    const fresh = shuffle(qs.filter(q => q.points === level && !q.used), rand);
    const old = shuffle(qs.filter(q => q.points === level && q.used), rand);
    four.push(...(trial ? [...old, ...fresh] : fresh).slice(0, NEED[level]));
  }
  if (four.length < 4) {
    if (!trial || qs.length < 4) return null;
    four = shuffle(qs, rand).slice(0, 4).sort((a, b) => a.points - b.points);
  }
  return four.map(q => ({
    id: q.id, topicId: topic.id, topic: topic.name, text: q.text,
    options: q.options.slice(), correct: q.correct, points: q.points,
  }));
}

// Темы выпуска: две выпадают сами, третью гость выбирает из остальных.
// Выпадают только темы, где хватает вопросов. Четвёрки вопросов набираются сразу.
export function drawTopics(topics, { trial = false, rand = Math.random } = {}) {
  const sets = {};
  for (const t of topics) {
    const four = pickFour(t, trial, rand);
    if (four) sets[t.id] = four;
  }
  const ready = topics.filter(t => sets[t.id]);
  if (ready.length < 3) {
    throw new GameError('Мало вопросов: нужны три темы, где есть новые 1 лёгкий, 2 средних и 1 сложный вопрос');
  }
  const drawn = shuffle(ready, rand).slice(0, 2);
  const brief = t => ({ id: t.id, name: t.name });
  return { drawn: drawn.map(brief), choices: ready.filter(t => !drawn.includes(t)).map(brief), sets };
}

// Вопрос показан гостю в обычном выпуске: больше он не выпадет никому
export function markUsed(questions, id, episode) {
  return questions.map(q => (q.id === id ? { ...q, used: episode } : q));
}

const norm = text => String(text).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

function checkQuestion(q) {
  const text = String(q.text || '').trim();
  const where = `Вопрос «${text.slice(0, 40) || 'без текста'}»`;
  const options = Array.isArray(q.options) ? q.options.map(o => String(o).trim()) : [];
  if (!text || text.length > 300) throw new GameError(`${where}: нужен текст до 300 знаков`);
  if (options.length !== 4 || options.some(o => !o || o.length > 120)) throw new GameError(`${where}: нужны 4 варианта до 120 знаков`);
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) throw new GameError(`${where}: правильный ответ от 0 до 3`);
  if (![1, 2, 3].includes(q.points)) throw new GameError(`${where}: сложность 1, 2 или 3`);
  return { text, options, correct: q.correct, points: q.points };
}

// Файл вопросов: { topics: [{ name, questions: [{ text, options, correct, points }] }] }.
// Тема с тем же именем пополняется. Вопрос с тем же текстом второй раз не добавляется.
// Ошибка в любом вопросе останавливает всю загрузку: в базу не попадает половина файла.
export function mergeBank(topics, file, newId, now) {
  if (!file || !Array.isArray(file.topics) || !file.topics.length) throw new GameError('В файле нет тем');
  const changed = [];
  let added = 0;
  let skipped = 0;
  for (const ft of file.topics) {
    const name = String(ft.name || '').trim();
    if (!name) throw new GameError('В файле есть тема без имени');
    const same = t => norm(t.name) === norm(name);
    const base = changed.find(same) || topics.find(same);
    const t = base
      ? { ...base, questions: (base.questions || []).slice() }
      : { id: newId('t'), name, order: now + changed.length, questions: [] };
    const seen = new Set(t.questions.map(q => norm(q.text)));
    for (const q of ft.questions || []) {
      const v = checkQuestion(q);
      if (seen.has(norm(v.text))) { skipped += 1; continue; }
      seen.add(norm(v.text));
      t.questions.push({ id: newId('q'), ...v });
      added += 1;
    }
    const i = changed.findIndex(same);
    if (i >= 0) changed[i] = t; else changed.push(t);
  }
  return { changed, added, skipped };
}
