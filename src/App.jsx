import { prepareDataUpgrade } from './backup/upgrade.mjs';
import { startLanBridge } from './sync/storage.mjs';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { isNewCabin } from './onboarding/onboarding-model.mjs';
const CabinRoom = lazy(() => import('./CabinRoom'));
import ClassicCabinRoom from './ClassicCabinRoom';
import { ClassicTitlebar, InterfaceDialog } from './InterfaceMode';
import { interfaceMode } from './interface-mode.mjs';
import AddAlbum from './AddAlbum';
import RecordCard from './RecordCard';
import BackupDialog from './BackupDialog';
import AlbumWall from './AlbumWall';
import CompanionBridge from './CompanionBridge';
import { RecordLibraryProvider } from './RecordLibrary';
import { FocusProvider } from './focus/useFocus';
import { StudyProvider } from './study/useStudy';
import { SoundscapeProvider } from './audio/useSoundscape';
import { addItem, importItems, listItems, removeItem } from './collection-api.mjs';
import { useToasts, ToastStack } from './ui/Toasts';
import ShortcutSheet from './ui/ShortcutSheet';

// Stable identifiers keep vinyl styles, crates and focus records saved by
// earlier releases attached to this computer's collection.
const OWNER = 'local-owner', ROOM = 'local-room';

export default function App() {
  const [firstVisit] = useState(() => isNewCabin(localStorage));
  const [hubRequest, setHubRequest] = useState(null);
  const [mode] = useState(interfaceMode), [interfaceOpen, setInterfaceOpen] = useState(false);
  const Room = mode === 'beta' ? CabinRoom : ClassicCabinRoom;
  useEffect(() => { const open = () => setInterfaceOpen(true);window.addEventListener('cabin:interface-choice',open);return () => window.removeEventListener('cabin:interface-choice',open); }, []);
  const [prepared,setPrepared] = useState(false), [upgradeError,setUpgradeError] = useState(''), [upgradeRetry,setUpgradeRetry] = useState(0);
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [adding, setAdding] = useState(null), [recordId, setRecordId] = useState(''), [backup, setBackup] = useState(false), [wall, setWall] = useState(false);
  const [toasts, notify, dismissToast] = useToasts();
  useEffect(() => { if (prepared && (window.albumMobile?.syncRequest || window.albumDesktopCapabilities?.lanSync)) return startLanBridge({onError:error=>{window.cabinSyncError=error.message;}}); }, [prepared]);
  useEffect(() => { const notice = event => notify(event.detail, { tone: event.detail.includes('未完成') ? 'error' : '' }); window.addEventListener('cabin:mobile-notice', notice); return () => window.removeEventListener('cabin:mobile-notice', notice); }, [notify]);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await listItems()); setError(''); } catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); window.addEventListener('cabin:collection-changed',reload);return()=>window.removeEventListener('cabin:collection-changed',reload); }, [reload]);
  useEffect(() => {
    // "收藏这张" on the turntable searches the catalog for the playing album.
    const receive = (event) => setAdding({ query: String(event.detail?.query || '').slice(0, 200) });
    window.addEventListener('album-quick-search', receive); return () => window.removeEventListener('album-quick-search', receive);
  }, []);
  const addToShelf = useCallback((item) => setItems((list) => [item, ...list.filter((entry) => entry.id !== item.id)]), []);
  const saveToShelf = useCallback(async (item) => {
    const result = await addItem(item);
    addToShelf(result.item);
    return result;
  }, [addToShelf]);
  useEffect(() => { if (loading || error || prepared) return; let active = true; prepareDataUpgrade(items).then(()=>{if(active)setPrepared(true);}).catch(e=>{if(active)setUpgradeError(e.message);});return()=>{active=false;}; }, [loading,error,prepared,upgradeRetry]);
  const record = items.find((item) => item.id === recordId);
  const replaceItem = (item) => setItems((list) => list.map((entry) => entry.id === item.id ? item : entry));
  const remove = async (item) => {
    try {
      await removeItem(item.id); setRecordId(''); setItems((list) => list.filter((entry) => entry.id !== item.id));
      // Undo re-imports the same record under its original id, so styles and crates stay attached.
      notify(`《${item.title}》已从唱片架移除。`, { action: { label: '撤销', run: () => importItems([item]).then(reload).catch((cause) => notify(cause.message, { tone: 'error' })) } });
    }
    catch (cause) { notify(cause.message, { tone: 'error' }); }
  };
  if (!prepared) return <main className="app app-startup"><section aria-label="准备小屋"><small>心流小屋 · FLOW CABIN</small><h1>{loading ? '正在读取唱片…' : error ? '收藏暂时没有读到' : upgradeError ? '恢复点还没有保存' : '正在准备小屋…'}</h1>{loading || (!error && !upgradeError) ? <p role="status">{loading ? error ? '正在重新读取唱片…' : '正在取回你的收藏。' : '正在保存更新前的恢复点。'}</p> : null}{(upgradeError||error)&&<div className="app-startup-error" role="alert"><p>{error || upgradeError}</p><button type="button" className="pixel-button" disabled={loading} onClick={()=>{setUpgradeError('');setUpgradeRetry(v=>v+1);if(error)reload();}}>{loading ? '正在重试…' : error ? '重试' : '重试保存恢复点'}</button></div>}</section></main>;
  return <RecordLibraryProvider userId={OWNER} roomId={ROOM}><FocusProvider userId={OWNER} notify={notify}><StudyProvider userId={OWNER}><SoundscapeProvider>
    <CompanionBridge/>
    <div className="app" data-interface={mode}>
      {mode === 'classic' && <ClassicTitlebar items={items} loading={loading} onAdd={() => setAdding({query:''})} onWall={() => setWall(true)} onBeta={() => setInterfaceOpen(true)} onSettings={() => setHubRequest({section:'music',at:Date.now()})} notify={notify}/>}
      <main className="app-cabin">
        {error && <p className="app-error" role="alert">{error}<button type="button" disabled={loading} onClick={reload}>{loading ? '正在重试…' : '重试'}</button></p>}
        <Suspense fallback={<p role="status">正在打开小屋…</p>}><Room items={items} loading={loading} loadError={error} reload={reload} firstVisit={firstVisit} hubRequest={hubRequest} openBackup={() => setBackup(true)} openWall={() => setWall(true)} notify={notify} openRecord={setRecordId} openAdd={(query = '', tab) => setAdding({ query, tab })} saveToShelf={saveToShelf}/></Suspense>
      </main>
      <ToastStack toasts={toasts} dismiss={dismissToast}/>
      <ShortcutSheet/>
    </div>
    {interfaceOpen && <InterfaceDialog mode={mode} items={items} close={() => setInterfaceOpen(false)}/>}
    {adding && <AddAlbum items={items} initialQuery={adding.query} initialTab={adding.tab} close={() => setAdding(null)} onAdded={addToShelf}/>}
    {record && <RecordCard key={record.id} item={record} close={() => setRecordId('')} onChanged={replaceItem} onRemove={remove}/>}
    {backup && <BackupDialog items={items} reload={reload} close={() => setBackup(false)}/>}
    {wall && <AlbumWall items={items} onClose={() => setWall(false)}/>}
  </SoundscapeProvider></StudyProvider></FocusProvider></RecordLibraryProvider>;
}
