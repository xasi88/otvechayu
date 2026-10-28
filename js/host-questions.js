// Действия раздела «Вопросы»: темы, добавить и удалить вопрос, справка к вопросу, загрузка файлом.
// host.js подключает их к своим нажатиям (DO). Справка: почему ответ верный,
// её видит только ведущий после «Открыть ответ» (решение автора 2026-10-28)
import { db, doc, deleteDoc, runTransaction } from './fb.js';
import { GameError } from './game.js';
import { mergeBank, sameText, WHY_MAX } from './bank.js';
import { toast, confirmed } from './ui.js';

export const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, points: 1, why: '' });
const topicData = t => { const { id, ...rest } = t; return rest; };

export function questionActions(S, save, newId, render) {
  const f = S.form;
  const put = (t, questions) => save(['topics', t.id], { ...topicData(t), questions });
  return {
    selTopic: d => { f.topicSel = d.id; render(false); },
    // Две темы с одним именем не заводятся: загрузка файлом пополняет тему по имени (bank.js)
    addTopic: () => {
      const name = f.newTopic.trim();
      if (!name) return toast('Впишите название темы');
      if (S.topics.some(t => sameText(t.name, name))) return toast('Такая тема уже есть');
      const id = newId('t');
      save(['topics', id], { name, order: Date.now(), questions: [] });
      f.newTopic = '';
      f.topicSel = id;
      f.topics.add(id);
    },
    delTopic: (d, b) => {
      if (!confirmed(b)) return;
      deleteDoc(doc(db, 'topics', d.id)).catch(err => toast('Не удалилось: ' + err.code));
      f.topicSel = null;
    },
    markCorrect: d => { f.q.correct = Number(d.option); render(false); },
    setPoints: d => { f.q.points = Number(d.n); render(false); },
    addQuestion: () => {
      const t = S.topics.find(x => x.id === f.topicSel);
      const q = f.q;
      const text = q.text.trim();
      const options = q.options.map(o => o.trim());
      const why = q.why.trim().slice(0, WHY_MAX);
      if (!t) return;
      if (!text || options.some(o => !o)) return toast('Нужен текст вопроса и все четыре варианта');
      if ((t.questions || []).some(x => sameText(x.text, text))) return toast('Такой вопрос в теме уже есть');
      const nq = { id: newId('q'), text, options, correct: q.correct, points: q.points, ...(why ? { why } : {}) };
      put(t, [...(t.questions || []), nq]);
      f.q = emptyQuestion();
    },
    delQuestion: (d, b) => {
      if (!confirmed(b)) return;
      const t = S.topics.find(x => x.id === d.topic);
      if (t) put(t, (t.questions || []).filter(q => q.id !== d.id));
    },
    // Справка готового вопроса: «Справка» открывает поле, «Сохранить» пишет в базу
    editWhy: d => {
      const t = S.topics.find(x => x.id === d.topic);
      const q = t && (t.questions || []).find(x => x.id === d.id);
      if (!q) return;
      f.whyEdit = q.id;
      f.whyText = q.why || '';
      render(false);
    },
    cancelWhy: () => { f.whyEdit = null; render(false); },
    saveWhy: d => {
      const t = S.topics.find(x => x.id === d.topic);
      if (!t) return;
      const why = f.whyText.trim().slice(0, WHY_MAX);
      put(t, (t.questions || []).map(q => {
        if (q.id !== d.id) return q;
        const { why: old, ...rest } = q;
        return why ? { ...rest, why } : rest;
      }));
      f.whyEdit = null;
    },
    importFile: () => document.getElementById('h-file').click(),
  };
}

// Файл вопросов: темы пополняются, повторы пропускаются, но получают справку из файла
// (bank.js, mergeBank). Ошибка в файле останавливает всю загрузку.
// Все темы пишутся одной транзакцией: обрыв связи не оставит в базе половину файла
export function watchImport(S, newId) {
  document.addEventListener('change', async e => {
    if (e.target.id !== 'h-file' || !e.target.files.length) return;
    try {
      const r = mergeBank(S.topics, JSON.parse(await e.target.files[0].text()), newId, Date.now());
      await runTransaction(db, async tx => {
        r.changed.forEach(t => tx.set(doc(db, 'topics', t.id), topicData(t)));
      });
      toast(`Добавлено вопросов: ${r.added}. Новых справок: ${r.notes}. Повторов пропущено: ${r.skipped}`);
    } catch (err) {
      toast(err instanceof GameError ? err.message : 'Файл не загрузился: ' + (err.code || err.message));
    }
    e.target.value = '';
  });
}
