import React, { useEffect, useRef, useState } from 'react';
import { version as buildVersion } from '../../package.json';
import Dialog from '../Dialog';
import PixelCat from '../pet/PixelCat';
import { getRoomScene } from '../scene-catalog.mjs';
import RoomPickers, { sceneThumb } from '../RoomPickers';
import { Check, Music2 } from '../icons';
import * as model from './onboarding-model.mjs';
import InputCompanionSettings from './InputCompanionSettings';
import useSourceStatus from './useSourceStatus';
import './onboarding.css';

const PERMISSION_TEXT = { granted: '已允许', pending: '已开启，等待系统授权或一次输入确认', denied: '未允许 · 可在系统设置里修改', skipped: '已跳过', unsupported: '会在第一次用到时由系统询问' };
const PERMISSION_LABELS = { typing: '跨应用键鼠陪伴', notifications: '通知', appleMusic: '音乐 App', autostart: '开机启动' };

// First-run wizard. Each step only changes what the user explicitly picks:
// it never starts a timer, and sound plays only after 「播放测试」 is pressed.
export default function OnboardingWizard({ state, update, mode = '', currentVersion = buildVersion, env, player, look, petId, onRoomChange, useSource, openMusicSettings, openAdd, close, reduceMotion, error }) {
  const heading = useRef(null), first = useRef(true);
  // `fromVersion` is set only while a version update is active. Keeping the
  // mode derivable from state means the room does not need another prop (and
  // an interrupted update still reopens as an update).
  const effectiveMode = mode === 'update' || (!mode && state.fromVersion) ? 'update' : 'first-run';
  const updateCopy = model.updateContext(state, currentVersion);
  // An update is a check of the whole product, not a welcome tour: it starts
  // with the complete change list. First-run and 重新引导 never show release
  // history, because there is no earlier confirmed version to compare against.
  const steps = effectiveMode === 'update' ? model.STEPS.filter((id) => id !== 'welcome') : model.STEPS.filter((id) => id !== 'updates');
  const step = steps.includes(state.step) ? state.step : effectiveMode === 'update' ? steps[0] : 'source';
  const index = Math.max(0, steps.indexOf(step));
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus({ preventScroll: true }); }, [step]);
  // Move only across the steps this mode actually shows, so a hidden step can
  // never become the saved step from 上一步 / 下一步.
  const move = (offset) => update(model.goTo(state, steps[Math.min(steps.length - 1, Math.max(0, index + offset))]));
  const scene = getRoomScene(look);
  const title = effectiveMode === 'update' ? '版本更新' : '新手引导';
  return <Dialog title={title} label={title} close={() => close('later')} className="onboarding" size="lg">
    <ol className="onboarding-progress" aria-label="引导进度">{steps.map((id, i) => <li key={id} aria-current={id === step ? 'step' : undefined} className={i < index ? 'is-done' : ''}><span aria-hidden="true">{i < index ? <Check size={12}/> : i + 1}</span>{model.STEP_LABELS[id]}</li>)}</ol>
    <div className="onboarding-layout">
      <aside className="onboarding-scene" aria-hidden="true"><img src={sceneThumb(scene)} alt="" width="362" height="272"/><PixelCat petId={petId} pose={step === 'test' || step === 'done' ? 'groove' : 'idle'} reduceMotion={reduceMotion}/><span>{scene.label}</span></aside>
      <section className="onboarding-step" key={step} aria-labelledby="onboarding-heading">
        {step === 'welcome' && <Welcome heading={heading} env={env}/>}
        {step === 'updates' && <UpdatesStep heading={heading} mode={effectiveMode} currentVersion={currentVersion} copy={updateCopy}/>}
        {step === 'source' && <SourceStep heading={heading} state={state} update={update} env={env} player={player} useSource={useSource} openMusicSettings={openMusicSettings} openAdd={openAdd}/>}
        {step === 'permissions' && <PermissionStep heading={heading} state={state} update={update} env={env} player={player}/>}
        {step === 'room' && <RoomStep heading={heading} look={look} petId={petId} onRoomChange={onRoomChange} reduceMotion={reduceMotion} error={error}/>}
        {step === 'test' && <TestStep heading={heading} state={state} update={update} player={player} openMusicSettings={openMusicSettings}/>}
        {step === 'done' && <DoneStep heading={heading} state={state} env={env} mode={effectiveMode}/>}
      </section>
    </div>
    <footer className="onboarding-footer">
      {step !== 'done' ? <button type="button" className="onboarding-text" onClick={() => close(effectiveMode === 'update' ? 'later' : 'skip')}>{effectiveMode === 'update' ? '稍后继续' : '跳过引导'}</button> : <span/>}
      <small>{step === 'done' ? '以后可以在「设置 › 关于」里重新引导。' : effectiveMode === 'update' ? '版本更新需要完整走一遍；关掉后下次打开会从这一步继续。' : '关掉窗口也没关系，下次打开会从这一步继续。'}</small>
      <div>
        {index > 0 && step !== 'done' && <button type="button" className="pixel-button" onClick={() => move(-1)}>上一步</button>}
        {step === 'welcome' && <button type="button" className="pixel-button is-primary" onClick={() => move(1)}>开始设置</button>}
        {step !== 'welcome' && step !== 'done' && <button type="button" className="pixel-button is-primary" onClick={() => move(1)}>{step === 'updates' ? '开始检查设置' : '下一步'}</button>}
        {step === 'done' && <button type="button" className="pixel-button is-primary" onClick={() => close('done')}>进入小屋</button>}
      </div>
    </footer>
  </Dialog>;
}

const Heading = ({ heading, eyebrow, children }) => <><span className="onboarding-eyebrow">{eyebrow}</span><h3 id="onboarding-heading" ref={heading} tabIndex={-1}>{children}</h3></>;

function Welcome({ heading, env }) {
  return <>
    <Heading heading={heading} eyebrow="第一次来">欢迎来到心流小屋</Heading>
    <p>花一分钟把小屋调好，之后打开就能直接听歌、专注。每一步都可以跳过，以后在「设置」里随时改。</p>
    <ul className="onboarding-list">
      <li><b>1</b>选一个音乐来源并连接</li><li><b>2</b>打开需要的权限（通知{env.desktop ? '、键鼠陪伴、开机启动' : ''}）</li><li><b>3</b>挑房间和陪你的小伙伴</li><li><b>4</b>放一段声音，确认能听到</li>
    </ul>
    {!env.desktop && <p className="onboarding-hint">你在用网页版：QQ 音乐 / 网易云登录、系统播放器和开机启动需要桌面版。</p>}
  </>;
}

function UpdatesStep({ heading, mode, currentVersion, copy }) {
  const count = copy.releases.length;
  const toVersion = copy.toVersion || currentVersion;
  return <>
    <Heading heading={heading} eyebrow={mode === 'update' ? `版本更新 · ${copy.fromVersion} → ${toVersion}` : '最近更新'}>
      {mode === 'update' ? count ? `你离开的这段时间，小屋更新了 ${count} 个版本` : `小屋已经更新到 ${toVersion}` : `欢迎来到心流小屋 ${toVersion}`}
    </Heading>
    <p>{mode === 'update' ? '下面是从你上次确认的版本到现在的全部变化。接下来会把音源、键鼠陪伴、房间伙伴和试听重新检查一遍，避免升级后某个开关悄悄失效。' : '先把最近加入的功能放在这里，之后每一步只需要确认自己的选择。'}</p>
    <div className="onboarding-releases">
      {copy.releases.map((release) => <article key={release.version} className="onboarding-release">
        <header><span>v{release.version}</span><strong>{release.title}</strong></header>
        <ul>{release.items.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>)}
      {!count && <p className="onboarding-hint">这个版本没有单独的用户更新摘要。接下来仍会检查所有关键设置。</p>}
    </div>
    <div className="onboarding-update-next"><strong>接下来会逐项确认</strong><span>音源连接 · 跨应用键鼠陪伴与系统权限 · 房间和伙伴 · 实际试听</span></div>
  </>;
}

function SourceStep({ heading, state, update, env, player, useSource, openMusicSettings, openAdd }) {
  const { sources, status, refresh, quality, setQuality } = useSourceStatus(player, env), [busy, setBusy] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    const done = () => { setBusy(''); if (state.source) refresh(state.source); };
    window.addEventListener('album-music-account', done); window.addEventListener('album-local-music', done);
    return () => { window.removeEventListener('album-music-account', done); window.removeEventListener('album-local-music', done); };
  }, [state.source, refresh]);
  useEffect(() => { if (state.source) refresh(state.source); }, [state.source, refresh]);
  const choose = (source) => { update(model.chooseSource(state, source.id)); setMessage(''); const provider = source.provider || model.providerFor(source.id); if (provider) useSource?.(provider); };
  const connect = async (source) => {
    setBusy(source.id); setMessage('');
    const result = await player.connectSource(source.id);
    if (!result.pending) setBusy('');
    if (result.fallback === 'add-album') { setMessage(result.error); return; }
    if (!result.ok) setMessage(result.error || '没有连接成功。'); else if (!result.pending) refresh(source.id);
  };
  const selected = sources.find((item) => item.id === state.source);
  return <>
    <Heading heading={heading} eyebrow="音源">想从哪里听歌？</Heading>
    <p>选一个就好，之后可以在「设置 › 音源」里加更多。</p>
    <div className="onboarding-sources" role="radiogroup" aria-label="音乐来源">{sources.map((source) => <button type="button" role="radio" key={source.id} aria-checked={state.source === source.id} disabled={!source.available} aria-label={`音源 ${source.label}`} onClick={() => choose(source)}>
      <strong>{source.label}</strong><small>{source.available ? source.hint : source.reason}</small>{state.source === source.id && <Check size={14}/>}
    </button>)}</div>
    {selected && <div className="onboarding-connect" role="group" aria-label={`连接 ${selected.label}`}>
      <span><strong>{selected.label}</strong><small>{status[selected.id]?.detail || ' '}</small></span>
      {selected.id === 'local' && !env.desktop ? <button type="button" className="pixel-button" onClick={() => openAdd?.()}>选择音乐文件</button>
        : selected.id !== 'system' && <button type="button" className="pixel-button" disabled={Boolean(busy)} onClick={() => connect(selected)}>{busy === selected.id ? '等待完成…' : selected.id === 'local' ? '添加音乐文件夹' : selected.id === 'appleMusic' ? '检查连接' : status[selected.id]?.connected ? '重新登录' : '登录'}</button>}
    </div>}
    {quality?.options?.length > 0 && <label className="onboarding-quality">音质<select aria-label="音质" value={state.quality || quality.current || ''} onChange={async (event) => { const id = event.target.value; if (await setQuality(id)) update({ ...state, quality: id }); }}>{quality.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>播放不了时会自动降一档</small></label>}
    {message && <p className="onboarding-hint" role="status">{message}</p>}
    {env.desktop && <button type="button" className="onboarding-text" onClick={() => openMusicSettings?.('music/accounts')}><Music2 size={14}/>更多音源（Music Assistant 等）</button>}
  </>;
}

function PermissionStep({ heading, state, update, env, player }) {
  const items = model.permissionItems(env, state.source).filter((item) => item.id !== 'typing');
  const [busy, setBusy] = useState('');
  const ask = async (item) => { setBusy(item.id); const result = await player.requestPermission(item.id); setBusy(''); update(model.setPermission(state, item.id, result)); };
  const rememberTyping = (verdict) => {
    if (verdict && state.permissions.typing !== verdict) update(model.setPermission(state, 'typing', verdict));
  };
  return <>
    <Heading heading={heading} eyebrow="权限">只开需要的权限</Heading>
    <p>{env.desktop ? '跨应用键鼠陪伴需要确认一次；macOS 的辅助功能和输入监控是两项独立授权。之后可随时在「设置 › 键鼠陪伴」里改。拒绝也不会影响小屋、音乐和专注。' : '每一项都会弹出系统询问，拒绝也能正常使用小屋。'}</p>
    {env.desktop && <InputCompanionSettings player={player} env={env} compact onPermission={rememberTyping}/>}
    {items.length ? <ul className="onboarding-permissions">{items.map((item) => { const result = state.permissions[item.id]; return <li key={item.id}>
      <span><strong>{item.label}{item.optional ? <em>可选</em> : null}</strong><small>{result ? PERMISSION_TEXT[result] : item.hint}</small></span>
      {result === 'granted' ? <span className="onboarding-ok"><Check size={14}/>已允许</span> : <>
        <button type="button" className="pixel-button" disabled={Boolean(busy)} aria-label={`允许 ${item.label}`} onClick={() => ask(item)}>{busy === item.id ? '等待系统…' : '允许'}</button>
        {!result && <button type="button" className="onboarding-text" aria-label={`跳过 ${item.label}`} onClick={() => update(model.setPermission(state, item.id, 'skipped'))}>跳过</button>}
      </>}
    </li>; })}</ul> : <p className="onboarding-hint">这个环境不需要额外权限。</p>}
  </>;
}

function RoomStep({ heading, look, petId, onRoomChange, reduceMotion, error }) {
  return <>
    <Heading heading={heading} eyebrow="房间与伙伴">选一个房间，再挑个伙伴</Heading>
    <RoomPickers look={look} petId={petId} onChange={onRoomChange} reduceMotion={reduceMotion} compact/>
    {error && <p role="alert" className="record-error">{error}</p>}
  </>;
}

function TestStep({ heading, state, update, player, openMusicSettings }) {
  const [phase, setPhase] = useState(state.tested ? 'answered' : 'idle'), [result, setResult] = useState(null);
  const play = async () => { setPhase('playing'); const next = await player.testPlayback(state.source === 'appleMusic' || state.source === 'system' ? 'auto' : model.providerFor(state.source) || 'auto'); setResult(next); if (!next.ok) { setPhase('answered'); update(model.setTested(state, 'failed')); } else setPhase('ask'); };
  const answer = (value) => { setPhase('answered'); update(model.setTested(state, value)); };
  return <>
    <Heading heading={heading} eyebrow="试听">放一段声音试试</Heading>
    <p>{result?.kind === 'track' ? `会从你选的音源低音量试放几秒${result.title ? `（《${result.title}》）` : ''}。` : '会播放一小段提示音，确认电脑的扬声器或耳机有声音。'}</p>
    <div className="onboarding-test">
      <button type="button" className="pixel-button is-primary" disabled={phase === 'playing'} onClick={play}>{phase === 'playing' ? '正在播放…' : state.tested ? '再试一次' : '播放测试'}</button>
      {phase === 'ask' && <span role="group" aria-label="是否听到声音"><button type="button" className="pixel-button" onClick={() => answer('ok')}>听到了</button><button type="button" className="pixel-button" onClick={() => answer('silent')}>没听到</button></span>}
    </div>
    {state.tested === 'ok' && <p className="onboarding-ok" role="status"><Check size={14}/>声音正常，可以开始听歌了。</p>}
    {(state.tested === 'silent' || state.tested === 'failed') && <div className="onboarding-hint" role="status"><p>{result?.error || '没听到声音的话，可以检查：'}</p><ul><li>系统音量和输出设备（耳机 / 扬声器）</li><li>小屋右上角是否静音（按 M 切换）</li><li>平台音源需要登录，部分歌曲受版权限制</li></ul><button type="button" className="onboarding-text" onClick={() => openMusicSettings?.()}>打开音源设置</button></div>}
  </>;
}

function DoneStep({ heading, state, env, mode }) {
  const s = model.summary(state, env);
  const permissionLabel = (id) => PERMISSION_LABELS[id] || id;
  const permissions = [...s.permissions.map(permissionLabel), ...s.pending.map((id) => `${permissionLabel(id)}（待系统确认）`)];
  return <>
    <Heading heading={heading} eyebrow={mode === 'update' ? '更新完成' : '都好了'}>{mode === 'update' ? '这次更新已经逐项确认' : '小屋准备好了'}</Heading>
    <dl className="onboarding-summary"><dt>音源</dt><dd>{s.source}</dd><dt>权限</dt><dd>{permissions.length ? permissions.join('、') : '未开启'}</dd><dt>试听</dt><dd>{s.tested}</dd></dl>
    <p>双击唱片架上的封面放盘，点右上角的「专注」开始一轮。键鼠陪伴的开关、授权和今天记录都在「设置 › 键鼠陪伴」里；想让小屋沉入桌面，点右上角「沉入桌面」，按 Ctrl/⌘+Alt+D 退出。</p>
  </>;
}
