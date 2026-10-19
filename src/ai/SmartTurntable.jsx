import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Music2, Play, Refresh, Settings, Sparkles, X } from '../icons';
import { aiConnectionReady } from './ai-model.mjs';
import { chat, isDesktopShell } from './ai-transport.mjs';
import { useAiSettings } from './useCabinLetters.js';
import {
  EXAMPLE_REQUESTS, buildAiMessages, localRecommendation, normalizePlaybackPlan, normalizePlaylistPlaybackPlan,
  parseAiPlaylist, parseIntent, smartPlaylistItem
} from './smart-turntable.mjs';
import './smart-turntable.css';

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

function AlbumCover({ item }) {
  return item?.cover
    ? <img className="st-cover" src={item.cover} alt="" loading="lazy" draggable="false"/>
    : <span className="st-cover st-cover-fallback" aria-hidden="true"><Music2 size={18}/></span>;
}

export default function SmartTurntable({ open, close, items = [], onStart, onSave, onNeedAiSettings }) {
  const { settings, key } = useAiSettings();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null);
  const [note, setNote] = useState('');
  const panel = useRef(null), input = useRef(null), previousFocus = useRef(null), sequence = useRef(0), request = useRef(null);
  const shelf = Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [];
  const configured = aiConnectionReady(settings, key, { desktop: isDesktopShell() });
  const abortRequest = () => { request.current?.abort(); request.current = null; };
  const dismiss = () => { abortRequest(); close?.(); };

  useEffect(() => {
    if (!open) {
      abortRequest();
      sequence.current++;
      setBusy(false);
      setSaving(false);
      setStarting(false);
      setQuery('');
      setResult(null);
      setNote('');
      return;
    }
    previousFocus.current = document.activeElement;
    const timer = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(timer);
      abortRequest();
      sequence.current++;
      previousFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const ask = async (raw = query) => {
    const text = String(raw || '').trim();
    if (!text || busy) return;
    const intent = parseIntent(text);
    const requestId = ++sequence.current;
    setBusy(true);
    setSaving(false);
    setStarting(false);
    setNote('');
    setResult(null);

    const fallback = (message) => {
      setResult(localRecommendation(intent, shelf));
      if (message) setNote(message);
    };
    if (!configured) {
      fallback(settings.enabled ? 'AI 配置还没有完成，已先用唱片架做本机推荐。' : 'AI 未启用，已按唱片架做本机推荐。');
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    try {
      const reply = await chat(settings, buildAiMessages(text, intent, shelf), {
        maxTokens: 1200,
        timeoutMs: 30000,
        json: true,
        temperature: 0.35,
        signal: controller.signal
      });
      if (requestId !== sequence.current) return;
      const selection = reply.ok ? parseAiPlaylist(reply.text, intent) : null;
      const item = selection ? smartPlaylistItem(selection, selection.tracks) : null;
      if (selection && item) {
        setResult({ ...selection, item, reason: selection.description });
        setNote('歌单已经排好，可以直接收进唱片架，或开始这一轮。');
      } else {
        fallback(reply.ok
          ? 'AI 没有返回可用的歌单，已先用唱片架做本机推荐。'
          : `AI 这次没有接上：${reply.error} 已先用唱片架做本机推荐。`);
      }
    } catch {
      if (requestId !== sequence.current) return;
      fallback('AI 这次没有接上，已先用唱片架做本机推荐。');
    } finally {
      if (request.current === controller) request.current = null;
      if (requestId === sequence.current) setBusy(false);
    }
  };

  const chooseExample = (example) => {
    setQuery(example);
    ask(example);
  };

  const savePlaylist = async () => {
    if (result?.savedItem) return result.savedItem;
    if (result?.kind !== 'playlist' || !result.item) throw new Error('这张歌单还没有准备好。');
    if (typeof onSave !== 'function') throw new Error('唱片架暂时无法保存歌单，请稍后重试。');
    const stored = await onSave(result.item);
    const item = stored?.item || stored;
    if (!item?.id) throw new Error('歌单没有成功收进唱片架，请检查存储空间后重试。');
    setResult((previous) => previous?.item === result.item ? { ...previous, savedItem: item } : previous);
    return item;
  };

  const saveOnly = async () => {
    if (busy || saving || starting || result?.savedItem) return;
    setSaving(true);
    setNote('');
    try {
      const item = await savePlaylist();
      setNote(`《${item.title}》已经收进唱片架，可以随时双击放上唱机。`);
    } catch (error) {
      setNote(error.message || '保存歌单失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    if (busy || saving || starting) return;
    setStarting(true);
    setNote('');
    try {
      let plan;
      if (result?.kind === 'playlist') {
        const item = await savePlaylist();
        plan = normalizePlaylistPlaybackPlan({ ...result, item, persisted: true }, query);
      } else {
        plan = normalizePlaybackPlan(result, shelf, parseIntent(query));
      }
      if (!plan) {
        setNote('这张推荐已经失效，请重新让小屋排一次。');
        if (result?.kind !== 'playlist') setResult(localRecommendation(parseIntent(query), shelf));
        return;
      }
      const accepted = await onStart?.(plan);
      if (accepted === false) {
        setNote('这一轮没有开始，请检查专注记录或存储空间后重试。');
        return;
      }
      dismiss();
    } catch (error) {
      setNote(error.message || '这一轮没有开始，请稍后重试。');
    } finally {
      setStarting(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...panel.current.querySelectorAll(FOCUSABLE)]
      .filter((node) => node.tabIndex >= 0 && node.getClientRects().length);
    const first = focusables[0], last = focusables.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const isPlaylist = result?.kind === 'playlist' && Boolean(result.item);
  const tracks = isPlaylist ? result.tracks : [];
  const sourceLabel = isPlaylist ? 'AI 歌单' : result?.source === 'ai' ? 'AI 推荐' : '本机推荐';
  const willAutoplay = result?.autoplay !== false;
  const ready = isPlaylist ? tracks.length > 0 : Boolean(result?.albums?.length);
  const ctaLabel = busy
    ? '正在编排歌单…'
    : starting
      ? '正在放上唱机…'
      : isPlaylist
        ? `收进唱片架并开始${result.activity?.label || '专注'}`
        : result?.albums?.length
          ? `开始${result.activity?.label || '专注'}并${willAutoplay ? '播放' : '放上唱片'}`
          : '等小屋排好歌单';

  return createPortal(
    <div className="st-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={panel} className={`st-panel${busy ? ' is-busy' : ''}`} role="dialog" aria-modal="true" aria-labelledby="smart-turntable-title" aria-describedby="smart-turntable-intro" onKeyDown={onKeyDown}>
        <header className="st-header">
          <span className="st-dial" aria-hidden="true"><i/></span>
          <div className="st-headcopy">
            <span className="st-eyebrow">AI 编一张能播放的歌单</span>
            <h2 id="smart-turntable-title" className="st-title">智能唱片机</h2>
          </div>
          <button type="button" className="st-close" aria-label="关闭智能唱片机" onClick={dismiss}><X size={18}/></button>
        </header>

        <div className="st-body">
          <p id="smart-turntable-intro" className="st-intro">说说你要做什么、准备做多久。小屋会按场景排一张完整歌单，不只从唱片架里挑；可以收进唱片架，也可以直接放上唱机。</p>
          <div className="st-examples" aria-label="试试这样说">
            {EXAMPLE_REQUESTS.map((example) => (
              <button key={example} type="button" className="st-example" disabled={busy} onClick={() => chooseExample(example)}>{example}</button>
            ))}
          </div>

          <div className="st-composer">
            <label className="st-input-label" htmlFor="smart-turntable-request">告诉小屋你的计划</label>
            <textarea ref={input} id="smart-turntable-request" className="st-input" rows="2" maxLength="240"
              value={query} placeholder="例如：我要学习五十分钟，帮我搭配音乐"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing) {
                  event.preventDefault();
                  ask();
                }
              }}/>
            <button type="button" className="st-send" aria-label="让小屋推荐歌单" disabled={busy || !query.trim()} onClick={() => ask()}>
              <Sparkles size={18}/>
              <span>编排</span>
            </button>
          </div>

          <div className="st-output" aria-live="polite" aria-busy={busy}>
            {busy && <div className="st-placeholder"><span className="st-loading" aria-hidden="true"/><p>小屋正在挑歌、排顺序…</p></div>}
            {!busy && !result && <p className="st-placeholder">写下计划，或者点一句示例。不会发送你的待办或笔记内容。</p>}
            {!busy && result && (
              <div className="st-result">
                <div className="st-summary">
                  <span className="st-chip"><Clock size={14}/>{result.minutes} 分钟</span>
                  <span className="st-chip"><Music2 size={14}/>{result.activity?.label || '专注'}</span>
                  {isPlaylist && <span className="st-chip">{tracks.length} 首</span>}
                  {!isPlaylist && <span className="st-chip">{willAutoplay ? '开始即播放' : '先不播放'}</span>}
                  <span className={`st-source ${result.source === 'ai' ? 'is-ai' : 'is-local'}`}>{sourceLabel}</span>
                </div>
                {isPlaylist && <div className="st-playlist-head"><strong>{result.title}</strong><small>{result.description}</small></div>}
                {!isPlaylist && <p className="st-reason"><Sparkles size={14}/><span>{result.reason}</span></p>}
                {isPlaylist && (
                  <ul className="st-tracks" aria-label="AI 歌单曲目">
                    {tracks.map((track, index) => (
                      <li key={`${track.title}-${track.artist}-${index}`} className="st-track">
                        <span className="st-track-cover" aria-hidden="true"><Music2 size={15}/></span>
                        <span className="st-track-copy">
                          <strong className="st-track-title">{track.title}</strong>
                          <small className="st-track-artist">{track.artist}{track.album ? ` · ${track.album}` : ''}</small>
                        </span>
                        <span className="st-order" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!isPlaylist && result.albums.length > 0 && (
                  <ul className="st-albums" aria-label="推荐唱片">
                    {result.albums.map((album, index) => {
                      const genres = Array.isArray(album.genres) ? album.genres : typeof album.genre === 'string' ? [album.genre] : [];
                      return (
                        <li key={album.id ?? `${album.title}-${index}`} className="st-album">
                          <AlbumCover item={album}/>
                          <span className="st-album-copy">
                            <strong className="st-album-title">{album.title || '未命名唱片'}</strong>
                            <small className="st-album-artist">{album.artist || '未知音乐人'}</small>
                            {genres.length > 0 && <small className="st-genres">{genres.slice(0, 2).join(' · ')}</small>}
                          </span>
                          <span className="st-order" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {note && <p className="st-note" role="status">{note}</p>}
                <button type="button" className="st-refresh" disabled={busy || !query.trim()} onClick={() => ask()}>
                  <Refresh size={14}/>重新编排
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="st-footer">
          {!configured && onNeedAiSettings && (
            <button type="button" className="st-settings" onClick={() => onNeedAiSettings()}>
              <Settings size={14}/>配置 AI
            </button>
          )}
          {isPlaylist && (
            <button type="button" className="st-save" disabled={busy || saving || starting || Boolean(result.savedItem)} onClick={saveOnly}>
              {result.savedItem ? '已收进唱片架' : saving ? '正在收进…' : '只收进唱片架'}
            </button>
          )}
          <button type="button" className="st-cta" disabled={busy || saving || starting || !ready} onClick={start}>
            <Play size={17}/>{ctaLabel}
          </button>
          <p className="st-privacy">只发送你的计划与唱片架摘要；不会发送待办、日记或 API Key。</p>
        </footer>
      </section>
    </div>,
    document.body
  );
}
