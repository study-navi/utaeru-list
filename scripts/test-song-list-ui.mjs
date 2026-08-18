#!/usr/bin/env node
/**
 * 曲一覧UI・単一選択絞り込み 回帰テスト
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

const VIEWPORTS = [
  { label: '320px', width: 320 },
  { label: '375px', width: 375 },
  { label: '390px', width: 390 },
  { label: '430px', width: 430 },
  { label: '1280px', width: 1280 },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function checkSongRow(page, label) {
  await page.click('#editTabSongs');
  await page.waitForSelector('#panelSongs:not([hidden])');
  await page.waitForSelector('details.artist-group', { timeout: 10000 });
  await page.locator('details.artist-group').first().evaluate((el) => { el.open = true; });
  await page.waitForSelector('.song-item', { timeout: 10000 });

  const row = await page.evaluate(() => {
    const item = document.querySelector('.song-item');
    if (!item) return null;
    const cs = getComputedStyle(item);
    const title = item.querySelector('.song-title');
    const artist = item.querySelector('.song-artist');
    const btn = item.querySelector('.song-settings-btn');
    const btnBefore = btn ? getComputedStyle(btn, '::before') : null;
    return {
      borderBottom: cs.borderBottomWidth,
      paddingTop: cs.paddingTop,
      hasTitle: !!title,
      hasArtist: !!artist,
      titleLines: title ? Math.round(title.scrollHeight / parseFloat(getComputedStyle(title).lineHeight)) : 0,
      settingsRight: btn && item.querySelector('.song-row')
        ? btn.getBoundingClientRect().left > item.querySelector('.song-row-body').getBoundingClientRect().right - 80
        : false,
      btnW: btn?.offsetWidth ?? 0,
      btnH: btn?.offsetHeight ?? 0,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  if (!row) { fail(`${label}: 曲行`, 'not found'); return; }
  if (row.hasTitle && row.hasArtist && row.settingsRight) ok(`${label}: 曲名/アーティスト/右設定`);
  else fail(`${label}: 曲行構造`, JSON.stringify(row));
  if (parseFloat(row.borderBottom) >= 1 && parseFloat(row.paddingTop) >= 8) ok(`${label}: 区切り線+padding`);
  else fail(`${label}: 境界`, JSON.stringify(row));
  if (row.titleLines <= 3) ok(`${label}: 曲名改行 ${row.titleLines}行`);
  else fail(`${label}: 曲名改行`, String(row.titleLines));
  if (!row.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);
}

async function checkFilterSingleSelect(page, label) {
  await page.fill('#searchInput', '');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(100);

  const click = async (text) => {
    await page.locator('#narrowFilterRow .chip', { hasText: text }).click();
    await page.waitForTimeout(120);
  };
  const active = () => page.evaluate(() =>
    [...document.querySelectorAll('#narrowFilterRow .chip.active')].map((c) => c.textContent?.trim()),
  );

  await click('新着');
  let chips = await active();
  if (chips.length === 1 && chips[0] === '新着') ok(`${label}: 新着単独選択`);
  else fail(`${label}: 新着`, chips.join(','));

  await click('J-POP');
  chips = await active();
  if (chips.length === 1 && chips[0] === 'J-POP') ok(`${label}: 新着→J-POP切替`);
  else fail(`${label}: J-POP切替`, chips.join(','));

  await click('アニソン');
  chips = await active();
  if (chips.length === 1 && chips[0] === 'アニソン') ok(`${label}: J-POP→アニソン切替`);
  else fail(`${label}: アニソン切替`, chips.join(','));

  await click('アニソン');
  chips = await active();
  if (chips.length === 0) ok(`${label}: 再タップ解除`);
  else fail(`${label}: 解除`, chips.join(','));

  await click('J-POP');
  await page.fill('#searchInput', 'aiko');
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(150);
  const meta = await page.locator('#resultMeta').textContent();
  if (meta && !meta.startsWith('0曲')) ok(`${label}: 検索AND ${meta.trim()}`);
  else fail(`${label}: 検索AND`, meta);
}

async function main() {
  console.log('=== test-song-list-ui.mjs ===\n');
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await addBypassStart(page);
    await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
    await checkSongRow(page, vp.label);
    if (vp.label === '375px') await checkFilterSingleSelect(page, vp.label);
    if (!errors.length) ok(`${vp.label}: Consoleエラーなし`);
    else fail(`${vp.label}: Console`, errors.join('; '));
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nAll song list UI tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
