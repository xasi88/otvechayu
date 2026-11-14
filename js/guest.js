// Экран гостя на Samsung. Гость входит без аккаунта и читает только live/state:
// правильный ответ попадает туда только после «Открыть ответ» (game.js, guestView).
// Касания гостя уходят в live/guest, их принимает экран ведущего.
import { auth, db, signInAnonymously, onAuthStateChanged, doc, onSnapshot } from './fb.js';
import { esc, pointsWord, toast, keepAwake, fitZoom } from './ui.js';
import { play, startTension, stopTension } from './sound.js';
import { timeText } from './game.js';
import { drawScreen, runDraw, fitRows } from './draw.js';
import { rolikSync, afterRolik, rolikReady, watchRolik } from './rolik.js';
import { question, stakeScreen, superScreen, topicsScreen, chosenOf } from './guest-play.js';
import { tapZero, mark, sendAck } from './guest-ack.js';
import { put, send, myDev, sendPick, settle, waitingPick } from './guest-send.js';
import { showLink, linkMode } from './guest-link.js';
import { optsOpen, timerText } from './pause.js';

const app = document.getElementById('g-app');
let state = { phase: 'prep' };
let baseKey = '';
let fullKey = '';
let stop = null;
let heard = '';  // выбор (темы или ответа), щелчок которого гость уже услышал от своего касания
let spin = false;  // ведущий только что нажал «Итог» или «Повторить жребий»: экран играет жребий
let shownHere = null;  // когда варианты появятся на этом экране: выпуск, вопрос, миг (pause.js)
let retry = null;  // касание темы не дошло: экран снова берёт выбор из базы
let thought = null;  // касание ответа на этом экране: выпуск, вопрос, сколько думал
let optsTimer = null;  // пауза на чтение кончилась: варианты выезжают
let wasOpen = true;  // варианты были на экране при прошлой сборке


// Проба без гостя (proba/index.html): экран гостя в рамке рядом с панелью. Он всегда участник,
// и нажимает только в выпуске вне конкурса: настоящий выпуск проба не тронет
const proba = new URLSearchParams(location.search).has('proba');
keepAwake();

const seen = () => document.visibilityState === 'visible';

// «На связи» шлёт только экран на виду: погасший Samsung не пишет в базу и не горит зелёным у ведущего.
// Пока выпуск идёт, отметка уходит раз в 4 секунды: ведущий видит пропажу связи через 12 секунд,
// а не через 25. До выпуска и после итога раз в 10 секунд: открытый весь день экран не тратит базу
let lastBeat = 0;
function beat(force) {
  if (!seen() || !auth.currentUser) return;
  const live = state.phase && state.phase !== 'prep' && state.phase !== 'result';
  if (force !== true && Date.now() - lastBeat < (live ? 3500 : 9500)) return;
  lastBeat = Date.now();
  put({ seen: lastBeat }).catch(() => {});
  sendAck(state);
}
setInterval(beat, 4000);
document.addEventListener('visibilitychange', () => beat(true));

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth).catch(err => showError('Вход не удался: ' + err.code));
    return;
  }
  listen();
  render(true);
  beat(true);
});

// Выпуск привязан к другому планшету (touch.js): этот экран его не показывает и не нажимает.
// По новым правилам базы такой экран вид выпуска и не прочитает: он ждёт и пробует снова
const STRANGER = 'Идёт выпуск на другом планшете. Этот экран подключится, когда выпуск закончится';
const stranger = s => !!s.dev && s.dev !== myDev();

function listen() {
  if (stop) stop();
  stop = onSnapshot(doc(db, 'live', 'state'), { includeMetadataChanges: true }, snap => {
    showLink(!snap.metadata.fromCache);
    const was = state;
    state = snap.data() || { phase: 'prep' };
    linkMode(state.phase !== 'prep');
    if (stranger(state)) return showError(STRANGER);
    settle(state);
    // Samsung сам меряет, сколько гость думал: от появления вариантов на экране до касания.
    // Экран перезагрузили посреди вопроса: появления он не видел, время считает панель
    const q = state.q || {};
    const wq = was.q || {};
    // Замена вопроса (тот же номер, другой текст): время идёт заново, как у ведущего
    const same = was.session === state.session;
    // «Назад на шаг» у ведущего (undo.js) вернул прошлый вопрос или закрыл открытый ответ:
    // это не новый показ, секундомер и секунды для монтажа остаются прежними
    const again = wq.shown && wq.text === q.text && (was.index === state.index ? was.phase !== 'stake' : was.index > state.index);
    if (state.phase === 'question' && q.shown && same && !again) {
      // Варианты выедут после паузы на чтение (pause.js): от них идёт время на ответ
      shownHere = { session: state.session, index: state.index, at: performance.now() + (q.wait || 0) };
      thought = null;
      mark(state.session, 'show:' + state.index);
      clearTimeout(optsTimer);
      const key = 'opts:' + state.index;
      optsTimer = setTimeout(() => { mark(shownHere.session, key); render(); }, q.wait || 0);
    }
    // Ведущий сбросил выбор: гость думает дальше, секундомер снова идёт
    if (same && wq.pick != null && q.pick == null && state.phase === 'question') thought = null;
    // Секунды событий по часам планшета, для монтажа (guest-ack.js)
    if (same && state.phase === 'reveal' && was.phase !== 'reveal' && !(was.index > state.index)) mark(state.session, 'reveal:' + state.index);
    if (same && state.phase === 'result' && was.phase !== 'result') mark(state.session, 'result');
    sound(was, state);
    // Жребий играет только на глазах: после перезагрузки экран сразу показывает таблицу
    spin = was.session === state.session && state.phase === 'result' && !!state.draw && state.draw !== was.draw;
    rolikSync(state);
    render();
    // Панель узнаёт, что этот вид уже на экране (ack.js)
    sendAck(state);
  }, err => {
    if (err.code !== 'permission-denied') return showError('База: ' + err.code);
    showError(STRANGER);
    setTimeout(listen, 8000);
  });
}

function showError(text) {
  baseKey = fullKey = '';
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
  // «Назад на шаг» у ведущего: прошлый вопрос вернулся молча
  if (a.index > b.index) return;
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
  // ok: ведущий исправил итог открытого ответа (fix.js), вердикт на экране другой
  const hint = [(s.used || []).join(','), (q.hidden || []).join(','), q.struck, q.second, q.ok].join('/');
  // open: пауза на чтение кончилась, варианты на экране (pause.js). wait: ответ гостя ещё идёт к ведущему
  const open = optsOpen(s, shownHere, performance.now());
  const full = base + '|' + (s.q ? s.q.pick : '') + '|' + hint + '|' + (s.topics ? chosenOf(s.topics).join(',') : '') + '|' + (s.stake ? s.stake.kind : '') + '|' + open + '|' + waitingPick();
  if (full === fullKey && !force) return;
  const anim = base !== baseKey ? 'pop' : '';
  // Варианты только что выехали: пружина у них, вопрос стоит на месте
  const fresh = !anim && open && !wasOpen;
  wasOpen = open;
  baseKey = base;
  fullKey = full;
  app.innerHTML = build(s, anim, { open, fresh, wait: waitingPick() });
  fitZoom(app.querySelector('.g-play, .g-final'));
  const board = app.querySelector('.g-draw');
  // Жребий ждёт конца ролика итога (rolik.js)
  const go = spin;
  if (board) afterRolik(() => runDraw(board, s, go));
  spin = false;
  tick();
}

// Секундомер над вопросом (guest-ack.js)
function tick() {
  const el = document.getElementById('g-timer');
  if (el) el.textContent = timerText(state, shownHere, thought, performance.now());
}
setInterval(tick, 100);

// Ролик лёг в память устройства: подпись под «Скоро начнём» меняется
watchRolik(() => { if (state.phase === 'prep') render(true); });

addEventListener('resize', () => { fitZoom(app.querySelector('.g-play, .g-final')); fitRows(app.querySelector('.g-draw')); });

function build(s, p, o) {
  if (s.phase === 'invite') return `
    <section class="g-center">
      <p class="g-name ${p}">${esc(s.guest)},</p>
      <h1 class="logo g-ask ${p} pop-1">отвечаешь?</h1>
      <button class="btn g-yes" data-act="ready">Отвечаю</button>
    </section>`;
  if (s.phase === 'topics') return topicsScreen(s.topics, p);
  if (s.phase === 'question' || s.phase === 'reveal') return question(s, p, o);
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
  if (stranger(state)) return;
  if (act === 'ready') {
    // Касание «Отвечаю» разворачивает экран целиком: в кадре нет строки браузера
    if (!proba && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    b.disabled = true;
    b.textContent = 'Ждём ведущего';
    play('ready');
    // Секунда 0 по часам планшета: это касание видно на записи
    tapZero(state.session);
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
    const think = here ? Math.round(performance.now() - shownHere.at) : null;
    thought = here ? { session: state.session, index: state.index, ms: think } : null;
    mark(state.session, 'pick:' + state.index);
    // Касание не дошло: экран сам шлёт тот же вариант снова, другой нажать нельзя (guest-send.js)
    sendPick(state, Number(b.dataset.pick), think);
    sendAck(state);
    tick();
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
