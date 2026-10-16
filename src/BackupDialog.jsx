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
import { MAX_BACKUP_BYTES, backupFileName, backupReplacements, buildBackup, mergeBackupLibrary, parseBackup, restoreFocus } from './backup-model.mjs';

const savedSound = () => { try { return JSON.parse(localStorage.getItem(SOUND_KEY)); } catch { return null; } };
const withWarnings = (text, warnings) => text + (warnings.length ? ' 注意：' + warnings.join('；') : '');

// Everything lives on this computer; a backup file moves it to another one.
// Albums merge in right away; anything that would overwrite this computer's own records is asked once, inline.
export default function BackupDialog({ items, close, reload }) {
  const library = useRecordLibrary(), focus = useFocus(), study = useStudy(), soundscape = useSoundscape();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [pending, setPending] = useState(null), picker = useRef(null);
  const stats = focus ? focusStats(focus.state.sessions, Date.now()) : null;
  const exportBackup = () => {
    const backup = buildBackup({ items, library: library.data, focus: focus?.state, study: study?.state, sound: savedSound() });
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), backupFileName());
    setNotice('备份文件已生成。');
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setNotice(''); setPending(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件最大 8 MB。');
      const parsed = parseBackup(await file.text()), result = await importItems(parsed.items), warnings = [];
      if (!library.update((old) => mergeBackupLibrary(old, parsed, library.roomId, result.ids))) warnings.push('唱片已导入，但小屋设置保存失败，请检查存储空间');
      await reload();
      const summary = `导入完成：新增 ${result.added} 张唱片，唱片架现在共有 ${result.total} 张。`;
      const replacements = backupReplacements(parsed, { focus: Boolean(focus), study: Boolean(study), sound: Boolean(soundscape?.replaceMix) });
      setNotice(withWarnings(summary, warnings));
      if (replacements.length) setPending({ parsed, replacements, summary, warnings });
    } catch (error) { setNotice(error.message || '导入失败，请重试。'); }
    finally { setBusy(false); }
  };
  const replace = () => {
    const { parsed, replacements, summary } = pending, warnings = [...pending.warnings];
    for (const { id } of replacements) {
      if (id === 'focus' && !focus.replace(restoreFocus(parsed.focus, focus.state))) warnings.push('专注记录、待办与随手记未能保存，原有内容保持不变');
      if (id === 'study' && !study.replace(parsed.study)) warnings.push('学习记录未能保存');
      if (id === 'sound') { try { soundscape.replaceMix(parsed.sound); } catch { warnings.push('声音设置未能保存'); } }
    }
    setPending(null); setNotice(withWarnings(`${summary} 已用备份替换${replacements.map((entry) => entry.label.replace(/（.*）$/, '')).join('、')}。`, warnings));
  };
  const keep = () => { setNotice(withWarnings(`${pending.summary} 这台电脑上的其他记录保持不变。`, pending.warnings)); setPending(null); };
  return <Dialog title="收藏与备份" icon={<Library size={20}/>} close={close} className="backup-dialog">
    <dl className="backup-stats">
      <div><dt>唱片</dt><dd>{items.length}</dd></div>
      <div><dt>唱片盒</dt><dd>{library.boxes.length}</dd></div>
      <div><dt>专注</dt><dd>{stats ? `${Math.round(stats.totalMinutes / 60 * 10) / 10} 小时` : '—'}</dd></div>
      <div><dt>小鱼干</dt><dd>{focus?.state.rewards.fish ?? '—'}</dd></div>
    </dl>
    <p className="add-intro">唱片、黑胶外观、唱片盒、专注记录、待办和随手记都只保存在这台电脑上，不需要注册。换电脑时导出备份，在新电脑上导入即可。</p>
    <div className="backup-actions">
      <button type="button" className="pixel-button is-primary" disabled={busy} onClick={exportBackup}><Download size={16}/>导出备份</button>
      <button type="button" className="pixel-button" disabled={busy} onClick={() => picker.current?.click()}><FolderOpen size={16}/>导入备份</button>
      <input ref={picker} type="file" accept=".json,application/json" aria-label="导入备份文件" disabled={busy} onChange={importBackup} hidden/>
    </div>
    {notice && <p className="add-status" role="status">{notice}</p>}
    {pending && <div className="backup-replace" role="group" aria-label="替换本机记录">
      <p className="add-intro">备份里还有{pending.replacements.map((entry) => entry.label).join('、')}。要用备份替换这台电脑上的这些内容吗？</p>
      <div className="backup-actions">
        <button type="button" className="pixel-button is-primary" onClick={replace}>替换这些内容</button>
        <button type="button" className="pixel-button" onClick={keep}>保留现有</button>
      </div>
    </div>}
  </Dialog>;
}
