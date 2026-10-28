// Экран гостя на Samsung. Гость входит без аккаунта и читает только live/state:
// правильный ответ попадает туда только после «Открыть ответ» (game.js, guestView).
// Касания гостя уходят в live/guest, их принимает экран ведущего.
import { auth, db, signInAnonymously, onAuthStateChanged, doc, setDoc, onSnapshot } from './fb.js';
import { esc, pointsWord, LETTERS, LEVELS, toast, confirmed, keepAwake } from './ui.js';
import { play, startTension, stopTension, mute, wake, audible } from './sound.js';
import { timeText } from './game.js';
import { drawScreen, runDraw } from './draw.js';

const app = document.getElementById('g-app');
const linkBar = document.getElementById('g-link');
let state = { phase: 'prep' };
let baseKey = '';
let fullKey = '';
let stop = null;
let linkTimer = null;
let heard = '';  // выбор (темы или ответа), щелчок которого гость уже услышал от своего касания
let spin = false;  // ведущий только что нажал «Жребий места»: экран играет жребий
let shownHere = null;  // когда варианты появились на этом экране: выпуск, вопрос, миг
let retry = null;  // касание темы не дошло: экран снова берёт выбор из базы

// Устройство помнит свою роль: экран участника (Samsung) или экран для телевизора (Surface).
// Телевизор только показывает: не шлёт касаний и отметки «на связи», зато играет звук.
// Звук сам: телевизор на связи и со звуком, Samsung молчит; телевизора нет, звук на Samsung.
// Телевизор сообщает о себе панели на Surface (tv.js), она кладёт отметку в вид гостя (state.tv)
function keep(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}
let tv = keep('otvechayu-screen') === 'tv';
let loud = false;  // окну телевизора браузер уже разрешил звук
document.body.classList.toggle('g-tv', tv);
if (tv) wake();
keepAwake();

// Окно телевизора не на виду (свёрнуто, закрыто другим окном) молчит и не забирает звук
const seen = () => document.visibilityState === 'visible';
const soundHere = () => (tv ? seen() : !state.tv);
const channel = window.BroadcastChannel ? new BroadcastChannel('otvechayu-tv') : null;
function tvPing() {
  mute(!soundHere());
  if (!channel || !tv) return;
  channel.postMessage({ tv: true, sound: audible() && seen() });
  if (audible() !== loud) {
    loud = audible();
    render(true);
  }
}
setInterval(tvPing, 2000);
addEventListener('pagehide', () => tv && channel && channel.postMessage({ tv: false }));

const send = data => setDoc(doc(db, 'live', 'guest'), data, { merge: true })
  .catch(err => toast('Нет связи: ' + err.code));
// «На связи» шлёт только экран на виду: погасший Samsung не пишет в базу и не горит зелёным у ведущего
const beat = () => !tv && seen() && auth.currentUser && send({ seen: Date.now() });
setInterval(beat, 10000);
document.addEventListener('visibilitychange', () => { tvPing(); beat(); });

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
    mute(!soundHere());
    sound(was, state);
    // Жребий играет только на глазах: после перезагрузки экран сразу показывает таблицу
    spin = was.session === state.session && state.phase === 'result' && !!state.draw && state.draw !== was.draw;
    render();
  }, err => showError(err.code === 'permission-denied' ? 'Нет доступа к выпуску' : 'База: ' + err.code));
  render(true);
  beat();
});

// Полоса «нет связи» появляется, только если связи нет дольше 3 секунд
function showLink(on) {
  clearTimeout(linkTimer);
  if (on) linkBar.hidden = true;
  else linkTimer = setTimeout(() => { linkBar.hidden = false; }, 3000);
}

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
  if (b.phase === 'reveal' && a.phase !== 'reveal') return play(qb.got ? 'right' : 'wrong');
  if (b.phase === 'topics') {
    if (a.phase !== 'topics') return play('draw');
    const c = chosenOf(b.topics).join(',');
    if (c !== chosenOf(a.topics).join(',') && heard !== [b.session, 'topic', c].join('|')) play('pick');
    return;
  }
  if (b.phase !== 'question' || !qb.shown) return;
  if (!qa.shown || a.index !== b.index) play('show');
  else if (qb.pick !== null && qa.pick === null) {
    if (heard !== [b.session, b.index, qb.pick].join('|')) play('pick');
    startTension();
  }
}

// Экран строится заново, только когда он поменялся.
// Пружина играет при смене вопроса или фазы, а не при каждом выборе.
function render(force) {
  const s = state;
  const base = [s.phase, s.session, s.index, s.q && s.q.shown, s.draw].join('|');
  const full = base + '|' + (s.q ? s.q.pick : '') + '|' + (s.topics ? chosenOf(s.topics).join(',') : '') +
    (s.phase === 'prep' ? '|' + !!s.tv : '');
  if (full === fullKey && !force) return;
  const anim = base !== baseKey ? 'pop' : '';
  baseKey = base;
  fullKey = full;
  app.innerHTML = build(s, anim);
  const board = app.querySelector('.g-draw');
  if (board) runDraw(board, s, spin);
  spin = false;
}

function build(s, p) {
  if (s.phase === 'invite') return `
    <section class="g-center">
      <p class="g-name ${p}">${esc(s.guest)},</p>
      <h1 class="logo g-ask ${p} pop-1">отвечаешь?</h1>
      <button class="btn g-yes" data-act="ready">Отвечаю</button>
    </section>`;
  if (s.phase === 'topics') return topicsScreen(s.topics, p);
  if (s.phase === 'question' || s.phase === 'reveal') return question(s, p);
  if (s.phase === 'result') return result(s, p);
  return `
    <section class="g-center">
      <h1 class="logo g-logo ${p}">Отвечаю</h1>
      <p class="g-hint ${p} pop-1">${tv ? 'Экран для телевизора' : 'Скоро начнём'}</p>
      ${tv ? '<button class="btn g-to-tv" data-act="toTv">На телевизор</button>' : ''}
    </section>
    <footer class="g-setup">
      <span>Этот экран</span>${seg('role', 'player', 'Участник', !tv)}${seg('role', 'tv', 'Телевизор', tv)}
      <span>${soundText(s)}</span>
    </footer>`;
}

// Где сейчас звук. Окну телевизора браузер даёт звук только после касания
function soundText(s) {
  if (tv) return audible() ? 'Звук: здесь' : 'Коснитесь экрана: включится звук';
  return s.tv ? 'Звук: на телевизоре' : 'Звук: здесь';
}

// Переключатель до выпуска: выбранное жёлтое. Смена роли просит второе касание
const seg = (act, v, text, on) =>
  `<button class="g-small ${on ? 'g-small-on' : ''}" data-act="${act}" data-v="${v}" data-confirm="Точно?" ${on ? 'disabled' : ''}>${text}</button>`;

// «На телевизор»: окно на весь экран второго монитора. Chrome один раз спросит разрешение
// на окна, после разрешения может понадобиться второе касание. Второго экрана нет: на весь этот
async function toTv() {
  const root = document.documentElement;
  if (!root.requestFullscreen) return;
  let screen = null;
  try {
    const d = await window.getScreenDetails();
    const cur = d.currentScreen;
    screen = d.screens.find(x => x.left !== cur.left || x.top !== cur.top) || null;
  } catch { /* нет разрешения или старый браузер */ }
  root.requestFullscreen(screen ? { screen } : {})
    .catch(() => root.requestFullscreen().catch(() => toast('Коснитесь ещё раз')));
}

// Панель ведущего на этом же Surface возвращает окно с телевизора: «Вернуть окно с телевизора».
// По тому же каналу ходят вести телевизора панели (объекты): их окно пропускает
if (channel) {
  channel.onmessage = e => {
    if (e.data === 'off' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
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

// Итог гостя. Место в таблице открывает жребий: ведущий жмёт «Жребий места» (draw.js).
// Строка гостя в таблице жёлтая, как его выбор в игре
function result(s, p) {
  const total = `
      <p class="g-name ${p}">${esc(s.guest)}, твой итог</p>
      <div class="sticker g-total ${p} pop-1"><b>${s.result.correct}</b> из ${s.result.asked}</div>
      <p class="chip chip-yellow g-big-chip ${p} pop-2">${pointsWord(s.score)}</p>
      ${s.time != null ? `<p class="chip g-big-chip ${p} pop-2">Время ${timeText(s.time)}</p>` : ''}`;
  if (s.table && s.draw) return drawScreen(s, total, spin, p);
  const wait = s.table ? 'Сейчас узнаем твоё место' : 'Спасибо за ответы!';
  return `<section class="g-center">${total}<p class="g-thanks ${p} pop-3">${wait}</p></section>`;
}

function question(s, p) {
  const q = s.q;
  const top = `
    <header class="g-top">
      <span class="chip">${esc(q.topic)}</span>
      <span class="chip">Вопрос ${s.index + 1} из ${s.total}</span>
      <span class="chip">${LEVELS[q.points]} · ${pointsWord(q.points)}</span>
      <span class="g-score">Баллы: ${s.score}</span>
    </header>`;
  if (!q.shown) return top + `
    <section class="g-center">
      <h1 class="logo g-listen ${p}">Слушай вопрос</h1>
    </section>`;

  const reveal = s.phase === 'reveal';
  const locked = reveal || q.pick !== null;
  const options = q.options.map((text, i) => {
    let cls = 'g-opt';
    if (reveal) cls += i === q.correct ? ' g-opt-right' : i === q.pick ? ' g-opt-wrong' : ' g-opt-dim';
    else if (q.pick !== null) cls += i === q.pick ? ' g-opt-picked' : ' g-opt-dim';
    return `
      <button class="${cls} ${p} pop-${i}" data-pick="${i}" ${locked ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span>
      </button>`;
  }).join('');

  let verdict = '';
  if (reveal && q.got) verdict = `<div class="sticker g-verdict g-verdict-right pop">Верно! +${pointsWord(q.got)}</div>`;
  else if (reveal) verdict = `<div class="sticker g-verdict g-verdict-wrong pop shake">${q.pick === null ? 'Без ответа' : 'Мимо'}</div>`;
  else if (q.pick !== null) verdict = '<div class="g-taken pop">Ответ принят</div>';

  return top + `
    <section class="g-play">
      <div class="sticker g-q ${p}">${esc(q.text)}</div>
      <div class="g-opts">${options}</div>
      ${verdict}
    </section>`;
}

// Выход из полного экрана: на Surface без клавиатуры иначе из него не выйти
const exitEl = document.getElementById('g-exit');
// На телевизоре кнопки нет: её не нажать, а камера её видит
document.addEventListener('fullscreenchange', () => { exitEl.hidden = tv || !document.fullscreenElement; });
exitEl.addEventListener('click', () => document.exitFullscreen().catch(() => {}));

app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'role') {
    if (!confirmed(b)) return;
    // Окно перестало быть телевизором: панель сразу отдаёт звук Samsung
    if (tv && channel) channel.postMessage({ tv: false });
    tv = b.dataset.v === 'tv';
    keep('otvechayu-screen', b.dataset.v);
    document.body.classList.toggle('g-tv', tv);
    beat();
    tvPing();
    return render(true);
  }
  if (act === 'toTv') return toTv();
  if (tv) return;  // телевизор только показывает
  if (act === 'ready') {
    // Касание «Отвечаю» разворачивает экран целиком: в кадре нет строки браузера
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
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
  }
});
