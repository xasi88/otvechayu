// Связь панели ведущего с базой: что панель слушает (вынесено из host.js 2026-11-14, предел 20 КБ).
// Темы, старые карточки участников, сводки выпусков, идущий выпуск, касания гостя, текущий сезон.
// Раньше панель при старте читала все выпуски целиком. Теперь она слушает короткие сводки (sums,
// summary.js), а полный выпуск с журналом читает, когда ведущий открыл его в «Истории» (watchEpisode).
import { db, doc, collection, onSnapshot, setDoc, deleteDoc, getDocs, getCountFromServer } from './fb.js';
import { burn } from './host-db.js';
import { summaryOf } from './summary.js';
import { parseAck } from './ack.js';
import { publish } from './public.js';
import { toast } from './ui.js';

// h: { refresh(...разделы), onGuest(касание), setBase(выпуск из базы), denied() }.
// Вернёт список функций, которые снимают подписки
export function listen(S, h) {
  const fail = err => (err.code === 'permission-denied' ? h.denied() : toast('База: ' + err.code));
  // Сверка сгоревших вопросов с банком (host-db.js, burn): идущий выпуск после «Итога»
  // и три последних выпуска «Истории», если их отметки не дошли до базы
  const burnAll = () => {
    burn(S, S.base);
    S.episodes.slice(0, 3).forEach(e => burn(S, e));
  };
  let healed = false;
  return [
    onSnapshot(collection(db, 'topics'), snap => {
      S.topics = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
      // Пока ведущий сам не трогал темы, выбраны все, даже только что добавленные
      if (!S.form.topicsTouched) S.topics.forEach(t => S.form.topics.add(t.id));
      burnAll();
      h.refresh('live', 'questions');
    }, fail),
    onSnapshot(collection(db, 'players'), snap => {
      S.players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.seen.players = true;
      h.refresh('live', 'players');
      publish(S);
    }, fail),
    onSnapshot(collection(db, 'sums'), snap => {
      S.episodes = snap.docs.map(d => d.data()).sort((a, b) => b.id.localeCompare(a.id));
      S.seen.sums = true;
      burnAll();
      h.refresh('history', 'players', 'live');
      if (!healed) { healed = true; heal(S); }
      publish(S);
    }, fail),
    // Идущий выпуск лежит в базе (live/host) и общий для всех открытых панелей:
    // панель на Surface, на Samsung, после перезагрузки. Любая из них ведёт его дальше.
    onSnapshot(doc(db, 'live', 'host'), snap => {
      S.base = (snap.data() || {}).ep || null;
      h.setBase(S.base);
      burnAll();
      h.refresh('live', 'history');
      h.onGuest(S.guest);
    }, fail),
    onSnapshot(doc(db, 'live', 'guest'), snap => {
      S.guest = snap.data() || {};
      // Подтверждение экрана гостя: что он показал, ролики, звук, заряд (ack.js)
      S.ack = parseAck(S.guest.view);
      h.onGuest(S.guest);
      h.refresh('live');
    }, fail),
    // Текущий сезон (season.js): его меняет кнопка «Начать новый сезон» в меню ⚙
    onSnapshot(doc(db, 'set', 'main'), snap => {
      S.season = (snap.data() || {}).season || 1;
      S.seen.season = true;
      h.refresh('live', 'players', 'history');
      publish(S);
    }, fail),
    // Открытая таблица для зрителей (public.js): панель помнит, что уже лежит в базе
    onSnapshot(doc(db, 'public', 'table'), snap => {
      S.pub = (snap.data() || {}).json || '';
      S.seen.pub = true;
      publish(S);
    }, fail),
  ];
}

// Сводки и выпуски разошлись: выпуски сняты до сводок (до 2026-11-14) или на прежней версии панели.
// Панель сверяет их число один раз при запуске. Не сошлось: читает выпуски целиком, дописывает
// недостающие сводки и убирает сводки без выпуска. Нет связи: сверка в следующий запуск
async function heal(S) {
  try {
    const n = (await getCountFromServer(collection(db, 'episodes'))).data().count;
    if (n === S.episodes.length) return;
    const full = (await getDocs(collection(db, 'episodes'))).docs.map(d => d.data());
    const have = new Set(S.episodes.map(e => e.id));
    const real = new Set(full.map(e => e.id));
    for (const ep of full) if (ep.id && !have.has(ep.id)) await setDoc(doc(db, 'sums', ep.id), summaryOf(ep));
    for (const id of have) if (!real.has(id)) await deleteDoc(doc(db, 'sums', id));
  } catch { /* сверка в следующий запуск */ }
}

// Полный выпуск «Истории»: панель читает его, пока он открыт, и видит правки (исправление итога).
// S.full: открытый выпуск или null, пока он грузится
let stopFull = null;
let fullId = null;
export function watchEpisode(S, id, changed) {
  if ((id || null) === fullId) return;
  if (stopFull) stopFull();
  stopFull = null;
  fullId = id || null;
  S.full = null;
  if (!id) return;
  stopFull = onSnapshot(doc(db, 'episodes', id), snap => {
    S.full = snap.exists() ? snap.data() : null;
    changed();
  }, () => {});
}

// Новый сезон: следующие выпуски идут в него, таблица начинается заново (season.js)
export const setSeason = n => setDoc(doc(db, 'set', 'main'), { season: n })
  .catch(err => toast('Не сохранилось: ' + err.code));
