import React, { useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useStudy } from '../study/useStudy';
import { dayKey } from '../focus/focus-model.mjs';
import { readJournalRecords } from '../focus/journal-entries.mjs';
import useFocusSessions from '../focus/stats/useFocusSessions';

export default function HomeCalendar() {
  const { focus, commands } = useCabinRuntime(), study=useStudy();
  const [date,setDate]=useState(()=>dayKey(Date.now())),[title,setTitle]=useState(''),[notice,setNotice]=useState('');
  const sessions=useFocusSessions(focus.state.sessions).filter(s=>dayKey(s.start)===date);
  let notes=[],readError='';try { notes=readJournalRecords(localStorage).filter(n=>n.body&&!n.deletedAt&&!n.purgedAt&&dayKey(n.createdAt)===date); } catch(error) { readError=error.message; }
  const dates=(study?.state.countdowns||[]).filter(d=>d.date===date);
  const add=()=>{if(study.addCountdown(title,date)){setTitle('');setNotice('这个日子已记在挂历上。');}else setNotice(study.error||'日期尚未保存，请检查名称和日期。');};
  return <section className="home-scene-tools"><label>查看日期<input type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label>
    <p>{sessions.length?`${sessions.length} 段专注 · ${Math.round(sessions.reduce((sum,s)=>sum+(s.durationMs||0),0)/60000)} 分钟`:'这一天还没有专注记录。'}</p>
    {dates.length>0&&<ul>{dates.map(d=><li key={d.id}><strong>{d.title}</strong><button onClick={()=>study.removeCountdown(d.id)} aria-label={`移除日期 ${d.title}`}>移除</button></li>)}</ul>}
    <label>记一个重要日子<input value={title} maxLength={40} onChange={e=>setTitle(e.target.value)} placeholder="纪念日、考试，或想期待的小事"/></label><button disabled={!title.trim()} onClick={add}>记在这一天</button>
    {readError&&<p role="alert">{readError}</p>}{notes.length>0&&<><h3>这一天的手记</h3><ul>{notes.slice(0,8).map(n=><li key={n.id}><span>{n.body.slice(0,100)}</span></li>)}</ul></>}
    <button onClick={()=>commands.open('journal')}>翻开全部手记</button><button onClick={()=>commands.open('stats')}>查看专注记录</button>{notice&&<p role="status">{notice}</p>}
  </section>;
}
