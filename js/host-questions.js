// Действия раздела «Вопросы»: темы, добавить и удалить вопрос, справка к вопросу, загрузка файлом.
// host.js подключает их к своим нажатиям (DO). Справка: почему ответ верный,
// её видит только ведущий после «Открыть ответ» (решение автора 2026-10-28)
// Правки тем идут транзакцией на свежих данных базы (topics-db.js): отметки сгорания не теряются
import { db, doc, deleteDoc } from './fb.js';
import { GameError } from './game.js';
import { sameText, WHY_MAX } from './bank.js';
import { toast, confirmed } from './ui.js';
import { editTopic, editQuestion, importBank } from './topics-db.js';

export const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: 0, points: 1, trap: false, why: '' });

export function questionActions(S, save, newId, render) {
  const f = S.form;
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
    setPoints: d => { f.q.points = Number(d.n); f.q.trap = d.trap === '1'; render(false); },
    addQuestion: () => {
      const t = S.topics.find(x => x.id === f.topicSel);
      const q = f.q;
      const text = q.text.trim();
      const options = q.options.map(o => o.trim());
      const why = q.why.trim().slice(0, WHY_MAX);
      if (!t) return;
      if (!text || options.some(o => !o)) return toast('Нужен текст вопроса и все четыре варианта');
      if ((t.questions || []).some(x => sameText(x.text, text))) return toast('Такой вопрос в теме уже есть');
      const nq = { id: newId('q'), text, options, correct: q.correct, points: q.points, ...(why ? { why } : {}),
        ...(q.trap && q.points === 2 ? { trap: true } : {}) };
      f.q = emptyQuestion();
      // Тот же вопрос мог добавить другой экран панели: сверка на свежих данных базы
      return editTopic(t.id, qs => {
        if (qs.some(x => sameText(x.text, text))) throw new GameError('Такой вопрос в теме уже есть');
        return [...qs, nq];
      });
    },
    delQuestion: (d, b) => {
      if (!confirmed(b)) return;
      return editTopic(d.topic, qs => qs.filter(q => q.id !== d.id));
    },
    // Метка «спорный» снята: вопрос разобран. doubt: false, сверка сгорания метку не вернёт (host-db.js)
    clearDoubt: d => editQuestion(d.topic, d.id, q => ({ ...q, doubt: false })),
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
      const why = f.whyText.trim().slice(0, WHY_MAX);
      f.whyEdit = null;
      return editQuestion(d.topic, d.id, q => {
        const { why: old, ...rest } = q;
        return why ? { ...rest, why } : rest;
      });
    },
    importFile: () => document.getElementById('h-file').click(),
  };
}

// Файл вопросов: темы пополняются, повторы пропускаются, но получают справку из файла
// (bank.js, mergeBank). Ошибка в файле останавливает всю загрузку.
// Все темы пишутся одной транзакцией на свежих данных базы (topics-db.js, importBank)
export function watchImport(S, newId) {
  document.addEventListener('change', async e => {
    if (e.target.id !== 'h-file' || !e.target.files.length) return;
    try {
      const r = await importBank(S.topics, JSON.parse(await e.target.files[0].text()), newId);
      toast(`Добавлено вопросов: ${r.added}. Новых справок: ${r.notes}. Повторов пропущено: ${r.skipped}`);
    } catch (err) {
      toast(err instanceof GameError ? err.message : 'Файл не загрузился: ' + (err.code || err.message));
    }
    e.target.value = '';
  });
}
