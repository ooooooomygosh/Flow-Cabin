import React, { useEffect, useState } from 'react';
import { useLetters } from '../ai/useCabinLetters';
import { JOURNAL_EVENT } from '../focus/stats/journal-events.mjs';
import './benchmark-cabin.css';

export default function CabinWelcome({ petName, onNotes }) {
  const [now, setNow] = useState(() => new Date()), { unread } = useLetters();
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const hour = now.getHours(), greeting = hour < 6 ? '夜深了，慢慢来' : hour < 12 ? '早安，从一件小事开始' : hour < 18 ? '留一点时间，给自己' : '欢迎回家，今天辛苦了';
  return <aside className="cabin-welcome" aria-label="回家小笺">
    <small>{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}<span>{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></small>
    <p>{greeting}</p>
    <div><span>{petName}陪你，把节奏放慢一点。</span><button type="button" onClick={onNotes}>写两句</button><button type="button" aria-label={unread ? `信箱 · ${unread} 封未读` : '打开小屋信箱'} onClick={() => window.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: { tab: 'letters' } }))}>{unread ? `来信 ${unread}` : '信箱'}</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: { tab: 'weekly' } }))}>日记</button></div>
  </aside>;
}
