import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Check, Music2, Sparkles, Loading } from '../icons';
import { addItem } from '../collection-api.mjs';
import { AUDIO_EXTENSIONS, TAG_READ_BYTES, groupAlbums, readTags } from './audio-tags.mjs';
import { generatedCover, pixelCover, hashString } from './pixel-cover.mjs';
import { registerSessionAlbum } from './session-files.mjs';
import './player.css';

const MAX_FILES = 2000;
// The file-import identity (externalIds.fileAlbum); not the album wall's key.
const fileAlbumKey = (album) => 'f' + hashString(`${album.title}\u0000${album.artist}`.toLowerCase()).toString(16);
async function readFileTags(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    // ID3 declares its own size: read exactly the tag (cover art included), capped.
    const id3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33 ? ((head[6] & 0x7f) << 21 | (head[7] & 0x7f) << 14 | (head[8] & 0x7f) << 7 | (head[9] & 0x7f)) + 10 : 0;
    return readTags(new Uint8Array(await file.slice(0, Math.min(TAG_READ_BYTES, id3 || 512 * 1024)).arrayBuffer()));
  } catch { return {}; }
}
function readDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio(), url = URL.createObjectURL(file), done = (value) => { URL.revokeObjectURL(url); audio.removeAttribute('src'); resolve(value); };
    const timer = setTimeout(() => done(0), 4000);
    audio.preload = 'metadata'; audio.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(audio.duration) ? audio.duration : 0); }; audio.onerror = () => { clearTimeout(timer); done(0); };
    audio.src = url;
  });
}
const pictureUrl = (picture) => picture ? URL.createObjectURL(new Blob([picture.data], { type: picture.mime })) : '';
// Embedded art as a bounded JPEG data URL (collection limit is 400 KB).
async function compactCover(src) {
  const image = await createImageBitmap(await (await fetch(src)).blob()), side = Math.min(image.width, image.height), size = Math.min(600, side);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size); image.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}

// Pick audio files or a folder in the page: tags are read here, files stay in
// place and play for this session only. Nothing is uploaded or copied.
export default function FileImport({ items = [], onAdded, desktop = false }) {
  const [albums, setAlbums] = useState([]), [status, setStatus] = useState(''), [busy, setBusy] = useState(''), [pixel, setPixel] = useState(true);
  const filesInput = useRef(null), folderInput = useRef(null), urls = useRef([]), generation = useRef(0);
  // A new pick (or unmount) frees the previous pick's cover URLs and stops its tag / preview loop.
  const reset = () => { generation.current++; urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = []; return generation.current; };
  useEffect(() => reset, []);
  useEffect(() => { folderInput.current?.setAttribute('webkitdirectory', ''); }, []);
  const existing = new Set(items.map((item) => item.externalIds?.fileAlbum).filter(Boolean));
  const pick = async (list) => {
    const files = [...(list || [])].filter((file) => AUDIO_EXTENSIONS.test(file.name) || file.type.startsWith('audio/')).slice(0, MAX_FILES);
    if (!files.length) { reset(); setAlbums([]); setStatus('没有找到音乐文件。支持 MP3、FLAC、M4A、OGG、WAV 等格式。'); return; }
    const run = reset(), stale = () => run !== generation.current;
    setStatus(`正在读取 ${files.length} 首歌曲的标签…`); setAlbums([]);
    const tagged = [];
    for (const [index, file] of files.entries()) {
      const tags = await readFileTags(file); if (stale()) return;
      tagged.push({ file, name: file.name, path: file.webkitRelativePath || file.name, tags });
      if (index % 25 === 24) setStatus(`正在读取标签… ${index + 1} / ${files.length}`);
    }
    const grouped = groupAlbums(tagged).map((album) => { const art = pictureUrl(album.picture); if (art) urls.current.push(art); return { ...album, key: fileAlbumKey(album), art, preview: '' }; });
    setAlbums(grouped);
    setStatus(`找到 ${grouped.length} 张专辑、${files.length} 首歌曲。${files.length >= MAX_FILES ? `一次最多读取 ${MAX_FILES} 首。` : ''}`);
    // Previews: pixel covers in the cabin palette, generated in the background.
    for (const album of grouped) {
      const result = await pixelCover(album, { source: album.art }).catch(() => ({ cover: generatedCover(album) })); if (stale()) return;
      setAlbums((list) => list.map((entry) => entry.key === album.key ? { ...entry, preview: result.cover, method: result.method } : entry));
    }
  };
  const add = async (album) => {
    setBusy(album.key); setStatus('');
    try {
      const tracks = album.tracks.slice(0, 100);
      const durations = await Promise.all(tracks.map((track) => track.duration ? track.duration : readDuration(track.file)));
      const cover = pixel ? album.preview || generatedCover(album) : album.art ? await compactCover(album.art) : generatedCover(album);
      const result = await addItem({ type: 'album', title: album.title, artist: album.artist, year: album.year, genre: album.genre, cover, source: 'local-files', label: '本地文件', platforms: ['本地文件'],
        tracks: tracks.map((track) => track.title), externalIds: { fileAlbum: album.key },
        trackDetails: tracks.map((track, index) => ({ title: track.title, trackNumber: track.track || index + 1, lengthMillis: Math.round((durations[index] || 0) * 1000), source: 'file' })) });
      registerSessionAlbum(album.key, tracks.map((track) => track.file));
      onAdded(result.item, result.duplicate);
      if (result.duplicate) setStatus(`《${album.title}》已经在唱片架上，这次选的文件已重新连上，可以直接播放。`);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(''); }
  };
  return <section className="file-import" aria-label="从文件导入">
    <h3><Music2 size={16}/>直接选择音乐文件</h3>
    <p className="add-intro">读取文件里的专辑、歌手、曲序和封面，自动做成小屋风格的像素封面。文件留在原位，不上传。{desktop ? '这样导入的歌曲只在本次打开期间可播放；想一直能播，请用上面的「添加音乐文件夹」。' : '浏览器无法长期记住文件位置，重新打开后需要再选一次。'}</p>
    <div className="add-local-actions">
      <button type="button" className="pixel-button" onClick={() => folderInput.current?.click()}><FolderOpen size={16}/>选择文件夹</button>
      <button type="button" className="pixel-button" onClick={() => filesInput.current?.click()}><Plus size={16}/>选择音乐文件</button>
      <label className="file-import-toggle"><input type="checkbox" checked={pixel} onChange={(event) => setPixel(event.target.checked)}/><Sparkles size={14}/>像素风封面</label>
      <input ref={filesInput} type="file" accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wav" multiple hidden aria-label="选择音乐文件" onChange={(event) => { pick(event.target.files); event.target.value = ''; }}/>
      <input ref={folderInput} type="file" multiple hidden aria-label="选择音乐文件夹" onChange={(event) => { pick(event.target.files); event.target.value = ''; }}/>
    </div>
    {status && <p className="add-status" role="status">{status}</p>}
    {albums.length > 0 && <ul className="add-results" aria-label="文件中的专辑">{albums.map((album) => {
      const done = existing.has(album.key) && busy !== album.key;
      const shown = pixel ? album.preview : album.art || album.preview;
      return <li key={album.key}>
        {shown ? <img className={`add-cover ${pixel ? 'file-import-pixel' : ''}`} src={shown} alt={`${album.title} 封面`} width="72" height="72"/> : <span className="add-cover add-cover-empty" aria-hidden="true"><Loading size={22} className="player-spin"/></span>}
        <span className="add-result-copy"><strong title={album.title}>{album.title}</strong><small>{album.artist} · {album.tracks.length} 首{album.year ? ' · ' + album.year : ''}</small><small className="add-source">{pixel ? album.method === 'pixelated' ? '像素化原封面' : '按专辑名生成的像素封面' : album.art ? '文件内封面' : '没有内嵌封面，用像素封面'}</small></span>
        <button type="button" className={`pixel-button ${done ? '' : 'is-primary'}`} disabled={busy === album.key} onClick={() => add(album)}>{busy === album.key ? '放上中…' : done ? <><Check size={15}/>重新连上文件</> : <><Plus size={15}/>放上唱片架</>}</button>
      </li>;
    })}</ul>}
  </section>;
}
