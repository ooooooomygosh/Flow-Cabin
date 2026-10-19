import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Music2, Play, Refresh, Settings, Sparkles, X } from '../icons';
import { aiReady, chatUrl } from './ai-model.mjs';
import { chat } from './ai-transport.mjs';
import { useAiSettings } from './useCabinLetters.js';
import {
  EXAMPLE_REQUESTS, buildAiMessages, localRecommendation, normalizePlaybackPlan, parseAiSelection, parseIntent
} from './smart-turntable.mjs';
import './smart-turntable.css';

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

function AlbumCover({ item }) {
  return item?.cover
    ? <img className="st-cover" src={item.cover} alt="" loading="lazy" draggable="false"/>
    : <span className="st-cover st-cover-fallback" aria-hidden="true"><Music2 size={18}/></span>;
}

export default function SmartTurntable({ open, close, items = [], onStart, onNeedAiSettings }) {
  const { settings, key } = useAiSettings();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [note, setNote] = useState('');
  const panel = useRef(null), input = useRef(null), previousFocus = useRef(null), sequence = useRef(0);
  const shelf = Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [];
  const configured = aiReady(settings, key.stored) && key.endpoint === chatUrl(settings.baseUrl);

  useEffect(() => {
    if (!open) {
      sequence.current++;
      setBusy(false);
      setQuery('');
      setResult(null);
      setNote('');
      return;
    }
    previousFocus.current = document.activeElement;
    const timer = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(timer);
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
    setNote('');
    setResult(null);
    if (!shelf.length) {
      setResult(localRecommendation(intent, shelf));
      setBusy(false);
      return;
    }

    if (!configured) {
      setResult(localRecommendation(intent, shelf));
      setNote(settings.enabled ? 'AI 配置还没有完成，已先用本机规则推荐。' : 'AI 未启用，已按唱片架规则推荐。');
      setBusy(false);
      return;
    }

    try {
      const reply = await chat(settings, buildAiMessages(text, intent, shelf), {
        maxTokens: 420,
        timeoutMs: 24000,
        json: true,
        temperature: 0.2
      });
      if (requestId !== sequence.current) return;
      const selection = reply.ok ? parseAiSelection(reply.text, shelf, intent) : null;
      if (selection) {
        setResult(selection);
        setNote('AI 从你的唱片架里挑好了。');
      } else {
        setResult(localRecommendation(intent, shelf));
        setNote(reply.ok ? 'AI 没有返回唱片架里的有效选片，已改成本机推荐。' : 'AI 这次没有接上，已改成本机推荐。');
      }
    } catch {
      if (requestId !== sequence.current) return;
      setResult(localRecommendation(intent, shelf));
      setNote('AI 这次没有接上，已改成本机推荐。');
    } finally {
      if (requestId === sequence.current) setBusy(false);
    }
  };

  const chooseExample = (example) => {
    setQuery(example);
    ask(example);
  };

  const start = () => {
    const plan = normalizePlaybackPlan(result, shelf, parseIntent(query));
    if (!plan) {
      if (result) {
        setResult(localRecommendation(parseIntent(query), shelf));
        setNote('推荐唱片已经不在唱片架里，已按当前收藏重新推荐。');
      }
      return;
    }
    onStart?.(plan);
    close?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) close?.();
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

  const sourceLabel = result?.source === 'ai' ? 'AI 推荐' : '本机推荐';
  const willAutoplay = result?.autoplay !== false;
  const ctaLabel = busy
    ? '正在翻唱片…'
    : result?.albums?.length
      ? `开始${result.activity?.label || '专注'}并${willAutoplay ? '播放' : '放上唱片'}`
      : '等小屋挑好唱片';

  return createPortal(
    <div className="st-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close?.(); }}>
      <section ref={panel} className={`st-panel${busy ? ' is-busy' : ''}`} role="dialog" aria-modal="true" aria-labelledby="smart-turntable-title" aria-describedby="smart-turntable-intro" onKeyDown={onKeyDown}>
        <header className="st-header">
          <span className="st-dial" aria-hidden="true"><i/></span>
          <div className="st-headcopy">
            <span className="st-eyebrow">从你的唱片架出发</span>
            <h2 id="smart-turntable-title" className="st-title">智能唱片机</h2>
          </div>
          <button type="button" className="st-close" aria-label="关闭智能唱片机" onClick={() => close?.()}><X size={18}/></button>
        </header>

        <div className="st-body">
          <p id="smart-turntable-intro" className="st-intro">说说你要做什么、准备做多久。小屋会从收藏里按顺序挑 1–3 张唱片；确认后可以立即播放，也可以先放上唱机。</p>
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
            <button type="button" className="st-send" aria-label="让小屋推荐唱片" disabled={busy || !query.trim()} onClick={() => ask()}>
              <Sparkles size={18}/>
              <span>推荐</span>
            </button>
          </div>

          <div className="st-output" aria-live="polite" aria-busy={busy}>
            {busy && <div className="st-placeholder"><span className="st-loading" aria-hidden="true"/><p>小屋正在翻唱片…</p></div>}
            {!busy && !result && <p className="st-placeholder">写下计划，或者点一句示例。不会发送你的待办或笔记内容。</p>}
            {!busy && result && (
              <div className="st-result">
                <div className="st-summary">
                  <span className="st-chip"><Clock size={14}/>{result.minutes} 分钟</span>
                  <span className="st-chip"><Music2 size={14}/>{result.activity?.label || '专注'}</span>
                  <span className="st-chip">{willAutoplay ? '开始即播放' : '先不播放'}</span>
                  <span className={`st-source ${result.source === 'ai' ? 'is-ai' : 'is-local'}`}>{sourceLabel}</span>
                </div>
                <p className="st-reason"><Sparkles size={14}/><span>{result.reason}</span></p>
                {result.albums.length > 0 && (
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
                  <Refresh size={14}/>重新推荐
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
          <button type="button" className="st-cta" disabled={busy || !result?.albums?.length} onClick={start}>
            <Play size={17}/>{ctaLabel}
          </button>
          <p className="st-privacy">只读取唱片摘要；不会发送待办、日记或 API Key。</p>
        </footer>
      </section>
    </div>,
    document.body
  );
}
