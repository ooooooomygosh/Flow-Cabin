import React, { useEffect, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import PixelCat from '../pet/PixelCat';
import { useCatBehaviour } from '../pet/RoomCat';
import { useLife } from './useLife';
import { Play, Pause } from '../icons';
import { ClockReadout, LyricsReadout } from './HomeReadouts';
import { cornerCamera, planeStyle } from './corner-camera.mjs';

const labels = { deck:'唱机', library:'唱片柜', speaker:'环境音', lyrics:'歌词册', focus:'专注钟', tasks:'今日任务', notes:'随手记', lamp:'台灯', keyboard:'学习', pet:'照顾伙伴', weather:'窗外天气', tea:'喝杯茶', plant:'照顾植物', rest:'休息一下' };
const actions = { deck:'music', library:'library', speaker:'sound', lyrics:'lyrics', focus:'timer', tasks:'tasks', notes:'notes', keyboard:'study', pet:'pet', weather:'weather', tea:'tea', plant:'plant', rest:'rest' };
const manifests = new Map();
async function manifestFor(theme) {
  if (!manifests.has(theme)) manifests.set(theme, fetch(`/room-scenes/v21/${theme}/corners/manifest.json`).then(r => { if (!r.ok) throw Error('近景正在加载，请稍后重试。'); return r.json(); }).catch(e => { manifests.delete(theme); throw e; }));
  return manifests.get(theme);
}
function Plane({ quad, width, height, className = '', children }) {
  return quad ? <div className={`corner-plane ${className}`} style={planeStyle(quad,width,height)}>{children}</div> : null;
}
function landscapeRange(view, zone) {
  const points = Object.values(view.planes || {}).flatMap(plane => plane.quad || []);
  const rects = zone === 'music' ? Object.values(view.hotspotRects) : zone === 'life' ? [view.hotspotRects.pet, view.petMount?.spriteBounds] : [];
  for (const rect of rects.filter(Boolean)) points.push([rect.x, rect.y], [rect.x + rect.width, rect.y + rect.height]);
  const ys = points.map(point => point[1]);
  return ys.length ? { top: Math.max(0, Math.min(...ys) - 12), bottom: Math.max(...ys) + 12 } : null;
}

export default function HomeCorner({ zone, viewport, reduced, dim, onLight }) {
  const { look, deck, items, focus, identity, sky, commands } = useCabinRuntime();
  const life = useLife(), pet = useCatBehaviour({ focus:focus.snapshot(), playing:deck.audible, track:deck.nowTrack, petId:identity.builtinId, reduceMotion:reduced });
  const [manifest, setManifest] = useState(null), [error, setError] = useState('');
  useEffect(() => { let alive = true; setError(''); setManifest(null); manifestFor(look).then(m => alive && setManifest(m), e => alive && setError(e.message)); return () => { alive = false; }; }, [look]);
  const view = manifest?.views?.[zone];
  if (!view) return <div className="home-corner-loading" role="status">{error || '正在走进这个角落…'}</div>;
  const image = `/room-scenes/v21/${look}/corners/${view.image}`;
  const camera = cornerCamera(viewport.width, viewport.height, manifest.sourceSize, viewport.width < 700 ? view.portraitFocalPoint : view.focalPoint, landscapeRange(view, zone));
  const style = { width:manifest.sourceSize.width, height:manifest.sourceSize.height, transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` };
  const taskCards = focus.state.tasks.filter(t => !t.done).slice(0,3);
  const albums = [deck.deckItem, ...items].filter((v,i,a) => v?.cover && a.findIndex(x => x?.id === v.id) === i).slice(0,2);
  const weather = sky.settings.realWeather && sky.real;
  const record = view.movingElements?.record;
  const body = view.petMount?.spriteBounds;
  return <div className={`home-corner corner-${zone} ${dim ? 'is-dim' : ''} ${camera.landscape ? 'has-landscape-frame' : ''}`} data-corner={zone} data-light={sky.state.bucket} aria-label={view.label}>
    {camera.landscape && <img className="corner-ambient" src={image} alt="" draggable="false"/>}
    <div className="corner-scene" style={style}>
      <img className="corner-art" src={image} alt="" draggable="false"/>
      {Object.entries(view.hotspotRects).map(([id,r]) => <button type="button" key={id} className="corner-hotspot" style={{ left:r.x, top:r.y, width:r.width, height:r.height }} aria-label={labels[id] || id} onClick={() => id === 'lamp' ? onLight() : commands.open(actions[id])}><span>{labels[id]}</span></button>)}
      {zone === 'music' && <>
        {albums.map((album,i) => <Plane key={i} quad={view.planes?.[`albumCover${i+1}`]?.quad} width={240} height={240} className="corner-cover"><img src={album.cover} alt={album.title}/></Plane>)}
        {record && <div className={`corner-record ${deck.audible && !reduced ? 'is-playing' : ''}`} style={{ left:record.center.x-record.radiusX, top:record.center.y-record.radiusY, width:record.radiusX*2, height:record.radiusY*2 }}><div className="corner-record-perspective" style={{ transform:`scaleY(${record.radiusY/record.radiusX})` }}><div className="corner-record-disc">{deck.deckItem?.cover && <img src={deck.deckItem.cover} alt=""/>}<i/></div></div></div>}
        <Plane quad={view.planes?.lyricLeft?.quad} width={210} height={190} className="corner-lyrics"><LyricsReadout/></Plane>
      </>}
      {zone === 'work' && <>
        <Plane quad={view.planes?.focusDisplay?.quad} width={260} height={88} className="corner-clock"><ClockReadout/></Plane>
        {[0,1,2].map(i => <Plane key={i} quad={view.planes?.[`task${i+1}`]?.quad} width={140} height={195} className="corner-task">{taskCards[i] ? <button type="button" onClick={() => commands.task(taskCards[i].id,true)} aria-label={`完成任务：${taskCards[i].text}`}><span aria-hidden="true">□</span>{taskCards[i].text}</button> : <button type="button" onClick={() => commands.open('tasks')} aria-label="添加今日任务"><span aria-hidden="true">＋</span>{i === 0 ? '今天想做什么？' : ''}</button>}</Plane>)}
        <Plane quad={view.planes?.noteLeft?.quad} width={180} height={180} className="corner-note"><small>随手记</small><span>{focus.state.notes?.slice(0,40) || '把想到的，轻轻记下来。'}</span></Plane>
      </>}
      {zone === 'life' && <>
        <Plane quad={view.planes?.weatherDisplay?.quad} width={200} height={78} className="corner-weather"><b>{Number.isFinite(weather?.temperature) ? `${Math.round(weather.temperature)}°` : '窗外'}</b><small>{weather ? sky.city?.name || '附近' : '设置位置'}</small></Plane>
        {body && <div className="corner-pet" style={{ left:body.x, top:body.y, width:body.width, height:body.height }}><PixelCat petId={identity.builtinId} accessory={identity.accessory} pose={life.resting ? 'sleep' : pet.pose} reduceMotion={reduced}/></div>}
        {view.petMount?.frontOccluderPolygon && <img className="corner-pet-occluder" src={image} alt="" style={{ clipPath:`polygon(${view.petMount.frontOccluderPolygon.map(([x,y])=>`${x}px ${y}px`).join(',')})` }}/ >}
      </>}
    </div>
    <div className="corner-actions" aria-label={`${view.label}操作`}>
      {zone === 'music' ? <><button type="button" className="corner-primary" onClick={commands.play}>{deck.audible ? <Pause size={16}/> : <Play size={16}/>}<span>{deck.audible ? '暂停' : '播放'}</span></button><button type="button" onClick={commands.next} disabled={!deck.deckItem}>下一首</button><button type="button" onClick={() => commands.open('lyrics')}>歌词册</button></> : zone === 'work' ? <><button type="button" className="corner-primary" onClick={() => commands.open('timer')}>{focus.state.timer.phase === 'idle' ? '开始专注' : '查看专注'}</button><button type="button" onClick={() => commands.open('tasks')}>今日任务</button><button type="button" onClick={() => commands.open('notes')}>随手记</button></> : <><button type="button" className="corner-primary" onClick={() => commands.open('pet')}>陪陪{identity.name}</button><button type="button" onClick={() => commands.open('weather')}>天气</button><button type="button" onClick={() => commands.open('rest')}>休息一下</button></>}
    </div>
  </div>;
}
