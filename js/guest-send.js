// Экран гостя: запись касаний в базу (live/guest), привязка экрана к выпуску, повтор ответа.
// Вынесено из guest.js 2026-11-14 (предел 20 КБ).
//
// Привязка экрана (touch.js). Каждая запись несёт dev: код входа этого экрана (вход без аккаунта,
// код живёт в браузере и переживает перезагрузку). Панель принимает касания только от экрана,
// с которого нажали «Отвечаю». Поле dev есть только в новых правилах базы (firestore.rules).
// Пока они не опубликованы, база такую запись не принимает: экран шлёт её ещё раз без dev
// и дальше работает по-старому, без привязки.
//
// Повтор ответа. Раньше через 4 секунды без ответа базы варианты снова нажимались. Если панель
// первое касание уже приняла, гость жал другой вариант, видел его жёлтым, а потом экран
// перескакивал на первый. Теперь экран сам шлёт тот же вариант ещё раз, пока панель его не примет.
// Гость второй вариант нажать не может, жёлтым остаётся первый: перескока в кадре нет.
import { auth, db, doc, setDoc } from './fb.js';
import { toast } from './ui.js';

const ref = () => doc(db, 'live', 'guest');
export const myDev = () => (auth.currentUser ? auth.currentUser.uid : null);

let dev = true;  // правила базы знают поле dev
export async function put(data) {
  const uid = myDev();
  if (dev && uid) {
    try { return await setDoc(ref(), { ...data, dev: uid }, { merge: true }); } catch (err) {
      if (err.code !== 'permission-denied') throw err;
    }
    // Старые правила базы: запись без dev пройдёт. Новые правила и чужой экран: отказ и здесь
    await setDoc(ref(), data, { merge: true });
    dev = false;
    return undefined;
  }
  return setDoc(ref(), data, { merge: true });
}

// Касание гостя. Отказ базы: экран не привязан к выпуску, гость видит это словами
export const send = data => put(data).catch(err => toast(err.code === 'permission-denied'
  ? 'Этот экран не привязан к выпуску' : 'Нет связи: ' + err.code));

// Ответ гостя, который панель ещё не приняла: { session, index, text, pick, think }
let pending = null;
let timer = null;

export function sendPick(state, pick, think) {
  const p = pending = { session: state.session, index: state.index, text: state.q.text, pick, think };
  const go = () => send({ session: p.session, index: p.index, pick, n: Date.now(), think });
  go();
  clearInterval(timer);
  timer = setInterval(go, 4000);
}

// Новый вид из базы: панель приняла ответ (pick в выпуске), вопрос сменился или ушёл,
// первый ответ погас при «Втором шансе». Тогда ждать больше нечего
export function settle(state) {
  if (!pending) return;
  const q = state.q;
  const same = q && state.phase === 'question' && state.session === pending.session &&
    state.index === pending.index && q.text === pending.text;
  if (same && q.pick == null && q.struck == null) return;
  pending = null;
  clearInterval(timer);
}

// Вариант, который гость уже нажал на этом вопросе и который ещё идёт к ведущему. Нет: null
export const waitingPick = () => (pending ? pending.pick : null);
