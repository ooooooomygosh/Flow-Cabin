// 设置 › AI（Beta）: bring your own OpenAI-compatible endpoint. Off by default.
import React, { useEffect, useRef, useState } from 'react';
import { writeAi, chatUrl, aiProvider, applyAiProvider, AI_PROVIDERS, TONES, CADENCES, TEST_MESSAGES, AI_EVENT } from './ai-model.mjs';
import { chat, saveKey, saveKeyConfirmed, isDesktopShell } from './ai-transport.mjs';
import { useAiSettings } from './useCabinLetters.js';
import { Segmented } from '../ui/Roving';
import '../focus/stats/focus-stats.css';

export default function AiSettings() {
  const { settings, key } = useAiSettings();
  const [keyDraft, setKeyDraft] = useState(''), [test, setTest] = useState({ state: 'idle', text: '' });
  const testVersion = useRef(0);
  useEffect(() => () => { testVersion.current++; }, []);
  const desktop = isDesktopShell();
  const preset = aiProvider(settings), codex = preset.mode === 'codex', needsKey = preset.requiresKey;
  const deepseek = settings.provider === 'deepseek';
  const replace = (next) => {
    testVersion.current++;
    writeAi(globalThis.localStorage, next);
    window.dispatchEvent(new CustomEvent(AI_EVENT));
    setTest({ state: 'idle', text: '' });
  };
  const update = (patch) => replace({ ...settings, ...patch });
  const chooseProvider = (provider) => {
    setKeyDraft('');
    replace(applyAiProvider(settings, provider));
  };
  const storeKey = async () => {
    if (!needsKey || !keyDraft.trim()) return true;
    const draft = keyDraft, version = testVersion.current;
    const ok = await saveKeyConfirmed(draft, { baseUrl: settings.baseUrl });
    if (version !== testVersion.current) return false;
    if (ok) setKeyDraft('');
    else setTest({ state: 'error', text: 'Key 未保存。请检查接口地址后再试。' });
    return ok;
  };
  const runTest = async () => {
    const version = ++testVersion.current;
    setTest({ state: 'busy', text: '正在连接…' });
    if (needsKey && keyDraft.trim() && !(await storeKey())) return;
    if (version !== testVersion.current) return;
    const result = await chat(settings, TEST_MESSAGES, { maxTokens: 8, timeoutMs: 20000 });
    if (version !== testVersion.current) return;
    const label = codex ? '本机 Codex CLI' : settings.model;
    setTest(result.ok ? { state: 'ok', text: `连接成功：${label} 回复了「${result.text.slice(0, 20)}」。` } : { state: 'error', text: result.error });
  };
  const urlOk = codex || !settings.baseUrl || chatUrl(settings.baseUrl);
  const credentialOk = !needsKey || Boolean(keyDraft.trim()) || Boolean(key.stored && key.endpoint === chatUrl(settings.baseUrl));
  const canTest = test.state !== 'busy' && (codex ? desktop : Boolean(settings.baseUrl && settings.model && urlOk)) && credentialOk;
  return <div className="hub-rows ai-settings" role="region" aria-label="AI（Beta）">
    <p className="personalization-intro">选一个已经配置好的 AI 模板，不用自己拼接口。小屋来信默认只发送汇总信息：专注分钟、真实播放时长、窗外天气、小猫心情；智能唱片机只发送你的计划、约束和唱片架摘要。</p>
    <label className="ai-row ai-toggle"><input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })}/> 启用 AI（Beta）</label>
    <fieldset className="ai-fields" disabled={!settings.enabled}>
      <label className="ai-row"><span>AI 服务</span><select aria-label="AI 服务" value={settings.provider} onChange={(e) => chooseProvider(e.target.value)}>{AI_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      <p className="ai-note">{preset.hint}</p>
      {codex ? <>
        {!desktop && <p className="ai-note is-error" role="alert">本机 Codex CLI 只在桌面版可用。网页版请选择其他模板。</p>}
        <p className="ai-note">桌面版会在临时目录运行 <code>codex exec</code>，使用你在终端里已经登录的 Codex；请求仍按该 CLI 的服务商与账号发出。CLI 的只读沙箱仍可能读取本机文件；请求会按你的 CLI 配置发送给对应服务商。小屋只读取最后一条回答，不保存思考过程、工具输出或会话文件。</p>
      </> : <>
        <label className="ai-row"><span>接口地址</span><input type="url" inputMode="url" placeholder={preset.baseUrl || 'https://…/v1'} value={settings.baseUrl} readOnly={settings.provider !== 'custom'} onChange={(e) => update({ baseUrl: e.target.value })} aria-invalid={!urlOk}/></label>
        {!urlOk && <p className="ai-note is-error" role="alert">请使用 HTTPS 地址。本机服务可使用 localhost 的 HTTP 地址；不要带账号、查询参数或锚点。</p>}
        <label className="ai-row"><span>模型</span><input type="text" placeholder={preset.model || '模型名'} value={settings.model} onChange={(e) => update({ model: e.target.value })}/></label>
        {deepseek && <p className="ai-note">DeepSeek 官方模型是 deepseek-flash。小屋会自动关闭思考模式，避免思考 token 占满输出、让歌单 JSON 变成空内容。</p>}
        {needsKey ? <>
          <label className="ai-row"><span>API Key</span><input type="password" autoComplete="off" spellCheck={false} placeholder={key.stored ? '已保存（输入新的可替换）' : 'sk-…'} value={keyDraft} onChange={(e) => { testVersion.current++; setKeyDraft(e.target.value); setTest({ state: 'idle', text: '' }); }}/>
            {keyDraft.trim() && <button type="button" className="pixel-button is-quiet" disabled={!urlOk} onClick={storeKey}>保存 Key</button>}
            {key.stored && <button type="button" className="pixel-button is-quiet" onClick={() => { testVersion.current++; saveKey(''); setTest({ state: 'idle', text: '' }); }}>清除</button>}</label>
          {key.stored && key.endpoint !== chatUrl(settings.baseUrl) && <p className="ai-note is-error" role="alert">接口地址已改变。请为这个地址重新保存 Key，旧 Key 不会发给新地址。</p>}
          <p className="ai-note">{desktop ? (!key.stored ? '尚未保存 Key，保存时才尝试系统加密。' : key.secure ? 'Key 用系统加密，只存在这台电脑上，请求由桌面版发出。' : '当前 Key 仅保存在本次运行的内存中，退出后需重新填写。') : 'Key 未加密，仅保存在当前标签页的会话中，关闭标签页后需重新填写。网页版直接请求接口，需要接口允许跨域（CORS）；不支持时请用桌面版。'}</p>
        </> : <p className="ai-note">这个模板连接本机服务，不需要 API Key。</p>}
      </>}
      {key.stored && !needsKey && <div className="ai-row"><span>已保存 Key</span>
        <p className="ai-note">当前模板不会使用云端 Key；它仍只绑定原来的接口地址。</p>
        <button type="button" className="pixel-button is-quiet" onClick={() => { testVersion.current++; saveKey(''); setTest({ state: 'idle', text: '' }); }}>清除已保存 Key</button>
      </div>}
      <div className="ai-row"><button type="button" className="pixel-button" disabled={!canTest} onClick={runTest}>测试连接</button>
        {test.text && <p className={`ai-note is-${test.state}`} role={test.state === 'error' ? 'alert' : 'status'}>{test.text}</p>}</div>
      <h4 className="ai-sub">小屋来信</h4>
      <div className="ai-row"><span>多久一封</span><Segmented label="来信频率" items={CADENCES} value={settings.cadence} onChange={(cadence) => update({ cadence })}/></div>
      <div className="ai-row"><span>语气</span><Segmented label="来信语气" items={TONES} value={settings.tone} onChange={(tone) => update({ tone })}/></div>
      <label className="ai-row ai-toggle"><input type="checkbox" checked={settings.shareNotes} onChange={(event) => update({ shareNotes: event.target.checked })}/> 允许自动来信参考我的随手记</label>
      <p className="ai-note">默认关闭。打开后，最近一段随手记摘录会随统计发给你配置的 AI 服务；信箱只保存“参考了随手记”的事实标记，不保存原文。关闭 AI 或请求失败时，小屋会用本机数据写一封不联网的信。</p>
      <p className="ai-note">来信都收在「唱片日记 › 信箱」。每{settings.cadence === 'daily' ? '天' : '周'}只写一封，新来信会立起小旗子；你也可以随时主动写信，失败时原稿和本地回信都会保留。</p>
    </fieldset>
  </div>;
}
