import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSoundscape } from '../audio/useSoundscape';
import useReducedMotion from '../useReducedMotion';
import { onBackgroundChange, onOcclusionChange } from '../frame-clock.mjs';
import { THEME_OBJECTS, STAR_PATTERNS, connectStar, freshTea, starAtPoint, teaAction, tendPlant } from './theme-interactions.mjs';
import { drawPlant, drawSeaWindow, drawStarChart, drawTea } from './theme-pixels.mjs';
import './theme-interactions.css';

function Pixels({ draw, value, wide = false, label, onPointerDown }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const context = ref.current.getContext('2d');
    context.imageSmoothingEnabled = false;
    draw(context, value);
  }, [draw, value]);
  return <canvas ref={ref} width={wide ? 240 : 96} height={wide ? 144 : 96} className="theme-pixels" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} onPointerDown={onPointerDown}/>;
}
function useObjectTool() {
  const [open, setOpen] = useState(false), trigger = useRef(null), panel = useRef(null);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (open) panel.current?.querySelector('[data-first-action]')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [open]);
  return { open, setOpen, trigger, panel, close };
}
function ObjectButton({ scene, tool, children, pressed }) {
  const { box, label } = THEME_OBJECTS[scene];
  return <button ref={tool.trigger} className={`theme-object theme-object-${scene}`} type="button"
    style={{ left: `${box[0] / 1448 * 100}%`, top: `${box[1] / 1086 * 100}%`, width: `${box[2] / 1448 * 100}%`, height: `${box[3] / 1086 * 100}%` }}
    aria-label={label} aria-expanded={tool.open} aria-pressed={pressed}
    onClick={() => tool.open ? tool.close() : tool.setOpen(true)}>
    {children}<span className="theme-object-label">{label}</span>
  </button>;
}
function ToolTray({ tool, kind, title, children }) {
  return tool.open && createPortal(<section ref={tool.panel} className={`theme-tool theme-tool-${kind}`} aria-label={title}
    onKeyDown={event => event.stopPropagation()}>
    <header><h2>{title}</h2><button type="button" onClick={tool.close} aria-label={`收起${title}`}>收起 · Esc</button></header>
    {children}
  </section>, document.body);
}
function ForestPlant() {
  const tool = useObjectTool(), [plant, setPlant] = useState({ water: 0, facing: 1 });
  const status = ['土有些干，给根部一点水。', '土壤微湿，叶子舒展开了。', '水分够了，让它安静长一会儿。'][plant.water];
  return <>
    <ObjectButton scene="forest" tool={tool}><Pixels draw={drawPlant} value={plant}/></ObjectButton>
    <ToolTray tool={tool} kind="garden" title="窗边照料">
      <div className="theme-garden-work"><Pixels draw={drawPlant} value={plant} label={`窗边植物：${status}`}/><div><p>先摸摸土，再慢慢浇。</p><p role="status">{status}</p><meter min="0" max="2" value={plant.water} aria-label="盆土湿润程度"/><small>{plant.facing === 1 ? '叶面朝窗' : '转过半圈，另一面向光'}</small></div></div>
      <div className="theme-tool-actions"><button data-first-action type="button" disabled={plant.water === 2} onClick={() => setPlant(old => tendPlant(old, 'water'))}>{plant.water === 2 ? '已经浇好' : '浇一点水'}</button><button type="button" onClick={() => setPlant(old => tendPlant(old, 'turn'))}>转半圈花盆</button></div>
      <p className="theme-footnote">本次摆放的小植物，无需每日打卡。</p>
    </ToolTray>
  </>;
}
function SeaWindow() {
  const tool = useObjectTool(), sound = useSoundscape();
  const volume = sound?.mix.tracks.wind || 0, open = volume > 0;
  return <>
    <ObjectButton scene="seaside" tool={tool} pressed={open}><Pixels draw={drawSeaWindow} value={open}/></ObjectButton>
    <ToolTray tool={tool} kind="sea" title="海风窗">
      <p>把窗推开一点，让风进来。</p>
      <div className="theme-tool-actions"><button data-first-action type="button" disabled={!sound} aria-pressed={open} onClick={() => sound?.setTrack('wind', open ? 0 : .25)}>{open ? '合上窗，停下风声' : '推开窗，开启风声'}</button></div>
      <label className="theme-wind-control">窗的开度 <output>{Math.round(volume * 100)}%</output><input aria-label="海风窗开度" type="range" min="0" max="60" step="5" value={Math.round(volume * 100)} disabled={!sound} onChange={event => sound?.setTrack('wind', Number(event.target.value) / 100)}/></label>
      <p role="status">{!open ? '窗合上了，其他小屋声音保持原样。' : sound?.enabled ? '窗已打开，风声随开度变化。' : '窗已打开，声音目前关闭。'}</p>
      {open && !sound?.enabled && <button type="button" onClick={() => sound?.turnOn()}>开启小屋声音</button>}
      {sound?.error && <p role="alert">{sound.error}</p>}
      <p className="theme-footnote">连接「声音」里的风声轨道；开启时会恢复已选的小屋声音。开度沿用声音设置保存，回到小屋后不会自动发声。</p>
    </ToolTray>
  </>;
}
function AmberTea() {
  const tool = useObjectTool(), [tea, setTea] = useState(freshTea);
  useEffect(() => {
    if (tea.phase !== 'brewing') return;
    let timer = null, background = true, occluded = true;
    const update = () => {
      clearTimeout(timer); timer = null;
      if (background || occluded) return;
      const remaining = tea.readyAt - Date.now();
      if (remaining <= 0) setTea(old => teaAction(old, 'ready', Date.now()));
      else timer = setTimeout(() => setTea(old => teaAction(old, 'ready', Date.now())), remaining);
    };
    const offBackground = onBackgroundChange(value => { background = value; update(); });
    const offOcclusion = onOcclusionChange(value => { occluded = value; update(); });
    return () => { clearTimeout(timer); offBackground(); offOcclusion(); };
  }, [tea.phase, tea.readyAt]);
  const status = tea.phase === 'empty' ? '杯底放好了茶叶，倒一点热水。'
    : tea.phase === 'brewing' ? '茶叶正在舒展，等四秒。'
      : tea.phase === 'ready' ? `茶泡好了，还剩 ${tea.sips} 小口。` : '杯子空了。刚才这一小会儿，是留给自己的。';
  const action = tea.phase === 'empty' ? 'brew' : tea.phase === 'finished' ? 'refill' : 'sip';
  return <>
    <ObjectButton scene="warm" tool={tool}><Pixels draw={drawTea} value={tea}/></ObjectButton>
    <ToolTray tool={tool} kind="tea" title="琥珀茶歇">
      <div className="theme-tea-work"><Pixels draw={drawTea} value={tea} label={status}/><div><p role="status">{status}</p><p className="theme-footnote">倒水、等一会儿、喝一口。茶杯只记录这次小歇，不改动专注计时。</p></div></div>
      <div className="theme-tool-actions"><button data-first-action type="button" disabled={tea.phase === 'brewing'} onClick={() => setTea(old => teaAction(old, action, Date.now()))}>{tea.phase === 'empty' ? '倒热水' : tea.phase === 'brewing' ? '正在泡茶…' : tea.phase === 'ready' ? '喝一小口' : '重新放些茶叶'}</button></div>
    </ToolTray>
  </>;
}
function Telescope() {
  const tool = useObjectTool(), dialog = useRef(null), opened = useRef(false);
  const [patternId, setPatternId] = useState(0), [progress, setProgress] = useState(0), [hint, setHint] = useState('');
  const pattern = STAR_PATTERNS[patternId], finished = progress === pattern.points.length;
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (tool.open) {
      opened.current = true;
      if (!node.open) node.showModal();
      // showModal() moves focus itself; put it on the primary star action.
      node.querySelector('[data-first-action]')?.focus({ preventScroll: true });
      return;
    }
    if (!opened.current) return;
    opened.current = false;
    if (node.open) node.close();
    // A trigger inside the page is inert while the native dialog is modal.
    // Return focus only after close() has removed that modal state.
    tool.trigger.current?.focus({ preventScroll: true });
  }, [tool.open]);
  useEffect(() => () => { if (dialog.current?.open) dialog.current.close(); }, []);
  const connect = index => {
    if (finished) return;
    const next = connectStar(pattern, progress, index);
    setProgress(next); setHint(next === progress ? '找有金色方框的那颗星，也可以用下面的按钮连线。' : '');
  };
  return <>
    <ObjectButton scene="starlight" tool={tool}><span className="theme-telescope-glint" aria-hidden="true">✦</span></ObjectButton>
    {progress > 0 && <div className="theme-window-chart" aria-hidden="true"><Pixels wide draw={drawStarChart} value={{ pattern, progress }}/></div>}
    {createPortal(<dialog ref={dialog} className="theme-observatory" aria-label="望远镜里的星图" onCancel={event => { event.preventDefault(); tool.close(); }} onKeyDown={event => event.stopPropagation()}>
      <header><div><small>想象星图 · 不对应真实天空</small><h2>望远镜里的小宇宙</h2></div><button type="button" onClick={tool.close}>放下望远镜 · Esc</button></header>
      <fieldset><legend>今晚寻找</legend>{STAR_PATTERNS.map((item, index) => <button type="button" key={item.id} aria-pressed={index === patternId} onClick={() => { setPatternId(index); setProgress(0); setHint(''); }}>{item.name}</button>)}</fieldset>
      <div className="theme-star-field"><Pixels wide draw={drawStarChart} value={{ pattern, progress }} label={`${pattern.name}：已连接 ${progress} / ${pattern.points.length} 颗星`} onPointerDown={event => {
        const box = event.currentTarget.getBoundingClientRect();
        connect(starAtPoint(pattern, progress, (event.clientX - box.left) / box.width * 240, (event.clientY - box.top) / box.height * 144));
      }}/></div>
      <p role="status">{hint || (finished ? `${pattern.name}连好了。${pattern.message}` : `沿着金色方框连星星：${progress} / ${pattern.points.length}`)}</p>
      <div className="theme-tool-actions"><button data-first-action type="button" disabled={finished} onClick={() => connect(progress)}>连接下一颗星</button><button type="button" disabled={!progress} onClick={() => { setProgress(0); setHint(''); }}>重新连线</button></div>
      <p className="theme-footnote">可点击星点，也可用 Tab 选中「连接下一颗星」再按空格。放下望远镜后，连好的线会留在圆窗里，直到离开这个场景。</p>
    </dialog>, document.body)}
  </>;
}
export default function ThemeInteractions({ look }) {
  const reduceMotion = useReducedMotion();
  const Component = { forest: ForestPlant, seaside: SeaWindow, warm: AmberTea, starlight: Telescope }[look];
  return Component ? <div className="theme-interactions" data-motion={reduceMotion ? 'still' : 'discrete'}><Component key={look}/></div> : null;
}
