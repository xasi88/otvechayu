// Панель ведущего на Surface: вход через Google, связь с базой, выпуск, нажатия.
// Идущий выпуск лежит в базе (live/host). Каждое действие пишет его одной транзакцией (host-db.js),
// а экран гостя получает свой вид (live/state) без правильного ответа.
import { auth, db, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, doc, setDoc } from './fb.js';
import { newEpisode, journal, guestView, GameError } from './game.js';
import { offerTopics, freshQuestion, loudSpare } from './bank.js';
import { touchAction } from './touch.js';
import { esc, toast, confirmed, download, clock, fitZoom } from './ui.js';
import { buildLive, liveKey, liveBase } from './host-live.js';
import { readyKey } from './host-ready.js';
import { buildPlayers, buildQuestions } from './host-data.js';
import { buildHistory } from './host-history.js';
import { reportText, fileName } from './report.js';
import { showMenu, menuLive } from './host-menu.js';
import { emptyQuestion, questionActions, watchImport } from './host-questions.js';
import { change, open, close } from './host-db.js';
import { listen } from './host-listen.js';
import { buildSeasons, seasonActions } from './host-seasons.js';
import { hostStep } from './undo.js';
import { nextNo, seasonTable } from './season.js';
import { linkBadge } from './host-link.js';
import { makeQueue } from './queue.js';
import { viewKey, linkState } from './ack.js';
import { dataActions } from './host-data-actions.js';

// Вкладок нет: главный экран «Выпуск», разделы открываются из его карточек (правило автора 2026-10-28)
const BUILD = { players: buildPlayers, questions: buildQuestions, history: buildHistory, seasons: buildSeasons };
const app = document.getElementById('h-app');
const samsung = document.getElementById('h-samsung');

// ep: выпуск на экране, base: выпуск из базы (ниже, «выпуск»)
const S = {
  tab: 'live', topics: [], players: [], episodes: [], ep: null, base: null, full: null, season: 1, names: {}, seen: {},
  guest: {}, ack: null, guestSeen: 0, seenRaw: undefined, guestOnline: false, took: null,
  form: {
    guest: '', ask: null, topics: new Set(), topicsTouched: false,
    newTopic: '', q: emptyQuestion(), playerSel: null, topicSel: null, epSel: null, epQ: null, seasonNames: {},
  },
};
let shown = false;  // вошёл ведущий: экран можно строить
let liveShown = '';
let liveAnim = '';
let dataShown = '';  // последний экран раздела: тот же не строится заново
let unsub = [];

const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const save = (path, data) => setDoc(doc(db, ...path), data).catch(err => toast('Не сохранилось: ' + err.code));

// ---------- вход ----------

onAuthStateChanged(auth, user => {
  unsub.forEach(stop => stop());
  unsub = [];
  if (!user || user.isAnonymous) return showLogin();
  // Что панель слушает в базе: host-listen.js
  shown = true;
  showMenu(true);
  unsub = listen(S, { refresh, onGuest, denied: showDenied, setBase: ep => { S.ep = Q.setBase(ep); } });
  render(true);
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
  const fn = touchAction(ep, g, now);
  if (!fn) return;
  // Касание уже идёт в базу: следующий снимок до ответа базы не пошлёт его второй раз
  S.took = g.n;
  Q.later(() => change(S, fn, g.n)).then(ok => { if (!ok && S.took === g.n) S.took = null; });
}

// Метка в полосе: связь с планшетом, очередь действий, подтверждение экрана гостя (ack.js).
// Пока выпуск идёт, планшет шлёт отметку раз в 4 секунды, и пропажу связи видно через 12 секунд
let wantKey = '';
let wantAt = 0;
function updateSamsung() {
  const now = Date.now();
  const on = now - S.guestSeen < (S.base && !S.base.finished ? 12000 : 25000);
  const want = S.base ? guestView(S.base) : null;
  const key = want ? viewKey(want) : '';
  if (key !== wantKey) { wantKey = key; wantAt = now; }
  linkBadge(samsung, linkState({
    on, off: S.guestSeen ? Math.round((now - S.guestSeen) / 1000) : 0,
    lag: Q.mine.filter(m => now - m.at > 2000).length, down: Q.down, waiting: Q.mine.length,
    ack: S.ack && want && S.ack.session === want.session ? S.ack : null, want,
    behind: Math.round((now - wantAt) / 1000),
  }));
  if (on !== S.guestOnline) {
    S.guestOnline = on;
    refresh('live');
  }
}
setInterval(updateSamsung, 1000);

// ---------- выпуск ----------

// Экран не ждёт базу (просьба автора 2026-11-03): действие ведущего сразу ложится на выпуск
// на экране, а в базу все действия и касания гостя идут по очереди. Связь подвела: действие
// остаётся на экране и идёт в базу снова (queue.js)
const Q = makeQueue({
  send: (fn, id, again) => change(S, fn, null, id, again),
  changed: () => { S.ep = Q.view(); updateSamsung(); refresh('live'); },
});

// Действие ведущего. Время берётся в миг касания, а не после ответа базы.
// Второе касание за 0,6 секунды не действует: двойное касание не попадает в кнопку,
// которая встала на место первой, и не запускает жребий второй раз
let busy = 0;  // миг последнего действия ведущего
function run(action, data) {
  const now = Date.now();
  if (!S.ep || now - busy < 600) return;
  busy = now;
  // hostStep: действие и снимок для «Назад на шаг» (undo.js)
  try { S.ep = Q.push(hostStep(action, data, now), now); } catch (err) { return toast(err.message); }
  refresh('live');
}

// Новый выпуск: гость выбирает три темы из тех, что отмечены «в игре». Вне конкурса в таблицу не идёт.
// Участник появляется в таблице с законченным выпуском (table.js)
function start(trial) {
  const f = S.form;
  if (S.ep && !S.ep.finished) return toast('Выпуск уже идёт');
  const name = f.guest.split(/\s+/).filter(Boolean).join(' ') || (trial ? 'Гость' : '');
  // Каждое участие отдельное: своя строка в таблице, баллы прошлых выпусков не складываются.
  // Имя уже в таблице: ведущий дописывает номер, «Атам Хасиев 2» (решение автора 2026-11-11)
  if (!trial && seasonTable(S.episodes, S.players, S.season).some(r => r.name.toLowerCase() === name.toLowerCase())) {
    return toast(`«${name}» уже есть в таблице. Допишите номер: «${name} 2»`);
  }
  let ep;
  try {
    ep = newEpisode({
      guest: name, playerId: trial ? 'trial' : newId('p'),
      offer: offerTopics(S.topics.filter(t => f.topics.has(t.id)), { trial }), now: Date.now(), trial,
      // Сезон и номер выпуска по порядку (season.js). Вне конкурса номера нет
      season: S.season, no: trial ? null : nextNo(S.episodes, S.season),
    });
  } catch (err) {
    if (err instanceof GameError) return toast(err.message);
    throw err;
  }
  f.ask = null;
  Q.later(() => open(ep));
}

// ---------- экран ----------

function render(force) {
  if (!shown) return;
  menuLive(S);
  if (S.tab === 'live') {
    const qs = t => (t.questions || []).length + ':' + (t.questions || []).filter(q => q.used).length;
    const k = liveKey(S) + (S.ep ? '' : '|' + S.form.ask + '|' + S.episodes.map(e => e.score + (e.out ? 'x' : '')).join(',') + '|' + S.episodes.length + '|' + S.topics.map(t => t.id + qs(t)) + '|' + readyKey(S) + '|' + S.season + JSON.stringify(S.names));
    if (!force && k === liveShown) return;
    const base = liveBase(S);
    const anim = force || base !== liveAnim ? 'pop' : '';
    liveShown = k;
    liveAnim = base;
    dataShown = '';
    paint(buildLive(S, anim), !force);
  } else {
    // Снимок базы без перемен в разделе (касание гостя, отметка «на связи») экран не трогает
    const html = BUILD[S.tab](S, force ? 'pop' : '');
    liveShown = liveAnim = '';
    if (!force && html === dataShown) return;
    dataShown = html;
    paint(html, !force);
  }
}

// Экран строится заново целиком. Прокрутка списков (data-keep) и поле с курсором остаются
// на месте: касание у 45-го вопроса не уводит список наверх, клавиатура не закрывается
// Вопрос и ответ на экране ведущего влезают без прокрутки (ui.js, fitZoom)
addEventListener('resize', () => fitZoom(app.querySelector('.h-play')));

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
  fitZoom(app.querySelector('.h-play'));
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
  // Пауза на чтение (pause.js): варианты у гостя выезжают сами, время на ответ идёт от них
  const left = Math.ceil((ep.shownAt - Date.now()) / 1000);
  el.textContent = (ep.pick !== null ? 'Гость ответил' : left > 0 ? `Варианты у гостя через ${left} с`
    : 'Думает ' + clock((Date.now() - ep.shownAt) / 1000)) + (ep.second ? ', второй шанс' : '');
}, 250);

// ---------- нажатия ----------

// Вариант за гостя со второго касания: случайное касание панели не отвечает за гостя.
// Первое касание только подсвечивает вариант (h-opt-arm), подпись в нём не меняется
function armed(b) {
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.classList.add('h-opt-arm');
  setTimeout(() => { delete b.dataset.armed; b.classList.remove('h-opt-arm'); }, 3000);
  return false;
}

const f = S.form;
// Полный выпуск: идущий или открытый в «Истории» (host-listen.js, watchEpisode)
const epById = id => (S.ep && S.ep.id === id ? S.ep : S.full && S.full.id === id ? S.full : null);

const DO = {
  login: () => signInWithPopup(auth, new GoogleAuthProvider()).catch(err => toast('Вход не удался: ' + err.code)),
  logout: (d, b) => confirmed(b) && signOut(auth),
  tab: d => { S.tab = d.tab; render(true); window.scrollTo(0, 0); },
  // Окно имени гостя: «Пригласить гостя» или «Вне конкурса» (host-home.js)
  ask: d => {
    if (S.ep && !S.ep.finished) return toast('Выпуск уже идёт');
    f.ask = d.ask;
    f.guest = '';
    render(true);
    const el = app.querySelector('[data-field="guest"]');
    if (el) el.focus();
  },
  askCancel: () => { f.ask = null; render(true); },
  toggleTopic: (d, b) => {
    f.topicsTouched = true;
    if (f.topics.has(d.id)) f.topics.delete(d.id); else f.topics.add(d.id);
    b.classList.toggle('h-topic-on');
  },
  start: () => start(false),
  trial: () => start(true),
  topic: d => run('topic', { option: Number(d.option) }),
  begin: () => run('begin'),
  cancel: (d, b) => confirmed(b) && Q.later(() => close(S)),
  new: () => Q.later(() => close(S)),
  pick: (d, b) => armed(b) && run('pick', { option: Number(d.option) }),
  clear_pick: () => run('clear_pick'),
  hint: (d, b) => confirmed(b) && run('hint', { hint: d.hint }),
  // Замена вопроса ведущим: новый вопрос из банка (bank.js, freshQuestion)
  swap: (d, b) => confirmed(b) && run('swap', { question: freshQuestion(S.topics, S.ep), was: S.ep.questions[S.ep.index].id }),
  reveal: () => run('reveal'),
  noAnswer: (d, b) => confirmed(b) && run('reveal', { none: true }),
  // Суперигра без вариантов: ответ вслух засчитывает ведущий (final.js)
  judge: (d, b) => confirmed(b) && run('reveal', { ok: d.ok === '1' }),
  // «Итог» на последнем вопросе просит второе касание: он сразу запускает ролик и жребий
  next: (d, b) => (!b.dataset.confirm || confirmed(b)) && run('next'),
  // Итог открытого вопроса наоборот: ведущий ошибся кнопкой или в банке неверный ответ (fix.js)
  fix: (d, b) => confirmed(b) && run('fix'),
  // Суперигра: ведущий выбирает за гостя, с вариантами или без, и показывает вопрос (final.js)
  stake: d => run('stake', { stake: d.stake }),
  go: () => run('go', loudSpare(S.topics, S.ep)),
  finish: (d, b) => confirmed(b) && run('finish'),
  // «Назад на шаг», метка «спорный вопрос», смена экрана гостя (undo.js)
  back: (d, b) => confirmed(b) && run('back'),
  doubt: () => run('doubt'),
  unbind: (d, b) => confirmed(b) && run('unbind'),
  draw: () => run('draw'),
  video: d => run('video', { name: d.name || null }),
  // Выпуск текстом для автора и копией JSON для монтажа (report.js)
  report: d => { const ep = epById(d.id); if (ep) download(fileName(ep, 'txt'), reportText(ep)); },
  journal: d => { const ep = epById(d.id); if (ep) download(fileName(ep, 'json'), journal(ep)); },
  ...dataActions(S, render, app),
  ...seasonActions(S),
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
  guest: el => { f.guest = el.value; },
  newTopic: el => { f.newTopic = el.value; },
  qText: el => { f.q.text = el.value; },
  qOpt: el => { f.q.options[Number(el.dataset.option)] = el.value; },
  qWhy: el => { f.q.why = el.value; },
  whyText: el => { f.whyText = el.value; },
  seasonName: el => { f.seasonNames[el.dataset.option] = el.value; },
};
// Окно имени гостя: Enter нажимает «Пригласить» (или «Начать» вне конкурса)
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.dataset.field !== 'guest' || !f.ask) return;
  e.preventDefault();
  start(f.ask === 'trial');
});
document.addEventListener('input', e => {
  const fn = FIELD[e.target.dataset.field];
  if (fn) fn(e.target);
});
