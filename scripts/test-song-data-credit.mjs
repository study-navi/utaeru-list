#!/usr/bin/env node
/**
 * 楽曲データ協力クレジット表記の回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIRO = path.join(ROOT, 'hiro.html');
const INDEX = path.join(ROOT, 'index.html');
const HTML404 = path.join(ROOT, '404.html');
const NOTION = 'https://separated-windscreen-557.notion.site/15b0f290a47d80a7a8ccdd12f67e530d?v=1740f290a47d802aa07f000c735a0c76';
const WIDTHS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function readCreditBlock(src) {
  const m = src.match(/<aside class="song-data-credit"[\s\S]*?<\/aside>/);
  return m ? m[0] : '';
}

function assertCreditHtml(label, src) {
  const block = readCreditBlock(src);
  if (!block) { fail(`${label}: song-data-credit なし`); return; }
  if (block.includes('楽曲データ協力：真君')) ok(`${label}: 協力表記`);
  else fail(`${label}: 協力表記`);
  if (block.includes('作成者')) fail(`${label}: 「作成者」表記なし`, block);
  else ok(`${label}: 「作成者」表記なし`);
  if (block.includes(`href="${NOTION}"`)) ok(`${label}: Notionリンク`);
  else fail(`${label}: Notionリンク`);
  if (block.includes('target="_blank"') && block.includes('rel="noopener noreferrer"')) {
    ok(`${label}: 外部リンク属性`);
  } else fail(`${label}: 外部リンク属性`);
}

function runStaticTests() {
  assertCreditHtml('hiro.html', fs.readFileSync(HIRO, 'utf8'));
  assertCreditHtml('index.html', fs.readFileSync(INDEX, 'utf8'));
  assertCreditHtml('404.html', fs.readFileSync(HTML404, 'utf8'));

  const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'build-404-html.mjs'), 'utf8');
  if (buildSrc.includes('song-data-credit') && buildSrc.includes('creditMatch')) {
    ok('build-404-html.mjs: hiro.htmlからクレジット抽出');
  } else fail('build-404-html.mjs: クレジット抽出');

  execSync('node scripts/build-404-html.mjs', { cwd: ROOT, stdio: 'pipe' });
  const regen = fs.readFileSync(HTML404, 'utf8');
  if (regen.includes('楽曲データ協力：真君') && regen.includes('song-data-credit')) {
    ok('404.html再生成後もクレジット維持');
  } else fail('404.html再生成後もクレジット維持');
}

function buildViewerFixture() {
  let html = fs.readFileSync(HIRO, 'utf8');
  const cfg = {
    streamerName: 'クレジットテスト',
    subtitle: '',
    themeType: 'preset',
    presetIndex: 0,
    songMeta: {},
    tagPresets: [],
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
  html = html.replace(/<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`);
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, 'const SONGS = [{"k":"あ","y":"あ","a":"A","t":"Alpha"}];');
  const p = path.join(ROOT, 'scripts', '.fixture-song-data-credit.html');
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function checkLayout(page, label, width) {
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
  await page.waitForTimeout(100);
  const data = await page.evaluate(() => {
    const credit = document.querySelector('.song-data-credit');
    const link = credit?.querySelector('a');
    const results = document.getElementById('results');
    const creditRect = credit?.getBoundingClientRect();
    const resultsRect = results?.getBoundingClientRect();
    return {
      text: credit?.textContent?.replace(/\s+/g, ' ').trim() || '',
      linkHref: link?.getAttribute('href') || '',
      linkTarget: link?.getAttribute('target') || '',
      linkRel: link?.getAttribute('rel') || '',
      fontSize: credit ? parseFloat(getComputedStyle(credit).fontSize) : 0,
      color: credit ? getComputedStyle(credit).color : '',
      afterResults: creditRect && resultsRect ? creditRect.top >= resultsRect.bottom - 2 : false,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      linkLines: link ? [...(() => {
        const range = document.createRange();
        range.selectNodeContents(link);
        return range.getClientRects();
      })()].length : 0,
    };
  });
  if (data.text.includes('楽曲データ協力：真君') && data.text.includes('データ元：楽曲リスト（Notion）')) {
    ok(`${label}@${width}px: 表記`);
  } else fail(`${label}@${width}px: 表記`, data.text);
  if (data.linkHref === NOTION && data.linkTarget === '_blank' && data.linkRel.includes('noopener')) {
    ok(`${label}@${width}px: リンク`);
  } else fail(`${label}@${width}px: リンク`, JSON.stringify(data));
  if (data.afterResults) ok(`${label}@${width}px: 曲一覧の後`);
  else fail(`${label}@${width}px: 曲一覧の後`);
  if (data.fontSize >= 10 && data.fontSize <= 12) ok(`${label}@${width}px: 文字サイズ ${data.fontSize}px`);
  else fail(`${label}@${width}px: 文字サイズ`, String(data.fontSize));
  if (!data.scroll) ok(`${label}@${width}px: 横スクロールなし`);
  else fail(`${label}@${width}px: 横スクロール`);
}

async function runBrowserTests(browser) {
  const viewerUrl = buildViewerFixture();
  const viewerPage = await browser.newPage();
  const viewerErrors = [];
  viewerPage.on('pageerror', (e) => viewerErrors.push(e.message));
  await viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
  await viewerPage.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-');
  for (const w of WIDTHS) await checkLayout(viewerPage, 'viewer', w);
  if (!viewerErrors.length) ok('viewer: Consoleエラーなし');
  else fail('viewer: Consoleエラー', viewerErrors.join('; '));
  await viewerPage.close();
  fs.unlinkSync(viewerUrl.replace('file://', ''));

  const editorPage = await browser.newPage();
  const editorErrors = [];
  editorPage.on('pageerror', (e) => editorErrors.push(e.message));
  await addBypassStart(editorPage);
  await editorPage.goto(`file://${INDEX}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await editorPage.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
  await editorPage.click('#editTabSongs');
  await editorPage.waitForSelector('#panelSongs:not([hidden])');
  const editorCredit = await editorPage.evaluate(() => {
    const panel = document.getElementById('panelSongs');
    const credit = panel?.querySelector('.song-data-credit');
    return !!credit && credit.textContent?.includes('真君');
  });
  if (editorCredit) ok('編集: 曲を選ぶ画面にクレジット');
  else fail('編集: 曲を選ぶ画面にクレジット');
  for (const w of WIDTHS) await checkLayout(editorPage, 'editor', w);
  if (!editorErrors.length) ok('editor: Consoleエラーなし');
  else fail('editor: Consoleエラー', editorErrors.join('; '));
  await editorPage.close();
}

async function checkHiroApi() {
  const res = await fetch('https://utaeru-api.manabit.workers.dev/api/public/hiro');
  const j = await res.json();
  ok(`/u/hiro GET ${j.songs?.length}曲 updatedAt=${j.updatedAt}（参照のみ）`);
}

async function main() {
  console.log('=== test-song-data-credit.mjs ===\n');
  runStaticTests();
  const indexHtml = fs.readFileSync(INDEX, 'utf8');
  const masterMatch = indexHtml.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
  const masterCount = masterMatch ? JSON.parse(masterMatch[1]).length : 0;
  const batchMatch = indexHtml.match(/const CURRENT_NEW_BATCH = "([^"]+)"/);
  ok(`MASTER_SONGS ${masterCount}曲`);
  ok(`CURRENT_NEW_BATCH ${batchMatch?.[1] || '?'}`);

  const browser = await chromium.launch();
  try {
    await runBrowserTests(browser);
    await checkHiroApi();
  } finally {
    await browser.close();
  }

  console.log(failed ? `\n${failed} failure(s)` : '\nAll song data credit tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
