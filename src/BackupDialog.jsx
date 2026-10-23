import React, { useRef, useState } from 'react';
import { Library, Download, FolderOpen } from './icons';
import Dialog from './Dialog';
import { useRecordLibrary } from './RecordLibrary';
import { useFocus } from './focus/useFocus';
import { useStudy } from './study/useStudy';
import { focusStats } from './focus/focus-model.mjs';
import { downloadBlob } from './lib/download.mjs';
import { importItems } from './collection-api.mjs';
import { SOUND_KEY } from './audio/ambience.mjs';
import { useSoundscape } from './audio/useSoundscape';
import { MAX_BACKUP_BYTES, backupFileName, backupReplacements, buildBackup, mergeBackupLibrary, parseBackup, restoreBackupMemory, restoreFocus } from './backup-model.mjs';

const savedSound = () => { try { return JSON.parse(localStorage.getItem(SOUND_KEY)); } catch { return null; } };

// Everything lives on this computer; a backup file moves it to another one.
// Albums merge in right away; anything that would overwrite this computer's own records is asked once, inline.
export default function BackupDialog({ items, close, reload }) {
  const library = useRecordLibrary(), focus = useFocus(), study = useStudy(), soundscape = useSoundscape();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [problems, setProblems] = useState([]), [pending, setPending] = useState(null), picker = useRef(null);
  const stats = focus ? focusStats(focus.state.sessions, Date.now()) : null;
  const mergesMemory = pending?.replacements.some(({ id }) => id === 'memory');
  const exportBackup = async () => {
    setProblems([]); setNotice('');
    try {
      const backup = buildBackup({ items, library: library.data, roomId: library.roomId, focus: focus?.state, study: study?.state, sound: savedSound() });
      await globalThis.albumMobile?.flushStorage();
      const result = await downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), backupFileName());
      if (result?.failed) throw new Error('备份未能导出，请重试。');
      setNotice(result?.cancelled ? '已取消导出。' : globalThis.albumMobile ? '备份已保存到你选择的位置。' : '备份文件已生成。');
    } catch (error) { setProblems([error?.message || '备份导出失败，请重试。']); }
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setNotice(''); setProblems([]); setPending(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件最大 8 MB。');
      const parsed = parseBackup(await file.text()), result = await importItems(parsed.items), warnings = [];
      if (!library.update((old) => mergeBackupLibrary(old, parsed, library.roomId, result.ids))) warnings.push('唱片已导入，但小屋设置保存失败，请检查存储空间');
      await globalThis.albumMobile?.flushStorage();
      await reload();
      const summary = `导入完成：新增 ${result.added} 张唱片，唱片架现在共有 ${result.total} 张。`;
      const replacements = backupReplacements(parsed, { focus: Boolean(focus), study: Boolean(study), sound: Boolean(soundscape?.replaceMix), memory: true });
      setNotice(summary); setProblems(warnings);
      if (replacements.length) setPending({ parsed, replacements, summary, warnings });
    } catch (error) { setProblems([error?.message || '导入失败，请重试。']); }
    finally { setBusy(false); }
  };
  const replace = async () => {
    const { parsed, replacements, summary } = pending, warnings = [...pending.warnings], done = [], merged = [];
    for (const entry of replacements) {
      const { id } = entry, before = warnings.length, label = entry.label.replace(/（.*）$/, '');
      try {
        if (id === 'focus' && !focus.replace(restoreFocus(parsed.focus, focus.state))) warnings.push('专注记录、待办与随手记未能保存，原有内容保持不变');
        if (id === 'study' && !study.replace(parsed.study)) warnings.push('学习记录未能保存');
        if (id === 'sound') soundscape.replaceMix(parsed.sound);
        if (id === 'memory') restoreBackupMemory(parsed);
        if (warnings.length === before) (id === 'memory' ? merged : done).push(label);
      } catch (error) { warnings.push(error?.message || `${label}未能保存，请重试。`); }
    }
    try { await globalThis.albumMobile?.flushStorage(); } catch { warnings.push('本机保存未完成，请保留应用并重试。'); }
    // Report replacements and non-destructive merges separately, after successful writes.
    setPending(null); setNotice(`${summary}${done.length ? ` 已用备份替换${done.join('、')}。` : ''}${merged.length ? ` 已合并${merged.join('、')}，本机已有记忆已保留。` : ''}`); setProblems(warnings);
  };
  const device = globalThis.albumMobile ? '手机' : '电脑';
  const keep = () => { setNotice(`${pending.summary} 这台${device}上的其他记录保持不变。`); setProblems(pending.warnings); setPending(null); };
  return <Dialog title="收藏与备份" icon={<Library size={20}/>} close={close} className="backup-dialog">
    <dl className="backup-stats">
      <div><dt>唱片</dt><dd>{items.length}</dd></div>
      <div><dt>唱片盒</dt><dd>{library.boxes.length}</dd></div>
      <div><dt>专注</dt><dd>{stats ? `${Math.round(stats.totalMinutes / 60 * 10) / 10} 小时` : '—'}</dd></div>
      <div><dt>小鱼干</dt><dd>{focus?.state.rewards.fish ?? '—'}</dd></div>
    </dl>
    <p className="add-intro">唱片、小屋外观、专注与听歌记录、待办、随手记、学习记录、小猫照顾和来信都只保存在这台{device}上。更换设备时导出备份，在新设备上导入即可。备份不包含 API Key 或账户凭据。{globalThis.albumMobile && '备份不包含音乐文件和手机文件授权，换手机后请重新选择原歌曲。'}</p>
    <p className="add-intro">永久删除的手记和往来信只保留编号、删除时间，新备份不含其正文或历史。恢复时删除记录优先：本机或备份中已永久删除的内容不会恢复，纪念物仍保留。外部旧备份不会被擦除；没有删除记录的新小屋仍可从旧备份恢复原文。</p>
    <div className="backup-actions">
      <button type="button" className="pixel-button is-primary" disabled={busy} onClick={exportBackup}><Download size={16}/>导出备份</button>
      <button type="button" className="pixel-button" disabled={busy} onClick={() => picker.current?.click()}><FolderOpen size={16}/>导入备份</button>
      <input ref={picker} type="file" accept=".json,application/json" aria-label="导入备份文件" disabled={busy} onChange={importBackup} hidden/>
    </div>
    {notice && <p className="add-status" role="status">{notice}</p>}
    {problems.length > 0 && <ul className="status is-error" role="alert">{problems.map((text) => <li key={text}>{text}</li>)}</ul>}
    {pending && <div className="backup-replace" role="group" aria-label={mergesMemory ? '恢复本机记录' : '替换本机记录'}>
      {mergesMemory && <p className="add-intro">永久删除记录优先于正文：备份中的删除记录也会移除本机对应的手记或往来信。不会移除已获得的纪念物。</p>}
      <p className="add-intro">备份里还有{pending.replacements.map((entry) => entry.label).join('、')}。{mergesMemory
        ? `小屋记忆会合并并保留本机记录${pending.replacements.some(({ id }) => id !== 'memory') ? '，其他列出的内容会被备份替换' : ''}。要继续恢复吗？`
        : `要用备份替换这台${device}上的这些内容吗？`}</p>
      <div className="backup-actions">
        <button type="button" className="pixel-button is-primary" onClick={replace}>{mergesMemory ? '恢复这些内容' : '替换这些内容'}</button>
        <button type="button" className="pixel-button" onClick={keep}>保留现有</button>
      </div>
    </div>}
  </Dialog>;
}
