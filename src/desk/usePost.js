// The post box's store (src/desk/post.mjs) in the page: the letters in localStorage, a window event when
// they change, and the hook the desk reads them with. The post box is DEsk's
// (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors).
import { useCallback, useEffect, useState } from 'react';
import { POST_EVENT, readPost, writePost, deliver, markRead, discard, boxLetters, noticeLetter, unreadCount } from './post.mjs';
import { LETTER_EVENT, readLetters, markRead as markCabinRead } from '../ai/ai-model.mjs';
import useLabs from '../product/useLabs';

const store = () => globalThis.localStorage;
const changed = () => globalThis.dispatchEvent?.(new CustomEvent(POST_EVENT));

// Change the box; false when nothing changed (or storage failed).
function change(fn) {
  try {
    const before = readPost(store()), next = fn(before);
    if (next === before) return false;
    writePost(store(), next); changed();
    return true;
  } catch { return false; }
}

// A letter through the slot. True when it is new (DEsk raises the flag and plays the letter's arrival).
export const postLetter = (letter) => letter ? change((post) => deliver(post, letter)) : false;
// notify()'s errors and kept notices, as letters too.
export const postNotice = (message, options = {}) => change((post) => { const letter = noticeLetter(post, message, options); return letter ? deliver(post, letter) : post; });

// The desk says when its lamp is up; a letter that should arrive "a moment after" waits for it.
export const DESK_LIT_EVENT = 'cabin:desk-lit';
export function announceDeskLit() { globalThis.__cabinDeskLit = true; globalThis.dispatchEvent?.(new CustomEvent(DESK_LIT_EVENT)); }
export function afterDeskLit(fn, delay = 0) {
  let timer = 0, done = false;
  const go = () => { if (done) return; done = true; globalThis.removeEventListener?.(DESK_LIT_EVENT, go); timer = setTimeout(fn, delay); };
  if (globalThis.__cabinDeskLit) go(); else globalThis.addEventListener?.(DESK_LIT_EVENT, go);
  return () => { done = true; clearTimeout(timer); globalThis.removeEventListener?.(DESK_LIT_EVENT, go); };
}

// Everything in the box, with the cabin's letters while 实验室 › 小屋来信 is on.
export default function usePost() {
  const labs = useLabs();
  const read = () => ({ post: readPost(store()), cabin: labs.letters ? safeCabin() : [] });
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    on();
    for (const e of [POST_EVENT, LETTER_EVENT, 'storage']) addEventListener(e, on);
    return () => { for (const e of [POST_EVENT, LETTER_EVENT, 'storage']) removeEventListener(e, on); };
  }, [labs.letters]);
  const letters = boxLetters(state.post, state.cabin);
  const setRead = useCallback((letter, value = true) => {
    if (!letter) return;
    if (letter.source === 'cabin') { if (value) { try { markCabinRead(store(), letter.id.replace(/^cabin:/, '')); dispatchEvent(new CustomEvent(LETTER_EVENT)); } catch {} } return; }
    change((post) => post.letters.some((l) => l.id === letter.id && l.read !== value) ? markRead(post, letter.id, value) : post);
  }, []);
  const remove = useCallback((letter) => { if (letter && letter.source !== 'cabin') change((post) => discard(post, letter.id)); }, []);
  return { letters, unread: unreadCount(letters), setRead, remove };
}

function safeCabin() { try { return readLetters(store()); } catch { return []; } }
