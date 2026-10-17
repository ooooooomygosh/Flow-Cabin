import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as model from './study-model.mjs';
import { openWordBook, nextBookCard } from './word-books.mjs';

const StudyContext = createContext(null);
const MAX_BYTES = 2_000_000;

// Flashcards and countdowns live beside the focus record, in this profile only.
export function StudyProvider({ userId, children }) {
  const key = model.STUDY_PREFIX + userId;
  const read = () => { try { return model.normalizeStudy(JSON.parse(localStorage.getItem(key) || '{}')); } catch { return model.normalizeStudy(); } };
  const [state, setState] = useState(read), [error, setError] = useState(''), current = useRef(state);
  const commit = (next) => {
    const value = model.normalizeStudy(next), raw = JSON.stringify(value);
    if (raw.length > MAX_BYTES) { setError('学习卡片太多了，存储空间已满。请删除一些不用的卡组。'); return false; }
    try { localStorage.setItem(key, raw); setError(''); } catch { setError('无法保存学习记录，请检查存储空间。'); return false; }
    current.current = value; setState(value); return true;
  };
  // Callers only clear drafts after the change was actually persisted.
  const apply = (change, unchangedError = '') => {
    const previous = current.current, result = change(previous), next = result?.state ?? result;
    if (next === previous) { if (unchangedError) setError(unchangedError); return false; }
    return commit(next) ? result : false;
  };
  useEffect(() => {
    const sync = (event) => { if (event.key === key) { const next = read(); current.current = next; setState(next); } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [key]);
  const value = {
    state, error,
    openBook: (id) => { const next = openWordBook(current.current, id); return next === current.current ? next.decks.some(deck => deck.id === id) : commit(next); },
    nextBookCard: (id) => { const next = nextBookCard(current.current, id); return next !== current.current && commit(next); },
    addDeck: (name) => Boolean(apply((s) => model.addDeck(s, name), current.current.decks.length >= model.LIMITS.decks ? `卡组已达 ${model.LIMITS.decks} 组上限，请先整理不用的卡组。` : '请填写卡组名称。')),
    renameDeck: (id, name) => apply((s) => model.renameDeck(s, id, name)),
    removeDeck: (id) => commit(model.removeDeck(current.current, id)),
    addCards: (deckId, input) => {
      const result = apply((s) => model.addCards(s, deckId, Array.isArray(input) ? input : model.parseCards(input)));
      return result === false ? null : result.added || 0; // null = save failed, 0 = no new cards
    },
    updateCard: (id, change) => commit(model.updateCard(current.current, id, change)),
    removeCard: (id) => commit(model.removeCard(current.current, id)),
    restoreCard: (card) => commit(model.restoreCard(current.current, card)),
    review: (id, rating) => commit(model.review(current.current, id, rating, Date.now())),
    setNewPerDay: (count) => apply((s) => ({ ...s, newPerDay: count })),
    addCountdown: (title, date) => Boolean(apply((s) => model.addCountdown(s, title, date), current.current.countdowns.length >= model.LIMITS.countdowns ? `倒计时已达 ${model.LIMITS.countdowns} 个上限，请先整理已结束的倒计时。` : '请填写倒计时名称和有效日期。')),
    removeCountdown: (id) => apply((s) => model.removeCountdown(s, id)),
    restoreCountdown: (entry) => apply((s) => model.restoreCountdown(s, entry)),
    replace: (next) => commit(next)
  };
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
export function useStudy() { return useContext(StudyContext); }
