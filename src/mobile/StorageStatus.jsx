import React, { useEffect, useState } from 'react';
export default function StorageStatus() {
  const [status, setStatus] = useState(() => window.albumMobile.storageStatus());
  const [notice, setNotice] = useState('');
  const save = async () => { try { await window.albumMobile.retrySave(); setNotice('已保存到这台手机。'); } catch { setNotice('保存未完成，请导出备份，并检查手机剩余空间。'); } setStatus(window.albumMobile.storageStatus()); };
  useEffect(() => { const update = () => setStatus(window.albumMobile.storageStatus()); window.addEventListener('cabin:mobile-notice', update); return () => window.removeEventListener('cabin:mobile-notice', update); }, []);
  return <div className="mobile-storage-note"><strong>这台手机的小屋</strong><p>收藏、房间设置、专注、学习和日记保存在应用内，离线可用，清理缓存不会移除。卸载或清除应用数据会删除这些内容，请先导出备份。</p><small>{status.error ? '有数据等待重新保存' : status.pending ? '正在保存到本机' : '已保存在本机'} · {(status.bytes / 1024 / 1024).toFixed(2)} MB</small><br/><button type="button" className="pixel-button" onClick={save}>重新保存本机数据</button>{notice && <p role="status">{notice}</p>}</div>;
}
