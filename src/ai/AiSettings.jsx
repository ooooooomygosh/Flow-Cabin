// 设置 › AI（Beta）: bring your own OpenAI-compatible endpoint. Off by default.
import React, { useEffect, useRef, useState } from 'react';
import { writeAi, chatUrl, TONES, CADENCES, TEST_MESSAGES, AI_EVENT } from './ai-model.mjs';
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
  const update = (patch) => { testVersion.current++; writeAi(globalThis.localStorage, { ...settings, ...patch }); window.dispatchEvent(new CustomEvent(AI_EVENT)); setTest({ state: 'idle', text: '' }); };
  const storeKey = async () => {
    if (!keyDraft.trim()) return true;
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
    if (keyDraft.trim() && !(await storeKey())) return;
    if (version !== testVersion.current) return;
    const result = await chat(settings, TEST_MESSAGES, { maxTokens: 8, timeoutMs: 20000 });
    if (version !== testVersion.current) return;
    setTest(result.ok ? { state: 'ok', text: `连接成功：${settings.model} 回复了「${result.text.slice(0, 20)}」。` } : { state: 'error', text: result.error });
  };
  const urlOk = !settings.baseUrl || chatUrl(settings.baseUrl);
  return <div className="hub-rows ai-settings" role="region" aria-label="AI（Beta）">
    <p className="personalization-intro">测试版。接入你自己的 AI（任何 OpenAI 兼容接口，比如 DeepSeek），让小猫回信时更懂你。默认只发送汇总信息：专注分钟、真实播放时长、窗外天气、小猫心情，不发送待办内容或逐条历史。</p>
    <label className="ai-row ai-toggle"><input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })}/> 启用 AI（Beta）</label>
    <fieldset className="ai-fields" disabled={!settings.enabled}>
      <label className="ai-row"><span>接口地址</span><input type="url" inputMode="url" placeholder="https://api.deepseek.com/v1" value={settings.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} aria-invalid={!urlOk}/></label>
      {!urlOk && <p className="ai-note is-error" role="alert">请使用 HTTPS 地址。本机服务可使用 localhost 的 HTTP 地址；不要带账号、查询参数或锚点。</p>}
      {key.stored && key.endpoint !== chatUrl(settings.baseUrl) && <p className="ai-note is-error" role="alert">接口地址已改变。请为这个地址重新保存 Key，旧 Key 不会发给新地址。</p>}
      <label className="ai-row"><span>API Key</span><input type="password" autoComplete="off" spellCheck={false} placeholder={key.stored ? '已保存（输入新的可替换）' : 'sk-…'} value={keyDraft} onChange={(e) => { testVersion.current++; setKeyDraft(e.target.value); setTest({ state: 'idle', text: '' }); }}/>
        {keyDraft.trim() && <button type="button" className="pixel-button is-quiet" disabled={!urlOk} onClick={storeKey}>保存 Key</button>}
        {key.stored && <button type="button" className="pixel-button is-quiet" onClick={() => { testVersion.current++; saveKey(''); setTest({ state: 'idle', text: '' }); }}>清除</button>}</label>
      <p className="ai-note">{desktop ? (key.secure ? 'Key 用系统加密（safeStorage）只存在这台电脑上，请求由桌面版发出。' : '这台电脑没有系统加密，Key 只在本次运行期间保存在内存里。') : 'Key 只存在这个浏览器里。网页版直接从浏览器请求，接口必须允许跨域（CORS）；不支持时请用桌面版。'}</p>
      <label className="ai-row"><span>模型</span><input type="text" placeholder="deepseek-chat" value={settings.model} onChange={(e) => update({ model: e.target.value })}/></label>
      <div className="ai-row"><button type="button" className="pixel-button" disabled={test.state === 'busy' || !settings.baseUrl || !settings.model || !(key.stored || keyDraft.trim())} onClick={runTest}>测试连接</button>
        {test.text && <p className={`ai-note is-${test.state}`} role={test.state === 'error' ? 'alert' : 'status'}>{test.text}</p>}</div>
      <h4 className="ai-sub">小屋来信</h4>
      <div className="ai-row"><span>多久一封</span><Segmented label="来信频率" items={CADENCES} value={settings.cadence} onChange={(cadence) => update({ cadence })}/></div>
      <div className="ai-row"><span>语气</span><Segmented label="来信语气" items={TONES} value={settings.tone} onChange={(tone) => update({ tone })}/></div>
      <label className="ai-row ai-toggle"><input type="checkbox" checked={settings.shareNotes} onChange={(event) => update({ shareNotes: event.target.checked })}/> 允许自动来信参考我的随手记</label>
      <p className="ai-note">默认关闭。打开后，最近一段随手记摘录会随统计发给你配置的 AI 服务；信箱只保存“参考了随手记”的事实标记，不保存原文。关闭 AI 或请求失败时，小屋会用本机数据写一封不联网的信。</p>
      <p className="ai-note">来信都收在「小屋日记 › 信箱」。每{settings.cadence === 'daily' ? '天' : '周'}只写一封，新来信会立起小旗子；你也可以随时主动写信，失败时原稿和本地回信都会保留。</p>
    </fieldset>
  </div>;
}
