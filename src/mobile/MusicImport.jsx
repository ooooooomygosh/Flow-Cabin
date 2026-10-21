import React, { useState } from 'react';
import { Music2, Plus } from '../icons';
import { addItem, updateItem } from '../collection-api.mjs';
import { generatedCover, hashString } from '../player/pixel-cover.mjs';
import { pickMobileMusic, rememberMobileAlbum } from './platform.mjs';

export default function MobileMusicImport({ onAdded }) {
  const [albums, setAlbums] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const pick = async () => {
    setBusy(true); setNotice('');
    try {
      const { tracks = [] } = await pickMobileMusic(), grouped = new Map();
      for (const track of tracks) {
        const key = 'android-' + hashString(track.album + '\0' + track.artist).toString(16);
        if (!grouped.has(key)) grouped.set(key, { key, title: track.album, artist: track.artist, year: track.year, cover: track.cover, tracks: [] });
        grouped.get(key).tracks.push(track);
      }
      setAlbums([...grouped.values()].map(album => ({ ...album, tracks: album.tracks.sort((a, b) => Number(a.track || 0) - Number(b.track || 0) || a.name.localeCompare(b.name)) })));
      if (tracks.length) setNotice(`找到 ${tracks.length} 首歌曲。选择专辑放上唱片架。`);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const add = async album => {
    setBusy(true);
    try {
      const mapping = JSON.parse(localStorage.getItem('flow-cabin-android-music-v1') || '{}');
      const all = [...new Map([...(mapping[album.key] || []), ...album.tracks].map(track => [track.uri, track])).values()]
        .sort((a, b) => Number(a.track || 0) - Number(b.track || 0) || a.name.localeCompare(b.name));
      if (all.length > 100) throw new Error('单张专辑最多 100 首，请分批整理为不同专辑。');
      const body = { type: 'album', title: album.title, artist: album.artist, year: album.year, cover: album.cover || generatedCover(album), source: 'android-files', platforms: ['手机音乐'],
        tracks: all.map(track => track.title || track.name), externalIds: { fileAlbum: album.key },
        trackDetails: all.map((track, index) => ({ title: track.title || track.name, trackNumber: index + 1, lengthMillis: Number(track.duration) || 0, source: 'file' })) };
      await rememberMobileAlbum(album.key, all);
      const result = await addItem(body);
      const item = result.duplicate ? (await updateItem(result.item.id, { tracks: body.tracks, trackDetails: body.trackDetails })).item : result.item;
      onAdded(item, result.duplicate); setNotice(`《${album.title}》已保存。重新打开小屋仍可播放；请保留原音乐文件。`);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  return <section className="file-import" aria-label="手机音乐">
    <h3><Music2 size={18}/>手机里的音乐</h3>
    <p className="add-intro">通过系统文件选择器挑选歌曲。小屋只记住所选文件的读取授权，不扫描整部手机，不上传音乐；重新打开仍可播放。原文件移动、删除或云盘离线时，需要重新选择。</p>
    <button type="button" className="pixel-button is-primary" disabled={busy} onClick={pick}><Plus size={18}/>{busy ? '正在整理…' : '选择手机音乐'}</button>
    {notice && <p role="status" className="add-status">{notice}</p>}
    <ul className="add-results">{albums.map(album => <li key={album.key}><img className="add-cover" src={album.cover || generatedCover(album)} alt=""/><span className="add-result-copy"><strong>{album.title}</strong><small>{album.artist} · {album.tracks.length} 首</small></span><button type="button" className="pixel-button" disabled={busy} onClick={() => add(album)}>放上唱片架</button></li>)}</ul>
  </section>;
}
