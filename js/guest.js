// Экран гостя на Samsung. Гость входит без аккаунта и читает только live/state:
// правильный ответ попадает туда только после «Открыть ответ» (game.js, guestView).
// Касания гостя уходят в live/guest, их принимает экран ведущего.
import { auth, db, signInAnonymously, onAuthStateChanged, doc, setDoc, onSnapshot } from './fb.js';
import { esc, pointsWord, LETTERS, toast } from './ui.js';

const app = document.getElementById('g-app');
const linkBar = document.getElementById('g-link');
let state = { phase: 'prep' };
let baseKey = '';
let fullKey = '';
let stop = null;
let linkTimer = null;

const send = data => setDoc(doc(db, 'live', 'guest'), data, { merge: true })
  .catch(err => toast('Нет связи: ' + err.code));
const beat = () => auth.currentUser && send({ seen: Date.now() });
setInterval(beat, 10000);

onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth).catch(err => showError('Вход не удался: ' + err.code));
    return;
  }
  if (stop) stop();
  stop = onSnapshot(doc(db, 'live', 'state'), { includeMetadataChanges: true }, snap => {
    showLink(!snap.metadata.fromCache);
    state = snap.data() || { phase: 'prep' };
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

// Экран строится заново, только когда он поменялся.
// Пружина играет при смене вопроса или фазы, а не при каждом выборе.
function render(force) {
  const s = state;
  const base = [s.phase, s.session, s.index, s.q && s.q.shown].join('|');
  const full = base + '|' + (s.q ? s.q.pick : '');
  if (full === fullKey && !force) return;
  const anim = base !== baseKey ? 'pop' : '';
  baseKey = base;
  fullKey = full;
  app.innerHTML = build(s, anim);
}

function build(s, p) {
  if (s.phase === 'invite') return `
    <section class="g-center">
      <p class="g-name ${p}">${esc(s.guest)},</p>
      <h1 class="logo g-ask ${p} pop-1">отвечаешь?</h1>
      <button class="btn g-yes" data-act="ready">Отвечаю</button>
    </section>`;
  if (s.phase === 'question' || s.phase === 'reveal') return question(s, p);
  if (s.phase === 'result') return `
    <section class="g-center">
      <p class="g-name ${p}">${esc(s.guest)}, твой итог</p>
      <div class="sticker g-total ${p} pop-1"><b>${s.result.correct}</b> из ${s.result.asked}</div>
      <p class="chip chip-yellow g-big-chip ${p} pop-2">${pointsWord(s.score)}</p>
      <p class="g-thanks ${p} pop-3">Спасибо за ответы!</p>
    </section>`;
  return `
    <section class="g-center">
      <h1 class="logo g-logo ${p}">Отвечаю</h1>
      <p class="g-hint ${p} pop-1">Скоро начнём</p>
    </section>`;
}

function question(s, p) {
  const q = s.q;
  const top = `
    <header class="g-top">
      <span class="chip chip-sky">${esc(q.topic)}</span>
      <span class="chip">Вопрос ${s.index + 1} из ${s.total}</span>
      <span class="chip chip-yellow">${pointsWord(q.points)}</span>
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
      <button class="${cls} ${p} pop-${i}" style="--c: var(--opt-${i})" data-pick="${i}" ${locked ? 'disabled' : ''}>
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
document.addEventListener('fullscreenchange', () => { exitEl.hidden = !document.fullscreenElement; });
exitEl.addEventListener('click', () => document.exitFullscreen().catch(() => {}));

app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.act === 'ready') {
    // Касание «Отвечаю» разворачивает экран целиком: в кадре нет строки браузера
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    b.disabled = true;
    b.textContent = 'Ждём ведущего';
    // Новый выпуск: выбор из прошлого выпуска стирается, иначе ведущий примет его заново
    send({ session: state.session, ready: true, pick: null, index: null, n: Date.now() });
  } else if (b.dataset.pick) {
    app.querySelectorAll('.g-opt').forEach(x => { x.disabled = true; });
    b.classList.add('g-opt-picked');
    send({ session: state.session, index: state.index, pick: Number(b.dataset.pick), n: Date.now() });
  }
});
