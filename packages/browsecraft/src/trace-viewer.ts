// ============================================================================
// Browsecraft - Trace Viewer
// Renders a recorded TraceFile as a single self-contained HTML page: a
// fake browser chrome with a live URL bar, a full-size screenshot with an
// animated cursor and glowing highlight over the acted-on element, a
// Gantt-style color-coded timeline, and video-style playback controls.
//
// No server, no framework, no dependency -- the trace data (including
// screenshots as base64) is inlined directly into the HTML so it can be
// opened straight from disk via a file:// URL.
// ============================================================================

import type { TraceFile } from './trace.js';

/** Escape a string for safe embedding inside an HTML attribute/text node */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Render a TraceFile into a standalone, offline-viewable HTML page */
export function renderTraceViewerHtml(trace: TraceFile): string {
	const title = `${trace.suitePath.length > 0 ? `${trace.suitePath.join(' › ')} › ` : ''}${trace.title}`;
	const traceJson = JSON.stringify(trace).replace(/</g, '\\u003c');
	const totalDuration =
		trace.steps.length > 1
			? trace.steps[trace.steps.length - 1]!.timestamp - trace.steps[0]!.timestamp
			: 0;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trace: ${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0a0d12;
    --bg-elevated: #12161d;
    --bg-hover: #1a212c;
    --bg-active: #1c2b40;
    --border: #262d38;
    --text: #eaf0f7;
    --text-muted: #7d8898;
    --accent: #4fa8ff;
    --accent-2: #8b7bff;
    --accent-glow: rgba(79, 168, 255, 0.4);
    --green: #3fd97f;
    --red: #ff5c6c;
    --amber: #ffb84d;
    --pink: #ff8fc7;
    --cyan: #4dd9e0;
    --shadow: 0 12px 32px rgba(0,0,0,0.55);
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    height: 100vh;
    background:
      radial-gradient(1200px 600px at 15% -10%, rgba(79,168,255,0.08), transparent 60%),
      radial-gradient(900px 500px at 100% 0%, rgba(139,123,255,0.06), transparent 55%),
      var(--bg);
    color: var(--text);
    font-size: 13px;
    overflow: hidden;
  }

  /* ---------- Top bar ---------- */
  #topbar {
    display: flex; align-items: center; gap: 14px; padding: 10px 16px;
    background: var(--bg-elevated); border-bottom: 1px solid var(--border);
    flex-shrink: 0; position: relative; overflow: hidden;
  }
  #topbar.celebrate::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, var(--accent-glow), transparent);
    transform: translateX(-100%); animation: sweep 1.1s var(--ease); pointer-events: none;
  }
  #topbar.shake { animation: shake 0.45s var(--ease); }
  @keyframes sweep { to { transform: translateX(100%); } }
  @keyframes shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }
  .pill {
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; flex-shrink: 0;
  }
  .pill.passed { background: rgba(63,217,127,0.15); color: var(--green); }
  .pill.failed { background: rgba(255,92,108,0.15); color: var(--red); }
  .pill.skipped { background: rgba(255,184,77,0.15); color: var(--amber); }
  #topbar .breadcrumb { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #topbar .meta { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
  #topbar .spacer { flex: 1; }
  #search {
    background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px;
    padding: 6px 10px; font-size: 12px; width: 170px; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s, width 0.2s var(--ease);
  }
  #search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); width: 220px; }
  #search::placeholder { color: var(--text-muted); }
  #kbd-hint { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
  kbd { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; font-family: inherit; font-size: 10px; }

  /* ---------- Body layout ---------- */
  #body { flex: 1; display: flex; overflow: hidden; min-height: 0; }
  #sidebar { flex-shrink: 0; overflow-y: auto; background: var(--bg-elevated); border-right: 1px solid var(--border); width: 300px; }
  #resize-handle { width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent; position: relative; z-index: 5; }
  #resize-handle:hover, #resize-handle.dragging { background: var(--accent); }

  #steps { list-style: none; margin: 0; padding: 6px; }
  #steps li {
    display: flex; align-items: flex-start; gap: 9px; padding: 8px 10px; margin-bottom: 2px; border-radius: 6px;
    cursor: pointer; transition: background 0.12s, transform 0.12s var(--ease); border-left: 3px solid transparent;
  }
  #steps li:hover { background: var(--bg-hover); transform: translateX(2px); }
  #steps li:active { transform: scale(0.98); }
  #steps li.active { background: linear-gradient(90deg, var(--bg-active), transparent); border-left-color: var(--accent); }
  #steps li.hidden { display: none; }
  #steps li .icon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
  #steps li .icon svg { width: 14px; height: 14px; }
  #steps li .body { min-width: 0; flex: 1; }
  #steps li .row1 { display: flex; align-items: baseline; gap: 6px; }
  #steps li .num { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
  #steps li .action { font-weight: 600; text-transform: capitalize; }
  #steps li .target {
    display: block; color: var(--text-muted); font-size: 11.5px; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  }
  #steps li .time { margin-left: auto; color: var(--text-muted); font-size: 10.5px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  #empty-search { padding: 24px 14px; color: var(--text-muted); text-align: center; font-size: 12px; }

  /* ---------- Main panel ---------- */
  #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  #filmstrip { display: flex; gap: 6px; padding: 10px; overflow-x: auto; background: var(--bg-elevated); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  #filmstrip .frame {
    width: 84px; height: 54px; flex-shrink: 0; border-radius: 5px; border: 2px solid var(--border);
    background: #000 center / cover no-repeat; cursor: pointer; opacity: 0.5;
    transition: opacity 0.15s, border-color 0.15s, transform 0.15s var(--ease);
  }
  #filmstrip .frame:hover { opacity: 0.85; transform: translateY(-2px) scale(1.03); }
  #filmstrip .frame.active { opacity: 1; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow), 0 6px 14px rgba(0,0,0,0.4); transform: translateY(-2px); }
  #filmstrip .frame.empty { display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; }

  #screenshot-wrap {
    flex: 1; overflow: auto; display: flex; flex-direction: column; align-items: center; padding: 20px;
    background: repeating-conic-gradient(#0f1319 0% 25%, #0a0d12 0% 50%) 50% / 20px 20px;
  }

  /* Fake browser chrome around the screenshot */
  #browser-chrome {
    width: 100%; max-width: 1400px; display: flex; align-items: center; gap: 10px;
    background: linear-gradient(#1a1f28, #151a22); border: 1px solid var(--border); border-bottom: none;
    border-radius: 10px 10px 0 0; padding: 9px 12px; flex-shrink: 0;
  }
  #browser-chrome .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  #browser-chrome .dot.red { background: #ff5f57; }
  #browser-chrome .dot.yellow { background: #febc2e; }
  #browser-chrome .dot.green { background: #28c840; }
  #url-bar {
    flex: 1; display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 10px; min-width: 0;
  }
  #url-bar svg { width: 11px; height: 11px; color: var(--green); flex-shrink: 0; }
  #url-text {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #mode-toggle { display: flex; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 2px; flex-shrink: 0; }
  #mode-toggle button {
    background: transparent; border: none; color: var(--text-muted); font-size: 11px; font-weight: 600;
    padding: 4px 10px; border-radius: 4px; cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  #mode-toggle button.active { background: var(--accent); color: #fff; }

  #shot-frame {
    position: relative; width: 100%; max-width: 1400px; box-shadow: var(--shadow); overflow: hidden;
    cursor: zoom-in; transition: max-width 0.25s var(--ease), box-shadow 0.2s; background: #000;
    border-radius: 0 0 8px 8px; flex-shrink: 0;
  }
  #shot-frame:hover { box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
  #shot-frame.zoomed { cursor: zoom-out; max-width: none; }
  #shot-frame.dom-mode { cursor: default; }
  #shot-frame .layer {
    display: block; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
    transition: opacity 0.28s ease;
  }
  #shot-frame.zoomed .layer { position: static; width: auto; height: auto; max-width: none; }

  #dom-frame {
    position: absolute; top: 0; left: 0; border: 0; background: #fff; transform-origin: top left; display: none;
  }
  #dom-hover-box {
    position: fixed; pointer-events: none; border: 1.5px solid var(--pink); background: rgba(255,143,199,0.18);
    display: none; z-index: 20; border-radius: 2px;
  }
  #dom-inspector {
    position: absolute; bottom: 10px; left: 10px; background: rgba(10,13,18,0.92); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11px; color: var(--text); display: none; max-width: 90%; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; box-shadow: var(--shadow); z-index: 21;
  }
  #dom-inspector .tag { color: var(--pink); }
  #dom-inspector .attr { color: var(--cyan); }
  #shot-frame #img-a { position: relative; }

  #highlight {
    position: absolute; border: 2px solid var(--accent); border-radius: 4px; pointer-events: none; display: none;
    box-shadow: 0 0 0 4000px rgba(0,0,0,0.4), 0 0 18px var(--accent-glow);
    transition: left 0.45s var(--ease), top 0.45s var(--ease), width 0.45s var(--ease), height 0.45s var(--ease), opacity 0.2s;
    animation: glow 1.6s ease-in-out infinite;
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 0 4000px rgba(0,0,0,0.4), 0 0 6px var(--accent-glow); }
    50% { box-shadow: 0 0 0 4000px rgba(0,0,0,0.4), 0 0 24px var(--accent-glow); }
  }
  #cursor {
    position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; pointer-events: none; display: none;
    transition: left 0.45s var(--ease), top 0.45s var(--ease), opacity 0.2s;
  }
  #cursor .dot {
    width: 100%; height: 100%; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, var(--accent-2) 60%, var(--accent) 100%);
    box-shadow: 0 0 10px var(--accent-glow), 0 2px 6px rgba(0,0,0,0.5);
  }
  #cursor .ring { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; transform: scale(0.4); }
  #cursor.ripple .ring { animation: ripple 0.6s var(--ease); }
  @keyframes ripple { 0% { opacity: 0.9; transform: scale(0.4); } 100% { opacity: 0; transform: scale(2.4); } }

  #no-screenshot { color: var(--text-muted); padding: 60px; text-align: center; }

  /* ---------- Playback / Gantt timeline ---------- */
  #playback { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--bg-elevated); border-top: 1px solid var(--border); flex-shrink: 0; }
  #play-btn, #speed-btn {
    background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px;
    height: 28px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: border-color 0.15s, transform 0.1s, background 0.15s; flex-shrink: 0;
  }
  #play-btn { width: 32px; }
  #speed-btn { width: auto; padding: 0 9px; font-size: 11px; font-weight: 700; }
  #play-btn:hover, #speed-btn:hover { border-color: var(--accent); background: var(--bg-hover); }
  #play-btn:active, #speed-btn:active { transform: scale(0.92); }
  #play-btn svg { width: 13px; height: 13px; }

  #gantt { flex: 1; display: flex; gap: 2px; height: 30px; }
  #gantt .segment {
    position: relative; min-width: 4px; border-radius: 4px; cursor: pointer; opacity: 0.55;
    transition: opacity 0.15s, transform 0.15s var(--ease), box-shadow 0.15s;
  }
  #gantt .segment:hover { opacity: 0.85; }
  #gantt .segment.active { opacity: 1; transform: scaleY(1.15); box-shadow: 0 0 0 2px rgba(255,255,255,0.5), 0 0 12px var(--accent-glow); z-index: 1; }
  #gantt .segment.passed::after {
    content: ''; position: absolute; inset: auto 0 -5px 0; height: 2px; background: var(--text); opacity: 0.4; border-radius: 2px;
  }
  #playback .meta-right { color: var(--text-muted); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }

  /* ---------- Status bar ---------- */
  #statusbar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: var(--bg-elevated); border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
  #statusbar strong { color: var(--text); font-weight: 600; }
  #statusbar .spacer { flex: 1; }
  #copy-target { background: var(--bg); border: 1px solid var(--border); color: var(--text-muted); border-radius: 5px; padding: 3px 9px; font-size: 11px; cursor: pointer; transition: color 0.15s, border-color 0.15s, transform 0.1s; }
  #copy-target:hover { color: var(--text); border-color: var(--accent); }
  #copy-target:active { transform: scale(0.94); }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
</style>
</head>
<body>
  <div id="topbar">
    <span class="pill ${trace.status}">${trace.status}</span>
    <span class="breadcrumb" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
    <span class="meta">${trace.steps.length} step${trace.steps.length === 1 ? '' : 's'}${totalDuration > 0 ? ` · ${totalDuration}ms total` : ''}</span>
    <span class="spacer"></span>
    <input id="search" type="text" placeholder="Filter steps…" autocomplete="off">
    <span id="kbd-hint"><kbd>space</kbd> play · <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>/</kbd> search · <kbd>f</kbd> zoom</span>
  </div>
  <div id="body">
    <div id="sidebar">
      <ul id="steps"></ul>
      <div id="empty-search" style="display:none">No steps match your filter.</div>
    </div>
    <div id="resize-handle"></div>
    <div id="main">
      <div id="filmstrip"></div>
      <div id="screenshot-wrap">
        <div id="browser-chrome">
          <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
          <div id="url-bar">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3Zm2 5H6V4a2 2 0 1 1 4 0v2Z"/></svg>
            <span id="url-text"></span>
          </div>
          <div id="mode-toggle">
            <button id="mode-screenshot" class="active">Screenshot</button>
            <button id="mode-dom">Inspect DOM</button>
          </div>
        </div>
        <div id="shot-frame">
          <img id="img-a" class="layer" alt="">
          <img id="img-b" class="layer" alt="" style="opacity:0">
          <iframe id="dom-frame" sandbox="allow-same-origin"></iframe>
          <div id="dom-inspector"></div>
          <div id="highlight"></div>
          <div id="cursor"><div class="ring"></div><div class="dot"></div></div>
        </div>
      </div>
      <div id="dom-hover-box"></div>
      <div id="playback"></div>
      <div id="statusbar"></div>
    </div>
  </div>
<script>
const trace = ${traceJson};
let activeIndex = trace.steps.length > 0 ? 0 : -1;
let zoomed = false;
let filter = '';
let isPlaying = false;
let playTimer = null;
let speed = 1;
const SPEEDS = [1, 2, 0.5];
let activeLayer = 'a';
let imgScale = null; // {scaleX, scaleY} derived from natural image size, cached

const ICONS = {
  click: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.5a.5.5 0 0 1 1 0V4a.5.5 0 0 1-1 0V1.5ZM3.05 3.05a.5.5 0 0 1 .707 0l1.06 1.06a.5.5 0 1 1-.707.708L3.05 3.757a.5.5 0 0 1 0-.707Zm9.9 0a.5.5 0 0 1 0 .707l-1.06 1.06a.5.5 0 1 1-.708-.707l1.06-1.06a.5.5 0 0 1 .708 0ZM1.5 6.5a.5.5 0 0 1 0 1H1a.5.5 0 0 1 0-1h.5Zm11.5 5.207 2.146 2.147a.5.5 0 0 1-.707.707L12.293 12.4 11 15l-1.5-6.5L15 10l-2 1.707Z"/></svg>',
  fill: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10ZM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5Zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5Z"/></svg>',
  type: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h13A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 12.5v-9ZM3 5v1h1V5H3Zm2 0v1h1V5H5Zm2 0v1h1V5H7Zm2 0v1h1V5H9Zm2 0v1h1V5h-1ZM3 7v1h1V7H3Zm2 0v1h1V7H5Zm2 0v1h3V7H7Zm4 0v1h1V7h-1ZM3 9v1h7V9H3Zm8 0v1h1V9h-1Z"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0Z"/></svg>',
  hover: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.72-5.657a.5.5 0 0 1 .565.103Z"/></svg>',
  goto: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.05 8.5h2.51c.028 1.24.183 2.404.437 3.4-1.55-.594-2.76-1.87-2.947-3.4Zm2.51-1H1.05c.187-1.53 1.397-2.806 2.947-3.4a12.9 12.9 0 0 0-.437 3.4Zm1.001 1h2.938a10.9 10.9 0 0 1-.437 3.4A6.7 6.7 0 0 1 4.56 8.5Zm2.938-1H4.56a6.7 6.7 0 0 1 2.001-3.4c.254.996.409 2.16.437 3.4Zm-1.977-3.87A6.98 6.98 0 0 1 8 3c.87 0 1.7.176 2.478.492A10.9 10.9 0 0 0 8.99 6.5H7.01a10.9 10.9 0 0 0-1.487-3.87ZM11.44 6.5h2.51c-.187-1.53-1.397-2.806-2.947-3.4.254.996.409 2.16.437 3.4Zm2.51 1H11.44a12.9 12.9 0 0 1-.437 3.4c1.55-.594 2.76-1.87 2.947-3.4Zm-3.51 0H7.502c.028 1.24.183 2.404.437 3.4A10.9 10.9 0 0 0 8.99 9.5h1.487v-2h-.037Zm-2.94 0H4.56c.028 1.24.183 2.404.437 3.4A6.98 6.98 0 0 1 8 13c.532 0 1.045-.075 1.53-.216a10.9 10.9 0 0 1-1.487-3.784H7.5v-1Z"/></svg>',
  see: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8ZM8 11.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7Zm0-1.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
  default: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/></svg>',
};
const ACTION_COLORS = {
  click: 'var(--accent)', fill: 'var(--accent-2)', type: 'var(--amber)', check: 'var(--green)',
  hover: 'var(--pink)', goto: 'var(--cyan)', see: 'var(--amber)', default: 'var(--text-muted)',
};
const PLAY_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5-10-5.5Z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5h3v11H4v-11Zm5 0h3v11H9v-11Z"/></svg>';

function actionKey(action) {
  return Object.keys(ICONS).find(function (k) { return action.toLowerCase().indexOf(k) !== -1; }) || 'default';
}
function iconFor(action) { return ICONS[actionKey(action)]; }
function colorFor(action) { return ACTION_COLORS[actionKey(action)]; }

const topbarEl = document.getElementById('topbar');
const stepsEl = document.getElementById('steps');
const emptySearchEl = document.getElementById('empty-search');
const filmstripEl = document.getElementById('filmstrip');
const statusEl = document.getElementById('statusbar');
const playbackEl = document.getElementById('playback');
const searchEl = document.getElementById('search');
const shotFrameEl = document.getElementById('shot-frame');
const highlightEl = document.getElementById('highlight');
const cursorEl = document.getElementById('cursor');
const sidebarEl = document.getElementById('sidebar');
const resizeHandleEl = document.getElementById('resize-handle');
const urlTextEl = document.getElementById('url-text');
const domFrameEl = document.getElementById('dom-frame');
const domInspectorEl = document.getElementById('dom-inspector');
const domHoverBoxEl = document.getElementById('dom-hover-box');
const modeScreenshotBtn = document.getElementById('mode-screenshot');
const modeDomBtn = document.getElementById('mode-dom');

let viewMode = 'screenshot';
const DOM_FALLBACK = '<html><body style="font-family:sans-serif;padding:40px;color:#888;background:#fff">No DOM snapshot captured for this step.</body></html>';

function matchesFilter(step) {
  if (!filter) return true;
  const q = filter.toLowerCase();
  return step.action.toLowerCase().indexOf(q) !== -1 || step.target.toLowerCase().indexOf(q) !== -1;
}

function renderSidebar() {
  if (trace.steps.length === 0) { stepsEl.innerHTML = ''; return; }
  const first = trace.steps[0].timestamp;
  let visibleCount = 0;
  stepsEl.innerHTML = trace.steps.map(function (step, i) {
    const visible = matchesFilter(step);
    if (visible) visibleCount++;
    const delta = step.timestamp - first;
    return '<li data-index="' + i + '" class="' + (i === activeIndex ? 'active' : '') + (visible ? '' : ' hidden') + '">' +
      '<span class="icon" style="color:' + colorFor(step.action) + '">' + iconFor(step.action) + '</span>' +
      '<span class="body">' +
        '<span class="row1"><span class="num">' + (i + 1) + '.</span><span class="action">' + step.action + '</span><span class="time">+' + delta + 'ms</span></span>' +
        '<span class="target">' + step.target + '</span>' +
      '</span>' +
    '</li>';
  }).join('');
  emptySearchEl.style.display = visibleCount === 0 ? 'block' : 'none';
  for (const li of stepsEl.querySelectorAll('li')) {
    li.addEventListener('click', function () { stop(); activeIndex = Number(li.dataset.index); render(); });
  }
}

function renderFilmstrip() {
  filmstripEl.innerHTML = trace.steps.map(function (step, i) {
    if (!step.screenshot) return '<div class="frame empty' + (i === activeIndex ? ' active' : '') + '" data-index="' + i + '">\\u2014</div>';
    return '<div class="frame' + (i === activeIndex ? ' active' : '') + '" data-index="' + i + '" style="background-image:url(data:image/png;base64,' + step.screenshot + ')"></div>';
  }).join('');
  for (const frame of filmstripEl.querySelectorAll('.frame')) {
    frame.addEventListener('click', function () { stop(); activeIndex = Number(frame.dataset.index); render(); });
  }
  const activeFrame = filmstripEl.querySelector('.frame.active');
  if (activeFrame) activeFrame.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function positionOverlaysFor(step) {
  if (!step.boundingBox || !imgScale) {
    highlightEl.style.display = 'none';
    cursorEl.style.display = 'none';
    return;
  }
  const box = step.boundingBox;
  const left = box.x * imgScale.scaleX;
  const top = box.y * imgScale.scaleY;
  const width = box.width * imgScale.scaleX;
  const height = box.height * imgScale.scaleY;

  highlightEl.style.display = 'block';
  highlightEl.style.left = left + '%';
  highlightEl.style.top = top + '%';
  highlightEl.style.width = width + '%';
  highlightEl.style.height = height + '%';

  cursorEl.style.display = 'block';
  cursorEl.style.left = (left + width / 2) + '%';
  cursorEl.style.top = (top + height / 2) + '%';

  if (step.action.toLowerCase().indexOf('click') !== -1) {
    cursorEl.classList.remove('ripple');
    void cursorEl.offsetWidth; // restart animation
    cursorEl.classList.add('ripple');
  }
}

function renderUrlBar(step) {
  urlTextEl.textContent = step.url || 'about:blank';
}

function renderScreenshotMode(step) {
  document.getElementById('img-a').style.display = 'block';
  document.getElementById('img-b').style.display = 'block';
  domFrameEl.style.display = 'none';
  domInspectorEl.style.display = 'none';
  domHoverBoxEl.style.display = 'none';

  if (!step.screenshot) {
    shotFrameEl.style.display = 'none';
    document.getElementById('screenshot-wrap').insertAdjacentHTML('beforeend', '<div id="no-screenshot">No screenshot captured for this step.</div>');
    return;
  }
  shotFrameEl.style.display = 'block';

  const nextLayer = activeLayer === 'a' ? 'b' : 'a';
  const showEl = document.getElementById('img-' + nextLayer);
  const hideEl = document.getElementById('img-' + activeLayer);
  const src = 'data:image/png;base64,' + step.screenshot;

  showEl.onload = function () {
    if (!imgScale) {
      imgScale = { scaleX: 100 / showEl.naturalWidth, scaleY: 100 / showEl.naturalHeight };
      shotFrameEl.style.aspectRatio = showEl.naturalWidth + ' / ' + showEl.naturalHeight;
    }
    showEl.style.opacity = '1';
    hideEl.style.opacity = '0';
    positionOverlaysFor(step);
  };
  showEl.src = src;
  activeLayer = nextLayer;
}

/** Scale the DOM iframe (rendered at its real pixel size) to fit the available frame width */
function applyDomScale() {
  const naturalWidth = Number(domFrameEl.getAttribute('width')) || 1280;
  const scale = shotFrameEl.clientWidth / naturalWidth;
  domFrameEl.style.transform = 'scale(' + scale + ')';
  return scale;
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? '#' + el.id : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\\s+/).join('.')
    : '';
  return { tag: tag, id: id, cls: cls };
}

function wireDomInspection(doc) {
  doc.addEventListener('mouseover', function (e) {
    const el = e.target;
    if (!el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    const scale = applyDomScale();
    const frameRect = domFrameEl.getBoundingClientRect();
    domHoverBoxEl.style.display = 'block';
    domHoverBoxEl.style.left = (frameRect.left + rect.left * scale) + 'px';
    domHoverBoxEl.style.top = (frameRect.top + rect.top * scale) + 'px';
    domHoverBoxEl.style.width = (rect.width * scale) + 'px';
    domHoverBoxEl.style.height = (rect.height * scale) + 'px';
  }, true);

  doc.addEventListener('mouseout', function () {
    domHoverBoxEl.style.display = 'none';
  }, true);

  doc.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const info = describeElement(e.target);
    const text = (e.target.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    domInspectorEl.style.display = 'block';
    domInspectorEl.innerHTML =
      '<span class="tag">&lt;' + info.tag + '&gt;</span> ' +
      '<span class="attr">' + info.id + info.cls + '</span>' +
      (text ? ' \\u2014 "' + text + '"' : '');
  }, true);

  doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
}

function renderDomMode(step) {
  document.getElementById('img-a').style.display = 'none';
  document.getElementById('img-b').style.display = 'none';
  highlightEl.style.display = 'none';
  cursorEl.style.display = 'none';
  domInspectorEl.style.display = 'none';
  domHoverBoxEl.style.display = 'none';
  shotFrameEl.style.display = 'block';

  const naturalWidth = imgScale ? Math.round(100 / imgScale.scaleX) : 1280;
  const naturalHeight = imgScale ? Math.round(100 / imgScale.scaleY) : 720;
  domFrameEl.setAttribute('width', naturalWidth);
  domFrameEl.setAttribute('height', naturalHeight);
  domFrameEl.style.width = naturalWidth + 'px';
  domFrameEl.style.height = naturalHeight + 'px';
  domFrameEl.style.display = 'block';

  domFrameEl.onload = function () {
    applyDomScale();
    try {
      wireDomInspection(domFrameEl.contentDocument);
    } catch {
      // Cross-origin or inaccessible snapshot -- inspection unavailable, still viewable.
    }
  };
  domFrameEl.srcdoc = step.domSnapshot || DOM_FALLBACK;
}

function renderScreenshot() {
  const noShot = document.getElementById('no-screenshot');
  if (noShot) noShot.remove();

  if (trace.steps.length === 0) {
    shotFrameEl.style.display = 'none';
    document.getElementById('browser-chrome').style.display = 'none';
    document.getElementById('screenshot-wrap').insertAdjacentHTML('beforeend', '<div id="no-screenshot">No steps recorded for this trace.</div>');
    return;
  }
  const step = trace.steps[activeIndex];
  renderUrlBar(step);
  if (viewMode === 'dom') renderDomMode(step);
  else renderScreenshotMode(step);
}

function renderStatusbar() {
  if (trace.steps.length === 0) { statusEl.innerHTML = ''; return; }
  const step = trace.steps[activeIndex];
  statusEl.innerHTML =
    '<span>Step <strong>' + (activeIndex + 1) + '</strong> of ' + trace.steps.length + '</span>' +
    '<span>\\u00b7</span><span><strong>' + step.action + '</strong></span>' +
    '<span class="spacer"></span><span id="target-label">' + step.target + '</span>' +
    '<button id="copy-target">Copy target</button>';
  document.getElementById('copy-target').addEventListener('click', function () {
    navigator.clipboard.writeText(step.target).catch(function () {});
    const btn = document.getElementById('copy-target');
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Copy target'; }, 1200);
  });
}

/** Relative duration weight for each step's Gantt segment (ms, floor 80ms so short/last steps stay visible) */
function stepWeights() {
  return trace.steps.map(function (step, i) {
    if (i < trace.steps.length - 1) return Math.max(80, trace.steps[i + 1].timestamp - step.timestamp);
    return 150;
  });
}

function renderPlayback() {
  if (trace.steps.length < 2) { playbackEl.innerHTML = ''; return; }
  const weights = stepWeights();
  const segments = trace.steps.map(function (step, i) {
    const cls = ['segment'];
    if (i === activeIndex) cls.push('active');
    if (i < activeIndex) cls.push('passed');
    return '<div class="' + cls.join(' ') + '" data-index="' + i + '" style="flex-grow:' + weights[i] +
      ';background:' + colorFor(step.action) + '" title="' + (i + 1) + '. ' + step.action + ' \\u2014 ' + step.target + '"></div>';
  }).join('');

  playbackEl.innerHTML =
    '<div id="play-btn" title="Play/Pause (space)">' + (isPlaying ? PAUSE_ICON : PLAY_ICON) + '</div>' +
    '<div id="gantt">' + segments + '</div>' +
    '<div id="speed-btn" title="Playback speed">' + speed + 'x</div>' +
    '<span class="meta-right">' + (activeIndex + 1) + ' / ' + trace.steps.length + '</span>';

  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('speed-btn').addEventListener('click', function () {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    renderPlayback();
    if (isPlaying) scheduleNext();
  });
  for (const seg of playbackEl.querySelectorAll('.segment')) {
    seg.addEventListener('click', function () {
      stop();
      activeIndex = Number(seg.dataset.index);
      render();
    });
  }
}

function togglePlay() {
  isPlaying ? stop() : play();
}
function play() {
  if (trace.steps.length < 2) return;
  if (activeIndex >= trace.steps.length - 1) activeIndex = 0;
  isPlaying = true;
  renderPlayback();
  scheduleNext();
}
function stop() {
  isPlaying = false;
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  renderPlayback();
}
function scheduleNext() {
  if (playTimer) clearTimeout(playTimer);
  playTimer = setTimeout(function () {
    if (!isPlaying) return;
    if (activeIndex >= trace.steps.length - 1) { stop(); return; }
    activeIndex++;
    render();
    if (isPlaying) scheduleNext();
  }, 900 / speed);
}

function celebrate() {
  if (trace.status === 'passed') { topbarEl.classList.add('celebrate'); setTimeout(function () { topbarEl.classList.remove('celebrate'); }, 1200); }
  else if (trace.status === 'failed') { topbarEl.classList.add('shake'); setTimeout(function () { topbarEl.classList.remove('shake'); }, 500); }
}

function render() {
  renderSidebar();
  renderFilmstrip();
  renderScreenshot();
  renderStatusbar();
  renderPlayback();
  const activeLi = stepsEl.querySelector('li.active');
  if (activeLi) activeLi.scrollIntoView({ block: 'nearest' });
}

searchEl.addEventListener('input', function () { filter = searchEl.value; renderSidebar(); });

shotFrameEl.addEventListener('click', function () {
  if (viewMode === 'dom') return;
  zoomed = !zoomed;
  shotFrameEl.classList.toggle('zoomed', zoomed);
});

function setViewMode(mode) {
  viewMode = mode;
  modeScreenshotBtn.classList.toggle('active', mode === 'screenshot');
  modeDomBtn.classList.toggle('active', mode === 'dom');
  shotFrameEl.classList.toggle('dom-mode', mode === 'dom');
  zoomed = false;
  shotFrameEl.classList.remove('zoomed');
  renderScreenshot();
}
modeScreenshotBtn.addEventListener('click', function () { setViewMode('screenshot'); });
modeDomBtn.addEventListener('click', function () { setViewMode('dom'); });

window.addEventListener('resize', function () {
  if (viewMode === 'dom') applyDomScale();
});

// Resizable sidebar
(function () {
  let dragging = false;
  resizeHandleEl.addEventListener('pointerdown', function (e) {
    dragging = true;
    resizeHandleEl.classList.add('dragging');
    resizeHandleEl.setPointerCapture(e.pointerId);
  });
  resizeHandleEl.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    const width = Math.min(480, Math.max(220, e.clientX));
    sidebarEl.style.width = width + 'px';
  });
  function endDrag() { dragging = false; resizeHandleEl.classList.remove('dragging'); }
  resizeHandleEl.addEventListener('pointerup', endDrag);
  resizeHandleEl.addEventListener('pointercancel', endDrag);
})();

document.addEventListener('keydown', function (e) {
  if (document.activeElement === searchEl) {
    if (e.key === 'Escape') { searchEl.value = ''; filter = ''; renderSidebar(); searchEl.blur(); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); searchEl.focus(); return; }
  if (trace.steps.length === 0) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (e.key === 'ArrowDown' || e.key === 'j') {
    stop(); activeIndex = Math.min(activeIndex + 1, trace.steps.length - 1); zoomed = false; render();
  } else if (e.key === 'ArrowUp' || e.key === 'k') {
    stop(); activeIndex = Math.max(activeIndex - 1, 0); zoomed = false; render();
  } else if (e.key === 'f' && viewMode === 'screenshot') {
    zoomed = !zoomed;
    shotFrameEl.classList.toggle('zoomed', zoomed);
  }
});

render();
setTimeout(celebrate, 300);
</script>
</body>
</html>
`;
}
