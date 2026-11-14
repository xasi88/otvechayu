// Нажатия разделов «Таблица» и «История» (вынесены из host.js 2026-11-14: файл упёрся в предел 20 КБ).
// Таблица считается из выпусков (table.js): участника нельзя добавить руками, он появляется
// с первым законченным выпуском. Экраны собирают host-data.js и host-history.js
import { confirmed, toast } from './ui.js';
import { drop, fixEpisode, editEpisode, hidePlayer } from './host-db.js';
import { watchEpisode } from './host-listen.js';
import { editQuestion } from './topics-db.js';

export function dataActions(S, render, app) {
  const f = S.form;
  const open = id => S.ep && S.ep.id === id;
  // Полный выпуск читается из базы, пока он открыт в «Истории» (host-listen.js)
  const watch = id => watchEpisode(S, id, () => render(false));
  return {
    // Таблица другого сезона или всех сезонов (season.js). 0: все
    selSeason: d => { f.seasonSel = Number(d.s); f.playerSel = null; render(false); },
    selPlayer: d => { f.playerSel = d.id; render(false); },
    openPlayer: d => { f.playerSel = d.id; S.tab = 'players'; render(true); },
    // Выпуски участника остаются в «Истории»: он уходит только из таблицы
    delPlayer: (d, b) => {
      if (!confirmed(b)) return;
      if (S.ep && !S.ep.finished && S.ep.playerId === d.id) return toast('У этого участника сейчас идёт выпуск');
      f.playerSel = null;
      return hidePlayer(S, d.id);
    },
    // Из раздела «Вопросы» выпуск открывается на этом вопросе: карточка выделена и на виду
    openEpisode: d => {
      f.epSel = d.id;
      f.epQ = d.q || null;
      S.tab = 'history';
      watch(d.id);
      render(true);
      const on = app.querySelector('.h-hq-on');
      if (on) on.scrollIntoView({ block: 'center' });
    },
    selEpisode: d => { f.epSel = d.id; f.epQ = null; watch(d.id); render(false); },
    // Метка «спорный» у вопроса закрытого выпуска: в выпуске и в банке вопросов (undo.js, doubt)
    doubtEp: d => {
      if (open(d.id)) return toast('Выпуск открыт на главном экране. Сначала нажмите «Новый выпуск»');
      const t = S.topics.find(x => (x.questions || []).some(q => q.id === d.q));
      let on = false;
      return editEpisode(d.id, ep => {
        const list = ep.doubt || [];
        on = !list.includes(d.q);
        ep.doubt = on ? [...list, d.q] : list.filter(id => id !== d.q);
      }).then(ok => ok && t && editQuestion(t.id, d.q, q => ({ ...q, doubt: on ? d.id : false })));
    },
    // Выпуск на главном экране ещё пишет себя в «Историю»: сначала его надо закрыть
    delEpisode: (d, b) => {
      if (!confirmed(b)) return;
      if (open(d.id)) return toast('Выпуск открыт на главном экране. Сначала закройте его');
      f.epSel = null;
      watch(null);
      return drop(S, d.id);
    },
    // Итог вопроса наоборот: «Верно» в «Неверно» и обратно, баллы выпуска и таблица пересчитаны (fix.js)
    fixEp: (d, b) => {
      if (!confirmed(b)) return;
      if (open(d.id)) return toast('Выпуск открыт на главном экране. Сначала нажмите «Новый выпуск»');
      return fixEpisode(d.id, Number(d.q));
    },
  };
}
