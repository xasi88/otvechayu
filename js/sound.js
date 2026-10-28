// Звуки выпуска на экране гостя (Samsung): камера пишет их вместе с гостем.
// Собраны в коде через Web Audio: без файлов и без скачивания.
// Браузер даёт звук только после касания: первое касание экрана будит его.

let ctx = null;

function wake() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
document.addEventListener('pointerdown', wake, { capture: true });

// Одна нота: частота, начало, длина, форма волны, громкость, скольжение к частоте, куда звучит
function tone(freq, at, len, type = 'triangle', vol = 0.3, to = 0, dest = ctx.destination) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + len + 0.03);
}

// Труба: пила через мягкий фильтр, плавный вход, дрожь (vib, Гц) и скольжение к частоте to
function horn(freq, at, len, vol, to = 0, vib = 0) {
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.linearRampToValueAtTime(to, at + len);
  f.type = 'lowpass';
  f.frequency.value = 1100;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.05);
  g.gain.setValueAtTime(vol, at + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  if (vib) {
    const l = ctx.createOscillator();
    const d = ctx.createGain();
    l.frequency.value = vib;
    d.gain.value = freq * 0.025;
    l.connect(d).connect(o.frequency);
    l.start(at);
    l.stop(at + len + 0.03);
  }
  o.connect(f).connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + len + 0.03);
}

const SOUNDS = {
  // «Отвечаю»: две ноты вверх, уверенное «да»
  ready: t => { tone(523, t, 0.14); tone(784, t + 0.11, 0.32); },
  // Темы выпали: дробь и звонкая нота
  draw: t => {
    for (let i = 0; i < 8; i++) tone(300 + i * 45, t + i * 0.06, 0.05, 'square', 0.08);
    tone(988, t + 0.52, 0.5, 'triangle', 0.28);
  },
  // Вопрос на экране: короткий взлёт
  show: t => tone(392, t, 0.32, 'sine', 0.25, 784),
  // Ответ принят: щелчок замка
  pick: t => { tone(880, t, 0.06, 'square', 0.12); tone(1320, t + 0.05, 0.09, 'square', 0.1); },
  // Верно: удар аккорда, фанфары вверх и звонкий аккорд сверху
  right: t => {
    [523, 659, 784].forEach(f => tone(f, t, 0.2, 'square', 0.06));
    [659, 784, 1047, 1319].forEach((f, i) => tone(f, t + 0.14 + i * 0.08, i === 3 ? 0.6 : 0.14, 'triangle', 0.24));
    [1047, 1319, 1568].forEach(f => tone(f, t + 0.46, 1, 'triangle', 0.08));
  },
  // Мимо: грустные ноты вниз (ми, до, ля), последняя дрожит и сползает
  wrong: t => {
    horn(330, t, 0.34, 0.22);
    horn(262, t + 0.36, 0.34, 0.22);
    horn(220, t + 0.72, 1.3, 0.22, 196, 5);
  },
  // Итог: короткие фанфары
  result: t => [392, 523, 659, 784, 659, 1047].forEach((f, i) =>
    tone(f, t + i * 0.12, i === 5 ? 0.8 : 0.14, 'triangle', 0.28)),
  // Жребий места: щелчок барабана на каждый прыжок карточки
  tick: t => tone(1250, t, 0.035, 'square', 0.09),
  // Место найдено: удар и аккорд
  place: t => {
    tone(160, t, 0.4, 'sine', 0.45, 55);
    [523, 659, 784, 1047].forEach(f => tone(f, t + 0.06, 0.9, 'triangle', 0.1));
  },
};

// Напряжение от выбора гостя до «Открыть ответ». Низкий гул поднимается и светлеет,
// сверху дрожит нота, снизу стучит сердце, и удары всё чаще. За RISE секунд до пика,
// дальше держится. Обрывает stopTension, сам гаснет через 90 секунд
const RISE = 8;
let tense = null;

export function startTension() {
  if (!ctx || ctx.state !== 'running' || tense) return;
  const t = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 1.2);
  out.connect(ctx.destination);
  // Гул: три пилы чуть врозь, фильтр открывается, тон ползёт вверх на квинту
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  f.type = 'lowpass';
  f.Q.value = 5;
  f.frequency.setValueAtTime(160, t);
  f.frequency.exponentialRampToValueAtTime(1500, t + RISE);
  g.gain.setValueAtTime(0.05, t);
  g.gain.linearRampToValueAtTime(0.12, t + RISE);
  f.connect(g).connect(out);
  const nodes = [55, 55.7, 110.5].map(hz => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.linearRampToValueAtTime(hz * 1.5, t + RISE);
    o.connect(f);
    return o;
  });
  // Верхняя нота дрожит всё быстрее
  const hi = ctx.createOscillator();
  const hg = ctx.createGain();
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  hi.type = 'triangle';
  hi.frequency.setValueAtTime(440, t);
  hi.frequency.linearRampToValueAtTime(660, t + RISE);
  hg.gain.setValueAtTime(0, t);
  hg.gain.linearRampToValueAtTime(0.04, t + RISE);
  lfo.frequency.setValueAtTime(4, t);
  lfo.frequency.linearRampToValueAtTime(10, t + RISE);
  depth.gain.value = 0.03;
  lfo.connect(depth).connect(hg.gain);
  hi.connect(hg).connect(out);
  nodes.push(hi, lfo);
  nodes.forEach(o => o.start(t));
  // Сердце: «тук-тук», пауза от 1 секунды до 0,55. Удары ставим на полсекунды вперёд
  let next = t + 0.25;
  const pump = () => {
    while (next < ctx.currentTime + 0.5) {
      tone(70, next, 0.14, 'sine', 0.42, 40, out);
      tone(64, next + 0.17, 0.12, 'sine', 0.3, 38, out);
      next += 1 - 0.45 * Math.min(1, (next - t) / RISE);
    }
  };
  pump();
  tense = { out, nodes, timer: setInterval(pump, 200), end: setTimeout(() => stopTension(2), 90000) };
}

// fade: секунды затухания. Открыли ответ: обрыв. Ведущий сбросил выбор: затихает
export function stopTension(fade = 0.08) {
  if (!tense) return;
  const { out, nodes, timer, end } = tense;
  tense = null;
  clearInterval(timer);
  clearTimeout(end);
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
  out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
  nodes.forEach(o => o.stop(t + fade + 0.05));
  setTimeout(() => out.disconnect(), (fade + 1) * 1000);
}

// Звук играет, только когда браузер его уже разрешил.
// Иначе молчит: копить звуки до касания нельзя, они прозвучат потом все разом.
export function play(name) {
  if (!ctx || !SOUNDS[name]) return;
  const go = () => SOUNDS[name](ctx.currentTime + 0.01);
  if (ctx.state === 'running') go();
  else if (navigator.userActivation && navigator.userActivation.isActive) ctx.resume().then(go).catch(() => {});
}
