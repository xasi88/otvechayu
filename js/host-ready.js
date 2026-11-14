// Готовность к выпуску на главном экране ведущего (2026-11-14): ведущий видит всё с панели
// и не идёт к планшету гостя смотреть подпись «Ролики готовы».
// Связь панель знает сама. Ролики, звук и заряд присылает экран гостя (ack.js, поле view).
// Пока новые правила базы не опубликованы, этих данных нет: метка серая, «нет данных».
// Чистые функции без сети и страницы: их проверяет tests/ack.test.mjs.
import { capacity, LOW } from './bank.js';
import { episodesWord } from './ui.js';

// ok: true (зелёная точка), false (красная метка), null (нет данных)
export function readyItems(S) {
  const a = S.guestOnline ? S.ack : null;
  const none = text => ({ ok: null, text });
  const n = capacity(S.topics.filter(t => S.form.topics.has(t.id)));
  return [
    { ok: !!S.guestOnline, text: S.guestOnline ? 'Samsung на связи' : 'Samsung не на связи' },
    !a || !Number.isFinite(a.rolik) ? none('Ролики: нет данных')
      : { ok: a.rolik >= 3, text: a.rolik >= 3 ? 'Ролики готовы' : `Ролики: ${a.rolik} из 3` },
    !a || typeof a.sound !== 'boolean' ? none('Звук: нет данных')
      : { ok: a.sound, text: a.sound ? 'Звук включён' : 'Звук: коснитесь экрана гостя' },
    !a || !Number.isFinite(a.battery) ? none('Заряд: нет данных')
      : { ok: a.battery >= 30, text: `Заряд Samsung ${a.battery}%` },
    { ok: n > LOW, text: n ? `Вопросов на ${episodesWord(n)}` : 'Мало вопросов' },
  ];
}

// Экран строится заново, только когда готовность поменялась
export const readyKey = S => readyItems(S).map(x => x.ok + x.text).join(',');

export function readyRow(S) {
  return `<div class="h-ready" aria-label="Готовность к выпуску">${readyItems(S).map(x =>
    `<span class="chip ${x.ok === null ? 'h-ready-none' : x.ok ? '' : 'h-ready-bad'}">${x.ok ? '<span class="dot dot-on"></span>' : ''}${x.text}</span>`).join('')}</div>`;
}
