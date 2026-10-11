import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStudy } from './useStudy';
import { RATINGS, studyQueue, previews, daysUntil, cardStage, parseCards } from './study-model.mjs';
import { Plus, Trash2, ArrowLeft, Check, BookOpen, Clock } from '../icons';
import './study.css';

// 学习: today's review in a deck (Space flips, 1–4 rates), a quick way to add
// or paste many cards, and the countdowns that keep the goal in view.
function Review({ deck, close }) {
  const study = useStudy(), [flipped, setFlipped] = useState(false), [done, setDone] = useState(0), [now, setNow] = useState(() => Date.now());
  const queue = useMemo(() => studyQueue(study.state, deck.id, now), [study.state, deck.id, now]);
  const card = queue.cards[0], labels = useMemo(() => card ? previews(card, Date.now()) : {}, [card?.id, card?.memory?.reps]);
  const rate = (rating) => { if (!card || !flipped) return; if (!study.review(card.id, rating)) return; setFlipped(false); setDone((value) => value + 1); setNow(Date.now()); };
  const root = useRef(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (!card && queue.upcoming && queue.upcoming - Date.now() < 30 * 60000) { const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, queue.upcoming - Date.now())); return () => clearTimeout(timer); } }, [card?.id, queue.upcoming]);
  const key = (event) => {
    if (event.target.closest('input,textarea') || (event.target !== event.currentTarget && event.target.closest('button') && (event.key === ' ' || event.key === 'Enter'))) return; // a focused button does its own thing
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!flipped) setFlipped(true); else rate(RATINGS[2].rating); }
    const choice = RATINGS.find((entry) => entry.key === event.key); if (choice && flipped) { event.preventDefault(); rate(choice.rating); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  };
  return <div ref={root} className="study-review" tabIndex={-1} onKeyDown={key} aria-label={`复习 ${deck.name}`}>
    <header className="study-review-head"><button type="button" className="study-back" onClick={close}><ArrowLeft size={14}/>{deck.name}</button><span>{done ? `已复习 ${done} · ` : ''}剩 {queue.cards.length}</span></header>
    {card ? <>
      <button type="button" className={`study-card ${flipped ? 'is-flipped' : ''}`} aria-label={flipped ? '卡片背面' : '翻到背面（空格）'} onClick={() => setFlipped(true)}>
        <small className={`study-stage is-${cardStage(card)}`}>{{ new: '新卡', learning: '学习中', review: '复习' }[cardStage(card)]}</small>
        <span className="study-card-front">{card.front}</span>
        {flipped ? <span className="study-card-back">{card.back || '（没有背面，想一想就好）'}</span> : <span className="study-card-hint">想一想，再按空格翻面</span>}
      </button>
      {flipped ? <div className="study-ratings" role="group" aria-label="记得怎么样">{RATINGS.map((entry) => <button type="button" key={entry.rating} className={`is-${entry.tone}`} onClick={() => rate(entry.rating)}><b>{entry.label}</b><small>{labels[entry.rating]}</small><kbd>{entry.key}</kbd></button>)}</div>
        : <button type="button" className="pixel-button is-primary study-flip" onClick={() => setFlipped(true)}>翻面 · 空格</button>}
    </> : <div className="study-done"><Check size={22}/><strong>{done ? `今天这组复习完了，共 ${done} 张` : '这组现在没有要复习的卡片'}</strong><small>{queue.upcoming ? `下一张在 ${new Date(queue.upcoming).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 到期` : '添加新卡片，或明天再来。'}</small><button type="button" className="pixel-button" onClick={close}>回到卡组</button></div>}
    {study.error && <p className="record-error" role="alert">{study.error}</p>}
  </div>;
}

function DeckEditor({ deck, close }) {
  const study = useStudy(), [input, setInput] = useState(''), [message, setMessage] = useState(''), [confirming, setConfirming] = useState(false), [query, setQuery] = useState(''), [editing, setEditing] = useState(null);
  const cards = study.state.cards.filter((card) => card.deckId === deck.id), preview = parseCards(input);
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const visible = cards.filter(card => !needle || [card.front, card.back].some(side => side.normalize('NFKC').toLowerCase().includes(needle)));
  const saveCard = (event) => { event.preventDefault(); if (editing?.front.trim() && study.updateCard(editing.id, { front: editing.front, back: editing.back })) { setEditing(null); setMessage('卡片已保存，复习进度保持不变。'); } };
  const add = (event) => { event.preventDefault(); const added = study.addCards(deck.id, input); setMessage(added ? `添加了 ${added} 张卡片。` : '没有新卡片（可能都已经在这组里了）。'); if (added) setInput(''); };
  return <div className="study-editor">
    <header className="study-review-head"><button type="button" className="study-back" onClick={close}><ArrowLeft size={14}/>卡组</button><span>{deck.name} · {cards.length} 张</span></header>
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
    <ul className="study-card-list" aria-label="这组卡片">{visible.slice(-60).reverse().map((card) => <li key={card.id}><span title={card.front}>{card.front}</span><small title={card.back}>{card.back}</small><button type="button" aria-label={`编辑卡片 ${card.front}`} onClick={() => { setEditing({ id: card.id, front: card.front, back: card.back }); setMessage(''); }}>编辑</button><button type="button" aria-label={`删除卡片 ${card.front}`} onClick={() => { study.removeCard(card.id); if (editing?.id === card.id) setEditing(null); }}><Trash2 size={13}/></button></li>)}</ul>
    {visible.length > 60 && <small className="study-more">显示最近 60 张匹配卡片，搜索可查找这组全部 {cards.length} 张。</small>}
    {query && !visible.length && <p role="status">没有找到匹配卡片，试试正面或背面的关键词。</p>}
    {study.error && <p className="record-error" role="alert">{study.error}</p>}
    {confirming ? <p className="study-danger">删除「{deck.name}」和其中 {cards.length} 张卡片？<button type="button" className="pixel-button is-danger" onClick={() => { study.removeDeck(deck.id); close(); }}>确认删除</button><button type="button" className="pixel-button is-quiet" onClick={() => setConfirming(false)}>取消</button></p>
      : <button type="button" className="pixel-button is-quiet study-delete-deck" onClick={() => setConfirming(true)}><Trash2 size={13}/>删除卡组</button>}
  </div>;
}

function Countdowns() {
  const study = useStudy(), [title, setTitle] = useState(''), [date, setDate] = useState('');
  const list = study.state.countdowns.map((entry) => ({ ...entry, days: daysUntil(entry.date) }));
  return <section className="study-countdowns" aria-label="考试倒计时">
    <h4><Clock size={14}/>倒计时</h4>
    {list.length > 0 && <ul>{list.map((entry) => <li key={entry.id} className={entry.days < 0 ? 'is-past' : entry.days <= 7 ? 'is-soon' : ''}><span>{entry.title}</span><b>{entry.days < 0 ? '已结束' : entry.days === 0 ? '就是今天' : `${entry.days} 天`}</b><button type="button" aria-label={`删除倒计时 ${entry.title}`} onClick={() => study.removeCountdown(entry.id)}><Trash2 size={12}/></button></li>)}</ul>}
    <form className="study-countdown-add" onSubmit={(event) => { event.preventDefault(); study.addCountdown(title, date); setTitle(''); setDate(''); }}>
      <input aria-label="倒计时名称" placeholder="考研、四级、期末…" value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)}/>
      <input type="date" aria-label="倒计时日期" value={date} onChange={(event) => setDate(event.target.value)}/>
      <button type="submit" className="pixel-button" disabled={!title.trim() || !date} aria-label="添加倒计时"><Plus size={14}/></button>
    </form>
  </section>;
}

export default function StudyPanel() {
  const study = useStudy(), [view, setView] = useState({ mode: 'decks', deckId: '' }), [name, setName] = useState('');
  if (!study) return null;
  const deck = study.state.decks.find((entry) => entry.id === view.deckId);
  if (view.mode === 'review' && deck) return <Review deck={deck} close={() => setView({ mode: 'decks' })}/>;
  if (view.mode === 'edit' && deck) return <DeckEditor deck={deck} close={() => setView({ mode: 'decks' })}/>;
  const totals = studyQueue(study.state, '', Date.now());
  return <div className="study-panel">
    <p className="study-summary"><BookOpen size={15}/>{totals.total ? <>今天要复习 <b>{totals.due}</b> 张 · 新卡 <b>{totals.fresh}</b> 张</> : '用闪卡记单词、公式和概念：按遗忘曲线安排复习（FSRS 算法）。'}</p>
    {study.state.decks.length > 0 && <ul className="study-decks">{study.state.decks.map((entry) => {
      const queue = studyQueue(study.state, entry.id, Date.now());
      return <li key={entry.id}>
        <button type="button" className="study-deck-open" onClick={() => setView({ mode: queue.cards.length ? 'review' : 'edit', deckId: entry.id })}><strong>{entry.name}</strong><small>{queue.total} 张{queue.cards.length ? ` · 待复习 ${queue.due} · 新 ${queue.fresh}` : ' · 已完成'}</small></button>
        {queue.cards.length > 0 && <span className="study-deck-badge" aria-label={`待复习 ${queue.cards.length} 张`}>{queue.cards.length}</span>}
        <button type="button" className="study-deck-edit" onClick={() => setView({ mode: 'edit', deckId: entry.id })}>编辑</button>
      </li>;
    })}</ul>}
    <form className="study-new-deck" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { study.addDeck(name); setName(''); } }}><input aria-label="新卡组名称" placeholder="新卡组：英语单词、高数公式…" value={name} maxLength={40} onChange={(event) => setName(event.target.value)}/><button type="submit" className="pixel-button" disabled={!name.trim()}><Plus size={14}/>新建</button></form>
    <label className="study-limit">每天新卡<input type="number" min="0" max="200" value={study.state.newPerDay} onChange={(event) => study.setNewPerDay(Math.max(0, Math.min(200, Number(event.target.value) || 0)))}/>张</label>
    <Countdowns/>
    {study.error && <p className="record-error" role="alert">{study.error}</p>}
  </div>;
}
