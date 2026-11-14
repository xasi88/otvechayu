// Правка темы в базе одной транзакцией (2026-11-14). Раньше раздел «Вопросы» писал тему целиком
// из копии на экране: добавил вопрос, удалил, поправил справку. А сгорание вопросов после выпуска
// шло своей транзакцией (host-db.js, burn). Правка с устаревшей копии могла стереть отметки
// «был в выпуске» (used), и вопрос выпал бы второй раз. Теперь правка читает свежую тему из базы
// и меняет в ней только своё: отметки сгорания остаются.
import { db, doc, runTransaction } from './fb.js';
import { GameError } from './game.js';
import { mergeBank } from './bank.js';
import { toast } from './ui.js';

const data = t => { const { id, ...rest } = t; return rest; };

// fn получает свежий список вопросов темы и возвращает новый. Бросил GameError: правки нет
export async function editTopic(id, fn) {
  const ref = doc(db, 'topics', id);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new GameError('Темы уже нет');
      const t = snap.data();
      tx.set(ref, { ...t, questions: fn(t.questions || []) });
    });
    return true;
  } catch (err) {
    toast(err instanceof GameError ? err.message : 'Не сохранилось: ' + (err.code || err.message));
    return false;
  }
}

// Один вопрос темы: fn получает вопрос и возвращает новый
export const editQuestion = (topic, id, fn) => editTopic(topic, qs => qs.map(q => (q.id === id ? fn(q) : q)));

// Загрузка файлом: темы читаются из базы внутри транзакции и пополняются на свежих данных
// (bank.js, mergeBank). Все темы пишутся разом: обрыв связи не оставит в базе половину файла
export async function importBank(topics, file, newId) {
  let r = null;
  await runTransaction(db, async tx => {
    const fresh = [];
    for (const t of topics) {
      const snap = await tx.get(doc(db, 'topics', t.id));
      if (snap.exists()) fresh.push({ id: t.id, ...snap.data() });
    }
    r = mergeBank(fresh, file, newId, Date.now());
    r.changed.forEach(t => tx.set(doc(db, 'topics', t.id), data(t)));
  });
  return r;
}
