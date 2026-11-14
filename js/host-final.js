// Экраны суперигры у ведущего (final.js): заставка и выбор, с вариантами или без. Только сборка экрана,
// нажатия обрабатывает host.js по data-do (go, stake, finish).
import { esc, pointsWord, LEVELS } from './ui.js';
import { STAKES, priceOf, finalNo, SUPER, ladder, ladderHtml } from './final.js';

const finishBtn = '<button class="btn btn-ghost h-finish" data-do="finish" data-confirm="Точно закончить?">Закончить выпуск</button>';

// Заставка: у гостя большая надпись «Суперигра» и правила.
// Ведущий говорит вступление и жмёт «К выбору»
export function superScreen(ep, p, chip) {
  return `
    <section class="h-play">
      <div class="h-meta">
        ${chip}
        <span class="chip chip-yellow">${SUPER}</span>
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      ${ladderHtml(ladder(ep))}
      <div class="sticker h-q h-super ${p}">${SUPER}
        <small>У гостя ролик с правилами суперигры. Коротко о них:</small>
        <ol class="h-super-rules">
          <li>3 сложных вопроса, по одному из каждой темы гостя.</li>
          <li>Перед каждым гость выбирает: с вариантами или без.</li>
          <li>С вариантами: обычная цена. Без вариантов: ответ вслух, цена вдвое.</li>
          <li>Ошибка: 0 баллов, набранное не сгорает.</li>
          <li>Подсказок нет.</li>
        </ol>
      </div>
      <div class="h-actions">
        ${finishBtn}
        <button class="btn btn-second" data-do="video" data-name="super">Правила ещё раз</button>
        <button class="btn h-main" data-do="go">К выбору</button>
      </div>
    </section>`;
}

// Выбор перед вопросом: с вариантами или без. Гость выбирает на Samsung, ведущий может за него.
// Менять можно, пока ведущий не нажал «Показать вопрос». Вопрос ведущий видит заранее
export function stakeScreen(ep, p, chip) {
  const q = ep.questions[ep.index];
  const n = finalNo(ep);
  const opts = Object.entries(STAKES).map(([kind, name], i) => `
      <button class="h-opt ${ep.stakeKind === kind ? 'h-opt-pick' : ''} ${p} pop-${i}" data-do="stake" data-stake="${kind}">
        <span class="letter">${i + 1}</span><span>${name}: верно +${pointsWord(priceOf(q, kind))}</span>
        ${ep.stakeKind === kind ? '<span class="h-tags"><em class="h-tag">Выбор гостя</em></span>' : ''}
      </button>`).join('');
  const ready = ep.stakeKind != null;
  return `
    <section class="h-play">
      <div class="h-meta">
        ${chip}
        <span class="chip chip-yellow">${SUPER} ${n} из 3</span>
        <span class="chip">${esc(q.topic)}</span>
        <span class="chip">${LEVELS[q.points]}</span>
        <span class="h-guest-score">${esc(ep.guest)}: ${pointsWord(ep.score)}</span>
      </div>
      ${ladderHtml(ladder(ep))}
      <div class="sticker h-q ${p}">Вопрос ${n} из 3: с вариантами или без?<small>Без вариантов гость отвечает вслух, вы отмечаете «Верно» или «Неверно». Ошибка: 0 баллов. Вопрос: ${esc(q.text)}</small></div>
      <div class="h-opts">${opts}</div>
      <div class="h-actions">
        ${finishBtn}
        <button class="btn h-main" data-do="go" ${ready ? '' : 'disabled'}>${ready ? 'Показать вопрос' : 'Ждём выбор гостя'}</button>
      </div>
    </section>`;
}
