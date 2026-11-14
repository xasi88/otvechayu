// Раздел «Сезоны» в меню ⚙ (просьба автора 2026-11-14: у кнопки «Начать новый сезон» не было
// шага назад и названия, «нужно больше свободы»). Список всех сезонов по номерам. У каждого:
// своё название, сколько в нём выпусков, «Сделать текущим». Так нажатый по ошибке новый сезон
// возвращается назад: прошлый сезон снова текущий, а пустой сам пропадает из списка.
// Внизу «Начать сезон N». Перенос выпуска в другой сезон: в «Истории» (host-history.js).
// Чистые правила в season.js, запись в базу одним документом set/main (host-listen.js).
import { esc, confirmed, toast, episodesWord } from './ui.js';
import { allSeasons, inSeason, seasonName, keepNames, newSeasonNo, moved, NAME_MAX } from './season.js';
import { saveSeasons } from './host-listen.js';
import { editEpisode } from './host-db.js';
import { head } from './host-data.js';

function card(S, n) {
  const cur = n === S.season;
  const count = inSeason(S.episodes, n).length;
  const name = S.form.seasonNames[n] ?? S.names[n] ?? '';
  return `
    <article class="h-season ${cur ? 'h-season-on' : ''}">
      <div class="h-head-row">
        <h2 class="h-h2">${esc(seasonName(n, S.names))}</h2>
        <span class="chip ${cur ? 'chip-yellow' : ''}">${cur ? 'идёт сейчас' : 'не текущий'}</span>
        <span class="chip">${count ? episodesWord(count) : 'выпусков нет'}</span>
      </div>
      <div class="h-inline">
        <input class="h-input" data-field="seasonName" data-option="${n}" maxlength="${NAME_MAX}" autocomplete="off"
          placeholder="Название, например «Осень 2026»" value="${esc(name)}">
        <button class="btn btn-second" data-do="nameSeason" data-s="${n}">Сохранить</button>
      </div>
      ${cur ? '' : `<button class="btn btn-second" data-do="goSeason" data-s="${n}" data-confirm="Точно сделать текущим?">Сделать текущим</button>`}
    </article>`;
}

export function buildSeasons(S, p) {
  const next = newSeasonNo(S.episodes, S.season);
  return `
    ${head(S, 'Сезоны')}
    <section class="h-season-page">
      <div class="sticker h-card h-col ${p}">
        <h2 class="h-h2">Сейчас идёт: ${esc(seasonName(S.season, S.names))}</h2>
        <p class="h-note">Новые выпуски идут в текущий сезон, у каждого сезона своя таблица. Название видят и зрители.</p>
        <div class="h-list" data-keep="seasons">${allSeasons(S.episodes, S.season).map(n => card(S, n)).join('')}</div>
        ${next
          ? `<button class="btn h-season-new" data-do="newSeason" data-confirm="Точно новый сезон?">Начать сезон ${next}</button>`
          : '<p class="h-note h-season-new">Новый сезон можно начать после первого выпуска в последнем сезоне.</p>'}
        <p class="h-note">Начали сезон по ошибке: сделайте текущим прошлый, пустой пропадёт сам.
          Выпуск попал не в тот сезон: откройте его в «Истории» и нажмите «Перенести выпуск».</p>
      </div>
    </section>`;
}

export function seasonActions(S) {
  const f = S.form;
  // Идущий выпуск уже несёт свой сезон: перемена коснётся только следующих
  const go = (n, text) => saveSeasons(n, keepNames(S.names, S.episodes, n)).then(() => toast(text));
  return {
    newSeason: (d, b) => {
      const n = newSeasonNo(S.episodes, S.season);
      return confirmed(b) && n && go(n, `Начат сезон ${n}`);
    },
    goSeason: (d, b) => confirmed(b) && go(Number(d.s), `Текущий: ${seasonName(Number(d.s), S.names)}`),
    nameSeason: d => {
      const n = Number(d.s);
      const names = keepNames(S.names, S.episodes, S.season, n, f.seasonNames[n] ?? S.names[n] ?? '');
      delete f.seasonNames[n];
      return saveSeasons(S.season, names).then(() => toast(`Сохранено: ${seasonName(n, names)}`));
    },
    // Перенос выпуска «Истории» в другой сезон: номер встаёт в конец нового сезона (season.js, moved)
    moveEpisode: (d, b) => {
      if (!confirmed(b)) return;
      if (S.ep && S.ep.id === d.id) return toast('Выпуск открыт на главном экране. Сначала нажмите «Новый выпуск»');
      const to = moved(S.episodes, d.id, Number(d.s));
      return editEpisode(d.id, ep => Object.assign(ep, to)).then(ok => ok && toast(`Перенесён: сезон ${to.season}, выпуск ${to.no}`));
    },
  };
}
