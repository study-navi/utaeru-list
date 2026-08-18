#!/usr/bin/env node
/**
 * スマホフォームの実効 font-size（16px以上）と viewport 設定の回帰テスト
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const MOBILE_WIDTHS = [320, 375, 390, 430];
const PC_WIDTH = 1280;

const PRIMARY_IDS = [
  { id: 'streamerName', label: '配信者名' },
  { id: 'subtitle', label: 'サブタイトル' },
  { id: 'streamerIdInput', label: '公開ページID' },
  { id: 'searchInput', label: '曲検索' },
  { id: 'editKeyStreamerIdInput', label: '編集キーID' },
  { id: 'editKeyInput', label: '編集キー' },
  { id: 'deleteConfirmInput', label: '削除確認入力' },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function fontSizePx(computed) {
  return parseFloat(computed) || 0;
}

async function setupPage(page) {
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
}

async function checkViewportMeta(page) {
  const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '');
  if (!/user-scalable=no/i.test(meta) && !/maximum-scale=1/i.test(meta)) {
    ok('15. ピンチズーム禁止なし');
  } else {
    fail('15. ピンチズーム禁止なし', meta);
  }
}

async function checkMobileWidth(browser, width) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setupPage(page);

  const sizes = await page.evaluate((ids) => {
    const formSelector = 'input:not([type="checkbox"]):not([type="file"]):not([type="color"]):not([readonly]), textarea, select';
    const all = [...document.querySelectorAll(formSelector)];
    const primary = ids.map(({ id, label }) => {
      const el = document.getElementById(id);
      if (!el) return { id, label, missing: true };
      return {
        id,
        label,
        fontSize: parseFloat(getComputedStyle(el).fontSize) || 0,
      };
    });
    const offenders = all
      .filter((el) => el.id !== 'importFile')
      .map((el) => ({
        id: el.id || el.name || el.type,
        type: el.type || el.tagName.toLowerCase(),
        fontSize: parseFloat(getComputedStyle(el).fontSize) || 0,
      }))
      .filter((x) => x.fontSize > 0 && x.fontSize < 16);
    const scroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    return { primary, offenders, scroll };
  }, PRIMARY_IDS);

  const label = `${width}px`;
  for (const p of sizes.primary) {
    if (p.missing) {
      fail(`${label}: ${p.label}`, '要素なし');
      continue;
    }
    if (p.fontSize >= 16) ok(`${label}: ${p.label} ${p.fontSize}px`);
    else fail(`${label}: ${p.label}`, `${p.fontSize}px`);
  }

  // song meta date input
  await page.click('#editTabBasic');
  await page.fill('#streamerName', 'フォント確認');
  await page.click('#editTabSongs');
  await page.evaluate(() => {
    selectedKeys.clear();
    for (const s of MASTER_SONGS.slice(0, 1)) selectedKeys.add(keyOf(s));
    songListView = 'selected';
    updateSongListChrome();
    render();
  });
  await page.click('#viewTabSelected');
  await page.waitForFunction(() => document.querySelector('.song-settings-btn'), { timeout: 5000 });
  await page.evaluate(() => document.querySelector('.song-settings-btn')?.click());
  await page.waitForFunction(() => document.querySelector('.song-meta-date'), { timeout: 5000 });
  const dateSize = await page.evaluate(() => {
    const el = document.querySelector('.song-meta-date');
    return el ? parseFloat(getComputedStyle(el).fontSize) || 0 : null;
  });
  if (dateSize === null) fail(`${label}: 追加日入力`, '要素なし');
  else if (dateSize >= 16) ok(`${label}: 追加日入力 ${dateSize}px`);
  else fail(`${label}: 追加日入力`, `${dateSize}px`);

  if (!sizes.offenders.length) ok(`${label}: その他入力欄すべて16px以上`);
  else fail(`${label}: その他入力欄`, JSON.stringify(sizes.offenders));

  if (!sizes.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);

  if (!errors.length) ok(`${label}: Consoleエラーなし`);
  else fail(`${label}: Consoleエラー`, errors.join('; '));

  await page.close();
}

async function checkPcWidth(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: PC_WIDTH, height: 800 });
  await setupPage(page);
  const pc = await page.evaluate(() => ({
    streamerName: parseFloat(getComputedStyle(document.getElementById('streamerName')).fontSize) || 0,
    search: parseFloat(getComputedStyle(document.getElementById('searchInput')).fontSize) || 0,
    scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  if (pc.streamerName === 15) ok(`14. PC 1280px 配信者名 ${pc.streamerName}px（従来維持）`);
  else ok(`14. PC 1280px 配信者名 ${pc.streamerName}px`);
  if (pc.search === 15) ok(`14. PC 1280px 曲検索 ${pc.search}px（従来維持）`);
  else ok(`14. PC 1280px 曲検索 ${pc.search}px`);
  if (!pc.scroll) ok('14. PC 1280px 横スクロールなし');
  else fail('14. PC 1280px 横スクロール');
  await page.close();
}

async function main() {
  console.log('=== test-mobile-form-font-size.mjs ===\n');
  const browser = await chromium.launch();
  const metaPage = await browser.newPage();
  await setupPage(metaPage);
  await checkViewportMeta(metaPage);
  await metaPage.close();

  for (const width of MOBILE_WIDTHS) {
    await checkMobileWidth(browser, width);
  }
  await checkPcWidth(browser);
  await browser.close();

  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
