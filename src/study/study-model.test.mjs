import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudy, addDeck, parseCards, addCards, studyQueue, review, previews, intervalLabel, daysUntil, addCountdown, nextCountdown, heatmap, removeDeck, cardStage, RATINGS } from './study-model.mjs';

const T0 = new Date('2026-10-10T09:00:00').getTime();

test('study: parse cards from lines, tabs and full-width colons', () => {
  assert.deepEqual(parseCards('apple - 苹果\n# comment\nephemeral\t短暂的\n光合作用：植物利用光能\nlonely'), [
    { front: 'apple', back: '苹果' }, { front: 'ephemeral', back: '短暂的' }, { front: '光合作用', back: '植物利用光能' }, { front: 'lonely', back: '' }]);
});

test('study: decks, de-duplicated cards and a daily queue of due + new cards', () => {
  let state = addDeck(normalizeStudy({}), '英语单词', T0);
  const deck = state.decks[0].id;
  let result = addCards(state, deck, parseCards('apple - 苹果\nApple - again\nbook - 书'), T0); state = result.state;
  assert.equal(result.added, 2);
  state = { ...state, newPerDay: 1 };
  let queue = studyQueue(state, deck, T0);
  assert.equal(queue.cards.length, 1); assert.equal(queue.fresh, 1); assert.equal(queue.cards[0].front, 'apple');
  state = review(state, queue.cards[0].id, RATINGS[2].rating, T0);
  assert.equal(cardStage(state.cards[0]), 'learning');
  assert.equal(state.log['2026-10-10'].learned, 1);
  queue = studyQueue(state, deck, T0 + 60000);
  assert.equal(queue.fresh, 0, 'the daily new-card limit holds');
  queue = studyQueue(state, deck, T0 + 60 * 60000);
  assert.equal(queue.due, 1, 'a learning card comes back the same day');
  assert.equal(normalizeStudy(JSON.parse(JSON.stringify(state))).cards[0].memory.reps, 1, 'memory survives JSON');
  assert.equal(removeDeck(state, deck).cards.length, 0);
});

test('study: rating previews read like a scheduler, Easy waits longest', () => {
  const labels = previews({ memory: null }, T0);
  assert.deepEqual(Object.keys(labels).length, 4);
  assert.match(labels[RATINGS[0].rating], /分钟/);
  assert.match(labels[RATINGS[3].rating], /天/);
  assert.equal(intervalLabel(90 * 60000), '2 小时'); assert.equal(intervalLabel(45 * 86400000), '2 个月'); assert.equal(intervalLabel(400 * 86400000), '1.1 年');
});

test('study: countdowns in whole local days and a heatmap of focus minutes', () => {
  assert.equal(daysUntil('2026-10-10', T0), 0); assert.equal(daysUntil('2026-12-26', T0), 77);
  let state = addCountdown(normalizeStudy({}), '考研', '2026-12-26'); state = addCountdown(state, '已过', '2026-01-01'); state = addCountdown(state, '四级', '2026-12-12');
  assert.deepEqual(nextCountdown(state, T0), { ...state.countdowns.find((c) => c.title === '四级'), days: 63 });
  const map = heatmap(new Map([['2026-10-10', 130], ['2026-10-09', 30]]), T0, 4);
  assert.equal(map.length, 4); assert(map.every((week) => week.length === 7));
  const flat = map.flat(), today = flat.find((d) => d.key === '2026-10-10');
  assert.equal(today.level, 4); assert.equal(flat.find((d) => d.key === '2026-10-09').level, 2);
  assert(flat.slice(flat.indexOf(today) + 1).every((d) => d.future && d.level === 0));
});

test('study: malformed storage is cleaned', () => {
  const state = normalizeStudy({ decks: [{ id: 'd', name: 'A' }, { name: '' }], cards: [{ deckId: 'd', front: 'x', memory: { state: 9, due: 'x' } }, { deckId: 'missing', front: 'y' }], countdowns: [{ title: 't', date: 'bad' }], log: { nope: 1 } });
  assert.equal(state.decks.length, 1); assert.equal(state.cards.length, 1); assert.equal(state.cards[0].memory.state, 0); assert.equal(state.countdowns.length, 0); assert.deepEqual(state.log, {});
});


test('study: damaged persisted scheduling memory recovers to a reviewable new card', () => {
  const valid = { due: T0, stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0, state: 2, last_review: T0 - 86400000 };
  for (const memory of [
    { ...valid, stability: 0 }, { ...valid, stability: null },
    { ...valid, last_review: 0 }, { ...valid, last_review: 9e15 },
    { ...valid, due: 9e15 },
    { state: 1, due: T0 }, { state: 2, due: T0 }, { state: 3, due: T0 },
  ]) {
    const state = normalizeStudy(JSON.parse(JSON.stringify({
      decks: [{ id: 'd', name: 'Vocabulary' }],
      cards: [{ id: 'c', deckId: 'd', front: 'word', back: 'meaning', memory }],
    })));
    const card = state.cards[0];
    assert.equal(card.memory, null, JSON.stringify(memory));
    assert.equal(card.front, 'word'); assert.equal(card.back, 'meaning');
    assert.equal(studyQueue(state, 'd', T0).fresh, 1);
    for (const { rating } of RATINGS) {
      assert.doesNotMatch(previews(card, T0)[rating], /NaN|Infinity/);
      const next = review(state, 'c', rating, T0).cards[0].memory;
      assert(Number.isFinite(next.due)); assert(next.due > T0);
      assert(Number.isFinite(next.stability)); assert(next.stability > 0);
    }
  }
});
test('study: valid FSRS schedules survive repeated JSON reloads for every rating', () => {
  for (const { rating } of RATINGS) {
    let state = addDeck(normalizeStudy(), 'Vocabulary', T0);
    state = addCards(state, state.decks[0].id, parseCards('word - meaning'), T0).state;
    let now = T0;
    for (let i = 0; i < 8; i++) {
      state = review(state, state.cards[0].id, rating, now);
      const saved = JSON.parse(JSON.stringify(state)); state = normalizeStudy(saved);
      assert.deepEqual(state.cards[0].memory, saved.cards[0].memory);
      assert(Number.isFinite(state.cards[0].memory.due)); now = state.cards[0].memory.due;
    }
  }
});

import { WORD_BOOKS, openWordBook, nextBookCard, previewWordImport } from './word-books.mjs';
test('word books keep catalog separate, introduce one card, preserve memory across books and obey daily quota', () => {
  let state = { ...normalizeStudy(), newPerDay: 1 };
  state = openWordBook(state, WORD_BOOKS[0].id, T0); assert.equal(state.cards.length, 0);
  state = nextBookCard(state, WORD_BOOKS[0].id, T0); assert.equal(state.cards.length, 1);
  assert.equal(nextBookCard(state, WORD_BOOKS[0].id, T0), state);
  state = review(state, state.cards[0].id, RATINGS[2].rating, T0);
  const saved = structuredClone(state.cards[0]);
  state = openWordBook(state, WORD_BOOKS[1].id, T0);
  assert.equal(nextBookCard(state, WORD_BOOKS[1].id, T0), state);
  assert.deepEqual(state.cards[0], saved); assert.equal(state.log[Object.keys(state.log)[0]].learned, 1);
  state = nextBookCard(state, WORD_BOOKS[1].id, T0 + 86400000); assert.equal(state.cards.length, 2);
  assert.deepEqual(normalizeStudy(state).cards[0], saved);
});
test('word book import maps columns, counts errors and duplicates without changing existing cards', () => {
  const existing = [{ front: 'Window', back: 'saved', memory: { reps: 4 } }];
  const snapshot = structuredClone(existing);
  const result = previewWordImport('meaning\tword\n窗户\twindow\n音乐\tmusic\n\tbroken\n重复\tMUSIC', { header: true, frontColumn: 1, backColumn: 0 }, existing);
  assert.deepEqual(result.cards, [{ front: 'music', back: '音乐' }]); assert.equal(result.duplicates, 2); assert.equal(result.errors, 1); assert.deepEqual(existing, snapshot);
  assert.equal(previewWordImport('{"front":"word"}', { format: 'json' }).errors, 1);
  assert.equal(previewWordImport('[null,{"front":23,"back":"x"},{"front":"x","back":"<b>plain text</b>"}]', { format: 'json' }).cards[0].back, '<b>plain text</b>');
});


test('a full 5000-card collection cannot create a new word-book state or rewrite memory', () => {
  const cards = Array.from({ length:5000 }, (_,i) => ({ id:`full-${i}`, deckId:'old', front:`word-${i}`, back:'kept', createdAt:T0+i, memory:null }));
  const state = openWordBook(normalizeStudy({ decks:[{ id:'old', name:'Old cards' }], cards }), WORD_BOOKS[0].id, T0);
  assert.equal(state.cards.length, 5000);
  for (let i=0;i<10;i++) assert.equal(nextBookCard(state, WORD_BOOKS[0].id, T0), state);
});
