import React, { useEffect, useRef, useState } from 'react';
import { version as buildVersion } from '../../package.json';
import Dialog from '../Dialog';
import PixelCat from '../pet/PixelCat';
import { getRoomScene } from '../scene-catalog.mjs';
import RoomPickers, { sceneThumb } from '../RoomPickers';
import { Check, Music2 } from '../icons';
import * as model from './onboarding-model.mjs';
import WhatsNew from './WhatsNew';
import useSourceStatus from './useSourceStatus';
import './onboarding.css';

const PERMISSION_TEXT = { granted: '已允许', pending: '已开启，等待系统授权或一次输入确认', denied: '未允许 · 可在系统设置里修改', skipped: '已跳过', unsupported: '会在第一次用到时由系统询问' };
const PERMISSION_LABELS = { typing: '跨应用键鼠陪伴', notifications: '通知', appleMusic: '音乐 App', autostart: '开机启动' };
// Where each optional permission lives once the guide is closed.
const PERMISSION_HOME = { typing: 'companion', notifications: 'focus', autostart: 'desktop', appleMusic: 'music/accounts' };

// First-run guide: three steps (音源 → 房间与伙伴 → 试听). Each step only changes
// what the user explicitly picks: it never starts a timer, and sound plays only
// after 「播放测试」 is pressed. A version update is the dismissible 新功能 sheet.
export default function OnboardingWizard({ state, update, mode = '', currentVersion = buildVersion, env, player, look, petId, onRoomChange, useSource, openMusicSettings, openAdd, close, reduceMotion, error }) {
  const heading = useRef(null), first = useRef(true);
  // `fromVersion` is set only while a version update is pending, so the mode
  // stays derivable from state (and an app quit before 知道了 shows it again).
  const effectiveMode = mode === 'update' || (!mode && state.fromVersion) ? 'update' : 'first-run';
  const steps = model.STEPS;
  const step = steps.includes(state.step) ? state.step : steps[0];
  const index = Math.max(0, steps.indexOf(step));
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus({ preventScroll: true }); }, [step]);
  if (effectiveMode === 'update') return <WhatsNew copy={model.updateContext(state, currentVersion)} close={() => close('done')} openSettings={(section) => { close('done'); openMusicSettings?.(section); }}/>;
  const move = (offset) => update(model.goTo(state, steps[Math.min(steps.length - 1, Math.max(0, index + offset))]));
  const scene = getRoomScene(look);
  const last = model.isLastStep(step);
  return <Dialog title="新手引导" label="新手引导" close={() => close('later')} className="onboarding" size="lg">
    <ol className="onboarding-progress" aria-label="引导进度">{steps.map((id, i) => <li key={id} aria-current={id === step ? 'step' : undefined} className={i < index ? 'is-done' : ''}><span aria-hidden="true">{i < index ? <Check size={12}/> : i + 1}</span>{model.STEP_LABELS[id]}</li>)}</ol>
    <div className="onboarding-layout">
      <aside className="onboarding-scene" aria-hidden="true"><img src={sceneThumb(scene)} alt="" width="362" height="272"/><PixelCat petId={petId} pose={step === 'test' ? 'groove' : 'idle'} reduceMotion={reduceMotion}/><span>{scene.label}</span></aside>
      <section className="onboarding-step" key={step} aria-labelledby="onboarding-heading">
        {step === 'source' && <SourceStep heading={heading} state={state} update={update} env={env} player={player} useSource={useSource} openMusicSettings={openMusicSettings} openAdd={openAdd}/>}
        {step === 'room' && <RoomStep heading={heading} look={look} petId={petId} onRoomChange={onRoomChange} reduceMotion={reduceMotion} error={error}/>}
        {step === 'test' && <TestStep heading={heading} state={state} update={update} env={env} player={player} openMusicSettings={openMusicSettings}/>}
      </section>
    </div>
    <footer className="onboarding-footer">
      <button type="button" className="onboarding-text" onClick={() => close('skip')}>跳过引导</button>
      <small>{last ? '以后可以在「设置 › 关于」里重新引导。' : '关掉窗口也没关系，下次打开会从这一步继续。'}</small>
      <div>
        {index > 0 && <button type="button" className="pixel-button" onClick={() => move(-1)}>上一步</button>}
        {last ? <button type="button" className="pixel-button is-primary" onClick={() => close('done')}>进入小屋</button>
          : <button type="button" className="pixel-button is-primary" onClick={() => move(1)}>下一步</button>}
      </div>
    </footer>
  </Dialog>;
}

const Heading = ({ heading, eyebrow, children }) => <><span className="onboarding-eyebrow">{eyebrow}</span><h3 id="onboarding-heading" ref={heading} tabIndex={-1}>{children}</h3></>;

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
    <Heading heading={heading} eyebrow="欢迎来到心流小屋">想从哪里听歌？</Heading>
    <p>三步就好：选音源、挑房间、试听一下。每一步都能跳过，以后在「设置」里随时改。</p>
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
    {env.mobile && <p className="onboarding-hint">手机版支持 QQ 音乐 / 网易云登录、本地音乐和后台播放。跨应用桌宠与开机启动可在电脑桌面版使用。</p>}
    {!env.desktop && !env.mobile && <p className="onboarding-hint">你在用网页版：QQ 音乐 / 网易云登录、系统播放器和开机启动需要桌面版。</p>}
  </>;
}

// Optional permissions are no longer a step of their own: the last step lists
// them with a one-tap 允许 and a pointer to where each lives in 设置.
function OptionalPermissions({ state, update, env, player, openSettings }) {
  const items = model.permissionItems(env, state.source);
  const [busy, setBusy] = useState('');
  if (!items.length) return null;
  const ask = async (item) => { setBusy(item.id); const result = await player.requestPermission(item.id); setBusy(''); update(model.setPermission(state, item.id, result)); };
  return <details className="onboarding-optional">
    <summary>可选权限 · {items.map((item) => item.label).join('、')}</summary>
    <ul className="onboarding-permissions">{items.map((item) => { const result = state.permissions[item.id]; return <li key={item.id}>
      <span><strong>{item.label}</strong><small>{result ? PERMISSION_TEXT[result] : item.hint}</small></span>
      {result === 'granted' ? <span className="onboarding-ok"><Check size={14}/>已允许</span>
        : item.id === 'typing' ? <button type="button" className="pixel-button" onClick={() => openSettings?.(PERMISSION_HOME.typing)}>去设置</button>
          : <button type="button" className="pixel-button" disabled={Boolean(busy)} aria-label={`允许 ${item.label}`} onClick={() => ask(item)}>{busy === item.id ? '等待系统…' : '允许'}</button>}
    </li>; })}</ul>
    <small>拒绝也不影响小屋、音乐和专注。之后可在「设置 › 键鼠陪伴 / 专注工具 / 显示与桌面」里随时修改。</small>
  </details>;
}

function RoomStep({ heading, look, petId, onRoomChange, reduceMotion, error }) {
  return <>
    <Heading heading={heading} eyebrow="房间与伙伴">选一个房间，再挑个伙伴</Heading>
    <RoomPickers look={look} petId={petId} onChange={onRoomChange} reduceMotion={reduceMotion} compact/>
    {error && <p role="alert" className="record-error">{error}</p>}
  </>;
}

function TestStep({ heading, state, update, env, player, openMusicSettings }) {
  const [phase, setPhase] = useState(state.tested ? 'answered' : 'idle'), [result, setResult] = useState(null);
  const play = async () => { setPhase('playing'); const next = await player.testPlayback(state.source === 'appleMusic' || state.source === 'system' ? 'auto' : model.providerFor(state.source) || 'auto'); setResult(next); if (!next.ok) { setPhase('answered'); update(model.setTested(state, 'failed')); } else setPhase('ask'); };
  const answer = (value) => { setPhase('answered'); update(model.setTested(state, value)); };
  const s = model.summary(state, env);
  const permissionLabel = (id) => PERMISSION_LABELS[id] || id;
  const permissions = [...s.permissions.map(permissionLabel), ...s.pending.map((id) => `${permissionLabel(id)}（待系统确认）`)];
  return <>
    <Heading heading={heading} eyebrow="最后一步">放一段声音试试</Heading>
    <p>{result?.kind === 'track' ? `会从你选的音源低音量试放几秒${result.title ? `（《${result.title}》）` : ''}。` : '会播放一小段提示音，确认扬声器或耳机有声音。'}</p>
    <div className="onboarding-test">
      <button type="button" className="pixel-button is-primary" disabled={phase === 'playing'} onClick={play}>{phase === 'playing' ? '正在播放…' : state.tested ? '再试一次' : '播放测试'}</button>
      {phase === 'ask' && <span role="group" aria-label="是否听到声音"><button type="button" className="pixel-button" onClick={() => answer('ok')}>听到了</button><button type="button" className="pixel-button" onClick={() => answer('silent')}>没听到</button></span>}
    </div>
    {state.tested === 'ok' && <p className="onboarding-ok" role="status"><Check size={14}/>声音正常，可以开始听歌了。</p>}
    {(state.tested === 'silent' || state.tested === 'failed') && <div className="onboarding-hint" role="status"><p>{result?.error || '没听到声音的话，可以检查：'}</p><ul><li>系统音量和输出设备（耳机 / 扬声器）</li><li>小屋右上角是否静音（按 M 切换）</li><li>平台音源需要登录，部分歌曲受版权限制</li></ul><button type="button" className="onboarding-text" onClick={() => openMusicSettings?.()}>打开音源设置</button></div>}
    <dl className="onboarding-summary"><dt>音源</dt><dd>{s.source}</dd><dt>试听</dt><dd>{state.tested ? s.tested : '还没有试听'}</dd>{permissions.length > 0 && <><dt>权限</dt><dd>{permissions.join('、')}</dd></>}</dl>
    <OptionalPermissions state={state} update={update} env={env} player={player} openSettings={openMusicSettings}/>
  </>;
}
