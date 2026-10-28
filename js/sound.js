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

// Одна нота: частота, начало, длина, форма волны, громкость, скольжение к частоте
function tone(freq, at, len, type = 'triangle', vol = 0.3, to = 0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + len + 0.03);
}

const SOUNDS = {
  // «Отвечаю»: две ноты вверх, уверенное «да»
  ready: t => { tone(523, t, 0.14); tone(784, t + 0.11, 0.32); },
  // Вопрос на экране: короткий взлёт
  show: t => tone(392, t, 0.32, 'sine', 0.25, 784),
  // Ответ принят: щелчок замка
  pick: t => { tone(880, t, 0.06, 'square', 0.12); tone(1320, t + 0.05, 0.09, 'square', 0.1); },
  // Верно: аккорд вверх и звонкая верхняя нота
  right: t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, i === 3 ? 0.6 : 0.16)),
  // Мимо: два низких гудка вниз
  wrong: t => { tone(233, t, 0.22, 'sawtooth', 0.16); tone(175, t + 0.22, 0.5, 'sawtooth', 0.16); },
  // Итог: короткие фанфары
  result: t => [392, 523, 659, 784, 659, 1047].forEach((f, i) =>
    tone(f, t + i * 0.12, i === 5 ? 0.8 : 0.14, 'triangle', 0.28)),
};

// Звук играет, только когда браузер его уже разрешил.
// Иначе молчит: копить звуки до касания нельзя, они прозвучат потом все разом.
export function play(name) {
  if (!ctx || !SOUNDS[name]) return;
  const go = () => SOUNDS[name](ctx.currentTime + 0.01);
  if (ctx.state === 'running') go();
  else if (navigator.userActivation && navigator.userActivation.isActive) ctx.resume().then(go).catch(() => {});
}
