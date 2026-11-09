// Экраны суперигры у ведущего (final.js): заставка и ставка. Только сборка экрана,
// нажатия обрабатывает host.js по data-do (go, stake, finish).
import { esc, pointsWord } from './ui.js';
import { STAKES, stakeOf, finalNo, SUPER } from './final.js';

const finishBtn = '<button class="btn btn-ghost h-finish" data-do="finish" data-confirm="Точно закончить?">Закончить выпуск</button>';

// Заставка: у гостя и на телевизоре большая надпись «Суперигра» и правила.
// Ведущий говорит вступление и жмёт «К ставке»
export function superScreen(ep, p, chip) {
  return `
    <section class="h-play">
      <div class="h-meta">
        ${chip}
        <span class="chip chip-yellow">${SUPER}</span>
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      <div class="sticker h-q h-super ${p}">${SUPER}
        <small>У гостя и на телевизоре заставка с правилами. Расскажите их:</small>
        <ol class="h-super-rules">
          <li>3 сложных вопроса, по одному из тем гостя.</li>
          <li>Перед каждым ставка: ничего, половина или все баллы.</li>
          <li>Верно: ставка в плюс. Ошибка: ставка сгорает.</li>
          <li>Потерял все баллы: следующий вопрос без ставки, верно: баллы вернутся. Один раз.</li>
          <li>Подсказок нет.</li>
        </ol>
      </div>
      <div class="h-actions">
        ${finishBtn}
        <button class="btn h-main" data-do="go">К ставке</button>
      </div>
    </section>`;
}

// Ставка перед вопросом. Гость ставит на Samsung, ведущий может за него. Ставку можно менять,
// пока ведущий не нажал «Показать вопрос». Вопрос ведущий видит заранее.
// Спасение: ставки нет, на кону потерянные баллы
export function stakeScreen(ep, p, chip) {
  const q = ep.questions[ep.index];
  const n = finalNo(ep);
  const rescue = ep.rescue;
  const opts = rescue ? '' : Object.entries(STAKES).map(([kind, name], i) => `
      <button class="h-opt ${ep.stakeKind === kind ? 'h-opt-pick' : ''} ${p} pop-${i}" data-do="stake" data-stake="${kind}">
        <span class="letter">${i + 1}</span><span>${name}: ${pointsWord(stakeOf(ep.score, kind))}</span>
        ${ep.stakeKind === kind ? '<span class="h-tags"><em class="h-tag">Ставка гостя</em></span>' : ''}
      </button>`).join('');
  const head = rescue
    ? `Второй шанс<small>Гость потерял все баллы. Ставки нет. Верно: вернутся ${pointsWord(rescue)}, ошибка: остаётся 0. Вопрос: ${esc(q.text)}</small>`
    : `Ставка на вопрос ${n} из 3<small>Верно: ставка в плюс. Неверно или без ответа: в минус. Вопрос: ${esc(q.text)}</small>`;
  const ready = ep.stakeKind != null;
  return `
    <section class="h-play">
      <div class="h-meta">
        ${chip}
        <span class="chip chip-yellow">${SUPER} ${n} из 3</span>
        <span class="chip">${esc(q.topic)}</span>
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      <div class="sticker h-q ${p}">${head}</div>
      ${opts ? `<div class="h-opts">${opts}</div>` : ''}
      <div class="h-actions">
        ${finishBtn}
        <button class="btn h-main" data-do="go" ${ready ? '' : 'disabled'}>${ready ? 'Показать вопрос' : 'Ждём ставку гостя'}</button>
      </div>
    </section>`;
}
