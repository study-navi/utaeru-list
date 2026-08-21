#!/usr/bin/env node
/**
 * 公開viewer「曲を探す」折りたたみパネル テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORTS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function buildViewerFixture(name, songs) {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  const cfg = {
    streamerName: '折りたたみテスト',
    subtitle: '',
    themeType: 'preset',
    presetIndex: 0,
    songMeta: {},
    tagPresets: [],
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
  html = html.replace(/<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`);
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = ${JSON.stringify(songs)};`);
  const p = path.join(ROOT, 'scripts', `.fixture-search-panel-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function measureListTop(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header.top');
    const dividerY = header?.getBoundingClientRect().bottom ?? 0;
    const firstSong = document.querySelector('#results .artist-accordion-trigger, #results .flat-song-item, #results .song-item, #results li');
    const meta = document.getElementById('resultMeta');
    const firstY = firstSong?.getBoundingClientRect().top
      ?? meta?.getBoundingClientRect().top
      ?? dividerY;
    const randomOutside = document.getElementById('randomBtn')?.closest('.random-row');
    const markInside = document.getElementById('statusFilterRow')?.closest('.song-search-panel-body');
    const panel = document.getElementById('songSearchPanel');
    return {
      listOffset: Math.round(firstY - dividerY),
      collapsed: panel?.classList.contains('is-collapsed'),
      expanded: panel?.classList.contains('is-expanded'),
      ariaExpanded: document.getElementById('songSearchPanelToggle')?.getAttribute('aria-expanded'),
      summary: document.getElementById('songSearchPanelSummary')?.textContent?.trim() || '',
      randomOutside: !!randomOutside && !document.getElementById('songSearchPanel')?.contains(randomOutside),
      markInside: !!markInside,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      panelH: panel?.offsetHeight ?? 0,
    };
  });
}

async function resetViewerFilters(page) {
  await page.evaluate(() => {
    activeFilter = null;
    activeMark = null;
    newOnly = false;
    activeGyo = null;
    activeKana = null;
    searchInput.value = '';
    searchPanelExpanded = null;
    refreshNarrowFilterChips?.();
    refreshStatusChips?.();
    render();
    applySearchPanelState();
  });
  await page.waitForTimeout(150);
}

async function checkViewer(page, url, label, width) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
  await resetViewerFilters(page);
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate(() => applySearchPanelState());
  await page.waitForTimeout(120);

  const init = await measureListTop(page);
  if (init.collapsed && init.ariaExpanded === 'false') {
    ok(`${label}: 初期折りたたみ`);
  } else {
    fail(`${label}: 初期折りたたみ`, JSON.stringify(init));
  }

  if (init.summary.includes('アーティスト') && init.summary.includes('あ→ん')) {
    ok(`${label}: 条件要約 ${init.summary.slice(0, 40)}…`);
  } else fail(`${label}: 条件要約`, init.summary);

  if (init.randomOutside && init.markInside) ok(`${label}: ランダム外・マーク内`);
  else fail(`${label}: 配置`, JSON.stringify({ randomOutside: init.randomOutside, markInside: init.markInside }));

  if (!init.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);

  if (!init.expanded) {
    await page.click('#songSearchPanelToggle');
    await page.waitForTimeout(280);
  }
  const opened = await measureListTop(page);
  if (opened.expanded && opened.ariaExpanded === 'true') ok(`${label}: 開く`);
  else fail(`${label}: 開く`, JSON.stringify(opened));

  await page.locator('#narrowFilterRow .chip', { hasText: 'J-POP' }).click();
  await page.waitForTimeout(150);
  const afterGenre = await page.evaluate(() => ({
    expanded: document.getElementById('songSearchPanel')?.classList.contains('is-expanded'),
    active: [...document.querySelectorAll('#narrowFilterRow .chip.active')].map((c) => c.textContent?.trim()),
  }));
  if (afterGenre.expanded && afterGenre.active.includes('J-POP')) ok(`${label}: ジャンル後も展開維持`);
  else fail(`${label}: ジャンル後展開`, JSON.stringify(afterGenre));

  await page.locator('#statusFilterRow .chip', { hasText: 'お気に入り' }).click();
  await page.waitForTimeout(150);
  const afterMark = await page.evaluate(() => document.getElementById('songSearchPanel')?.classList.contains('is-expanded'));
  if (afterMark) ok(`${label}: マーク後も展開維持`);
  else fail(`${label}: マーク後展開`);

  await page.fill('#searchInput', '青');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const afterSearch = await page.evaluate(() => ({
    expanded: document.getElementById('songSearchPanel')?.classList.contains('is-expanded'),
    summary: document.getElementById('songSearchPanelSummary')?.textContent || '',
  }));
  if (afterSearch.expanded) ok(`${label}: 検索後も展開維持`);
  else fail(`${label}: 検索後展開`);

  await page.click('#songSearchPanelToggle');
  await page.waitForTimeout(280);
  const closed = await measureListTop(page);
  if (closed.collapsed) ok(`${label}: 閉じる`);
  else fail(`${label}: 閉じる`, JSON.stringify(closed));

  return { collapsedOffset: closed.listOffset, expandedOffset: opened.listOffset, collapsedPanelH: closed.panelH };
}

async function checkEditor(page, label, width) {
  await page.setViewportSize({ width, height: 844 });
  await addBypassStart(page);
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
  await page.click('#editTabSongs');
  await page.waitForTimeout(200);
  const data = await page.evaluate(() => ({
    expanded: document.getElementById('songSearchPanel')?.classList.contains('is-expanded'),
    hasPanel: !!document.getElementById('songSearchPanel'),
    freeTag: !!document.getElementById('tagFilterRow') || document.body.textContent.includes('自由タグ'),
    scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  if (data.hasPanel && data.expanded) ok(`${label}: 編集初期展開`);
  else fail(`${label}: 編集初期`, JSON.stringify(data));
  if (!data.freeTag) ok(`${label}: 編集 自由タグUIなし`);
  else fail(`${label}: 自由タグ`);
  if (!data.scroll) ok(`${label}: 編集 横スクロールなし`);
  else fail(`${label}: 編集 横スクロール`);
}

async function check404() {
  const src = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  for (const needle of ['songSearchPanel', 'songSearchPanelToggle', 'songSearchPanelSummary', 'statusFilterRow', 'buildSearchPanelSummary']) {
    if (src.includes(needle)) ok(`404.html: ${needle}`);
    else fail(`404.html missing ${needle}`);
  }
  if (!src.includes('<div class="filter-row" id="statusFilterRow"></div>\n\n  <div class="random-row">')) {
    ok('404.html: statusFilterRowがパネル内');
  } else fail('404.html: statusFilterRowがパネル外');
}

async function measureBaselineBefore(page, url) {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  return measureListTop(page);
}

async function main() {
  console.log('=== test-search-panel-collapse.mjs ===\n');
  check404();

  const songs = [
    { k: 'あ', y: 'あ', a: 'Alpha', t: 'Song A', ty: 'そんぐえー', tk: 's' },
    { k: 'か', y: 'き', a: 'Beta', t: 'Song B', ty: 'そんぐびー', tk: 's' },
    { k: 'さ', y: 'し', a: 'Gamma', t: 'Song C', ty: 'そんぐしー', tk: 's' },
  ];
  const url = buildViewerFixture('viewer', songs);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');

  const heights = {};
  for (const w of VIEWPORTS) {
    heights[w] = await checkViewer(page, url, `${w}px`, w);
  }

  await checkEditor(page, '375px', 375);

  if (!errors.length) ok('viewer: Consoleエラーなし');
  else fail('viewer: Console', errors.join('; '));

  const h375 = heights[375];
  ok(`375px: 折りたたみ時 タイトル下→曲一覧 ${h375.collapsedOffset}px (panel ${h375.collapsedPanelH}px)`);
  ok(`375px: 展開時 タイトル下→曲一覧 ${h375.expandedOffset}px`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
  await resetViewerFilters(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.evaluate(() => {
    searchPanelExpanded = true;
    applySearchPanelState();
  });
  await page.waitForTimeout(200);
  const forcedExpanded = await measureListTop(page);
  await page.evaluate(() => {
    searchPanelExpanded = false;
    applySearchPanelState();
  });
  await page.waitForTimeout(200);
  const forcedCollapsed = await measureListTop(page);
  const savedPx = forcedExpanded.listOffset - forcedCollapsed.listOffset;
  ok(`375px: 折りたたみで曲一覧まで ${savedPx}px 短縮 (展開 ${forcedExpanded.listOffset}px → 折りたたみ ${forcedCollapsed.listOffset}px)`);

  await page.close();
  await browser.close();
  fs.unlinkSync(url.replace('file://', ''));

  console.log(failed ? `\n${failed} failure(s)` : '\nAll search panel collapse tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
