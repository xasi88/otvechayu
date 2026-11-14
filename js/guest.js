// Экран гостя на Samsung. Гость входит без аккаунта и читает только live/state:
// правильный ответ попадает туда только после «Открыть ответ» (game.js, guestView).
// Касания гостя уходят в live/guest, их принимает экран ведущего.
import { auth, db, signInAnonymously, onAuthStateChanged, doc, setDoc, onSnapshot, enableNetwork, disableNetwork } from './fb.js';
import { esc, pointsWord, toast, keepAwake, fitZoom } from './ui.js';
import { play, startTension, stopTension } from './sound.js';
import { timeText } from './game.js';
import { drawScreen, runDraw, fitRows } from './draw.js';
import { rolikSync, afterRolik, rolikReady, watchRolik } from './rolik.js';
import { question, stakeScreen, superScreen } from './guest-play.js';

const app = document.getElementById('g-app');
const linkBar = document.getElementById('g-link');
let state = { phase: 'prep' };
let baseKey = '';
let fullKey = '';
let stop = null;
let linkTimer = null;
let heard = '';  // выбор (темы или ответа), щелчок которого гость уже услышал от своего касания
let spin = false;  // ведущий только что нажал «Итог» или «Повторить жребий»: экран играет жребий
let shownHere = null;  // когда варианты появились на этом экране: выпуск, вопрос, миг
let retry = null;  // касание темы не дошло: экран снова берёт выбор из базы


// Проба без гостя (proba/index.html): экран гостя в рамке рядом с панелью. Он всегда участник,
// и нажимает только в выпуске вне конкурса: настоящий выпуск проба не тронет
const proba = new URLSearchParams(location.search).has('proba');
keepAwake();

const seen = () => document.visibilityState === 'visible';

const send = data => setDoc(doc(db, 'live', 'guest'), data, { merge: true })
  .catch(err => toast('Нет связи: ' + err.code));
// «На связи» шлёт только экран на виду: погасший Samsung не пишет в базу и не горит зелёным у ведущего
const beat = () => seen() && auth.currentUser && send({ seen: Date.now() });
setInterval(beat, 10000);
document.addEventListener('visibilitychange', beat);

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth).catch(err => showError('Вход не удался: ' + err.code));
    return;
  }
  if (stop) stop();
  stop = onSnapshot(doc(db, 'live', 'state'), { includeMetadataChanges: true }, snap => {
    showLink(!snap.metadata.fromCache);
    const was = state;
    state = snap.data() || { phase: 'prep' };
    // Samsung сам меряет, сколько гость думал: от появления вариантов на экране до касания.
    // Экран перезагрузили посреди вопроса: появления он не видел, время считает панель
    const q = state.q || {};
    const wq = was.q || {};
    if (state.phase === 'question' && q.shown && was.session === state.session &&
        !(was.phase === 'question' && wq.shown && was.index === state.index)) {
      shownHere = { session: state.session, index: state.index, at: performance.now() };
    }
    sound(was, state);
    // Жребий играет только на глазах: после перезагрузки экран сразу показывает таблицу
    spin = was.session === state.session && state.phase === 'result' && !!state.draw && state.draw !== was.draw;
    rolikSync(state);
    render();
  }, err => showError(err.code === 'permission-denied' ? 'Нет доступа к выпуску' : 'База: ' + err.code));
  render(true);
  beat();
});

// Полоса «нет связи» появляется, только если связи нет дольше 3 секунд
let live = true;
function showLink(on) {
  live = on;
  clearTimeout(linkTimer);
  if (on) linkBar.hidden = true;
  else linkTimer = setTimeout(() => { linkBar.hidden = false; kick(); }, 3000);
}

// Связь с базой пропала: сама база возвращается с растущими паузами, до минуты.
// Экран подталкивает её: рвёт и сразу поднимает связь. Не чаще раза в 5 секунд, пока связи нет,
// и сразу, когда вернулась сеть или экран снова на виду. Касания гостя при этом не теряются
let kicked = 0;
function kick() {
  if (live || linkBar.hidden || Date.now() - kicked < 5000) return;
  kicked = Date.now();
  disableNetwork(db).then(() => enableNetwork(db)).catch(() => {});
}
setInterval(kick, 5000);
addEventListener('online', kick);
document.addEventListener('visibilitychange', () => seen() && kick());

function showError(text) {
  app.innerHTML = `<section class="g-center"><h1 class="logo g-logo">Отвечаю</h1><p class="g-hint">${esc(text)}</p></section>`;
}

// Звук на смену вида: только между двумя видами одного выпуска,
// после перезагрузки экран молчит. Свои касания гость слышит сразу (ниже, click).
// Напряжение живёт от выбора до «Открыть ответ»: сменился вид или вопрос, и оно обрывается,
// ведущий сбросил выбор, и оно затихает
function sound(a, b) {
  const qa = a.q || {}, qb = b.q || {};
  if (a.session !== b.session || a.phase !== b.phase || a.index !== b.index) stopTension();
  else if (qa.pick != null && qb.pick == null) stopTension(0.6);
  if (a.session !== b.session) return;
  if (b.phase === 'result' && a.phase !== 'result') return play('result');
  if (b.phase === 'reveal' && a.phase !== 'reveal') return play((qb.ok ?? qb.pick === qb.correct) ? 'right' : 'wrong');
  if (b.phase === 'topics') {
    if (a.phase !== 'topics') return play('draw');
    const c = chosenOf(b.topics).join(',');
    if (c !== chosenOf(a.topics).join(',') && heard !== [b.session, 'topic', c].join('|')) play('pick');
    return;
  }
  if (b.phase !== 'question' || !qb.shown) return;
  // Новый вопрос, и замена вопроса ведущим (тот же номер, другой текст)
  if (!qa.shown || a.index !== b.index || qa.text !== qb.text) play('show');
  // Второй шанс: первый ответ неверный, гость отвечает ещё раз
  else if (qb.struck != null && qa.struck == null) play('wrong');
  else if (qb.pick !== null && qa.pick === null) {
    if (heard !== [b.session, b.index, qb.pick].join('|')) play('pick');
    startTension();
  }
}

// Экран строится заново, только когда он поменялся. Текст вопроса: замена ведущим (баг 2026-11-11).
// Пружина играет при смене вопроса или фазы, а не при каждом выборе.
function render(force) {
  const s = state;
  const base = [s.phase, s.session, s.index, s.q && s.q.shown, s.q && s.q.text, s.draw, !!s.table].join('|');
  const q = s.q || {};
  const hint = [(s.used || []).join(','), (q.hidden || []).join(','), q.struck, q.second].join('/');
  const full = base + '|' + (s.q ? s.q.pick : '') + '|' + hint + '|' + (s.topics ? chosenOf(s.topics).join(',') : '') + '|' + (s.stake ? s.stake.kind : '');
  if (full === fullKey && !force) return;
  const anim = base !== baseKey ? 'pop' : '';
  baseKey = base;
  fullKey = full;
  app.innerHTML = build(s, anim);
  fitZoom(app.querySelector('.g-play, .g-final'));
  const board = app.querySelector('.g-draw');
  // Жребий ждёт конца ролика итога (rolik.js)
  const go = spin;
  if (board) afterRolik(() => runDraw(board, s, go));
  spin = false;
}

// Ролик лёг в память устройства: подпись под «Скоро начнём» меняется
watchRolik(() => { if (state.phase === 'prep') render(true); });

addEventListener('resize', () => { fitZoom(app.querySelector('.g-play, .g-final')); fitRows(app.querySelector('.g-draw')); });

function build(s, p) {
  if (s.phase === 'invite') return `
    <section class="g-center">
      <p class="g-name ${p}">${esc(s.guest)},</p>
      <h1 class="logo g-ask ${p} pop-1">отвечаешь?</h1>
      <button class="btn g-yes" data-act="ready">Отвечаю</button>
    </section>`;
  if (s.phase === 'topics') return topicsScreen(s.topics, p);
  if (s.phase === 'question' || s.phase === 'reveal') return question(s, p);
  if (s.phase === 'stake') return stakeScreen(s, p);
  if (s.phase === 'super') return superScreen(s, p);
  if (s.phase === 'result') return result(s, p);
  return `
    <section class="g-center">
      <h1 class="logo g-logo ${p}">Отвечаю</h1>
      <p class="g-hint ${p} pop-1">${proba ? 'Проба: экран гостя' : 'Скоро начнём'}</p>
      <p class="g-ready">${rolikReady()}</p>
    </section>`;
}

// Выбранные темы гостя: номера в порядке выбора. Старый вид выпуска хранил одно число
const chosenOf = t => [].concat(t && t.chosen != null ? t.chosen : []);

// Темы выпуска: гость сам выбирает три. Выбранная тема жёлтая, как выбор ответа,
// с номером: в таком порядке пойдут вопросы. Повторное касание снимает тему
function topicsScreen(t, p) {
  const chosen = chosenOf(t);
  const full = chosen.length >= 3;
  const choices = t.choices.map((name, i) => {
    const k = chosen.indexOf(i);
    const cls = k >= 0 ? ' g-opt-picked' : full ? ' g-opt-dim' : '';
    return `<button class="g-choice${cls} ${p} pop-${i % 4}" data-topic="${i}" ${k < 0 && full ? 'disabled' : ''}>
      ${k >= 0 ? `<span class="letter">${k + 1}</span>` : ''}<span>${esc(name)}</span></button>`;
  }).join('');
  return `
    <section class="g-center">
      <h1 class="logo g-pick-title ${p}">${full ? 'Твои темы' : 'Выбери 3 темы'}</h1>
      <p class="g-name g-name-sm ${p} pop-1">${full ? 'Ждём ведущего' : `Выбрано ${chosen.length} из 3`}</p>
      <div class="g-choices">${choices}</div>
    </section>`;
}

// Итог гостя. Место в таблице открывает жребий после ролика итога (draw.js).
// Строка гостя в таблице жёлтая, как его выбор в игре
// Баллы и итог гость видит только на своём месте, во время жребия g-hide (решение автора 2026-11-11)
function result(s, p) {
  const stats = `
      <div class="sticker g-total ${p} pop-1 g-hide"><b>${s.result.correct}</b> из ${s.result.asked}</div>
      <p class="chip chip-yellow g-big-chip ${p} pop-2 g-hide">${pointsWord(s.score)}</p>
      ${s.time != null ? `<p class="chip g-big-chip ${p} pop-2 g-hide">Время ${timeText(s.time)}</p>` : ''}`;
  if (s.table && s.draw) return drawScreen(s, `<p class="g-name ${p}">${esc(s.guest)}, твой итог</p>${stats}`, spin, p);
  if (s.table) return `<section class="g-center"><p class="g-name ${p}">${esc(s.guest)}, спасибо за игру!</p>
      <p class="g-thanks ${p} pop-3">Сейчас узнаем твоё место</p></section>`;
  return `<section class="g-center"><p class="g-name ${p}">${esc(s.guest)}, твой итог</p>${stats}
      <p class="g-thanks ${p} pop-3">Спасибо за ответы!</p></section>`;
}

// Значок подсказки ждёт второе касание 3 секунды. Рисунок значка остаётся, меняется только подпись
function arm(b) {
  const name = b.querySelector('.g-tip-name');
  const text = name.textContent;
  b.dataset.armed = '1';
  b.classList.add('g-tip-arm');
  name.textContent = 'Ещё раз';
  setTimeout(() => { delete b.dataset.armed; b.classList.remove('g-tip-arm'); name.textContent = text; }, 3000);
}

// Выход из полного экрана: на Surface без клавиатуры иначе из него не выйти
const exitEl = document.getElementById('g-exit');
document.addEventListener('fullscreenchange', () => { exitEl.hidden = !document.fullscreenElement; });
exitEl.addEventListener('click', () => document.exitFullscreen().catch(() => {}));

app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (proba && !state.trial) return toast('Проба играет только вне конкурса');
  if (act === 'ready') {
    // Касание «Отвечаю» разворачивает экран целиком: в кадре нет строки браузера
    if (!proba && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    b.disabled = true;
    b.textContent = 'Ждём ведущего';
    play('ready');
    // Новый выпуск: выбор из прошлого выпуска стирается, иначе ведущий примет его заново
    send({ session: state.session, ready: true, pick: null, index: null, n: Date.now() });
  } else if (b.dataset.topic) {
    // Весь выбор тем уходит списком в pick с index -1: правила базы пропускают от гостя только эти поля.
    // Пока ведущий не принял касание, темы не нажимаются: так ни одно касание не теряется.
    // Касание не дошло: через 3 секунды экран снова берёт выбор из базы
    const i = Number(b.dataset.topic);
    const was = chosenOf(state.topics);
    const list = was.includes(i) ? was.filter(x => x !== i) : [...was, i];
    app.querySelectorAll('.g-choice').forEach(x => { x.disabled = true; });
    b.classList.toggle('g-opt-picked', !was.includes(i));
    heard = [state.session, 'topic', list.join(',')].join('|');
    play('pick');
    send({ session: state.session, index: -1, pick: list, n: Date.now() });
    clearTimeout(retry);
    retry = setTimeout(() => render(true), 3000);
  } else if (b.dataset.pick) {
    app.querySelectorAll('.g-opt').forEach(x => { x.disabled = true; });
    b.classList.add('g-opt-picked');
    heard = [state.session, state.index, Number(b.dataset.pick)].join('|');
    play('pick');
    startTension();
    // think всегда в касании: null стирает время прошлого вопроса (запись дописывает поля)
    const here = shownHere && shownHere.session === state.session && shownHere.index === state.index;
    send({ session: state.session, index: state.index, pick: Number(b.dataset.pick), n: Date.now(),
      think: here ? Math.round(performance.now() - shownHere.at) : null });
    // Касание не дошло: через 4 секунды варианты снова можно нажать (как у тем и подсказок)
    clearTimeout(retry);
    retry = setTimeout(() => render(true), 4000);
  } else if (b.dataset.stake) {
    // Ставка суперигры: pick «вид:номер вопроса» с index -3 (final.js). Передумать можно до вопроса
    app.querySelectorAll('.g-opt').forEach(x => { x.disabled = true; });
    b.classList.add('g-opt-picked');
    play('pick');
    send({ session: state.session, index: -3, pick: `${b.dataset.stake}:${state.index}`, n: Date.now() });
    clearTimeout(retry);
    retry = setTimeout(() => render(true), 3000);
  } else if (b.dataset.hint) {
    // Подсказка со второго касания: первое подсвечивает значок, подпись «Ещё раз».
    // Уходит как pick «вид:номер вопроса» с index -2: правила базы пропускают от гостя только эти поля (hints.js)
    if (!b.dataset.armed) return arm(b);
    app.querySelectorAll('.g-tip').forEach(x => { x.disabled = true; });
    play('pick');
    send({ session: state.session, index: -2, pick: `${b.dataset.hint}:${state.index}`, n: Date.now() });
    clearTimeout(retry);
    retry = setTimeout(() => render(true), 3000);
  }
});
