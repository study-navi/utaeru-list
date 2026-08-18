#!/usr/bin/env node
/**
 * hiro.html のリスナー描画ロジックをベースに 404.html（Phase 4D 公開閲覧）を生成する。
 * 手動編集は 404.html ではなく、このスクリプトと hiro.html 側の viewer 部分を正本とする。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const hiro = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');

const cssMatch = hiro.match(/<style>([\s\S]*?)<\/style>/);
if (!cssMatch) throw new Error('hiro.html style block not found');
const css = cssMatch[1];

const searchBarMatch = hiro.match(/<div class="search-bar">[\s\S]*?<\/div>\s*\n\s*\n\s*<div class="filter-row" id="statusFilterRow"/);
if (!searchBarMatch) throw new Error('search-bar block not found in hiro.html');
const searchBarHtml = searchBarMatch[0].replace(/\n\s*\n\s*<div class="filter-row" id="statusFilterRow"$/, '');

const viewerStart = hiro.indexOf('// @genre-lookup-inject');
const viewerEnd = hiro.lastIndexOf('render();');
if (viewerStart < 0 || viewerEnd < 0) throw new Error('viewer script block not found in hiro.html');
let viewerJs = hiro.slice(viewerStart, viewerEnd + 'render();'.length);

viewerJs = viewerJs
  .replace(/^\/\/ @genre-lookup-inject/m, `function initPublicViewer(PUBLIC_DATA) {
let SONGS = PUBLIC_DATA.songs;
const SONG_META = PUBLIC_DATA.songMeta;
const TAG_PRESETS = PUBLIC_DATA.tagPresets;
function keyOf(s) { return s.a + "\\u0001" + s.t; }

// @genre-lookup-inject`)
  .replace(
    /document\.getElementById\('statSongs'\)\.textContent = SONGS\.length\.toLocaleString\('ja-JP'\);\n.*?render\(\);/s,
    `document.getElementById('statSongs').textContent = SONGS.length.toLocaleString('ja-JP');
document.getElementById('statArtists').textContent = new Set(SONGS.map(s => s.a)).size.toLocaleString('ja-JP');
document.getElementById('statUpdated').textContent = formatUpdatedLabel(PUBLIC_DATA.updatedAt);

initSortSelect();
render();
}`
  );

const html = `<!DOCTYPE html>
<html lang="ja" data-utalis-viewer="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>UTAEMO</title>
<style>
${css}
  .page-state {
    text-align: center;
    padding: 48px 16px;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.7;
  }
  .page-state .emoji { font-size: 32px; margin-bottom: 8px; }
  .page-state a { color: var(--accent); }
  #viewerRoot[hidden] { display: none !important; }
</style>
</head>
<body>
<div id="pageState" class="page-state">
  <div class="emoji">⏳</div>
  <div>読み込み中…</div>
</div>

<div id="viewerRoot" class="wrap" hidden>
  <header class="top">
    <div class="top-main">
      <p class="page-kind">歌える曲リスト</p>
      <h1 id="streamerName">-</h1>
      <p class="subtitle" id="subtitle">-</p>
      <div class="header-stats">
        <span><strong id="statSongs">-</strong> 曲</span>
        <span><strong id="statArtists">-</strong> 組</span>
        <span>更新 <strong id="statUpdated">-</strong></span>
      </div>
    </div>
    <span class="utalis-mark" aria-hidden="true">UTAEMO</span>
  </header>

  ${searchBarHtml}

  <div class="filter-row" id="statusFilterRow"></div>
  <div class="filter-row" id="tagFilterRow" style="display:none;"></div>

  <div class="random-row">
    <button class="random-btn" id="randomBtn">🎲 表示中からランダム</button>
    <div class="random-pick" id="randomPick"></div>
  </div>

  <div class="result-meta" id="resultMeta"></div>
  <div class="filter-summary" id="filterSummary" style="display:none;"></div>

  <div id="results"></div>

  <nav class="site-footer-nav" aria-label="うたエモ">
    <span class="site-footer-brand">UTAEMO</span>
    <a data-legal="terms.html" href="terms.html">利用規約</a>
    <a data-legal="privacy.html" href="privacy.html">プライバシー</a>
    <a data-legal="contact.html" href="contact.html">お問い合わせ</a>
  </nav>
  <footer class="catalog-footer">
    データ提供元：Mirrativ（ミラティブ）内カラオケアプリ「エモカラ」の楽曲一覧を個人配布しているGoogle Driveより取得（2026/7/28時点のカタログ）。配信者が歌える曲として選択したものを掲載しています。配信状況や仕様変更により、実際に歌える曲は変動する場合があります。
  </footer>
</div>

<script>
// Phase 4D: GitHub Pages 404.html SPA — /u/{streamerId} から D1 公開データを取得して表示
const API_BASE = 'https://utaeru-api.manabit.workers.dev';
function resolveSiteBase() {
  const host = location.hostname;
  if (host === 'utalis.github.io') return '';
  if (host === 'study-navi.github.io') return '/utaeru-list';
  const path = location.pathname || '';
  if (path.indexOf('/utaeru-list') === 0) return '/utaeru-list';
  return '';
}
const SITE_BASE = resolveSiteBase();
const PUBLIC_PATH_PREFIX = '/u/';
const CATALOG_UPDATED = '2026/7/28';
const STREAMER_ID_RE = /^[a-z0-9-]{3,32}$/;

const PRESETS = [
  { name:'ブルー',     light:'#2a78d6', dark:'#3987e5' },
  { name:'オレンジ',   light:'#eb6834', dark:'#d95926' },
  { name:'アクア',     light:'#1baf7a', dark:'#199e70' },
  { name:'イエロー',   light:'#eda100', dark:'#c98500' },
  { name:'マゼンタ',   light:'#e87ba4', dark:'#d55181' },
  { name:'グリーン',   light:'#008300', dark:'#008300' },
  { name:'バイオレット', light:'#4a3aa7', dark:'#9085e9' },
  { name:'レッド',     light:'#e34948', dark:'#e66767' },
];

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}
function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}
function relLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
function pickInk(hex) { return relLuminance(hex) > 0.45 ? '#0b0b0b' : '#ffffff'; }
function deriveWash(hex, targetL, sRange) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const s = clamp(hsl.s, sRange[0], sRange[1]);
  return hslToHex(hsl.h, s, targetL);
}
function themeFromPair(lightHex, darkHex) {
  return {
    light: lightHex,
    dark: darkHex,
    lightWash: deriveWash(lightHex, 93, [15, 35]),
    darkWash: deriveWash(darkHex, 19, [25, 45]),
    lightInk: pickInk(lightHex),
    darkInk: pickInk(darkHex),
  };
}
function deriveThemeFromSeed(seedHex) {
  const rgb = hexToRgb(seedHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const s = clamp(hsl.s, 45, 90);
  const lightAccent = hslToHex(hsl.h, s, clamp(hsl.l, 38, 52));
  const darkAccent = hslToHex(hsl.h, s, clamp(hsl.l, 56, 70));
  return themeFromPair(lightAccent, darkAccent);
}

function parseStreamerIdFromPath() {
  const path = decodeURIComponent(window.location.pathname).replace(/\\/+$/, '') || '/';
  for (const prefix of [SITE_BASE + PUBLIC_PATH_PREFIX, PUBLIC_PATH_PREFIX]) {
    if (path.startsWith(prefix)) {
      const id = path.slice(prefix.length);
      if (id && !id.includes('/')) return id;
    }
  }
  return null;
}

function normalizePublicData(api) {
  return {
    version: Number.isInteger(api.configVersion) ? api.configVersion : 1,
    streamer: {
      id: (typeof api.streamerId === 'string' && api.streamerId) ? api.streamerId : null,
      name: api.streamerName || '',
      subtitle: api.subtitle || '',
    },
    songs: Array.isArray(api.songs) ? api.songs : [],
    songMeta: (api.songMeta && typeof api.songMeta === 'object') ? api.songMeta : {},
    tagPresets: Array.isArray(api.tagPresets) ? api.tagPresets : [],
    updatedAt: api.updatedAt || null,
    themeType: api.themeType || 'preset',
    presetIndex: api.presetIndex,
    customHex: api.customHex || null,
  };
}

function formatUpdatedLabel(updatedAt) {
  if (!updatedAt) return CATALOG_UPDATED;
  const d = new Date(updatedAt);
  if (isNaN(d.getTime())) return CATALOG_UPDATED;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function applyAccentTheme(themeType, presetIndex, customHex) {
  let light, dark, lightWash, darkWash, lightInk, darkInk;
  if (themeType === 'custom' && typeof customHex === 'string' && customHex) {
    const derived = deriveThemeFromSeed(customHex);
    light = derived.light;
    dark = derived.dark;
    lightWash = derived.lightWash;
    darkWash = derived.darkWash;
    lightInk = derived.lightInk;
    darkInk = derived.darkInk;
  } else {
    const idx = Number.isInteger(presetIndex) ? presetIndex : 0;
    const p = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, idx))];
    const derived = themeFromPair(p.light, p.dark);
    light = derived.light;
    dark = derived.dark;
    lightWash = derived.lightWash;
    darkWash = derived.darkWash;
    lightInk = derived.lightInk;
    darkInk = derived.darkInk;
  }
  let style = document.getElementById('dynamic-theme');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamic-theme';
    document.head.appendChild(style);
  }
  style.textContent = \`
    :root { --accent: \${light}; --accent-ink: \${lightInk}; --accent-wash: \${lightWash}; }
  \`;
}

function showPageState(emoji, messageHtml) {
  const el = document.getElementById('pageState');
  el.hidden = false;
  el.innerHTML = '<div class="emoji">' + emoji + '</div><div>' + messageHtml + '</div>';
  document.getElementById('viewerRoot').hidden = true;
}

function showViewer() {
  document.getElementById('pageState').hidden = true;
  document.getElementById('viewerRoot').hidden = false;
}

async function bootstrapPublicViewer() {
  const streamerId = parseStreamerIdFromPath();
  if (!streamerId || !STREAMER_ID_RE.test(streamerId)) {
    document.title = 'ページが見つかりません';
    showPageState('🔍', 'ページが見つかりません。<br><a href="' + SITE_BASE + '/">うたエモ ビルダー</a>');
    return;
  }

  showPageState('⏳', '読み込み中…');

  let res;
  try {
    res = await fetch(API_BASE + '/api/public/' + encodeURIComponent(streamerId), {
      method: 'GET',
      credentials: 'omit',
    });
  } catch (e) {
    document.title = '読み込みエラー';
    showPageState('⚠️', 'うまく読み込めませんでした。<br>もう一度お試しください。<br><a href="' + SITE_BASE + '/">うたエモトップ</a>');
    return;
  }

  if (res.status === 404) {
    document.title = '公開ページが見つかりません';
    showPageState('🔍', '公開ページが見つかりません。<br>URLを確認するか、配信者に最新のリンクを確認してください。');
    return;
  }
  if (res.status === 410) {
    document.title = '公開されていません';
    showPageState('📭', 'この公開ページは現在公開されていません。<br><a href="' + SITE_BASE + '/">うたエモで歌える曲リストを作る</a>');
    return;
  }
  if (!res.ok) {
    document.title = '読み込みエラー';
    showPageState('⚠️', 'うまく読み込めませんでした。<br>もう一度お試しください。<br><a href="' + SITE_BASE + '/">うたエモトップ</a>');
    return;
  }

  let api;
  try {
    api = await res.json();
  } catch (e) {
    document.title = '読み込みエラー';
    showPageState('⚠️', 'うまく読み込めませんでした。<br>もう一度お試しください。<br><a href="' + SITE_BASE + '/">うたエモトップ</a>');
    return;
  }

  const publicData = normalizePublicData(api);
  const name = publicData.streamer.name || streamerId;
  document.title = name + ' - UTAEMO';
  document.getElementById('streamerName').textContent = name;
  document.getElementById('subtitle').textContent = publicData.streamer.subtitle || '';
  applyAccentTheme(api.themeType, api.presetIndex, api.customHex);
  showViewer();
  initPublicViewer(publicData);
}

function applySiteFooterLinks() {
  document.querySelectorAll('.site-footer-nav a[data-legal]').forEach((a) => {
    const file = a.getAttribute('data-legal');
    if (file) a.href = SITE_BASE + '/' + file;
  });
}

${viewerJs}

applySiteFooterLinks();
bootstrapPublicViewer();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, '404.html'), html);
console.log('Wrote 404.html (' + Buffer.byteLength(html, 'utf8') + ' bytes)');
