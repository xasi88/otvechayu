// Очередь действий ведущего (вынесена из host.js 2026-11-14, проверка tests/queue.test.mjs).
// Экран не ждёт базу: действие сразу ложится на выпуск на экране, а в базу действия идут по очереди.
// base: выпуск из базы, mine: действия ведущего, которых в базе ещё нет. Экран: base, поверх mine.
// Действие в базе, когда в выпуске номер hostN не меньше его номера (commit.js).
// Связь подвела (send вернул false): действие остаётся на экране и идёт в базу снова, в том же
// порядке и с тем же временем касания, пока база не ответит. Раньше оно молча уходило с экрана,
// и выпуск посреди записи прыгал назад. База отказала (send вернул 'no'): действие уходит с экрана.
// Чистый код без сети и без страницы.
export function makeQueue({ send, changed = () => {}, pause = ms => new Promise(r => setTimeout(r, ms)), gap = 2000 }) {
  let chain = Promise.resolve();
  let base = null;
  let mine = [];
  let lastId = 0;
  let down = false;

  // Любая работа с базой встаёт в одну очередь: действия ведущего, касания гостя, новый выпуск
  const later = job => (chain = chain.then(job, job));

  function view() {
    const done = (base && base.hostN) || 0;
    mine = mine.filter(m => m.id > done);
    let ep = base;
    for (const m of mine) {
      if (!ep) break;
      const next = structuredClone(ep);
      try { m.fn(next); ep = next; } catch { /* база его не примет: экран покажет то, что есть */ }
    }
    return ep;
  }

  async function deliver(m) {
    let res = await send(m.fn, m.id, false);
    while (res === false) {
      if (!down) { down = true; changed(); }
      await pause(gap);
      res = await send(m.fn, m.id, true);
    }
    down = false;
    if (res !== 'done') mine = mine.filter(x => x !== m);
    changed();
  }

  return {
    later, view,
    setBase(ep) { base = ep; return view(); },
    // fn: действие над выпуском, at: миг касания. Действие невозможно: ошибка сразу, в очередь не идёт
    push(fn, at) {
      fn(structuredClone(view()));
      const id = lastId = Math.max(at, lastId + 1, ((base && base.hostN) || 0) + 1);
      const m = { id, fn, at };
      mine.push(m);
      later(() => deliver(m));
      return view();
    },
    get mine() { return mine; },
    // База не отвечает: действия ждут
    get down() { return down; },
  };
}
