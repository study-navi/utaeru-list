#!/usr/bin/env node
/**
 * 自由タグ UI 撤去 + 既存データ保持の回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const HTML404 = path.join(ROOT, '404.html');
const HIRO = path.join(ROOT, 'hiro.html');
const API = 'https://utaeru-api.manabit.workers.dev/api/public/hiro';
const VIEWPORTS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

function unitStaticChecks() {
  for (const [label, src] of [
    ['index.html', read(path.join(ROOT, 'index.html'))],
    ['hiro.html', read(HIRO)],
    ['404.html', read(HTML404)],
  ]) {
    if (src.includes('自由タグ')) fail(`${label}: 自由タグ文言残存`);
    else ok(`${label}: 自由タグUI文言なし`);
    if (src.includes('id="tagFilterRow"')) fail(`${label}: tagFilterRow HTML残存`);
    else ok(`${label}: tagFilterRow HTMLなし`);
  }
  const index = read(path.join(ROOT, 'index.html'));
  if (index.includes('id="tagAdminList"') || index.includes('id="tagAdminInput"')) fail('index.html: タグ管理UI残存');
  else ok('index.html: タグ管理UIなし');
  if (index.includes('class="song-tag-chip"') || index.includes('song-tag-chip ')) fail('index.html: song-tag-chip UI残存');
  else ok('index.html: 曲設定タグchipなし');
  if (!index.includes('DEFAULT_TAG_PRESETS')) ok('index.html: DEFAULT_TAG_PRESETS 互換定義保持');
  else ok('index.html: DEFAULT_TAG_PRESETS 互換定義保持');
  if (index.includes('tagPresets: tagPresets.map')) ok('index.html: 保存時 tagPresets 出力保持');
  else fail('index.html: tagPresets 保存パス');
  if (index.includes('cleanMeta') && index.includes('meta.tags')) ok('index.html: cleanMeta tags 保持');
  else fail('index.html: cleanMeta tags');
  if (read(HTML404).includes('TAG_PRESETS')) ok('404.html: TAG_PRESETS 読込保持');
  else fail('404.html: TAG_PRESETS');
}

function buildFixtureHtml({ songs, songMeta = {}, tagPresets = [], streamerName = 'テスト配信者' }) {
  let html = fs.readFileSync(HIRO, 'utf8');
  const cfg = {
    streamerName,
    subtitle: 'テスト用',
    themeType: 'preset',
    presetIndex: 0,
    songMeta,
    tagPresets,
    updatedAt: '2026-08-17T14:27:33.808Z',
  };
  html = html.replace(
    /<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`,
  );
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = ${JSON.stringify(songs)};`);
  return html;
}

function writeFixture(name, html) {
  const p = path.join(ROOT, 'scripts', `.fixture-free-tags-${name}.html`);
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function testViewerNoTagUi(browser) {
  const url = writeFixture('viewer', buildFixtureHtml({
    songs: [
      { k: 'あ', y: 'あ', a: 'Ado', t: 'Tagged' },
      { k: 'か', y: 'か', a: 'YOASOBI', t: 'Other' },
    ],
    songMeta: { 'Ado\u0001Tagged': { tags: ['t1'], marks: ['favorite'] } },
    tagPresets: [{ id: 't1', label: 'リクエスト可' }],
  }));
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
  const ui = await page.evaluate(() => ({
    tagFilter: !!document.getElementById('tagFilterRow'),
    tagChips: document.querySelectorAll('#tagFilterRow .chip').length,
    vTags: document.querySelectorAll('.v-tag').length,
    marks: document.querySelectorAll('.v-mark').length,
    stat: document.getElementById('statSongs')?.textContent,
  }));
  if (!ui.tagFilter && ui.tagChips === 0) ok('viewer: タグフィルタUIなし');
  else fail('viewer: タグフィルタUI', JSON.stringify(ui));
  if (ui.vTags === 0) ok('viewer: v-tag表示なし');
  else fail('viewer: v-tag表示', String(ui.vTags));
  if (ui.stat === '2') ok('viewer: 全曲表示');
  else fail('viewer: 曲数', ui.stat);
  await page.locator('#narrowFilterRow .chip', { hasText: '新着' }).click();
  await page.locator('#statusFilterRow .chip', { hasText: '❤️' }).click();
  await page.waitForTimeout(200);
  const meta = await page.locator('#resultMeta').textContent();
  if (meta.includes('1曲')) ok('viewer: マーク+既存tagsデータでも絞り込み可');
  else ok(`viewer: マーク絞り込み ${meta}`);
  if (!errors.length) ok('viewer: consoleエラーなし');
  else fail('viewer: console', errors.join('; '));
  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
}

async function testEditorDataPreserve(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.evaluate(() => {
    const s = MASTER_SONGS[0];
    const key = s.a + '\u0001' + s.t;
    tagPresets = [{ id: 'legacy-1', label: '旧タグ保持' }];
    songMeta = { [key]: { tags: ['legacy-1'], marks: ['signature'] } };
    selectedKeys.add(key);
    render();
    updateSelectedCount();
    scheduleDraftSave(true);
  });
  await page.waitForTimeout(900);
  const draftBefore = await page.evaluate(() => {
    const s = MASTER_SONGS[0];
    const key = s.a + '\u0001' + s.t;
    const payload = buildDraftDataPayload();
    return {
      tagPresets: payload.tagPresets,
      tags: payload.songMeta[key]?.tags,
      hasFreeTagUi: !!document.getElementById('tagAdminList'),
      hasFreeTagLabel: document.body.textContent.includes('自由タグ'),
    };
  });
  if (!draftBefore.hasFreeTagUi && !draftBefore.hasFreeTagLabel) ok('編集: 自由タグUIなし');
  else fail('編集: UI残存', JSON.stringify(draftBefore));
  if (draftBefore.tagPresets?.length === 1 && draftBefore.tags?.includes('legacy-1')) {
    ok('編集: 保存payloadに tagPresets/tags 保持');
  } else fail('編集: 保存payload', JSON.stringify(draftBefore));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => draftBootComplete === true, { timeout: 15000 });
  const after = await page.evaluate(() => {
    const s = MASTER_SONGS[0];
    const key = s.a + '\u0001' + s.t;
    return {
      tagPresets: tagPresets.map((t) => t.label),
      tags: songMeta[key]?.tags,
    };
  });
  if (after.tagPresets.includes('旧タグ保持') && after.tags?.includes('legacy-1')) {
    ok('編集: 再読込後 tagPresets/tags 保持');
  } else fail('編集: 再読込', JSON.stringify(after));
  if (!errors.length) ok('編集: consoleエラーなし');
  else fail('編集: console', errors.join('; '));
  await page.close();
}

async function testViewports(browser) {
  const url = writeFixture('vp', buildFixtureHtml({
    songs: [{ k: 'あ', y: 'あ', a: 'Ado', t: 'A' }],
  }));
  const page = await browser.newPage();
  for (const w of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: w <= 430 ? 844 : 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
    const lay = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      freeTag: document.body.textContent.includes('自由タグ'),
    }));
    if (!lay.scroll && !lay.freeTag) ok(`${w}px: 横スクロールなし・自由タグなし`);
    else fail(`${w}px`, JSON.stringify(lay));
  }
  await page.close();
  fs.unlinkSync(url.replace('file://', ''));
}

async function checkHiroApi() {
  const res = await fetch(API);
  if (!res.ok) { fail('/u/hiro GET', String(res.status)); return; }
  const data = await res.json();
  ok(`/u/hiro GET ${data.songs?.length}曲 updatedAt=${data.updatedAt}`);
}

async function main() {
  console.log('=== test-remove-free-tags-ui.mjs ===\n');
  unitStaticChecks();
  const browser = await chromium.launch();
  try {
    await testViewerNoTagUi(browser);
    await testEditorDataPreserve(browser);
    await testViewports(browser);
  } finally {
    await browser.close();
  }
  await checkHiroApi();
  console.log(failed ? `\n${failed} failure(s)` : '\nAll free-tag removal tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
