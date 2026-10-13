import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import useRoomPlayback from '../../src/useRoomPlayback.jsx';
import { usePlayerQueue } from '../../src/player/usePlayer.jsx';

const album = (id, count) => ({ id, type: 'album', title: `Fixture ${id}`, artist: 'Synthetic audio', tracks: Array.from({ length: count }, (_, index) => `${id}-${index}`), trackDetails: Array.from({ length: count }, (_, index) => ({ title: `${id}-${index}`, source: 'local', providerId: `${id}${index}`.padEnd(16, '0') })) });
const items = [album('a', 3), album('b', 1), album('c', 1)];
const wait = async (predicate, timeout = 7000) => { const end = performance.now() + timeout; while (!predicate()) { if (performance.now() > end) throw new Error('Timed out waiting for media state'); await new Promise(resolve => setTimeout(resolve, 40)); } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
function Fixture() {
  const [record, setRecord] = useState(items[0]), [trackIndex, setTrackIndex] = useState(0), [provider, setProvider] = useState('local');
  const queue = useRef(null);
  const playback = useRoomPlayback(record, trackIndex, provider, (manual = false) => queue.current?.current.next(manual), { peekNext: () => queue.current?.current.peekNext(), canNext: () => queue.current?.current.canNext });
  const [player, playerRef] = usePlayerQueue({ items, record, trackIndex, setTrackIndex, loadAlbum: (item, index) => { setRecord(item); setTrackIndex(index); }, playback, provider });
  queue.current = playerRef;
  window.fixture = { playback, player, setTrackIndex, setProvider, eject: () => setRecord(null), load: (id, index = 0) => { setRecord(items.find(item => item.id === id)); setTrackIndex(index); } };
  return <><output id="state">{JSON.stringify({ status: playback.status, position: playback.position, duration: playback.duration, trackIndex, record: record?.id, provider, queue: player.queue })}</output><input aria-label="Playback progress" type="range" min="0" max={playback.duration || 0} disabled={!playback.duration} value={playback.position} onChange={event => playback.seek(Number(event.target.value))}/>{playback.deckRefs.map((ref, index) => <audio key={index} ref={ref} {...playback.events} preload="auto"/>)}</>;
}
function Runner() {
  const [results, setResults] = useState([]), [running, setRunning] = useState(false), [instance, setInstance] = useState(0);
  const run = async () => {
    setRunning(true); setResults([]);
    const fixture = () => window.fixture;
    const active = id => wait(() => { const playback = fixture().playback, audio = playback.audio.current; return playback.playing && playback.actualTrack === `${id[0]}-${Number(id[1])}` && audio && !audio.paused && !audio.seeking && audio.readyState >= 3 && audio.getAttribute('src')?.endsWith(id); });
    const buffered = id => wait(() => { const deck = document.querySelector('audio[data-deck="standby"]'); return deck?.getAttribute('src')?.endsWith(id) && deck.readyState >= 3; });
    const reset = async () => { localStorage.removeItem('album-circle-player-queue-v1'); localStorage.removeItem('flow-cabin-crossfade-v1'); const previous = fixture(); setInstance(value => value + 1); await wait(() => fixture() !== previous); await active('a000000000000000'); };
    const test = async (name, body) => { try { await reset(); await body(); setResults(old => [...old, { name, passed: true }]); } catch (error) { setResults(old => [...old, { name, passed: false, error: error.message }]); } };
    await test('buffered duration and progress', async () => { await buffered('a100000000000000'); fixture().player.next(); await active('a100000000000000'); check(fixture().playback.duration === 60, `duration is ${fixture().playback.duration}, expected 60`); check(!document.querySelector('input').disabled, 'progress disabled'); });
    await test('buffered cross-track seek and stale listener', async () => { await buffered('a100000000000000'); fixture().playback.startAt(23); fixture().setTrackIndex(1); await active('a100000000000000'); check(fixture().playback.audio.current.currentTime >= 22.95, `buffered seek ignored: ${fixture().playback.audio.current.currentTime}`); fixture().setTrackIndex(2); await active('a200000000000000'); check(fixture().playback.audio.current.currentTime < 3, 'stale metadata listener sought into unrelated song'); });
    await test('natural ended handoff keeps progress', async () => { await buffered('a100000000000000'); const deck = document.querySelector('audio[data-deck="standby"]'); fixture().playback.audio.current.currentTime = 59.7; await active('a100000000000000'); check(fixture().playback.audio.current === deck && fixture().playback.duration === 60, 'ended handoff lost buffered metadata'); });
    for (const source of ['eject', 'visual', 'system', 'next']) await test(`interrupt crossfade: ${source}`, async () => { await buffered('a100000000000000'); window.dispatchEvent(new CustomEvent('flow-cabin-crossfade', { detail: 10 })); const audio = fixture().playback.audio.current; audio.currentTime = 51; audio.dispatchEvent(new Event('timeupdate')); await active('a100000000000000'); check([...document.querySelectorAll('audio')].every(a => !a.paused), 'expected both decks during crossfade'); if (source === 'eject') fixture().eject(); else if (source === 'next') fixture().player.next(); else fixture().setProvider(source); await sleep(180); check([...document.querySelectorAll('audio')].filter(a => !a.paused && a.getAttribute('src')).length === (source === 'next' ? 1 : 0), 'old crossfade audio continues after interruption'); });
    await test('queue enqueue, reorder and removal', async () => { fixture().setTrackIndex(2); await active('a200000000000000'); fixture().player.enqueue('b'); await buffered('b000000000000000'); fixture().player.playNext('c'); await buffered('c000000000000000'); fixture().player.remove('c'); await buffered('b000000000000000'); fixture().player.remove('b'); await wait(() => !document.querySelector('audio[data-deck="standby"]').getAttribute('src')); });
    await test('repeat mode invalidates buffer', async () => { await buffered('a100000000000000'); fixture().player.cycleRepeat(); await sleep(40); fixture().player.cycleRepeat(); await wait(() => !document.querySelector('audio[data-deck="standby"]').getAttribute('src')); fixture().player.cycleRepeat(); await buffered('a100000000000000'); });
    await test('shuffle invalidates buffer', async () => { await buffered('a100000000000000'); const random = Math.random; Math.random = () => .99; fixture().player.toggleShuffle(); await sleep(40); Math.random = random; await buffered('a200000000000000'); });
    await test('pause and mute overlapping decks', async () => { await buffered('a100000000000000'); window.dispatchEvent(new CustomEvent('flow-cabin-crossfade', { detail: 10 })); const audio = fixture().playback.audio.current; audio.currentTime = 51; audio.dispatchEvent(new Event('timeupdate')); await active('a100000000000000'); fixture().playback.setMuted(true); await wait(() => [...document.querySelectorAll('audio')].every(a => a.muted)); await fixture().playback.toggle(); await wait(() => [...document.querySelectorAll('audio')].every(a => a.paused)); check(document.querySelector('audio[data-deck="standby"]').getAttribute('src') === null, 'paused outgoing deck not cleared'); });
    fixture().eject(); setRunning(false);
  };
  return <><h1>Silent playback regression fixture</h1><p>Generated silent PCM only. No accounts or external services. Each case remounts both decks.</p><button disabled={running} onClick={run}>{running ? 'Running checks…' : 'Run regression checks'}</button><ol>{results.map(result => <li key={result.name}>{result.passed ? 'PASS' : 'FAIL'} {result.name}{result.error ? `: ${result.error}` : ''}</li>)}</ol><Fixture key={instance}/></>;
}
createRoot(document.getElementById('root')).render(<Runner/>);
