import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as model from './study-model.mjs';

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
  const apply = (change) => { const result = change(current.current); const saved = commit(result?.state ?? result); return saved ? result : { ...result, added: 0 }; };
  useEffect(() => {
    const sync = (event) => { if (event.key === key) { const next = read(); current.current = next; setState(next); } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [key]);
  const value = {
    state, error,
    addDeck: (name) => apply((s) => model.addDeck(s, name)),
    renameDeck: (id, name) => apply((s) => model.renameDeck(s, id, name)),
    removeDeck: (id) => commit(model.removeDeck(current.current, id)),
    addCards: (deckId, input) => apply((s) => model.addCards(s, deckId, Array.isArray(input) ? input : model.parseCards(input))).added || 0, // 0 when the save failed: the text stays
    updateCard: (id, change) => commit(model.updateCard(current.current, id, change)),
    removeCard: (id) => commit(model.removeCard(current.current, id)),
    review: (id, rating) => commit(model.review(current.current, id, rating, Date.now())),
    setNewPerDay: (count) => apply((s) => ({ ...s, newPerDay: count })),
    addCountdown: (title, date) => apply((s) => model.addCountdown(s, title, date)),
    removeCountdown: (id) => apply((s) => model.removeCountdown(s, id)),
    replace: (next) => commit(next)
  };
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
export function useStudy() { return useContext(StudyContext); }
