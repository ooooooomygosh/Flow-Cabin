import React from 'react';
import Dialog from '../Dialog';
import { Sparkles } from '../icons';
import './onboarding.css';

// 新功能: the one-screen summary shown once after an update (and from
// 设置 › 关于). It never walks through settings; closing it in any way means
// "seen". `copy` is onboarding-model's updateContext(): { fromVersion,
// toVersion, releases } with the newest release first. `history` is the
// 关于 page's copy: the same sheet, without the "while you were away" line.
export default function WhatsNew({ copy, close, openSettings, history = false }) {
  const [latest, ...older] = copy.releases;
  const toVersion = copy.toVersion || latest?.version || '';
  const span = copy.fromVersion && copy.fromVersion !== toVersion ? `v${copy.fromVersion} → v${toVersion}` : `v${toVersion}`;
  return <Dialog title="新功能" label="新功能" icon={<Sparkles size={16}/>} close={close} className="onboarding whats-new" size="md" initialFocus=".whats-new-ok">
    <span className="onboarding-eyebrow">{span}</span>
    <h3 className="whats-new-title">{latest ? latest.title : `小屋已经更新到 ${toVersion}`}</h3>
    {!history && older.length > 0 && <p className="whats-new-gap">你离开的这段时间，小屋更新了 {copy.releases.length} 个版本。</p>}
    {latest ? <ul className="whats-new-list">{latest.items.map((item) => <li key={item}>{item}</li>)}</ul>
      : <p className="whats-new-gap">这个版本没有单独的更新摘要，你的收藏、设置和记录都保持原样。</p>}
    {older.length > 0 && <details className="whats-new-older">
      <summary>{history ? '版本历史' : '更早的更新'} · {older.length} 个版本</summary>
      <div className="onboarding-releases">{older.map((release) => <article key={release.version} className="onboarding-release">
        <header><span>v{release.version}</span><strong>{release.title}</strong></header>
        <ul>{release.items.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>)}</div>
    </details>}
    <footer className="onboarding-footer">
      {openSettings ? <button type="button" className="onboarding-text" onClick={() => openSettings('music')}>检查音源与权限</button> : <span/>}
      <small>{openSettings ? '关掉后，这个版本不会再提示。' : `当前版本 v${toVersion}`}</small>
      <div><button type="button" className="pixel-button is-primary whats-new-ok" onClick={close}>知道了</button></div>
    </footer>
  </Dialog>;
}
