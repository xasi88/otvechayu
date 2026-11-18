// Звуки выпуска на экране гостя (Samsung): камера пишет их вместе с гостем.
// Верно, мимо и сердце: настоящие записи из zvuk/ (Mixkit, выбор автора 2026-11-18).
// Остальные собраны в коде через Web Audio.
// Браузер даёт звук только после касания: первое касание экрана будит его.

let ctx = null;
// Звук можно выключить целиком (mute)
let muted = false;

// Браузер уже разрешил звук
export const audible = () => !!ctx && ctx.state === 'running';

export function mute(on) {
  muted = on;
  if (on) stopTension();
}

export function wake() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) { ctx = new AC(); load(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// Записи: имя звука и файл. Грузятся при первом касании, до выпуска успевают
const REC = { right: 'verno.mp3', wrong: 'mimo.mp3', heart: 'serdce.mp3' };
const buf = {};
function load() {
  for (const [name, file] of Object.entries(REC)) {
    fetch(new URL('../zvuk/' + file, import.meta.url))
      .then(r => r.arrayBuffer())
      .then(b => ctx.decodeAudioData(b))
      .then(d => { buf[name] = d; })
      .catch(() => {});
  }
}

// Запись целиком, или по кругу (loop) в узел dest. Возвращает источник
function rec(name, at, dest = ctx.destination, loop = false) {
  const s = ctx.createBufferSource();
  s.buffer = buf[name];
  s.loop = loop;
  s.connect(dest);
  s.start(at);
  return s;
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
    // Верно и мимо: записи из zvuk/ (REC), здесь их нет
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

// Напряжение от выбора гостя до «Открыть ответ»: запись сердца на барабанах по кругу.
// Обрывает stopTension, сам гаснет через 90 секунд
let tense = null;

export function startTension() {
  if (muted || !ctx || ctx.state !== 'running' || tense || !buf.heart) return;
  const t = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 0.3);
  out.connect(ctx.destination);
  const nodes = [rec('heart', t, out, true)];
  tense = { out, nodes, end: setTimeout(() => stopTension(2), 90000) };
}

// fade: секунды затухания. Открыли ответ: обрыв. Ведущий сбросил выбор: затихает
export function stopTension(fade = 0.08) {
  if (!tense) return;
  const { out, nodes, end } = tense;
  tense = null;
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
  if (muted || !ctx || !(SOUNDS[name] || buf[name])) return;
  const go = () => (buf[name] ? rec(name, ctx.currentTime + 0.01) : SOUNDS[name](ctx.currentTime + 0.01));
  if (ctx.state === 'running') go();
  else if (navigator.userActivation && navigator.userActivation.isActive) ctx.resume().then(go).catch(() => {});
}
