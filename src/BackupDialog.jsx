import React, { useState } from 'react';
import { Library, Download, FolderOpen } from './icons';
import Dialog from './Dialog';
import { useRecordLibrary } from './RecordLibrary';
import { normalizeLibrary } from './record-library.mjs';
import { useFocus } from './focus/useFocus';
import { useStudy } from './study/useStudy';
import { normalizeStudy } from './study/study-model.mjs';
import { focusStats } from './focus/focus-model.mjs';
import { downloadBlob } from './album-wall-canvas.mjs';
import { importItems } from './collection-api.mjs';
import { SOUND_KEY } from './audio/ambience.mjs';
import { useSoundscape } from './audio/useSoundscape';
import { backupFocus, restoreFocus } from './backup-model.mjs';

// Everything lives on this computer; a backup file moves it to another one.
export default function BackupDialog({ items, close, reload }) {
  const library = useRecordLibrary(), focus = useFocus(), study = useStudy(), soundscape = useSoundscape();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const stats = focus ? focusStats(focus.state.sessions, Date.now()) : null;
  const exportBackup = () => {
    let sound = null; try { sound = JSON.parse(localStorage.getItem(SOUND_KEY)); } catch {}
    const backup = { kind: 'FlowCabinBackup', version: 2, exportedAt: new Date().toISOString(), items, library: library.data, focus: focus ? backupFocus(focus.state) : null, study: study?.state || null, sound };
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `FlowCabin-backup-${day}.json`);
    setNotice('备份文件已生成。');
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setNotice('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('备份文件最大 8 MB。');
      const data = JSON.parse(await file.text());
      // Earlier releases exported "AlbumCircleCollection" files with the same fields.
      if (!['FlowCabinBackup', 'AlbumCircleCollection'].includes(data.kind) || !Array.isArray(data.items)) throw new Error('请选择心流小屋导出的备份文件。');
      const result = await importItems(data.items);
      const source = normalizeLibrary(data.library), roomId = library.roomId, sourceRoom = source.rooms[data.roomId || roomId] || source.rooms[roomId];
      const librarySaved = library.update((old) => ({ ...old, styles: { ...old.styles, ...source.styles }, genres: { ...old.genres, ...source.genres }, rooms: sourceRoom ? { ...old.rooms, [roomId]: { ...(old.rooms[roomId] || {}), ...sourceRoom } } : old.rooms }));
      const warnings = [];
      if (!librarySaved) warnings.push('唱片已导入，但小屋设置保存失败，请检查存储空间');
      if (data.focus && focus && window.confirm('备份里包含专注记录、待办与随手记。要替换这台电脑上的这些内容吗？')) { if (!focus.replace(restoreFocus(data.focus, focus.state))) warnings.push('专注记录、待办与随手记未能保存，原有内容保持不变'); }
      const savedStudy = data.study ? normalizeStudy(data.study) : null;
      if (savedStudy && study && (savedStudy.decks.length || savedStudy.countdowns.length) && window.confirm(`备份里有 ${savedStudy.decks.length} 个卡组、${savedStudy.cards.length} 张闪卡和 ${savedStudy.countdowns.length} 个倒计时。要替换这台电脑上的学习记录吗？`)) { if (!study.replace(savedStudy)) warnings.push('学习记录未能保存'); }
      if (data.sound && soundscape?.replaceMix) {
        try { soundscape.replaceMix(data.sound); } catch { warnings.push('声音设置未能保存'); }
      }
      await reload();
      setNotice(`导入完成：新增 ${result.added} 张唱片，唱片架现在共有 ${result.total} 张。${warnings.length ? ' 注意：' + warnings.join('；') : ''}`);
    } catch (error) { setNotice(error instanceof SyntaxError ? '文件内容无法读取。' : error.message); }
    finally { setBusy(false); }
  };
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
      <label className={`pixel-button ${busy ? 'is-disabled' : ''}`}><FolderOpen size={16}/>导入备份<input type="file" accept=".json,application/json" aria-label="导入备份文件" disabled={busy} onChange={importBackup} hidden/></label>
    </div>
    {notice && <p className="add-status" role="status">{notice}</p>}
  </Dialog>;
}
