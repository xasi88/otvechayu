// Панель ведущего на Surface: вход через Google, связь с базой, выпуск, нажатия.
// Идущий выпуск лежит в базе (live/host). Каждое действие пишет его одной транзакцией (host-db.js),
// а экран гостя получает свой вид (live/state) без правильного ответа.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, collection, setDoc, deleteDoc, onSnapshot,
} from './fb.js';
import { newEpisode, act, journal, GameError } from './game.js';
import { offerTopics } from './bank.js';
import { esc, toast, confirmed, download, clock } from './ui.js';
import { buildLive, liveKey, liveBase } from './host-live.js';
import { buildPlayers, buildQuestions, buildHistory } from './host-data.js';
import { showMenu } from './host-menu.js';
import { watchTv, tvSeen, tvOn } from './tv.js';
import { emptyQuestion, questionActions, watchImport } from './host-questions.js';
import { change, open, close, drop } from './host-db.js';

// Вкладок нет: главный экран «Выпуск», разделы открываются из его карточек (правило автора 2026-10-28)
const BUILD = { players: buildPlayers, questions: buildQuestions, history: buildHistory };
const app = document.getElementById('h-app');
const samsung = document.getElementById('h-samsung');

const S = {
  tab: 'live', topics: [], players: [], episodes: [], ep: null,
  guest: {}, guestSeen: 0, seenRaw: undefined, guestOnline: false, took: null,
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
    tvSeen(S.ep);
  }, fail));
  unsub.push(onSnapshot(doc(db, 'live', 'guest'), snap => {
    S.guest = snap.data() || {};
    onGuest(S.guest);
  }, fail));
  render(true);
}

// Касания гостя и отметка «на связи» приходят через live/guest.
// Время касания: миг, когда оно пришло, а не когда база ответила на транзакцию
function onGuest(g) {
  if (g.seen && g.seen !== S.seenRaw) {
    // Первый раз верим часам Samsung, дальше времени прихода на Surface.
    S.guestSeen = S.seenRaw === undefined ? g.seen : Date.now();
    S.seenRaw = g.seen;
  }
  updateSamsung();
  const ep = S.ep;
  if (!ep || g.session !== ep.id || !g.n || g.n === ep.lastN || g.n === S.took) return;
  const now = Date.now();
  let fn = null;
  if (ep.phase === 'invite' && g.ready) fn = e => act(e, 'ready', {}, false, now);
  // Выбор тем приходит как pick с index -1: правила базы пропускают от гостя только эти поля.
  // Новый экран гостя шлёт весь выбор списком, старый одну тему числом
  else if (ep.phase === 'topics' && g.index === -1 && (Array.isArray(g.pick) || Number.isInteger(g.pick))) {
    const data = Array.isArray(g.pick) ? { topics: g.pick } : { option: g.pick };
    fn = e => act(e, 'topic', data, false, now);
  } else if (ep.phase === 'question' && Number.isInteger(g.pick) && g.index === ep.index) {
    // think: сколько гость думал, его меряет сам Samsung (guest.js)
    fn = e => act(e, 'pick', { option: g.pick, think: g.think }, false, now);
  }
  if (!fn) return;
  // Касание уже идёт в базу: следующий снимок до ответа базы не пошлёт его второй раз
  S.took = g.n;
  change(S, fn, g.n).then(ok => { if (!ok && S.took === g.n) S.took = null; });
}

function updateSamsung() {
  const on = Date.now() - S.guestSeen < 25000;
  // Коротко, чтобы влезло в полосу: зелёная точка на связи, красная метка без связи.
  // «ТВ»: окно телевизора на связи, звук идёт с него
  samsung.innerHTML = `<span class="dot ${on ? 'dot-on' : ''}"></span>Samsung` +
    (tvOn() ? ' <span class="dot dot-on"></span>ТВ' : '');
  samsung.classList.toggle('h-samsung-off', !on);
  samsung.title = (on ? 'Samsung на связи' : 'Samsung не на связи') +
    (tvOn() ? '. Звук идёт с телевизора' : '. Звук идёт с Samsung');
  if (on !== S.guestOnline) {
    S.guestOnline = on;
    refresh('live');
  }
}
setInterval(updateSamsung, 5000);
watchTv(updateSamsung);

// ---------- выпуск ----------

// Действие ведущего. Время берётся в миг касания, а не после ответа базы.
// Пока действие идёт в базу (не дольше 4 секунд) и ещё 0,6 секунды после касания новые касания
// не действуют: двойное касание не даёт ошибки «Сейчас это сделать нельзя» и не запускает жребий второй раз
let busy = 0;          // миг последнего действия ведущего
let pending = false;   // оно ещё идёт в базу
async function run(action, data) {
  const now = Date.now();
  if (now - busy < (pending ? 4000 : 600)) return;
  busy = now;
  pending = true;
  await change(S, ep => act(ep, action, data, true, now));
  if (busy === now) pending = false;
}

// Новый выпуск: гость выбирает три темы из тех, что отмечены «в игре». Пробный не трогает участников.
// Карточка нового участника появляется в конце выпуска (host-db.js): отменённый выпуск её не оставляет
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
  if (tvOn()) ep.tv = true;
  return open(ep);
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
    paint(buildLive(S, anim), !force);
  } else {
    liveShown = liveAnim = '';
    paint(BUILD[S.tab](S, force ? 'pop' : ''), !force);
  }
}

// Экран строится заново целиком. Прокрутка списков (data-keep) и поле с курсором остаются
// на месте: касание у 45-го вопроса не уводит список наверх, клавиатура не закрывается
function paint(html, keep) {
  const tops = {};
  let field = null;
  if (keep) {
    app.querySelectorAll('[data-keep]').forEach(el => { tops[el.dataset.keep] = el.scrollTop; });
    const a = document.activeElement;
    if (a && app.contains(a) && a.dataset.field) {
      field = { sel: `[data-field="${a.dataset.field}"]` + (a.dataset.option ? `[data-option="${a.dataset.option}"]` : ''),
        from: a.selectionStart, to: a.selectionEnd };
    }
  }
  app.innerHTML = html;
  app.querySelectorAll('[data-keep]').forEach(el => { if (tops[el.dataset.keep]) el.scrollTop = tops[el.dataset.keep]; });
  const el = field && app.querySelector(field.sel);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { el.setSelectionRange(field.from, field.to); } catch { /* поле без выделения */ }
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
  cancel: () => close(tvOn()),
  new: () => close(tvOn()),
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
  // Выпуск на главном экране ещё пишет себя в «Историю»: сначала его надо закрыть
  delEpisode: (d, b) => {
    if (!confirmed(b)) return;
    if (S.ep && S.ep.id === d.id) return toast('Выпуск открыт на главном экране. Сначала закройте его');
    f.epSel = null;
    return drop(S, d.id);
  },
  ...questionActions(S, save, newId, render),
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-do]');
  if (!b || b.disabled) return;
  const fn = DO[b.dataset.do];
  const out = fn && fn(b.dataset, b);
  // Действие ушло в базу: кнопка бледнеет, пока база не ответит
  if (out && out.then) {
    b.classList.add('h-busy');
    out.finally(() => b.classList.remove('h-busy'));
  }
});

watchImport(S, newId);

const FIELD = {
  guest: el => { f.guest = el.value; f.playerId = null; },
  newPlayer: el => { f.newPlayer = el.value; },
  newTopic: el => { f.newTopic = el.value; },
  qText: el => { f.q.text = el.value; },
  qOpt: el => { f.q.options[Number(el.dataset.option)] = el.value; },
  qWhy: el => { f.q.why = el.value; },
  whyText: el => { f.whyText = el.value; },
};
document.addEventListener('input', e => {
  const fn = FIELD[e.target.dataset.field];
  if (fn) fn(e.target);
});
