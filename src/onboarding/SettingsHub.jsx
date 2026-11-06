import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PERFORMANCE_MODES, performanceMode, performanceLevel, setPerformanceMode, onPerformanceChange } from '../perf-profile.mjs';
import Dialog from '../Dialog';
import { Tabs, Segmented, tabPanelProps } from '../ui/Roving';
import { playSfx, sfxEnabled, sfxVolume, setSfxEnabled, setSfxVolume } from '../props/sfx.mjs';
import { readPace, savePace, moveSeconds, EASE_DRAWER } from '../props/motion.mjs';
import { reducedMotion } from '../motion-preference.mjs';
import RoomPickers from '../RoomPickers';
import SkySettings from '../SkySettings';
import MusicAccounts from '../MusicSettings';
import FocusSettingsForm from '../focus/FocusSettingsForm';
import DailyGoalField from '../focus/stats/DailyGoalField.jsx';
import { desktopCommand } from '../desktop-client';
import { getAutostart, setAutostart, onAutostartChange } from '../desktop/autostart-client.mjs';
import { ChevronLeft, ChevronRight, Check, Search, X } from '../icons';
import { providerFor } from './onboarding-model.mjs';
import useSourceStatus from './useSourceStatus';
import { PROVIDERS, providerLabel } from '../player/providers.mjs';
import { version } from '../../package.json';
import UpdatePanel from '../desktop/UpdatePanel';
import './onboarding.css';
import { CROSSFADE_OPTIONS, crossfadeSeconds, setCrossfadeSeconds, onCrossfadeChange } from '../player/crossfade.mjs';
import { SHORTCUTS } from '../shortcuts.mjs';
import AiSettings from '../ai/AiSettings.jsx';
import InputCompanionSettings from './InputCompanionSettings';
import StorageStatus from '../mobile/StorageStatus';
import PetBehaviourSettings from '../pet/PetBehaviourSettings';
import { MiniPlayerRow, MediaKeysRows } from '../desktop/PlayerDesktopSettings';
import WhatsNew from './WhatsNew';
import { RELEASES } from './releases.mjs';
import { searchSettings, matchingSections } from './settings-search.mjs';
import { HUB_SECTIONS, hubTab, hubAnchor } from './settings-sections.mjs';
import { noteColour, noteLines, readNotes, sameNotes, currentNote, flipPlan, targetScroll } from './settings-notes.mjs';
import { LAB_FEATURES, LAB_IDS, setLabEnabled } from '../product/features.mjs';
import useLabs from '../product/useLabs';
import { Diagnostics } from '../home/SceneTools';
import '../home/shell.css';
import './settings-folder.css';

const SyncSettings = lazy(() => import('../sync/SyncSettings'));
const PetPackSettings = lazy(() => import('../pet/PetPackSettings'));

// 3.0: six sections (settings-sections.mjs). Old ids ('companion', 'sync',
// 'ai', 'about', 'beta'…) still open the hub, on the section that holds them now.
export { HUB_SECTIONS, hubTab };

// Preferences, in one place; actions (timer, album wall, the companion going
// out, fullscreen) stay in the room. Tray / menu / deck shortcuts open this
// dialog on their section.
//
// It is DEsk's Shell Settings (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors,
// docs/screenshots/shell-settings.jpg): one sheet of paper on the desk, its sections as index tabs
// along the top, the open one a wire-bound pad, and every part of the page a sticky note standing out
// of the pad's right edge that turns the page to it. The tablist, the search box and every setting
// keep their roles and names.
export default function SettingsHub({ section = 'music', setSection, close, env, player, provider, useSource, look, petId, onRoomChange, reduceMotion, error, desktop, openBackup, restartOnboarding }) {
  const tab = hubTab(section);
  const [query, setQuery] = useState(''), [found, setFound] = useState(null), [news, setNews] = useState(false);
  const [scanned, setScanned] = useState({ key: '', list: [] }), [here, setHere] = useState('');
  const searchBox = useRef(null), panel = useRef(null), pocket = useRef(null), sheet = useRef(null), slot = useRef(null), ghost = useRef(null), opened = useRef(false);
  const labels = useMemo(() => Object.fromEntries(HUB_SECTIONS.map((item) => [item.id, item.label])), []);
  const results = useMemo(() => searchSettings(query, { env, labels }), [query, env, labels]);
  const searching = Boolean(query.trim());
  // Notes read off a page other than the one showing (a section just changed) are not shown.
  const notes = !searching && scanned.key === section ? scanned.list : NO_NOTES;
  const hits = useMemo(() => new Map(matchingSections(results, HUB_SECTIONS).map((item) => [item.id, results.filter((entry) => hubTab(entry.section) === item.id).length])), [results]);
  const tabs = searching ? HUB_SECTIONS.map((item) => ({ ...item, disabled: !hits.has(item.id), content: <>{item.label}{hits.has(item.id) && <small className="settings-hub-count">{hits.get(item.id)}</small>}</> })) : HUB_SECTIONS;
  // Every way of changing section goes through here, so the pad that was in front can stay in the folder
  // (as a picture of itself) while the new one is drawn up over it.
  const leave = (next) => { if (hubTab(next) !== tab && !reducedMotion()) ghost.current = ghostOf(sheet.current, panel.current?.scrollTop || 0); setQuery(''); };
  const go = (next) => { leave(next); setSection(next); };
  const jump = (entry) => { leave(entry.section); setSection(entry.section); setFound({ ...entry, at: Date.now() }); };
  useSettingHighlight(panel, found, reduceMotion);
  useSectionAnchor(panel, section, reduceMotion);
  useLayoutEffect(() => {
    const old = ghost.current; ghost.current = null;
    const first = !opened.current; opened.current = true;
    return drawPad(sheet.current, pocket.current, old, first);
  }, [tab]);
  // The notes on the pad are the parts of the open page: read them off the page, and again when a lazy part arrives.
  useEffect(() => {
    const root = panel.current; if (!root || searching) return undefined;
    let frame = 0;
    const scan = () => { frame = 0; const next = readNotes(root); setScanned((previous) => previous.key === section && sameNotes(previous.list, next) ? previous : { key: section, list: next }); };
    scan();
    const watch = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); }) : null;
    watch?.observe(root, { childList: true, subtree: true });
    return () => { watch?.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [tab, section, searching]);
  // Which part is being read: its note shows the stuck end.
  useEffect(() => {
    const root = panel.current; if (!root || searching || !notes.length) { setHere(''); return undefined; }
    let frame = 0;
    const look = () => {
      frame = 0; const top = root.getBoundingClientRect().top;
      setHere(currentNote(notes.map((note) => ({ id: note.id, top: (root.querySelector(`#${note.id}`)?.getBoundingClientRect().top ?? Infinity) - top }))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(look); };
    look(); root.addEventListener('scroll', onScroll, { passive: true });
    return () => { root.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [notes, searching]);
  const turnTo = (id) => { const root = panel.current, target = root?.querySelector(`#${id}`); if (!root || !target) return; setHere(id); turnPage(root, target, slot.current); };
  const padIndex = Math.max(0, HUB_SECTIONS.findIndex((item) => item.id === tab));
  return <Dialog title="设置" label="设置" close={close} className="settings-hub" size="lg" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); searchBox.current?.focus(); searchBox.current?.select(); }
  }}>
    <div className="settings-hub-layout hub-folder">
      <div className="settings-hub-side hub-folder-top">
        {/* the search line comes first in the Tab order, as it always has; it is drawn after the tabs (flex order) */}
        <label className="settings-hub-search hub-typed"><Search size={14}/><input ref={searchBox} type="search" placeholder="搜索设置" aria-label="搜索设置" aria-controls="hub-tab-panel" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) { event.preventDefault(); jump(results[0]); }
          else if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
          else if (event.key === 'ArrowDown' && results[0]) { event.preventDefault(); panel.current?.querySelector('.settings-hub-results button')?.focus(); }
        }}/>{query && <button type="button" className="settings-hub-clear" aria-label="清除搜索" onClick={() => { setQuery(''); searchBox.current?.focus(); }}><X size={12}/></button>}</label>
        <Tabs className="settings-hub-nav hub-tabs" label="设置分区" idPrefix="hub-tab" orientation="horizontal" arrows="both" items={tabs} value={searching ? '' : tab} onChange={(id) => go(id)}/>
      </div>
      <div className="hub-pocket" ref={pocket}>
        <div className="hub-sheet" ref={sheet}>
          <div className="hub-pad-slot" ref={slot}>
            <div className="hub-pad">
              <i className="hub-rings" aria-hidden="true"/>
              <section ref={panel} {...tabPanelProps('hub-tab', tab)} className="settings-hub-panel">
        {searching ? <SearchResults query={query} results={results} labels={labels} jump={jump}/> : <>
        {tab === 'music' && section !== 'music/accounts' && <MusicSection env={env} player={player} provider={provider} useSource={useSource} openAccounts={() => setSection('music/accounts')}/>}
        {section === 'music/accounts' && <div className="hub-subpage" role="region" aria-label="账户与文件夹">
          <button type="button" className="hub-back" onClick={() => setSection('music')}><ChevronLeft size={14}/>音乐</button>
          <MusicAccounts/>
        </div>}
        {tab === 'focus' && <><Part id="hub-timer" note="计时"><p className="personalization-intro">番茄钟的时长和提醒。计时本身在顶栏的「专注」里。</p><FocusSettingsForm className="hub-focus-settings"/></Part><Part id="hub-goal" note="目标"><DailyGoalField/></Part></>}
        {tab === 'room' && <>
          <Part id="hub-room" note="伙伴">
            <p className="personalization-intro">选一位安静的伙伴，它住在抽屉里的照片上，也会出门到桌面上散步。换伙伴不会打断音乐和专注。</p>
            <RoomPickers petsOnly look={look} petId={petId} onChange={onRoomChange} reduceMotion={reduceMotion}/>
          </Part>
          <Part id="hub-pet" note="习性"><PetBehaviourSettings desktop={Boolean(env.desktop)}/></Part>
          <div id="hub-sky" className="hub-block" data-note="天空"><SkySettings/></div>
          <Suspense fallback={<p role="status">正在整理桌宠衣柜…</p>}>{(window.albumDesktopCapabilities?.petPacks || window.albumMobile?.petRequest) && <PetPackSettings/>}</Suspense>
          {window.albumMobile?.setLauncherIcon && <Row title="桌宠启动图标" hint="使用当前伙伴作为启动器图标；系统图标缓存可能稍后更新。"><button type="button" className="pixel-button" onClick={() => window.albumMobile.setLauncherIcon(petId)}>使用当前桌宠图标</button></Row>}
          <section id="hub-companion" className="hub-block" data-note="键鼠" aria-label="键鼠陪伴"><h3>键鼠陪伴</h3><CompanionSection env={env} player={player}/></section>
          {error && <p role="alert" className="record-error">{error}</p>}
        </>}
        {tab === 'desktop' && <DisplaySection env={env} desktop={desktop}/>}
        {tab === 'data' && <DataSection env={env} openBackup={openBackup} openFolders={() => setSection('music/accounts')} open={section === 'diagnostics'}/>}
        {tab === 'labs' && <LabsSection env={env} openNews={() => setNews(true)} restartOnboarding={restartOnboarding}/>}
        </>}
              </section>
            </div>
          </div>
          {notes.length > 0 && <nav className="hub-notes" aria-label="本页分区">{notes.map((note, index) => <button type="button" key={note.id} className={`hub-note${here === note.id ? ' is-here' : ''}`} style={{ '--note': noteColour(index, padIndex) }} aria-current={here === note.id ? 'true' : undefined} onClick={() => turnTo(note.id)}>
            {noteLines(note.label).map((line, i) => <span key={i}>{line}</span>)}
          </button>)}</nav>}
        </div>
      </div>
      <button type="button" className="settings-hub-about" onClick={() => go('about')}>关于 · v{version}</button>
    </div>
    {news && <WhatsNew history copy={{ fromVersion: '', toVersion: version, releases: RELEASES.slice(0, 8) }} close={() => setNews(false)}/>}
  </Dialog>;
}

// A part of a page that has its own sticky note: `note` is what the note says (two lines with \n).
const NO_NOTES = [];
const Part = ({ id, note, children }) => <div id={id} data-note={note} className="hub-part">{children}</div>;

// A picture of a page as it stands, to leave behind while it is covered or turned: a copy of the DOM with no ids,
// hidden from the keyboard and from screen readers. `top` puts its pad at that scroll position.
function ghostOf(node, top = 0) {
  if (!node) return null;
  const copy = node.cloneNode(true);
  copy.removeAttribute('id'); copy.classList.add('is-ghost'); copy.setAttribute('aria-hidden', 'true'); copy.setAttribute('inert', '');
  for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
  for (const el of copy.querySelectorAll('[tabindex]')) el.setAttribute('tabindex', '-1');
  copy.dataset.top = String(top);
  return copy;
}
const restoreScroll = (copy) => { const pad = copy.querySelector('.settings-hub-panel'); if (pad) pad.scrollTop = Number(copy.dataset.top) || 0; };

// The sheet of a section drawn up from the bottom of the folder over the one that was in front (DEsk's tab_switch:
// 0.45 s of the drawer spring, the sound of taking a sheet). Opening does the same a moment after the paper lands.
function drawPad(sheet, pocket, old, first) {
  if (old && pocket && sheet) { pocket.insertBefore(old, sheet); restoreScroll(old); }
  if (!sheet || reducedMotion() || typeof sheet.animate !== 'function') { old?.remove(); return () => old?.remove(); }
  if (!first) playSfx('sheet-take');
  const rise = sheet.animate([{ transform: `translateY(${sheet.offsetHeight + 16}px)` }, { transform: 'translateY(0)' }], { duration: moveSeconds(0.45) * 1000, delay: first ? 120 : 0, easing: EASE_DRAWER, fill: 'backwards' });
  rise.finished.then(() => old?.remove(), () => old?.remove());
  return () => { rise.cancel(); old?.remove(); };
}

// A click on a note turns the page to its part: going down, the page in front lifts over the wire and the part
// is under it; going up, the part's page falls back onto the pad (DEsk's page_turn, hinged on the wire).
function turnPage(root, target, slot) {
  const to = targetScroll({ scrollTop: root.scrollTop, partTop: target.getBoundingClientRect().top, panelTop: root.getBoundingClientRect().top, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight });
  const plan = flipPlan(root.scrollTop, to, { reduced: reducedMotion() });
  playSfx('page-turn');
  const pad = root.closest('.hub-pad');
  if (plan.kind === 'jump' || !pad || !slot || typeof pad.animate !== 'function') { root.scrollTo({ top: to, behavior: reducedMotion() ? 'auto' : 'smooth' }); return; }
  const lift = plan.kind === 'lift', copy = ghostOf(pad, lift ? root.scrollTop : to);
  copy.classList.add('is-turning'); slot.appendChild(copy); restoreScroll(copy);
  if (lift) root.scrollTop = to;
  const turn = copy.animate(lift ? [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(104deg)' }] : [{ transform: 'rotateX(104deg)' }, { transform: 'rotateX(0deg)' }], { duration: moveSeconds(0.5) * 1000, easing: lift ? 'cubic-bezier(.5,.1,.7,.6)' : 'cubic-bezier(.3,.5,.5,1)', fill: 'both' });
  const done = () => { if (!lift) root.scrollTop = to; copy.remove(); };
  turn.finished.then(done, () => copy.remove());
}

// The results of 搜索设置: one row per setting, with the section it lives in.
function SearchResults({ query, results, labels, jump }) {
  const move = (event) => {
    const keys = { ArrowDown: 1, ArrowUp: -1 }; if (!keys[event.key]) return;
    const list = [...event.currentTarget.querySelectorAll('button')], index = list.indexOf(document.activeElement);
    const next = list[index + keys[event.key]];
    event.preventDefault();
    if (next) next.focus(); else if (keys[event.key] < 0) document.querySelector('.settings-hub-search input')?.focus();
  };
  if (!results.length) return <div className="settings-hub-empty" role="status"><strong>没有找到「{query.trim()}」</strong><small>换个说法试试，比如“备份”“通知”“歌词”或“音源”。</small></div>;
  return <ul className="settings-hub-results" aria-label={`找到 ${results.length} 项设置`} onKeyDown={move}>{results.map((entry) => { const [tab, sub] = entry.section.split('/'); return <li key={entry.id}>
    <button type="button" onClick={() => jump(entry)}><span><strong>{entry.title}</strong><small>{labels[tab]}{sub === 'accounts' ? ' › 账户与文件夹' : ''}</small></span><ChevronRight size={14}/></button>
  </li>; })}</ul>;
}

// After a jump, scroll the matching row into view and light it up briefly.
// Lazy sections (同步与设备, 桌宠衣柜) render a moment later, so look a few times.
function useSettingHighlight(panel, found, reduceMotion) {
  useEffect(() => {
    if (!found) return undefined;
    const anchor = found.anchor || found.title;
    let tries = 0, lit = null, timer = 0;
    const look = () => {
      const root = panel.current; if (!root) return;
      const text = [...root.querySelectorAll('strong,h3,h4,legend,label,span,button,p')].find((node) => node.textContent.trim().startsWith(anchor));
      if (!text) { if (++tries < 20) timer = setTimeout(look, 100); return; }
      lit = text.closest('.hub-row,.hub-sources,.typing-companion,fieldset,section,label') || text;
      if (lit === root) lit = text;
      lit.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      lit.classList.add('is-found');
      timer = setTimeout(() => lit?.classList.remove('is-found'), 1800);
    };
    timer = setTimeout(look, 0);
    return () => { clearTimeout(timer); lit?.classList.remove('is-found'); };
  }, [found]);
}

// An old section id ('ai', 'sync', 'about', 'companion'…) opens its new section scrolled to that block.
function useSectionAnchor(panel, section, reduceMotion) {
  useEffect(() => {
    const anchor = hubAnchor(section);
    if (!anchor) return undefined;
    let tries = 0, timer = 0;
    const look = () => {
      const node = panel.current?.querySelector(`#${anchor}`);
      if (!node) { if (++tries < 20) timer = setTimeout(look, 100); return; }
      node.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    timer = setTimeout(look, 0);
    return () => clearTimeout(timer);
  }, [section]);
}

const Row = ({ title, hint, led, children }) => <div className="hub-row"><span><strong>{led !== undefined && <i className={`hub-led ${led ? 'is-on' : ''}`} aria-hidden="true"/>}{title}</strong>{hint && <small>{hint}</small>}</span>{children && <span className="hub-row-actions">{children}</span>}</div>;

function CompanionSection({ env, player }) {
  return <>
    <p className="personalization-intro">奶糖会在你使用其他应用时，陪着你打字和点鼠标。这里可以直接开关、检查授权，并确认今天的记录是否真的在增加。</p>
    {env.desktop
      ? <InputCompanionSettings player={player} env={env}/>
      : <div className="onboarding-hint">{env.mobile ? '手机版的小猫在小屋内陪伴你；跨应用键鼠统计与独立桌宠需要电脑桌面版。' : '跨应用键鼠陪伴需要心流小屋桌面版。网页版仍会在小屋窗口内回应键盘和鼠标。'}</div>}
    {env.desktop && <Row title="统计位置" hint="今天的键盘、点击与最近 7 天，也在奶糖的小猫面板和顶栏的「日记」里。"/>}
  </>;
}

// 数据: backups and folders, plus 功能诊断 (opened on demand: it asks the music service and devices).
function DataSection({ env, openBackup, openFolders, open: initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => { if (initiallyOpen) setOpen(true); }, [initiallyOpen]);
  return <div className="hub-rows">
    <Part id="hub-backup" note="备份">
      {env.mobile && <StorageStatus/>}
      <Row title="收藏与备份" hint="导出 / 导入唱片、歌单、专注记录。备份文件只保存在你选的位置。"><button type="button" className="pixel-button" onClick={openBackup}>收藏与备份</button></Row>
      {env.desktop && <Row title="本地音乐文件夹" hint="添加或移除扫描的文件夹。"><button type="button" className="pixel-button" onClick={openFolders}>管理文件夹<ChevronRight size={14}/></button></Row>}
    </Part>
    <section id="hub-diagnostics" className="hub-block" data-note="诊断" aria-label="功能诊断">
      <Row title="功能诊断" hint="播放、专注、天气、账号与连接是否正常。报告不含账号凭据、任务正文或位置坐标。"><button type="button" className="pixel-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? '收起诊断' : '查看功能诊断'}</button></Row>
      {open && <div className="hub-diagnostics"><Diagnostics/></div>}
    </section>
  </div>;
}

// 实验室: features that sit outside the core loop (docs/design/3.0-design.md §5.3).
// Turning one off only hides its entry points; data, backups and sync stay as they are.
function LabsSection({ env, openNews, restartOnboarding }) {
  const labs = useLabs();
  return <div className="hub-rows hub-labs">
    <Part id="hub-labs-list" note={'功能\n开关'}>
    <p className="personalization-intro">还在打磨、或只有一部分人需要的功能。关掉只会收起它们的入口，数据、备份和同步都原样保留，随时可以再打开。</p>
    <div className="hub-labs-list" role="group" aria-label="实验室功能">{LAB_IDS.map((id) => { const lab = LAB_FEATURES[id], on = Boolean(labs[id]); return <Row key={id} title={lab.label} hint={lab.hint} led={on}>
      <label className="hub-toggle"><input type="checkbox" aria-label={lab.label} checked={on} onChange={(event) => setLabEnabled(id, event.target.checked)}/><span>{on ? '开' : '关'}</span></label>
    </Row>; })}</div>
    </Part>
    <section id="hub-ai" className="hub-block" data-note="AI"><h3>AI（Beta）</h3><AiSettings/></section>
    <section id="hub-sync" className="hub-block" data-note="同步" aria-label="同步与设备"><h3>同步与设备</h3>{labs.devices
      ? <Suspense fallback={<p role="status">正在打开同步设置…</p>}><SyncSettings/></Suspense>
      : <Row title="设备联动已收起" hint="打开上面的「设备联动」，就能在这里配对手机或另一台电脑。已配对的设备和同步数据都还在。"><button type="button" className="pixel-button" onClick={() => setLabEnabled('devices', true)}>打开设备联动</button></Row>}</section>
    <section id="hub-about" className="hub-block" data-note="版本" aria-label="关于"><h3>关于</h3>
      <UpdatePanel version={version} desktop={Boolean(env.desktop)}/>
      <Row title="新功能" hint={`看看 v${version} 带来了什么，也可以翻到更早的版本。`}><button type="button" className="pixel-button" onClick={openNews}>查看新功能</button></Row>
      <Row title="重新引导" hint="再走一遍三步引导（音源、房间与伙伴、试听），之前的选择会保留。"><button type="button" className="pixel-button" onClick={restartOnboarding}>重新引导</button></Row>
    </section>
  </div>;
}

// What the deck plays from: one radio list. Each source row shows whether it is
// connected; logins, folders and Music Assistant live one page deeper.
function MusicSection({ env, player, provider, useSource, openAccounts }) {
  const { sources, status, quality, setQuality } = useSourceStatus(player, env);
  const rows = [
    { id: 'visual', available: true, hint: '唱片转动、显示曲目，不出声。' },
    { id: 'auto', available: Boolean(env.desktop || env.mobile), hint: '按唱片在已连接的音源里找能播放的版本。', reason: '需要心流小屋桌面版' },
    ...sources.map((source) => ({ id: source.provider || providerFor(source.id), source: source.id, available: source.available, hint: status[source.id]?.detail || source.hint, reason: source.reason, connected: status[source.id]?.connected })),
    { id: 'ma', available: Boolean(env.desktop), hint: '由家里的 Music Assistant 服务器出声，在「账户与文件夹」里连接。', reason: '需要心流小屋桌面版' }
  ].filter((row, index, list) => (!env.mobile || ['visual', 'auto', 'local', 'qq', 'netease'].includes(row.id)) && PROVIDERS.some((item) => item.id === row.id) && list.findIndex((other) => other.id === row.id) === index);
  const move = (event) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }; if (!keys[event.key]) return;
    const enabled = rows.filter((row) => row.available), index = enabled.findIndex((row) => row.id === provider);
    const next = enabled[(Math.max(0, index) + keys[event.key] + enabled.length) % enabled.length]; if (!next) return;
    event.preventDefault(); useSource(next.id); document.getElementById(`hub-source-${next.id}`)?.focus();
  };
  return <div className="hub-rows">
    <Part id="hub-source" note="音源">
    <div className="hub-sources" role="radiogroup" aria-label="唱机音源" onKeyDown={move}>{rows.map((row) => { const on = row.id === provider; return <button type="button" role="radio" key={row.id} id={`hub-source-${row.id}`} aria-checked={on} tabIndex={on || (!rows.some((item) => item.id === provider) && row.id === 'visual') ? 0 : -1} disabled={!row.available} aria-label={providerLabel(row.id)} onClick={() => useSource(row.id)}>
      <i className={`hub-led ${row.available && (on || row.connected) ? 'is-on' : ''}`} aria-hidden="true"/><span><strong>{providerLabel(row.id)}</strong><small>{row.available ? row.hint : row.reason}</small></span>{on && <span className="onboarding-ok"><Check size={14}/>唱机在用</span>}
    </button>; })}</div>
    {(env.desktop || env.mobile) && <Row title="账户与文件夹" hint={env.mobile ? '登录 QQ 音乐 / 网易云，凭据加密保存在这台手机。' : '登录 QQ 音乐 / 网易云、管理本地文件夹、连接 Music Assistant。'}><button type="button" className="pixel-button" onClick={openAccounts}>账户与文件夹<ChevronRight size={14}/></button></Row>}
    </Part>
    <Part id="hub-tune" note={'音质\n过渡'}>
    {quality?.options?.length > 0 && <Row title="音质" hint="QQ 音乐 / 网易云向平台请求的音质。没有会员或没有该音质时，自动换成能播放的最高一档。">
      <select aria-label="音质" value={quality.current || quality.options[0].id} onChange={(event) => setQuality(event.target.value)}>{quality.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </Row>}
    <CrossfadeRow/>
    </Part>
  </div>;
}

// 歌曲过渡: the next song is always buffered early; a crossfade also overlaps them.
function CrossfadeRow() {
  const [seconds, setSeconds] = useState(crossfadeSeconds);
  useEffect(() => onCrossfadeChange(setSeconds), []);
  return <Row title="歌曲过渡" hint={seconds ? `上一首结束前 ${seconds} 秒，下一首淡入，上一首淡出。` : '下一首会提前缓冲好，上一首结束时立刻接上。'}>
    <select aria-label="歌曲过渡" value={seconds} onChange={(event) => setSeconds(setCrossfadeSeconds(event.target.value))}>{CROSSFADE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
  </Row>;
}

const PERFORMANCE_ITEMS = PERFORMANCE_MODES.map(([id, label]) => ({ id, label }));
function PerformanceRow() {
  const [mode, setMode] = useState(performanceMode), [level, setLevel] = useState(performanceLevel);
  useEffect(() => onPerformanceChange((detail) => { setLevel(detail.level); setMode(detail.mode); }), []);
  return <Row title="流畅模式" hint={`电脑带不动时少画一些：纸张不投柔和的阴影、台钟少亮几次。现在：${level === 'low' ? '流畅优先' : '完整画质'}${mode === 'auto' ? '（自动判断）' : ''}。`}>
    <Segmented label="流畅模式" items={PERFORMANCE_ITEMS} value={mode} onChange={(id) => { setLevel(setPerformanceMode(id)); setMode(id); }}/>
  </Row>;
}

// 开机时打开小屋: shown only where the desktop shell reports it can.
function AutostartRow() {
  const [state, setState] = useState(getAutostart), [busy, setBusy] = useState(false);
  useEffect(() => onAutostartChange(setState), []);
  if (!state.supported) return null;
  return <Row title="开机时打开小屋" hint="登录电脑后自动点亮小屋。">
    <label className="hub-toggle"><input type="checkbox" aria-label="开机时打开小屋" checked={state.enabled} disabled={busy} onChange={async (event) => { setBusy(true); setState(await setAutostart(event.target.checked)); setBusy(false); }}/><span>{state.enabled ? '开' : '关'}</span></label>
  </Row>;
}

// 桌面质感: the desk's sounds (made from nothing, see src/props/sfx.mjs) and how briskly things move.
const PACE_ITEMS = [{ id: 'brisk', label: '利落' }, { id: 'normal', label: '正常' }, { id: 'gentle', label: '从容' }];
function DeskFeelRows() {
  const [sound, setSound] = useState(sfxEnabled), [volume, setVolume] = useState(sfxVolume), [pace, setPace] = useState(readPace);
  return <>
    <Row title="桌面音效" hint="纸、抽屉、旋钮和铜牌的声音，都是合成出来的，不是录音。">
      <label className="hub-toggle"><input type="checkbox" aria-label="桌面音效" checked={sound} onChange={(event) => { setSfxEnabled(event.target.checked); setSound(event.target.checked); if (event.target.checked) playSfx('key-press'); }}/><span>{sound ? '开' : '关'}</span></label>
      <input type="range" aria-label="音效音量" min="0" max="1" step="0.05" value={volume} disabled={!sound} onChange={(event) => { const value = Number(event.target.value); setSfxVolume(value); setVolume(value); }} onPointerUp={() => playSfx('knob-tick')}/>
    </Row>
    <Row title="动作快慢" hint="抽屉、纸张和镜头移动的节奏。"><Segmented label="动作快慢" items={PACE_ITEMS} value={pace} onChange={(id) => { savePace(id); setPace(id); }}/></Row>
  </>;
}

// `desktop` is the room's own 沉入桌面 state and toggle (the toolbar uses the same pair).
function DisplaySection({ env, desktop }) {
  const { active, busy, supported, reason } = desktop.state;
  return <div className="hub-rows">
    <Part id="hub-perf" note="画质"><PerformanceRow/></Part>
    <Part id="hub-feel" note="质感"><DeskFeelRows/></Part>
    <Part id="hub-sink" note="桌面">
    <Row title="沉入桌面" hint={reason || '小屋沉到所有窗口下面变成动态桌面，唱机、时钟和专注成为桌面小组件。随时按 Ctrl/⌘+Alt+D 退出。'}>
      <label className="hub-toggle"><input type="checkbox" aria-label="沉入桌面" checked={Boolean(active)} disabled={!supported || busy} onChange={desktop.toggle}/><span>{active ? '开' : '关'}</span></label>
    </Row>
    {env.desktop && <AutostartRow/>}
    {env.desktop && <Row title="显示与字体" hint="界面缩放、字体、减少动态效果。"><button type="button" className="pixel-button" onClick={() => desktopCommand('settings')}>打开显示与字体</button></Row>}
    {env.desktop && <MiniPlayerRow/>}
    {env.desktop && <MediaKeysRows/>}
    </Part>
    <div id="hub-keys" data-note="快捷键" className="hub-row hub-shortcuts-row"><span><strong>快捷键</strong><button type="button" className="onboarding-text" onClick={() => window.dispatchEvent(new Event('cabin:shortcuts'))}>按 ? 或 Ctrl/⌘+/ 随时打开速查表</button><dl className="hub-shortcuts">{SHORTCUTS.map((entry) => <div key={entry.id}><dt>{entry.label}</dt><dd>{entry.action}</dd></div>)}</dl></span></div>
  </div>;
}
