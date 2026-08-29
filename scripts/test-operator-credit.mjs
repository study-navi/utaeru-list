#!/usr/bin/env node
/**
 * 運営者表記フッターの回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDIT = '© 2026 UTAEMO / 運営：湊音ヒロ';
const WIDTHS = [320, 375, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function assertStatic(label, src) {
  if (src.includes(CREDIT)) ok(`${label}: 運営者表記`);
  else fail(`${label}: 運営者表記`);
}

function runStaticTests() {
  assertStatic('hiro.html', fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8'));
  assertStatic('index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  assertStatic('404.html', fs.readFileSync(path.join(ROOT, '404.html'), 'utf8'));

  const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts/build-404-html.mjs'), 'utf8');
  if (buildSrc.includes('operator-credit') && buildSrc.includes('operatorCreditMatch')) {
    ok('build-404-html.mjs: operator-credit 抽出');
  } else fail('build-404-html.mjs: operator-credit 抽出');

  execSync('node scripts/build-404-html.mjs', { cwd: ROOT, stdio: 'pipe' });
  assertStatic('404.html再生成', fs.readFileSync(path.join(ROOT, '404.html'), 'utf8'));

  const b64 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/id="viewer-template-b64">([^<]+)/);
  if (b64 && Buffer.from(b64[1], 'base64').toString('utf8').includes(CREDIT)) {
    ok('index.html viewer-template-b64: 運営者表記');
  } else fail('index.html viewer-template-b64: 運営者表記');
}

function buildViewerFixture() {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, 'const SONGS = [{"k":"あ","y":"あ","a":"A","t":"Alpha"}];');
  const p = path.join(ROOT, 'scripts', '.fixture-operator-credit.html');
  fs.writeFileSync(p, html);
  return `file://${p}`;
}

async function checkFooter(page, label, width) {
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
  await page.waitForTimeout(120);
  const data = await page.evaluate((credit) => {
    const el = document.querySelector('.operator-credit, .site-footer-copy');
    const footer = document.querySelector('.site-footer');
    const rect = el?.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const style = el ? getComputedStyle(el) : null;
    return {
      text: el?.textContent?.trim() || footer?.querySelector('.site-footer-copy')?.textContent?.trim() || '',
      fontSize: style ? parseFloat(style.fontSize) : 0,
      color: style?.color || '',
      textAlign: style?.textAlign || '',
      nearBottom: rect ? rect.bottom >= bodyRect.bottom - 120 : false,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, CREDIT);

  if (data.text === CREDIT) ok(`${label}@${width}px: 表記`);
  else fail(`${label}@${width}px: 表記`, data.text);
  if (data.fontSize >= 10 && data.fontSize <= 12) ok(`${label}@${width}px: 文字サイズ ${data.fontSize}px`);
  else fail(`${label}@${width}px: 文字サイズ`, String(data.fontSize));
  if (data.textAlign === 'center') ok(`${label}@${width}px: 中央揃え`);
  else fail(`${label}@${width}px: 中央揃え`, data.textAlign);
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
  for (const w of WIDTHS) await checkFooter(viewerPage, 'viewer', w);
  if (!viewerErrors.length) ok('viewer: Consoleエラーなし');
  else fail('viewer: Consoleエラー', viewerErrors.join('; '));
  await viewerPage.close();
  fs.unlinkSync(viewerUrl.replace('file://', ''));

  const editorPage = await browser.newPage();
  const editorErrors = [];
  editorPage.on('pageerror', (e) => editorErrors.push(e.message));
  await addBypassStart(editorPage);
  await editorPage.goto(`file://${path.join(ROOT, 'index.html')}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await editorPage.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
  for (const w of WIDTHS) await checkFooter(editorPage, 'editor', w);

  await editorPage.click('#editTabSongs');
  await editorPage.waitForSelector('#panelSongs:not([hidden])');
  const songsPanelOk = await editorPage.evaluate(() => !!document.querySelector('#narrowFilterRow'));
  if (songsPanelOk) ok('editor: 曲選択タブ操作可能');
  else fail('editor: 曲選択タブ操作');

  if (!editorErrors.length) ok('editor: Consoleエラーなし');
  else fail('editor: Consoleエラー', editorErrors.join('; '));
  await editorPage.close();

  const page404 = await browser.newPage();
  const errors404 = [];
  page404.on('pageerror', (e) => errors404.push(e.message));
  await page404.goto(`file://${path.join(ROOT, '404.html')}`, { waitUntil: 'domcontentloaded' });
  const hasCredit = await page404.evaluate((credit) => {
    return document.body.textContent.includes(credit);
  }, CREDIT);
  if (hasCredit) ok('404.html: 運営者表記（静的）');
  else fail('404.html: 運営者表記（静的）');
  if (!errors404.length) ok('404.html: Consoleエラーなし');
  else fail('404.html: Consoleエラー', errors404.join('; '));
  await page404.close();
}

async function main() {
  console.log('=== test-operator-credit.mjs ===\n');
  runStaticTests();

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const masterCount = JSON.parse(indexHtml.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]).length;
  const batchId = indexHtml.match(/const CURRENT_NEW_BATCH = "([^"]+)"/)?.[1];
  ok(`MASTER_SONGS ${masterCount}曲（変更なし確認用）`);
  ok(`CURRENT_NEW_BATCH ${batchId}`);

  const browser = await chromium.launch();
  try {
    await runBrowserTests(browser);
  } finally {
    await browser.close();
  }

  console.log(failed ? `\n${failed} failure(s)` : '\nAll operator credit tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
