// Original short teaching notes written for Flow Cabin; no scraped dictionary,
// examination list, pronunciation audio, or third-party quotations are bundled.
import { addCards, cardKey, dayKey, LIMITS, sourceFields } from './study-model.mjs';
import { PRACTICAL_WORD_BOOKS } from './books/practical-english.mjs';
import { importRows } from './import-parser.mjs';
export { PRACTICAL_SERIES, PRACTICAL_WORD_BOOKS } from './books/practical-english.mjs';
const book = (id, name, description, rows) => Object.freeze({ id: `book-${id}`, name, description, source: '小屋原创入门词书 · 不是考试完整词库', words: rows.map(([front, back]) => ({ front, back })) });
export const WORD_BOOKS = Object.freeze([
  book('daily', '日常小事', '从家、食物和天气开始。', [['morning', 'n. 早晨；一天开始的时段'], ['window', 'n. 窗户；房间采光通风的开口'], ['bread', 'n. 面包'], ['water', 'n. 水'], ['quiet', 'adj. 安静的；声音很少的'], ['garden', 'n. 花园；栽种花草的地方']]),
  book('work', '工作交流', '安排时间，表达进展。', [['meeting', 'n. 会议；为讨论事情而聚在一起'], ['schedule', 'n. 日程；计划好的时间安排'], ['draft', 'n. 草稿；尚可修改的初稿'], ['review', 'v. 检查、回顾；再次仔细查看'], ['confirm', 'v. 确认；说明信息已经确定'], ['progress', 'n. 进展；朝目标推进的情况']]),
  book('music', '音乐生活', '把唱片里的词带进小屋。', [['record', 'n. 唱片；这里指记录音乐的实体载体'], ['needle', 'n. 唱针；读取黑胶纹路的部件'], ['melody', 'n. 旋律；一串有组织的音符'], ['rhythm', 'n. 节奏；声音在时间上的规律'], ['album', 'n. 专辑；收录一组音乐作品'], ['listen', 'v. 听；留意声音']]),
  ...PRACTICAL_WORD_BOOKS
]);
export function openWordBook(state, id, now = Date.now()) {
  const book = WORD_BOOKS.find(book => book.id === id);
  if (!book || state.decks.some(deck => deck.id === id) || state.decks.length >= LIMITS.decks) return state;
  return { ...state, decks: [...state.decks, { id, name: book.name, source: book.source, createdAt: now }] };
}
// Content stays in the catalog. Create only the next card when it is presented;
// changing books cannot reset a previous card's memory or daily learning limit.
export function nextBookCard(state, id, now = Date.now()) {
  const book = WORD_BOOKS.find(book => book.id === id);
  const remaining = Math.max(0, state.newPerDay - (state.log[dayKey(now)]?.learned || 0));
  // All books share one daily pool of cards waiting to be learned. Without
  // this global check, opening several books can create more pending cards
  // than the user's remaining daily allowance and show misleading badges.
  if (!book || !state.decks.some(deck => deck.id === id) || state.cards.filter(card => !card.memory).length >= remaining) return state;
  const cards = state.cards.filter(card => card.deckId === id);
  if (cards.some(card => !card.memory)) return state;
  const existing = new Set(cards.map(card => cardKey(card.front)));
  const word = book.words.find(word => !existing.has(cardKey(word.front)));
  if (!word) return state;
  const result = addCards(state, id, [{ ...word, ...sourceFields(word.source || book.source) }], now);
  return result.added ? result.state : state;
}
export function previewWordImport(text, { format = 'tsv', frontColumn = 0, backColumn = 1, header = false } = {}, existing = []) {
  const seen = new Set(existing.map(card => cardKey(card.front)));
  let rows;
  try {
    if (format === 'json') { rows = JSON.parse(text); if (!Array.isArray(rows)) throw new Error(); }
    else if (format === 'csv' || format === 'anki') {
      // CSV (quoted fields, ; or ,) and Anki "Notes in Plain Text" (#separator, #html, #columns).
      const parsed = importRows(text, format, { header: format === 'csv' && header });
      const named = parsed.headers.findIndex(label => label.trim().toLowerCase() === 'source');
      const sourceColumn = parsed.headers.length ? named : format === 'csv' ? 2 : -1;
      rows = parsed.rows.map(parts => ({ front: parts[frontColumn], back: parts[backColumn], source: sourceColumn >= 0 && ![frontColumn, backColumn].includes(sourceColumn) && parts[sourceColumn]?.trim() ? parts[sourceColumn] : undefined }));
    }
    else {
      const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
      const sourceColumn = header ? (lines[0] || '').split('\t').findIndex(label => label.trim().toLowerCase() === 'source') : 2;
      rows = lines.slice(header ? 1 : 0).map(line => {
        const parts = line.split('\t');
        return { front: parts[frontColumn], back: parts[backColumn], source: sourceColumn >= 0 && ![frontColumn, backColumn].includes(sourceColumn) ? parts[sourceColumn] : undefined };
      });
    }
  } catch { return { cards: [], duplicates: 0, errors: 1, message: format === 'json' ? 'JSON 需要是 [{"front":"单词","back":"释义"}] 数组。' : '没能读懂这个文件，请确认是 UTF-8 文本。' }; }
  let duplicates = 0, errors = 0, sourceErrors = 0; const cards = [];
  for (const row of rows) {
    if (!row || typeof row.front !== 'string' || typeof row.back !== 'string' || !row.front.trim() || !row.back.trim() || row.front.length > LIMITS.side || row.back.length > LIMITS.side) { errors++; continue; }
    if (row.source != null && (typeof row.source !== 'string' || row.source.trim().length > LIMITS.source)) { errors++; sourceErrors++; continue; }
    const key = cardKey(row.front);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); cards.push({ front: row.front.trim(), back: row.back.trim(), ...sourceFields(row.source) });
  }
  return { cards, duplicates, errors, message: sourceErrors ? `来源须为不超过 ${LIMITS.source} 字符的纯文本；请修改错误行后重试。` : '' };
}
