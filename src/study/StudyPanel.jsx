import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStudy } from './useStudy';
import { RATINGS, LIMITS, studyQueue, deckStatus, previews, daysUntil, cardStage, parseCards, dayKey } from './study-model.mjs';
import { Plus, Trash2, ArrowLeft, Check, BookOpen, Clock } from '../icons';
import './study.css';
import { WORD_BOOKS, previewWordImport } from './word-books.mjs';
import { downloadBlob } from '../lib/download.mjs';
import { ConfirmButton, UndoLine, useUndo } from '../ui/Confirm';
import { NumberField } from '../lib/NumberField.jsx';

// 每天新词: one number field; an empty field while typing does not save 0.
const NewPerDay = ({ study }) => <label className="study-limit">每天新词（个）<NumberField live min={0} max={200} list="study-new-per-day" aria-label="词书每日新词" value={study.state.newPerDay} onCommit={study.setNewPerDay}/><datalist id="study-new-per-day"><option value="5"/><option value="10"/><option value="20"/></datalist></label>;
const whenLabel = (time) => new Date(time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const Source = ({ value }) => value ? <small className="study-source">来源：{value}</small> : null;
const deckSource = (deck) => deck.source || WORD_BOOKS.find(book => book.id === deck.id)?.source;
function DeckSource({ deck, cards }) {
  const sources = [...new Set([deckSource(deck), ...cards.filter(card => card.deckId === deck.id).map(card => card.source)].filter(Boolean))];
  return <Source value={sources.length > 1 ? `${sources.length} 种来源（学习时逐张查看）` : sources[0]}/>;
}

// 学习: today's review in a deck (Space flips, 1–4 rates), a quick way to add
// or paste many cards, and the countdowns that keep the goal in view.
function Review({ deck, close, edit }) {
  const study = useStudy(), [flipped, setFlipped] = useState(false), [done, setDone] = useState(0), [now, setNow] = useState(() => Date.now());
  const queue = useMemo(() => studyQueue(study.state, deck.id, now), [study.state, deck.id, now]);
  const status = useMemo(() => deckStatus(study.state, deck.id, now), [study.state, deck.id, now]);
  useEffect(() => { if (!queue.cards.length) study.nextBookCard(deck.id); }, [study.state, deck.id, queue.cards.length]);
  const card = queue.cards[0], labels = useMemo(() => card ? previews(card, Date.now()) : {}, [card?.id, card?.memory?.reps]);
  const rate = (rating) => { if (!card || !flipped) return; if (!study.review(card.id, rating)) return; setFlipped(false); setDone((value) => value + 1); setNow(Date.now()); };
  const root = useRef(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, [card?.id]);
  useEffect(() => { if (!card && queue.upcoming && queue.upcoming - Date.now() < 30 * 60000) { const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, queue.upcoming - Date.now())); return () => clearTimeout(timer); } }, [card?.id, queue.upcoming]);
  const key = (event) => {
    if (event.target.closest('input,textarea') || (event.target !== event.currentTarget && event.target.closest('button') && (event.key === ' ' || event.key === 'Enter'))) return; // a focused button does its own thing
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!flipped) setFlipped(true); else rate(RATINGS[2].rating); }
    const choice = RATINGS.find((entry) => entry.key === event.key); if (choice && flipped) { event.preventDefault(); rate(choice.rating); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  };
  const book = WORD_BOOKS.find(entry => entry.id === deck.id);
  const canIntroduce = book && book.words.length > 0 && study.state.newPerDay > (study.state.log[dayKey(now)]?.learned || 0);
  const quotaTitle = study.state.newPerDay === 0 ? '每天新词数是 0' : '今天的新词额度已用完';
  const quotaCopy = study.state.newPerDay === 0 ? '每天新词数是 0；回到词书架把它调高后即可开始。' : '今日新词额度已用完；回到词书架调高每天新词，或明天再来。';
  const notice = card ? null : status.kind === 'empty'
    ? book
      ? { title: canIntroduce ? '正在准备第一张词卡…' : '这本词书还没开始', copy: canIntroduce ? '马上开始。' : quotaCopy }
      : { title: '这组还没有词条', copy: '添加卡片或导入自己的 TSV / JSON 词表后开始。', edit: true }
    : status.kind === 'new'
      ? { title: quotaTitle, copy: `还剩 ${status.unlearned} 张新词；${quotaCopy}` }
      : status.kind === 'paused'
        ? { title: '今天的新词已经学完', copy: `还剩 ${status.unlearned} 张新词，明天继续；也可以回到词书架调高每天新词。` }
        : { title: done ? `今天这组复习完了，共 ${done} 张` : '这组今天的复习已完成', copy: queue.upcoming ? `下一张在 ${whenLabel(queue.upcoming)} 到期` : '全部学完，继续保持。' };
  return <div ref={root} className="study-review" tabIndex={-1} onKeyDown={key} aria-label={`复习 ${deck.name}`}>
    <header className="study-review-head"><button type="button" className="study-back" onClick={close}><ArrowLeft size={14}/>{deck.name}</button><span>{done ? `已复习 ${done} · ` : ''}剩 {queue.cards.length}</span></header>
    {card ? <>
      <button type="button" className={`study-card ${flipped ? 'is-flipped' : ''}`} aria-label={flipped ? '卡片背面' : '翻到背面（空格）'} onClick={() => setFlipped(true)}>
        <small className={`study-stage is-${cardStage(card)}`}>{{ new: '新卡', learning: '学习中', review: '复习' }[cardStage(card)]}</small>
        <span className="study-card-front">{card.front}</span>
        {flipped ? <span className="study-card-back">{card.back || '（没有背面，想一想就好）'}</span> : <span className="study-card-hint">想一想，再按空格翻面</span>}
      </button>
      <Source value={card.source || deckSource(deck)}/>
      {flipped ? <div className="study-ratings" role="group" aria-label="记得怎么样">{RATINGS.map((entry) => <button type="button" key={entry.rating} className={`is-${entry.tone}`} onClick={() => rate(entry.rating)}><b>{entry.label}</b><small>{labels[entry.rating]}</small><kbd>{entry.key}</kbd></button>)}</div>
        : <button type="button" className="pixel-button is-primary study-flip" onClick={() => setFlipped(true)}>翻面 · 空格</button>}
    </> : <div className="study-done">{status.kind === 'empty' || status.kind === 'new' ? <BookOpen size={22}/> : <Check size={22}/>}<strong>{notice.title}</strong><small>{notice.copy}</small><div className="study-done-actions">{notice.edit && <button type="button" className="pixel-button is-primary" onClick={edit}>添加或导入词条</button>}<button type="button" className="pixel-button is-quiet" onClick={close}>回到词书架</button></div></div>}
    {study.state.cards.length >= LIMITS.cards && <p role="status">学习卡已达 5,000 张上限；旧词仍可复习。整理不需要的卡片后再添加新词。</p>}
  </div>;
}

function DeckEditor({ deck, close }) {
  const study = useStudy(), [input, setInput] = useState(''), [message, setMessage] = useState(''), [query, setQuery] = useState(''), [editing, setEditing] = useState(null), [undo, offerUndo, clearUndo] = useUndo();
  const cards = study.state.cards.filter((card) => card.deckId === deck.id), preview = parseCards(input);
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const visible = cards.filter(card => !needle || [card.front, card.back].some(side => side.normalize('NFKC').toLowerCase().includes(needle)));
  const saveCard = (event) => { event.preventDefault(); if (editing?.front.trim() && study.updateCard(editing.id, { front: editing.front, back: editing.back })) { setEditing(null); setMessage('卡片已保存，复习进度保持不变。'); } };
  const add = (event) => { event.preventDefault(); const added = study.addCards(deck.id, input); setMessage(added === null ? '' : added ? `添加了 ${added} 张卡片。` : '没有新卡片（可能都已经在这组里了，或已达卡片上限）。'); if (added) setInput(''); };
  return <div className="study-editor">
    <header className="study-review-head"><button type="button" className="study-back" onClick={close}><ArrowLeft size={14}/>卡组</button><span>{deck.name} · {cards.length} 张</span></header>
    <DeckSource deck={deck} cards={cards}/>
    <WordImport deck={deck} cards={cards}/>
    <form onSubmit={add} className="study-add">
      <label>每行一张：<span className="study-sample">正面 - 背面</span>，也可以粘贴 Anki / Excel 导出的两列文本<textarea rows={5} aria-label="新卡片" value={input} onChange={(event) => setInput(event.target.value)} placeholder={'ephemeral - 短暂的\n光合作用：植物利用光能把二氧化碳和水合成有机物'}/></label>
      <button type="submit" className="pixel-button is-primary" disabled={!preview.length}><Plus size={14}/>{preview.length ? `添加 ${preview.length} 张` : '添加卡片'}</button>
      {message && <small role="status">{message}</small>}
    </form>
    {cards.length > 0 && <label className="study-card-search">查找卡片<input type="search" aria-label="查找这组全部卡片" placeholder="搜索正面或背面，包含较早的卡片" value={query} onChange={event => setQuery(event.target.value)}/><small>{visible.length} / {cards.length} 张</small></label>}
    {editing && <form className="study-card-edit" aria-label="编辑学习卡片" onSubmit={saveCard}>
      <label>正面<textarea aria-label="编辑卡片正面" maxLength={600} value={editing.front} onChange={event => setEditing({ ...editing, front: event.target.value })}/></label>
      <label>背面<textarea aria-label="编辑卡片背面" maxLength={600} value={editing.back} onChange={event => setEditing({ ...editing, back: event.target.value })}/></label>
      <div><button type="submit" className="pixel-button is-primary" disabled={!editing.front.trim()}>保存卡片</button><button type="button" className="pixel-button is-quiet" onClick={() => setEditing(null)}>取消编辑</button></div>
    </form>}
    <ul className="study-card-list" aria-label="这组卡片">{visible.slice(-60).reverse().map((card) => <li key={card.id}><span title={card.front}>{card.front}</span><small title={card.back}>{card.back}</small><button type="button" aria-label={`编辑卡片 ${card.front}`} onClick={() => { setEditing({ id: card.id, front: card.front, back: card.back }); setMessage(''); }}>编辑</button><button type="button" aria-label={`删除卡片 ${card.front}`} onClick={() => { if (!study.removeCard(card.id)) return; offerUndo(`已删除卡片「${card.front}」`, () => study.restoreCard(card)); if (editing?.id === card.id) setEditing(null); }}><Trash2 size={16}/></button><Source value={card.source || deckSource(deck)}/></li>)}</ul>
    <UndoLine offer={undo} clear={clearUndo}/>
    {visible.length > 60 && <small className="study-more">显示最近 60 张匹配卡片，搜索可查找这组全部 {cards.length} 张。</small>}
    {query && !visible.length && <p role="status">没有找到匹配卡片，试试正面或背面的关键词。</p>}
    <p className="study-danger"><ConfirmButton className="pixel-button is-quiet study-delete-deck" icon={<Trash2 size={16}/>} question={`删除「${deck.name}」和其中 ${cards.length} 张卡片？`} confirmLabel="确认删除" onConfirm={() => { if (!study.removeDeck(deck.id)) return false; close(); }}>删除卡组</ConfirmButton></p>
  </div>;
}

function WordImport({ deck, cards }) {
  const study = useStudy(), [text, setText] = useState(''), [format, setFormat] = useState('tsv'), [frontColumn, setFrontColumn] = useState(0), [backColumn, setBackColumn] = useState(1), [header, setHeader] = useState(false), [message, setMessage] = useState('');
  const preview = previewWordImport(text, { format, frontColumn, backColumn, header }, cards);
  const read = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = '';
    if (file.size > 500000) { setMessage('文件不能超过 500 KB，请拆分后导入。'); return; }
    try { setText(await file.text()); setFormat(file.name.endsWith('.json') ? 'json' : 'tsv'); setMessage(''); } catch { setMessage('无法读取文件，请重试。'); }
  };
  return <details className="study-import"><summary>导入本地词书</summary>
    <p>支持 UTF-8 的 TSV / Anki 两列纯文本，或 front、back 字段的 JSON 数组。追加词条，不覆盖已有复习进度。</p>
    <p>可选来源：无标题 TSV 用第三列；有标题 TSV 用 source 列；JSON 用 source 字段。来源最多 {LIMITS.source} 字符，按纯文本显示。</p>
    <label>选择词书文件<input aria-label="选择词书文件" type="file" accept=".tsv,.txt,.json" onChange={read}/></label>
    <button type="button" className="pixel-button is-quiet" onClick={() => downloadBlob(new Blob(['word\tmeaning\nwindow\t窗户\n'], { type: 'text/tab-separated-values' }), '小屋词书模板.tsv')}>下载两列模板</button>
    {text && <><label>格式<select aria-label="词书导入格式" value={format} onChange={event => setFormat(event.target.value)}><option value="tsv">Tab 分隔文本</option><option value="json">JSON 数组</option></select></label>
      {format === 'tsv' && <div className="study-import-columns">{[['正面列', frontColumn, setFrontColumn], ['背面列', backColumn, setBackColumn]].map(([label, value, update]) => <label key={label}>{label}<select aria-label={label} value={value} onChange={event => update(Number(event.target.value))}>{[0,1,2,3].map(index => <option key={index} value={index}>第 {index+1} 列</option>)}</select></label>)}<label><input type="checkbox" checked={header} onChange={event => setHeader(event.target.checked)}/>首行为标题</label></div>}
      <p role="status">有效 {preview.cards.length} · 重复 {preview.duplicates} · 错误 {preview.errors}{preview.message && ` · ${preview.message}`}</p>
      <ul className="study-import-preview">{preview.cards.slice(0,5).map(card => <li key={card.front}><b>{card.front}</b><span>{card.back}</span><Source value={card.source}/></li>)}</ul>
      <button type="button" className="pixel-button" disabled={!preview.cards.length} onClick={() => { const added = study.addCards(deck.id, preview.cards); setMessage(added === null ? '' : `已追加 ${added} 张卡片；旧进度保持不变。`); if (added) setText(''); }}>确认追加 {preview.cards.length} 张</button></>}
    {message && <p role="status">{message}</p>}
  </details>;
}

function Countdowns() {
  const study = useStudy(), [title, setTitle] = useState(''), [date, setDate] = useState(''), [undo, offerUndo, clearUndo] = useUndo();
  const list = study.state.countdowns.map((entry) => ({ ...entry, days: daysUntil(entry.date) }));
  return <section className="study-countdowns" aria-label="考试倒计时">
    <h4><Clock size={14}/>倒计时</h4>
    {list.length > 0 && <ul>{list.map((entry) => <li key={entry.id} className={entry.days < 0 ? 'is-past' : entry.days <= 7 ? 'is-soon' : ''}><span>{entry.title}</span><b>{entry.days < 0 ? '已结束' : entry.days === 0 ? '就是今天' : `${entry.days} 天`}</b><button type="button" aria-label={`删除倒计时 ${entry.title}`} onClick={() => { const { days, ...saved } = entry; if (study.removeCountdown(entry.id)) offerUndo(`已删除倒计时「${entry.title}」`, () => study.restoreCountdown(saved)); }}><Trash2 size={16}/></button></li>)}</ul>}
    <UndoLine offer={undo} clear={clearUndo}/>
    <form className="study-countdown-add" onSubmit={(event) => { event.preventDefault(); if (study.addCountdown(title, date)) { setTitle(''); setDate(''); } }}>
      <input aria-label="倒计时名称" placeholder="考研、四级、期末…" value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)}/>
      <input type="date" lang="zh-CN" aria-label="倒计时日期" value={date} onChange={(event) => setDate(event.target.value)}/>
      <button type="submit" className="pixel-button" disabled={!title.trim() || !date} aria-label="添加倒计时"><Plus size={14}/></button>
    </form>
  </section>;
}

export default function StudyPanel() {
  const study = useStudy(), [view, setView] = useState({ mode: 'decks', deckId: '' }), [name, setName] = useState(''), [bookId, setBookId] = useState(WORD_BOOKS[0].id);
  if (!study) return null;
  const deck = study.state.decks.find((entry) => entry.id === view.deckId);
  if (view.mode === 'review' && deck) return <Review deck={deck} close={() => setView({ mode: 'decks' })} edit={() => setView({ mode: 'edit', deckId: deck.id })}/>;
  if (view.mode === 'edit' && deck) return <DeckEditor deck={deck} close={() => setView({ mode: 'decks' })}/>;
  const selectedBook = WORD_BOOKS.find(book => book.id === bookId);
  const totals = studyQueue(study.state, '', Date.now());
  return <div className="study-panel">
    <p className="study-summary"><BookOpen size={15}/>{totals.total ? <>今天要复习 <b>{totals.due}</b> 张 · 新卡 <b>{totals.fresh}</b> 张</> : '还没有学习卡片：选一本词书开始，或新建卡组导入词表。'}</p>
    <section className="study-books" aria-label="小屋词书架">
      <label>选一本词书<select aria-label="入门词书" value={bookId} onChange={event => setBookId(event.target.value)}>{WORD_BOOKS.map(book => <option key={book.id} value={book.id}>{book.name} · {book.words.length} 词</option>)}</select></label>
      <p>{selectedBook.description}<small>{selectedBook.source}</small></p>
      <details><summary>预览 {selectedBook.words.length} 个词</summary><ul>{selectedBook.words.map(word => <li key={word.front}><b>{word.front}</b><span>{word.back}</span></li>)}</ul></details>
      <div className="study-book-start"><NewPerDay study={study}/><button type="button" className="pixel-button is-primary" onClick={() => { if (study.openBook(bookId)) setView({ mode: 'review', deckId: bookId }); }}>开始学习 / 复习</button></div>
    </section>
    <details className="study-guide"><summary>怎么使用词书与复习？</summary><ol><li>选书并预览，设置每天新词数，再开始学习。已有卡组也可以直接打开。</li><li>先回忆，再按空格揭示答案。到期的旧词优先，新词遵守每日总额度。</li><li>忘记选「忘了」；费力想起选「模糊」；正常想起选「记得」；非常熟悉选「简单」。按钮下方显示下一次复习时间。</li><li>按 1–4 评分，Esc 返回词书架。切换词书保留已学进度。每天回来复习到期词。</li><li>新建卡组后可导入自己有权使用的 TSV、JSON 或 Anki 两列纯文本；不支持 .apkg 或导入第三方调度历史。</li></ol><p>内置 3 本小屋原创主题书，每本 6 词。更多内容可自行导入。</p></details>
    {!study.state.decks.length && <p className="study-empty" role="status"><BookOpen size={15}/><span>还没有开始任何词书。选上面一本内置词书开始，或新建卡组后导入自己的词表。</span></p>}
    {study.state.decks.length > 0 && <ul className="study-decks">{study.state.decks.map((entry) => {
      const status = deckStatus(study.state, entry.id, Date.now());
      const book = WORD_BOOKS.find(book => book.id === entry.id);
      const shelf = status.kind === 'empty' && book ? { ...status, kind: 'new', label: '未开始', detail: `${book.words.length} 个词待加入`, action: 'review' } : status;
      const detail = shelf.kind === 'done' && shelf.upcoming ? `下次复习 ${whenLabel(shelf.upcoming)}` : shelf.detail;
      const summary = [shelf.label, detail].filter(Boolean).join(' · ');
      return <li key={entry.id}>
        <button type="button" className="study-deck-open" aria-label={`${entry.name}：${summary}，${shelf.action === 'edit' ? '添加或导入词条' : '打开复习'}`} onClick={() => setView({ mode: shelf.action, deckId: entry.id })}><strong>{entry.name}</strong><small>{status.total} 张 · {summary}</small><DeckSource deck={entry} cards={study.state.cards}/></button>
        {status.due + status.fresh > 0 && <span className="study-deck-badge" aria-label={`待复习 ${status.due + status.fresh} 张`}>{status.due + status.fresh}</span>}
        <button type="button" className="study-deck-edit" onClick={() => setView({ mode: 'edit', deckId: entry.id })}>{shelf.action === 'edit' ? '添加词条' : '编辑'}</button>
      </li>;
    })}</ul>}
    <form className="study-new-deck" onSubmit={(event) => { event.preventDefault(); if (name.trim() && study.addDeck(name)) setName(''); }}><input aria-label="新卡组名称" placeholder="新卡组：英语单词、高数公式…" value={name} maxLength={40} onChange={(event) => setName(event.target.value)}/><button type="submit" className="pixel-button" disabled={!name.trim()}><Plus size={14}/>新建</button></form>
    <Countdowns/>
  </div>;
}
