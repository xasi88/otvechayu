// Панель ведущего на Surface: вход через Google, вкладки, связь с базой, выпуск.
// Выпуск живёт здесь. После каждого действия он сохраняется в базу (episodes),
// а экран гостя получает свой вид (live/state) без правильного ответа.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, collection, setDoc, deleteDoc, onSnapshot,
} from './fb.js';
import { newEpisode, act, guestView, addToPlayer, journal, GameError } from './game.js';
import { esc, toast, confirmed, download, clock } from './ui.js';
import { buildLive, liveKey, liveBase } from './host-live.js';
import { buildPlayers, buildQuestions, buildHistory } from './host-data.js';

const TABS = [['live', 'Выпуск'], ['players', 'Участники'], ['questions', 'Вопросы'], ['history', 'История']];
const BUILD = { players: buildPlayers, questions: buildQuestions, history: buildHistory };
const app = document.getElementById('h-app');
const tabsEl = document.getElementById('h-tabs');
const outEl = document.getElementById('h-out');
const samsung = document.getElementById('h-samsung');

const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, points: 1 });
const S = {
  tab: 'live', topics: [], players: [], episodes: [], ep: null,
  guestSeen: 0, seenRaw: undefined, guestOnline: false, lastN: null, resumed: false,
  form: {
    guest: '', playerId: null, topics: new Set(), topicsTouched: false,
    newPlayer: '', newTopic: '', q: emptyQuestion(), playerSel: null, topicSel: null, epSel: null,
  },
};
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
  tabsEl.hidden = outEl.hidden = true;
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
  tabsEl.hidden = true;
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
  tabsEl.hidden = outEl.hidden = false;
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
    resume();
    refresh('history', 'players');
  }, fail));
  unsub.push(onSnapshot(doc(db, 'live', 'guest'), snap => onGuest(snap.data() || {}), fail));
  render(true);
}

// Surface перезагрузили посреди выпуска: продолжаем с того же места.
function resume() {
  if (S.resumed) return;
  S.resumed = true;
  const open = S.episodes.find(e => !e.finished && e.start);
  if (open && !S.ep) {
    S.ep = open;
    publish();
    refresh('live');
  }
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
  if (!ep || g.session !== ep.id || !g.n || g.n === S.lastN) return;
  S.lastN = g.n;
  if (ep.phase === 'invite' && g.ready) run('ready', {}, false, true);
  else if (ep.phase === 'question' && Number.isInteger(g.pick) && g.index === ep.index) {
    run('pick', { option: g.pick }, false, true);
  }
}

function updateSamsung() {
  const on = Date.now() - S.guestSeen < 25000;
  samsung.innerHTML = `<span class="dot ${on ? 'dot-on' : ''}"></span>${on ? 'Samsung на связи' : 'Samsung не на связи'}`;
  if (on !== S.guestOnline) {
    S.guestOnline = on;
    refresh('live');
  }
}
setInterval(updateSamsung, 5000);

// Выпуск в базу, вид гостя в live/state
function publish() {
  save(['live', 'state'], guestView(S.ep));
  if (S.ep && S.ep.start) save(['episodes', S.ep.id], S.ep);
}

// ---------- выпуск ----------

function run(action, data, host = true, quiet = false) {
  const ep = S.ep;
  if (!ep) return;
  try {
    act(ep, action, data, host, Date.now());
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
    if (!quiet) toast(err.message);
    return;
  }
  if (ep.finished && !ep.counted) {
    ep.counted = true;
    const player = S.players.find(pl => pl.id === ep.playerId);
    const { id, ...old } = player || {};
    save(['players', ep.playerId], addToPlayer(player ? old : null, ep));
  }
  publish();
  refresh('live', 'history');
}

function start() {
  const f = S.form;
  if (S.ep) return toast('Выпуск уже идёт');
  const name = f.guest.split(/\s+/).filter(Boolean).join(' ');
  const player = S.players.find(pl => pl.id === f.playerId) ||
    S.players.find(pl => pl.name.toLowerCase() === name.toLowerCase());
  try {
    S.ep = newEpisode({
      guest: player ? player.name : name, playerId: player ? player.id : newId('p'),
      topics: S.topics.filter(t => f.topics.has(t.id)), now: Date.now(),
    });
  } catch (err) {
    if (err instanceof GameError) return toast(err.message);
    throw err;
  }
  if (!player) save(['players', S.ep.playerId], { name: S.ep.guest, episodes: 0, points: 0, correct: 0, asked: 0 });
  S.lastN = null;
  publish();
  render(true);
}

function close() {
  S.ep = null;
  publish();
  render(true);
}

// ---------- экран ----------

function render(force) {
  if (tabsEl.hidden) return;
  tabsEl.innerHTML = TABS.map(([id, name]) => `
    <button class="h-tab ${S.tab === id ? 'h-tab-on' : ''}" data-do="tab" data-tab="${id}">${name}${
      id === 'live' && S.ep && !S.ep.finished ? '<span class="h-live-dot"></span>' : ''}</button>`).join('');
  if (S.tab === 'live') {
    const k = liveKey(S) + (S.ep ? '' : '|' + S.players.length + '|' + S.topics.map(t => t.id + (t.questions || []).length));
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
  tab: d => { S.tab = d.tab; render(true); },
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
  start,
  cancel: close,
  new: close,
  show: () => run('show'),
  pick: d => run('pick', { option: Number(d.option) }),
  clear_pick: () => run('clear_pick'),
  reveal: () => run('reveal'),
  next: () => run('next'),
  finish: (d, b) => confirmed(b) && run('finish'),
  journal: d => {
    const ep = S.ep && S.ep.id === d.id ? S.ep : S.episodes.find(e => e.id === d.id);
    if (ep) download(`otvechayu_${ep.id}.json`, journal(ep));
  },
  selPlayer: d => { f.playerSel = d.id; render(false); },
  addPlayer: () => {
    const name = f.newPlayer.split(/\s+/).filter(Boolean).join(' ');
    if (!name) return toast('Впишите имя');
    if (S.players.some(pl => pl.name.toLowerCase() === name.toLowerCase())) return toast('Такой участник уже есть');
    const id = newId('p');
    save(['players', id], { name, episodes: 0, points: 0, correct: 0, asked: 0 });
    f.newPlayer = '';
    f.playerSel = id;
  },
  openEpisode: d => { f.epSel = d.id; S.tab = 'history'; render(true); },
  selEpisode: d => { f.epSel = d.id; render(false); },
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
