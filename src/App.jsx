import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from './icons';
import { isNewCabin } from './onboarding/onboarding-model.mjs';
import CabinRoom from './CabinRoom';
import AddAlbum from './AddAlbum';
import RecordCard from './RecordCard';
import BackupDialog from './BackupDialog';
import AlbumWall from './AlbumWall';
import CompanionBridge from './CompanionBridge';
import PixelCat from './pet/PixelCat';
import { DesktopControls } from './desktop-client';
import { RecordLibraryProvider } from './RecordLibrary';
import { FocusProvider } from './focus/useFocus';
import { StudyProvider } from './study/useStudy';
import { SoundscapeProvider } from './audio/useSoundscape';
import { listItems, removeItem } from './collection-api.mjs';

// Stable identifiers keep vinyl styles, crates and focus records saved by
// earlier releases attached to this computer's collection.
const OWNER = 'local-owner', ROOM = 'local-room';

// notify(text) confirms quietly for 3.2 s; notify(text, { tone: 'error' }) is an alert that stays 6 s.
function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 3200); return () => clearTimeout(timer); }, [toast]);
  return [toast, useCallback((text, { tone = '' } = {}) => setToast({ text, tone, at: Date.now() }), [])];
}

export default function App() {
  const [firstVisit] = useState(() => isNewCabin(localStorage));
  const [hubRequest, setHubRequest] = useState(null);
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [adding, setAdding] = useState(null), [recordId, setRecordId] = useState(''), [backup, setBackup] = useState(false), [wall, setWall] = useState(false);
  const [toast, notify] = useToast();
  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await listItems()); setError(''); } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    // "收藏这张" on the turntable searches the catalog for the playing album.
    const receive = (event) => setAdding({ query: String(event.detail?.query || '').slice(0, 200) });
    window.addEventListener('album-quick-search', receive); return () => window.removeEventListener('album-quick-search', receive);
  }, []);
  const addToShelf = useCallback((item) => setItems((list) => [item, ...list.filter((entry) => entry.id !== item.id)]), []);
  const record = items.find((item) => item.id === recordId);
  const replaceItem = (item) => setItems((list) => list.map((entry) => entry.id === item.id ? item : entry));
  const remove = async (item) => {
    try { await removeItem(item.id); setRecordId(''); setItems((list) => list.filter((entry) => entry.id !== item.id)); notify(`《${item.title}》已从唱片架移除。`); }
    catch (cause) { notify(cause.message, { tone: 'error' }); }
  };
  return <RecordLibraryProvider userId={OWNER} roomId={ROOM}><FocusProvider userId={OWNER}><StudyProvider userId={OWNER}><SoundscapeProvider>
    <CompanionBridge/>
    <div className="app">
      <header className="app-titlebar">
        <div className="app-brand"><PixelCat pose="idle" accessory="headphones" className="app-brand-cat" label="心流小屋"/><span><strong>心流小屋</strong><small>{loading ? '整理唱片中…' : `${items.length} 张唱片`}</small></span></div>
        <div className="app-actions">
          <button type="button" className="pixel-button is-primary" aria-label="添加到唱片架" title="曲库搜索、我的歌单、本地音乐或手动填写" onClick={() => setAdding({ query: '' })}><Plus size={17}/><span>添加到唱片架</span></button>
        </div>
        <DesktopControls onSettings={() => setHubRequest({ section: 'music', at: Date.now() })} onError={(text) => notify(text, { tone: 'error' })}/>
      </header>
      <main className="app-cabin">
        {error && <p className="app-error" role="alert">{error}<button type="button" disabled={loading} onClick={reload}>{loading ? '正在重试…' : '重试'}</button></p>}
        <CabinRoom items={items} loading={loading} loadError={error} firstVisit={firstVisit} hubRequest={hubRequest} openBackup={() => setBackup(true)} openWall={() => setWall(true)} notify={notify} openRecord={setRecordId} openAdd={(query = '') => setAdding({ query })}/>
      </main>
      {toast && <p className={`app-toast ${toast.tone === 'error' ? 'is-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.at}>{toast.text}</p>}
    </div>
    {adding && <AddAlbum items={items} initialQuery={adding.query} initialTab={adding.tab} close={() => setAdding(null)} onAdded={addToShelf}/>}
    {record && <RecordCard key={record.id} item={record} close={() => setRecordId('')} onChanged={replaceItem} onRemove={remove}/>}
    {backup && <BackupDialog items={items} reload={reload} close={() => setBackup(false)}/>}
    {wall && <AlbumWall items={items} onClose={() => setWall(false)}/>}
  </SoundscapeProvider></StudyProvider></FocusProvider></RecordLibraryProvider>;
}
