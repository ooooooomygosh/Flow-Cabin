import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICAL_SERIES, PRACTICAL_WORD_BOOKS } from './practical-english.mjs';
import { WORD_BOOKS, openWordBook, nextBookCard, previewWordImport } from '../word-books.mjs';
import { LIMITS, STUDY_PREFIX, normalizeStudy, cardKey, dayKey, review, studyQueue, RATINGS } from '../study-model.mjs';
import { buildBackup, parseBackup } from '../../backup-model.mjs';

const T0 = new Date(2026, 9, 19, 10).getTime();
const easy = RATINGS[3].rating;
const reload = state => normalizeStudy(JSON.parse(JSON.stringify(state)));
const nextDay = time => { const date = new Date(time); date.setDate(date.getDate() + 1); return date.getTime(); };

test('original collection has 240 distinct words in 12 practical themes, with complete short bilingual examples', () => {
  assert.equal(PRACTICAL_SERIES.topicCount, 12);
  assert.equal(PRACTICAL_SERIES.wordCount, 240);
  assert.equal(PRACTICAL_WORD_BOOKS.length, PRACTICAL_SERIES.topicCount);
  const words = [], examples = [];
  for (const book of PRACTICAL_WORD_BOOKS) {
    assert.equal(book.words.length, 20, book.name);
    assert.ok(book.name.length <= 40);
    assert.match(book.id, /^book-practical-[a-z]+$/);
    assert.ok(book.id.length <= 60);
    assert.match(book.description, /12 个主题、240 词/);
    assert.match(book.description, /本主题 20 词/);
    assert.match(book.source, /本项目原创学习材料，不是完整考试词库\/官方分级/);
    assert.match(book.source, /日常实用英语 v1/);
    assert.ok(book.source.includes(book.name));
    assert.ok(book.source.length <= LIMITS.source);
    for (const word of book.words) {
      assert.match(word.front, /^[a-z]{2,24}$/, book.name);
      assert.equal(word.front, word.front.trim());
      assert.equal(word.source, book.source);
      assert.ok(word.back.length <= LIMITS.side, word.front);
      const [meaning, englishLine, chineseLine, extra] = word.back.split('\n');
      assert.equal(extra, undefined, word.front);
      assert.match(meaning, /^(n|v|adj|adv)\. [\u3400-\u9fff]/, word.front);
      assert.ok(meaning.length <= 65, word.front);
      assert.ok(englishLine.startsWith('例句：'), word.front);
      assert.ok(chineseLine.startsWith('译意：'), word.front);
      const english = englishLine.slice(3), chinese = chineseLine.slice(3);
      assert.match(english, new RegExp(`\\b${word.front}\\b`, 'i'), word.front);
      assert.match(english, /^[A-Z][a-zA-Z ,.'?-]+[.?]$/, word.front);
      assert.ok(english.length <= 100 && english.split(/\s+/).length <= 16, word.front);
      assert.ok(english.split(/\s+/).length >= 4, word.front);
      assert.match(chinese, /[\u3400-\u9fff].*[。？]$/, word.front);
      assert.ok(chinese.length <= 65, word.front);
      assert.doesNotMatch(word.back, /[<>\t\x00-\x08\x0b-\x1f\x7f]/, word.front);
      words.push(cardKey(word.front)); examples.push(english.toLowerCase());
    }
  }
  assert.equal(words.length, 240);
  assert.equal(new Set(words).size, words.length);
  assert.equal(new Set(examples).size, examples.length);
  assert.equal(new Set(WORD_BOOKS.map(book => book.id)).size, WORD_BOOKS.length);
  const allWords = WORD_BOOKS.flatMap(book => book.words.map(word => cardKey(word.front)));
  assert.equal(new Set(allWords).size, allWords.length, 'No duplicates against the three legacy books either');
});

test('the original three starter books retain their IDs, order and exact card text', () => {
  const expected = [
    ['book-daily', '日常小事', [
      ['morning', 'n. 早晨；一天开始的时段'], ['window', 'n. 窗户；房间采光通风的开口'],
      ['bread', 'n. 面包'], ['water', 'n. 水'], ['quiet', 'adj. 安静的；声音很少的'],
      ['garden', 'n. 花园；栽种花草的地方']
    ]],
    ['book-work', '工作交流', [
      ['meeting', 'n. 会议；为讨论事情而聚在一起'], ['schedule', 'n. 日程；计划好的时间安排'],
      ['draft', 'n. 草稿；尚可修改的初稿'], ['review', 'v. 检查、回顾；再次仔细查看'],
      ['confirm', 'v. 确认；说明信息已经确定'], ['progress', 'n. 进展；朝目标推进的情况']
    ]],
    ['book-music', '音乐生活', [
      ['record', 'n. 唱片；这里指记录音乐的实体载体'], ['needle', 'n. 唱针；读取黑胶纹路的部件'],
      ['melody', 'n. 旋律；一串有组织的音符'], ['rhythm', 'n. 节奏；声音在时间上的规律'],
      ['album', 'n. 专辑；收录一组音乐作品'], ['listen', 'v. 听；留意声音']
    ]]
  ];
  assert.deepEqual(WORD_BOOKS.slice(0, expected.length).map(book =>
    [book.id, book.name, book.words.map(({ front, back }) => [front, back])]), expected);
  for (const [id] of expected) {
    let state = openWordBook(normalizeStudy(), id, T0);
    state = nextBookCard(state, id, T0);
    const legacy = { ...state.cards[0] }; delete legacy.source;
    state = review({ ...state, cards: [legacy] }, legacy.id, easy, T0);
    const reviewed = structuredClone(state.cards[0]);
    state = nextBookCard(reload(state), id, T0 + 1000);
    assert.deepEqual(state.cards[0], reviewed, 'Existing cards and FSRS memory are never migrated or replaced');
    assert.equal(state.cards[1].source, WORD_BOOKS.find(book => book.id === id).source);
  }
});

test('previewing and opening all themes creates no cards; each introduction creates exactly one', () => {
  let state = normalizeStudy();
  for (const book of PRACTICAL_WORD_BOOKS) state = openWordBook(state, book.id, T0);
  assert.equal(state.decks.length, 12);
  assert.deepEqual(state.cards, []);
  assert.deepEqual(state.log, {});
  for (const book of PRACTICAL_WORD_BOOKS) {
    const before = state.cards.length;
    state = nextBookCard(state, book.id, T0);
    assert.equal(state.cards.length, before + 1);
    const card = state.cards.at(-1);
    assert.deepEqual([card.front, card.back, card.source, card.memory],
      [book.words[0].front, book.words[0].back, book.source, null]);
    assert.equal(nextBookCard(state, book.id, T0), state, 'Repeated requests cannot create more pending cards');
    assert.deepEqual(nextBookCard(reload(state), book.id, T0), state, 'A reload retains the pending card');
  }
  assert.equal(state.cards.length, 12, 'Only one requested card per opened theme, not all 240 catalog entries');
});

test('daily quota is global across new and legacy books and survives serialization and midnight', () => {
  const ids = [PRACTICAL_WORD_BOOKS[0].id, PRACTICAL_WORD_BOOKS[1].id, WORD_BOOKS[0].id];
  let state = normalizeStudy({ newPerDay: 1 });
  for (const id of ids) state = openWordBook(state, id, T0);
  state = nextBookCard(state, ids[0], T0);
  state = review(state, state.cards[0].id, easy, T0);
  state = reload(state);
  const existing = structuredClone(state.cards[0]);
  for (const id of ids) assert.equal(nextBookCard(state, id, T0), state, 'Switching themes cannot reset the quota');
  assert.equal(studyQueue(state, '', T0).fresh, 0);
  const tomorrow = nextDay(T0);
  state = nextBookCard(state, ids[1], tomorrow);
  assert.equal(state.cards.length, 2);
  assert.deepEqual(state.cards[0], existing);
  assert.equal(studyQueue(state, '', tomorrow).fresh, 1);
  for (const id of ids) {
    const paused = reload({ ...state, newPerDay: 0 });
    assert.equal(nextBookCard(paused, id, tomorrow), paused, 'Zero daily quota cannot materialize another card');
  }
});

test('all 240 cards can be learned over successive seven-card days without duplicates or lost memory', () => {
  let state = normalizeStudy({ newPerDay: 7 }), now = T0, issued = 0;
  for (const book of PRACTICAL_WORD_BOOKS) state = openWordBook(state, book.id, now);
  const firstMemories = new Map();
  for (let day = 0; issued < 240 && day < 40; day++, now = nextDay(now)) {
    for (let slot = 0; slot < 7 && issued < 240; slot++) {
      const book = PRACTICAL_WORD_BOOKS.find(book => state.cards.filter(card => card.deckId === book.id).length < book.words.length);
      const previous = state.cards.length;
      state = nextBookCard(state, book.id, now + slot * 1000);
      assert.equal(state.cards.length, previous + 1);
      const card = state.cards.at(-1);
      assert.equal(card.source, book.source);
      state = review(state, card.id, easy, now + slot * 1000);
      firstMemories.set(card.id, structuredClone(state.cards.at(-1).memory));
      state = reload(state);
      issued++;
    }
    assert.ok(state.log[dayKey(now)].learned <= 7);
    if (state.log[dayKey(now)].learned === 7) {
      for (const book of PRACTICAL_WORD_BOOKS) assert.equal(nextBookCard(state, book.id, now), state);
    }
  }
  assert.equal(issued, 240);
  assert.equal(new Set(state.cards.map(card => cardKey(card.front))).size, 240);
  assert.equal(Object.keys(state.log).length, 35);
  for (const card of state.cards) assert.deepEqual(card.memory, firstMemories.get(card.id));
  for (const book of PRACTICAL_WORD_BOOKS) {
    assert.deepEqual(state.cards.filter(card => card.deckId === book.id).map(card => card.front), book.words.map(word => word.front));
    assert.equal(nextBookCard(state, book.id, nextDay(now)), state, 'An exhausted theme does not start over');
  }
});

test('case-normalized restored cards are recognized without replacing their content or source', () => {
  const book = PRACTICAL_WORD_BOOKS[0];
  let state = normalizeStudy({
    decks: [{ id: book.id, name: book.name, source: book.source }],
    cards: [{ id: 'existing-shelf', deckId: book.id, front: 'ＳＨＥＬＦ', back: '我自己改写的背面', source: '我的补充笔记', createdAt: T0 }]
  });
  state = review(state, state.cards[0].id, easy, T0);
  const previous = structuredClone(state.cards[0]);
  state = nextBookCard(reload(state), book.id, T0 + 1000);
  assert.equal(state.cards.length, 2);
  assert.deepEqual(state.cards[0], previous);
  assert.equal(state.cards[1].front, book.words[1].front);
});

test('created card sources, bilingual backs, FSRS memory and limits survive backup into an empty study store', () => {
  const key = STUDY_PREFIX + 'synthetic-content-test', originalStore = new Map(), restoredStore = new Map();
  let state = normalizeStudy({ newPerDay: 2 });
  for (const book of PRACTICAL_WORD_BOOKS.slice(0, 3)) {
    state = openWordBook(state, book.id, T0);
    if (state.cards.length < 2) {
      state = nextBookCard(state, book.id, T0);
      state = review(state, state.cards.at(-1).id, easy, T0);
    }
  }
  originalStore.set(key, JSON.stringify(state));
  const backup = buildBackup({ study: normalizeStudy(JSON.parse(originalStore.get(key))), storage: null, memory: null, now: new Date(T0) });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(restoredStore.size, 0);
  restoredStore.set(key, JSON.stringify(parsed.study));
  let restored = normalizeStudy(JSON.parse(restoredStore.get(key)));
  assert.deepEqual(restored, state);
  assert.equal(restored.cards.length, 2, 'Backup includes only introduced cards, not the catalog');
  for (const book of PRACTICAL_WORD_BOOKS.slice(0, 3)) assert.equal(nextBookCard(restored, book.id, T0), restored);
  restored = nextBookCard(restored, PRACTICAL_WORD_BOOKS[2].id, nextDay(T0));
  assert.equal(restored.cards.length, 3);
  const newest = restored.cards.at(-1);
  assert.equal(newest.source, PRACTICAL_WORD_BOOKS[2].source);
  assert.match(newest.back, /\n例句：.*\n译意：/);
  const imported = previewWordImport(JSON.stringify(restored.cards), { format: 'json' });
  assert.equal(imported.errors, 0);
  assert.deepEqual(imported.cards.map(({ front, back, source }) => ({ front, back, source })),
    restored.cards.map(({ front, back, source }) => ({ front, back, source })));
});
