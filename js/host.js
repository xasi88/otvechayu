// Панель ведущего на Surface: вход через Google, вкладки, связь с базой, выпуск.
// Выпуск живёт здесь. После каждого действия он сохраняется в базу (episodes),
// а экран гостя получает свой вид (live/state) без правильного ответа.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, collection, setDoc, deleteDoc, onSnapshot, runTransaction,
} from './fb.js';
import {
  newEpisode, act, guestView, addToPlayer, removeFromPlayer, journal, standings, guestTable, GameError,
} from './game.js';
import { offerTopics, markUsed, release, mergeBank } from './bank.js';
import { esc, toast, confirmed, download, clock } from './ui.js';
import { buildLive, liveKey, liveBase } from './host-live.js';
import { buildPlayers, buildQuestions, buildHistory } from './host-data.js';
import { showMenu } from './host-menu.js';

// Вкладок нет: главный экран «Выпуск», разделы открываются из его карточек (правило автора 2026-10-28)
const BUILD = { players: buildPlayers, questions: buildQuestions, history: buildHistory };
const app = document.getElementById('h-app');
const samsung = document.getElementById('h-samsung');

const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, points: 1 });
const S = {
  tab: 'live', topics: [], players: [], episodes: [], ep: null,
  guest: {}, guestSeen: 0, seenRaw: undefined, guestOnline: false,
  form: {
    guest: '', playerId: null, topics: new Set(), topicsTouched: false,
    newPlayer: '', newTopic: '', q: emptyQuestion(), playerSel: null, topicSel: null, epSel: null,
  },
};
let shown = false;  // вошёл ведущий: экран можно строить
let liveShown = '';
let liveAnim = '';
let unsub = [];

const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const save = (path, data) => setDoc(doc(db, ...path), data).catch(err => toast('Не сохранилось: ' + err.code));

// ---------- вход ----------

onAuthStateChanged(auth, user => {
  unsub.forEach(stop => stop());
  unsub = [];
  if (!user || user.isAnonymous) return showLogin();
  listen();
});

function showLogin() {
  shown = false;
  showMenu(false);
  app.innerHTML = `
    <section class="h-center">
      <h1 class="logo h-login-logo pop">Отвечаю</h1>
      <p class="h-wait">Панель ведущего. Войдите через свой аккаунт Google.</p>
      <button class="btn h-main" data-do="login">Войти через Google</button>
    </section>`;
}

function showDenied() {
  unsub.forEach(stop => stop());
  unsub = [];
  shown = false;
  const u = auth.currentUser;
  app.innerHTML = `
    <section class="h-center">
      <p class="h-wait">У аккаунта ${esc(u && u.email)} нет доступа к вопросам.</p>
      <p class="h-note">Код аккаунта: ${esc(u && u.uid)}</p>
      <button class="btn btn-second" data-do="logout">Выйти</button>
    </section>`;
}

// ---------- база ----------

function listen() {
  shown = true;
  showMenu(true);
  const fail = err => (err.code === 'permission-denied' ? showDenied() : toast('База: ' + err.code));
  unsub.push(onSnapshot(collection(db, 'topics'), snap => {
    S.topics = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    // Пока ведущий сам не трогал темы, выбраны все, даже только что добавленные
    if (!S.form.topicsTouched) S.topics.forEach(t => S.form.topics.add(t.id));
    refresh('live', 'questions');
  }, fail));
  unsub.push(onSnapshot(collection(db, 'players'), snap => {
    S.players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refresh('live', 'players');
  }, fail));
  unsub.push(onSnapshot(collection(db, 'episodes'), snap => {
    S.episodes = snap.docs.map(d => d.data()).sort((a, b) => b.id.localeCompare(a.id));
    refresh('history', 'players', 'live');
  }, fail));
  // Идущий выпуск лежит в базе (live/host) и общий для всех открытых панелей:
  // панель на Surface, на Samsung, после перезагрузки. Любая из них ведёт его дальше.
  unsub.push(onSnapshot(doc(db, 'live', 'host'), snap => {
    S.ep = (snap.data() || {}).ep || null;
    refresh('live', 'history');
    onGuest(S.guest);
  }, fail));
  unsub.push(onSnapshot(doc(db, 'live', 'guest'), snap => {
    S.guest = snap.data() || {};
    onGuest(S.guest);
  }, fail));
  render(true);
}

// Касания гостя и отметка «на связи» приходят через live/guest.
function onGuest(g) {
  if (g.seen && g.seen !== S.seenRaw) {
    // Первый раз верим часам Samsung, дальше времени прихода на Surface.
    S.guestSeen = S.seenRaw === undefined ? g.seen : Date.now();
    S.seenRaw = g.seen;
  }
  updateSamsung();
  const ep = S.ep;
  if (!ep || g.session !== ep.id || !g.n || g.n === ep.lastN) return;
  if (ep.phase === 'invite' && g.ready) change(e => act(e, 'ready', {}, false, Date.now()), g.n);
  // Выбор тем приходит как pick с index -1: правила базы пропускают от гостя только эти поля.
  // Новый экран гостя шлёт весь выбор списком, старый одну тему числом
  else if (ep.phase === 'topics' && g.index === -1 && (Array.isArray(g.pick) || Number.isInteger(g.pick))) {
    const data = Array.isArray(g.pick) ? { topics: g.pick } : { option: g.pick };
    change(e => act(e, 'topic', data, false, Date.now()), g.n);
  } else if (ep.phase === 'question' && Number.isInteger(g.pick) && g.index === ep.index) {
    change(e => act(e, 'pick', { option: g.pick }, false, Date.now()), g.n);
  }
}

function updateSamsung() {
  const on = Date.now() - S.guestSeen < 25000;
  // Коротко, чтобы влезло в полосу: зелёная точка на связи, красная метка без связи
  samsung.innerHTML = `<span class="dot ${on ? 'dot-on' : ''}"></span>Samsung`;
  samsung.classList.toggle('h-samsung-off', !on);
  samsung.title = on ? 'Samsung на связи' : 'Samsung не на связи';
  if (on !== S.guestOnline) {
    S.guestOnline = on;
    refresh('live');
  }
}
setInterval(updateSamsung, 5000);

// ---------- выпуск ----------

// Правка выпуска одной транзакцией: выпуск, вид гостя, журнал, карточка участника, банк вопросов.
// Показанный гостю вопрос сгорает в банке (bank.js, markUsed) и больше не выпадает.
// В конце выпуска в него ложится турнирная таблица: её видит гость, она остаётся в «Истории».
// Пробный выпуск ничего не сжигает и не пишет ни в участников, ни в «Историю».
// Две открытые панели не примут одно касание дважды: вторая увидит, что оно уже принято.
// n: время касания гостя, по нему касание принимается один раз.
async function change(fn, n = null) {
  try {
    await runTransaction(db, async tx => {
      const hostRef = doc(db, 'live', 'host');
      const ep = ((await tx.get(hostRef)).data() || {}).ep;
      if (!ep) throw new GameError('Выпуска нет');
      if (n && ep.lastN === n) throw new GameError('');
      // Все чтения до первой записи: так требует транзакция Firestore
      const playerRef = ep.trial ? null : doc(db, 'players', ep.playerId);
      const player = playerRef ? await tx.get(playerRef) : null;
      const q = !ep.trial && ep.phase === 'question' && !ep.shown ? ep.questions[ep.index] : null;
      const topicRef = q && q.topicId ? doc(db, 'topics', q.topicId) : null;
      const topic = topicRef ? await tx.get(topicRef) : null;
      fn(ep);
      if (n) ep.lastN = n;
      if (topic && topic.exists() && ep.shown) {
        const t = topic.data();
        tx.set(topicRef, { ...t, questions: markUsed(t.questions || [], q.id, ep.id) });
      }
      if (ep.finished && !ep.counted) {
        ep.counted = true;
        const past = S.episodes.filter(e => e.playerId === ep.playerId && e.finished && e.id !== ep.id);
        const card = addToPlayer(player && player.exists() ? player.data() : null, ep, past);
        if (playerRef) tx.set(playerRef, card);
        const others = S.players.filter(pl => pl.id !== ep.playerId);
        ep.table = guestTable(standings([...others, { id: ep.playerId, ...card }], S.episodes), ep.playerId);
      }
      tx.set(hostRef, { ep });
      tx.set(doc(db, 'live', 'state'), guestView(ep));
      if (ep.start && !ep.trial) tx.set(doc(db, 'episodes', ep.id), ep);
    });
  } catch (err) {
    if (!(err instanceof GameError)) return toast('Не сохранилось: ' + (err.code || err.message));
    if (!n && err.message) toast(err.message);  // касания гостя без всплывающих ошибок
  }
}

const run = (action, data) => change(ep => act(ep, action, data, true, Date.now()));

// Новый выпуск: гость выбирает три темы из тех, что отмечены «в игре». Пробный не трогает участников.
// Карточка нового участника появляется в конце выпуска (change): отменённый выпуск её не оставляет
function start(trial) {
  const f = S.form;
  if (S.ep && !S.ep.finished) return toast('Выпуск уже идёт');
  const name = f.guest.split(/\s+/).filter(Boolean).join(' ') || (trial ? 'Пробный гость' : '');
  const player = trial ? null : S.players.find(pl => pl.id === f.playerId) ||
    S.players.find(pl => pl.name.toLowerCase() === name.toLowerCase());
  let ep;
  try {
    ep = newEpisode({
      guest: player ? player.name : name, playerId: trial ? 'trial' : player ? player.id : newId('p'),
      offer: offerTopics(S.topics.filter(t => f.topics.has(t.id)), { trial }), now: Date.now(), trial,
    });
  } catch (err) {
    if (err instanceof GameError) return toast(err.message);
    throw err;
  }
  save(['live', 'host'], { ep });
  save(['live', 'state'], guestView(ep));
}

function close() {
  save(['live', 'host'], { ep: null });
  save(['live', 'state'], guestView(null));
}

// Удаление выпуска из «Истории» одной транзакцией: итог уходит из карточки участника,
// вопросы выпуска снова в запасе (решения автора 2026-10-28).
async function drop(id) {
  const ep = S.episodes.find(e => e.id === id);
  if (!ep) return;
  const rest = S.episodes.filter(e => e.playerId === ep.playerId && e.finished && e.id !== id);
  const refs = S.topics.filter(t => (t.questions || []).some(q => q.used === id)).map(t => doc(db, 'topics', t.id));
  try {
    await runTransaction(db, async tx => {
      const playerRef = doc(db, 'players', ep.playerId);
      const player = ep.counted ? await tx.get(playerRef) : null;
      const topics = await Promise.all(refs.map(r => tx.get(r)));
      if (player && player.exists()) tx.set(playerRef, removeFromPlayer(player.data(), ep, rest));
      topics.forEach(t => t.exists() && tx.set(t.ref, { ...t.data(), questions: release(t.data().questions || [], id) }));
      tx.delete(doc(db, 'episodes', id));
    });
  } catch (err) {
    toast('Не удалилось: ' + (err.code || err.message));
  }
}

// ---------- экран ----------

function render(force) {
  if (!shown) return;
  if (S.tab === 'live') {
    const qs = t => (t.questions || []).length + ':' + (t.questions || []).filter(q => q.used).length;
    const k = liveKey(S) + (S.ep ? '' : '|' + S.players.length + '|' + S.episodes.length + '|' + S.topics.map(t => t.id + qs(t)));
    if (!force && k === liveShown) return;
    const base = liveBase(S);
    const anim = force || base !== liveAnim ? 'pop' : '';
    liveShown = k;
    liveAnim = base;
    app.innerHTML = buildLive(S, anim);
  } else {
    liveShown = liveAnim = '';
    app.innerHTML = BUILD[S.tab](S, force ? 'pop' : '');
  }
}

function refresh(...tabs) {
  if (tabs.includes(S.tab)) render(false);
}

// Счётчик «думает» под вопросом
setInterval(() => {
  const el = document.getElementById('h-timer');
  const ep = S.ep;
  if (!el || !ep || !ep.shownAt) return;
  el.textContent = ep.pick !== null ? 'Гость ответил' : 'Думает ' + clock((Date.now() - ep.shownAt) / 1000);
}, 250);

// ---------- нажатия ----------

const topicData = t => { const { id, ...rest } = t; return rest; };
const f = S.form;

const DO = {
  login: () => signInWithPopup(auth, new GoogleAuthProvider()).catch(err => toast('Вход не удался: ' + err.code)),
  logout: (d, b) => confirmed(b) && signOut(auth),
  tab: d => { S.tab = d.tab; render(true); window.scrollTo(0, 0); },
  pickPlayer: d => {
    const pl = S.players.find(x => x.id === d.id);
    f.playerId = pl.id;
    f.guest = pl.name;
    render(true);
  },
  toggleTopic: (d, b) => {
    f.topicsTouched = true;
    if (f.topics.has(d.id)) f.topics.delete(d.id); else f.topics.add(d.id);
    b.classList.toggle('h-topic-on');
  },
  start: () => start(false),
  trial: () => start(true),
  topic: d => run('topic', { option: Number(d.option) }),
  begin: () => run('begin'),
  cancel: close,
  new: close,
  show: () => run('show'),
  pick: d => run('pick', { option: Number(d.option) }),
  clear_pick: () => run('clear_pick'),
  reveal: () => run('reveal'),
  next: () => run('next'),
  finish: (d, b) => confirmed(b) && run('finish'),
  draw: () => run('draw'),
  journal: d => {
    const ep = S.ep && S.ep.id === d.id ? S.ep : S.episodes.find(e => e.id === d.id);
    if (ep) download(`otvechayu_${ep.id}.json`, journal(ep));
  },
  selPlayer: d => { f.playerSel = d.id; render(false); },
  openPlayer: d => { f.playerSel = d.id; S.tab = 'players'; render(true); },
  addPlayer: () => {
    const name = f.newPlayer.split(/\s+/).filter(Boolean).join(' ');
    if (!name) return toast('Впишите имя');
    if (S.players.some(pl => pl.name.toLowerCase() === name.toLowerCase())) return toast('Такой участник уже есть');
    const id = newId('p');
    save(['players', id], { name, episodes: 0, points: 0, correct: 0, asked: 0 });
    f.newPlayer = '';
    f.playerSel = id;
  },
  delPlayer: (d, b) => {
    if (!confirmed(b)) return;
    if (S.ep && !S.ep.finished && S.ep.playerId === d.id) return toast('У этого участника сейчас идёт выпуск');
    // Выпуски участника остаются в «Истории»: удаляется только его карточка
    deleteDoc(doc(db, 'players', d.id)).catch(err => toast('Не удалилось: ' + err.code));
    f.playerSel = null;
    if (f.playerId === d.id) f.playerId = null;
  },
  openEpisode: d => { f.epSel = d.id; S.tab = 'history'; render(true); },
  selEpisode: d => { f.epSel = d.id; render(false); },
  // Выпуск во вкладке «Выпуск» ещё пишет себя в «Историю»: сначала его надо закрыть
  delEpisode: (d, b) => {
    if (!confirmed(b)) return;
    if (S.ep && S.ep.id === d.id) return toast('Выпуск открыт на главном экране. Сначала закройте его');
    drop(d.id);
    f.epSel = null;
  },
  selTopic: d => { f.topicSel = d.id; render(false); },
  addTopic: () => {
    const name = f.newTopic.trim();
    if (!name) return toast('Впишите название темы');
    const id = newId('t');
    save(['topics', id], { name, order: Date.now(), questions: [] });
    f.newTopic = '';
    f.topicSel = id;
    f.topics.add(id);
  },
  delTopic: (d, b) => {
    if (!confirmed(b)) return;
    deleteDoc(doc(db, 'topics', d.id)).catch(err => toast('Не удалилось: ' + err.code));
    f.topicSel = null;
  },
  markCorrect: d => { f.q.correct = Number(d.option); render(false); },
  setPoints: d => { f.q.points = Number(d.n); render(false); },
  addQuestion: () => {
    const t = S.topics.find(x => x.id === f.topicSel);
    const q = f.q;
    const text = q.text.trim();
    const options = q.options.map(o => o.trim());
    if (!t) return;
    if (!text || options.some(o => !o)) return toast('Нужен текст вопроса и все четыре варианта');
    const questions = [...(t.questions || []), { id: newId('q'), text, options, correct: q.correct, points: q.points }];
    save(['topics', t.id], { ...topicData(t), questions });
    f.q = emptyQuestion();
  },
  importFile: () => document.getElementById('h-file').click(),
  delQuestion: (d, b) => {
    if (!confirmed(b)) return;
    const t = S.topics.find(x => x.id === d.topic);
    if (t) save(['topics', t.id], { ...topicData(t), questions: (t.questions || []).filter(q => q.id !== d.id) });
  },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-do]');
  if (!b || b.disabled) return;
  const fn = DO[b.dataset.do];
  if (fn) fn(b.dataset, b);
});

// Файл вопросов: темы пополняются, повторы пропускаются (bank.js, mergeBank).
// Ошибка в файле останавливает всю загрузку
document.addEventListener('change', async e => {
  if (e.target.id !== 'h-file' || !e.target.files.length) return;
  try {
    const r = mergeBank(S.topics, JSON.parse(await e.target.files[0].text()), newId, Date.now());
    await Promise.all(r.changed.map(t => setDoc(doc(db, 'topics', t.id), topicData(t))));
    toast(`Добавлено вопросов: ${r.added}. Повторов пропущено: ${r.skipped}`);
  } catch (err) {
    toast(err instanceof GameError ? err.message : 'Файл не загрузился: ' + (err.code || err.message));
  }
  e.target.value = '';
});

const FIELD = {
  guest: el => { f.guest = el.value; f.playerId = null; },
  newPlayer: el => { f.newPlayer = el.value; },
  newTopic: el => { f.newTopic = el.value; },
  qText: el => { f.q.text = el.value; },
  qOpt: el => { f.q.options[Number(el.dataset.option)] = el.value; },
};
document.addEventListener('input', e => {
  const fn = FIELD[e.target.dataset.field];
  if (fn) fn(e.target);
});
