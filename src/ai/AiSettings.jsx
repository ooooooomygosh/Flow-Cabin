// 设置 › AI（Beta）: bring your own OpenAI-compatible endpoint. Off by default.
import React, { useState } from 'react';
import { writeAi, chatUrl, TONES, CADENCES, TEST_MESSAGES, AI_EVENT } from './ai-model.mjs';
import { chat, saveKey, isDesktopShell } from './ai-transport.mjs';
import { useAiSettings } from './useCabinLetters.js';
import { Segmented } from '../ui/Roving';
import '../focus/stats/focus-stats.css';

export default function AiSettings() {
  const { settings, key } = useAiSettings();
  const [keyDraft, setKeyDraft] = useState(''), [test, setTest] = useState({ state: 'idle', text: '' });
  const desktop = isDesktopShell();
  const update = (patch) => { writeAi(globalThis.localStorage, { ...settings, ...patch }); window.dispatchEvent(new CustomEvent(AI_EVENT)); setTest({ state: 'idle', text: '' }); };
  const storeKey = () => { if (!keyDraft.trim()) return; saveKey(keyDraft); setKeyDraft(''); };
  const runTest = async () => {
    if (keyDraft.trim()) storeKey();
    setTest({ state: 'busy', text: '正在连接…' });
    // Give the desktop shell a moment to store a just-typed key.
    if (keyDraft.trim() && desktop) await new Promise((r) => setTimeout(r, 300));
    const result = await chat(settings, TEST_MESSAGES, { maxTokens: 8, timeoutMs: 20000 });
    setTest(result.ok ? { state: 'ok', text: `连接成功：${settings.model} 回复了「${result.text.slice(0, 20)}」。` } : { state: 'error', text: result.error });
  };
  const urlOk = !settings.baseUrl || chatUrl(settings.baseUrl);
  return <div className="hub-rows ai-settings" role="region" aria-label="AI（Beta）">
    <p className="personalization-intro">测试版。接入你自己的 AI（任何 OpenAI 兼容接口，比如 DeepSeek），让小猫根据你的专注统计给你写信。只发送汇总数字（专注分钟、次数、常听专辑、小猫心情），不发送待办内容和历史记录。</p>
    <label className="ai-row ai-toggle"><input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })}/> 启用 AI（Beta）</label>
    <fieldset className="ai-fields" disabled={!settings.enabled}>
      <label className="ai-row"><span>接口地址</span><input type="url" inputMode="url" placeholder="https://api.deepseek.com/v1" value={settings.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} aria-invalid={!urlOk}/></label>
      {!urlOk && <p className="ai-note is-error" role="alert">接口地址需要以 http:// 或 https:// 开头。</p>}
      <label className="ai-row"><span>API Key</span><input type="password" autoComplete="off" spellCheck={false} placeholder={key.stored ? '已保存（输入新的可替换）' : 'sk-…'} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} onBlur={storeKey}/>
        {key.stored && <button type="button" className="pixel-button is-quiet" onClick={() => saveKey('')}>清除</button>}</label>
      <p className="ai-note">{desktop ? (key.secure ? 'Key 用系统加密（safeStorage）只存在这台电脑上，请求由桌面版发出。' : '这台电脑没有系统加密，Key 只在本次运行期间保存在内存里。') : 'Key 只存在这个浏览器里。网页版直接从浏览器请求，接口必须允许跨域（CORS）；不支持时请用桌面版。'}</p>
      <label className="ai-row"><span>模型</span><input type="text" placeholder="deepseek-chat" value={settings.model} onChange={(e) => update({ model: e.target.value })}/></label>
      <div className="ai-row"><button type="button" className="pixel-button" disabled={test.state === 'busy' || !settings.baseUrl || !settings.model || !(key.stored || keyDraft.trim())} onClick={runTest}>测试连接</button>
        {test.text && <p className={`ai-note is-${test.state}`} role={test.state === 'error' ? 'alert' : 'status'}>{test.text}</p>}</div>
      <h4 className="ai-sub">小屋来信</h4>
      <div className="ai-row"><span>多久一封</span><Segmented label="来信频率" items={CADENCES} value={settings.cadence} onChange={(cadence) => update({ cadence })}/></div>
      <div className="ai-row"><span>语气</span><Segmented label="来信语气" items={TONES} value={settings.tone} onChange={(tone) => update({ tone })}/></div>
      <p className="ai-note">每{settings.cadence === 'daily' ? '天' : '周'}只写一封，放在小屋日记 › 周报的「小屋来信」里，信箱会立起小旗子。AI 关闭或失败时，那里仍是小屋自己写的信。</p>
    </fieldset>
  </div>;
}
