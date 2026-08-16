#!/usr/bin/env node
/**
 * Phase 6.2: スマホ固定バー周辺の余白・視認性
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const WIDTHS = [320, 375, 390, 430];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function runWidth(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof syncBuilderChromeInsets === 'function', { timeout: 15000 });
  await page.waitForTimeout(100);

  if (errors.length) fail(`${width}px: JS エラーなし`, errors.join('; '));
  else ok(`${width}px: JS エラーなし`);

  const layout = await page.evaluate(() => {
    const bar = document.getElementById('utaeruBar');
    const wrap = document.querySelector('.wrap');
    const intro = document.querySelector('.brand-intro');
    const barRect = bar?.getBoundingClientRect();
    const wrapRect = wrap?.getBoundingClientRect();
    const introRect = intro?.getBoundingClientRect();
    const bodyPad = parseFloat(getComputedStyle(document.body).paddingTop);
    const barHVar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--builder-bar-h'));
    return {
      scrollW: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      clientW: document.documentElement.clientWidth,
      gapBelowBar: introRect && barRect ? introRect.top - barRect.bottom : null,
      bodyPad,
      barHVar,
      barHeight: barRect?.height,
      titleSize: parseFloat(getComputedStyle(document.querySelector('.edit-tab')).fontSize),
      hintLH: parseFloat(getComputedStyle(document.querySelector('.edit-panel .hint') || document.querySelector('.hint')).lineHeight),
      labelSize: parseFloat(getComputedStyle(document.querySelector('.field-label')).fontSize),
      inputMinH: parseFloat(getComputedStyle(document.getElementById('streamerName')).minHeight),
      bottomPad: parseFloat(getComputedStyle(wrap).paddingBottom),
      exportH: document.querySelector('.export-bar')?.getBoundingClientRect().height,
    };
  });

  if (layout.scrollW > layout.clientW + 1) fail(`${width}px: 横スクロールなし`, `${layout.scrollW}/${layout.clientW}`);
  else ok(`${width}px: 横スクロールなし`);

  if (layout.gapBelowBar == null || layout.gapBelowBar < 8) fail(`${width}px: 固定バー下余白`, String(layout.gapBelowBar));
  else ok(`${width}px: 固定バー下余白 ${Math.round(layout.gapBelowBar)}px`);

  if (Math.abs(layout.bodyPad - layout.barHeight) > 2) {
    fail(`${width}px: body padding ≒ bar高`, `${layout.bodyPad} vs ${layout.barHeight}`);
  } else ok(`${width}px: body padding ≒ bar高`);

  if (layout.titleSize < 14.5) fail(`${width}px: タイトル文字`, String(layout.titleSize));
  else ok(`${width}px: タイトル ${layout.titleSize}px`);

  if (layout.labelSize < 12.5) fail(`${width}px: ラベル文字`, String(layout.labelSize));
  else ok(`${width}px: ラベル ${layout.labelSize}px`);

  if (layout.hintLH < 1.45) fail(`${width}px: 説明行間`, String(layout.hintLH));
  else ok(`${width}px: 説明行間 ${layout.hintLH.toFixed(2)}`);

  if (layout.inputMinH < 44) fail(`${width}px: 入力欄高さ`, String(layout.inputMinH));
  else ok(`${width}px: 入力欄 ${layout.inputMinH}px`);

  if (layout.bottomPad < layout.exportH + 8) fail(`${width}px: 下部余白`, `${layout.bottomPad} vs export ${layout.exportH}`);
  else ok(`${width}px: 下部固定UI余白`);

  await page.click('#editTabSongs');
  await page.waitForTimeout(180);
  const afterNext = await page.evaluate(() => {
    const bar = document.getElementById('utaeruBar');
    const nav = document.getElementById('editNav');
    const barBottom = bar?.getBoundingClientRect().bottom ?? 0;
    const navTop = nav?.getBoundingClientRect().top ?? 0;
    return { gap: navTop - barBottom };
  });
  if (afterNext.gap < 8) fail(`${width}px: タブ位置`, `${afterNext.gap}px`);
  else ok(`${width}px: タブ余白 ${Math.round(afterNext.gap)}px`);

  await page.click('#editTabDesign');
  await page.waitForTimeout(120);
  await page.click('#editTabPreview');
  await page.waitForTimeout(150);

  const preview = await page.evaluate(() => {
    const frame = document.getElementById('previewFrame');
    const bar = document.getElementById('utaeruBar');
    const label = document.querySelector('.preview-shell-label');
    const rect = frame?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    return {
      frameScroll: frame ? frame.scrollWidth > frame.clientWidth + 1 : false,
      labelBelowBar: labelRect && bar ? labelRect.top >= bar.getBoundingClientRect().bottom - 2 : true,
      pvTitle: parseFloat(getComputedStyle(frame?.querySelector('.pv-title') || frame).fontSize),
    };
  });
  if (preview.frameScroll) fail(`${width}px: プレビュー横スクロール`);
  else ok(`${width}px: プレビュー横スクロールなし`);
  if (!preview.labelBelowBar) fail(`${width}px: プレビューラベルがバー下`);
  else ok(`${width}px: プレビューラベル表示`);
  if (preview.pvTitle < 16) fail(`${width}px: プレビュー文字`, String(preview.pvTitle));
  else ok(`${width}px: プレビュー文字 ${preview.pvTitle}px`);

  const menuSize = await page.evaluate(() => {
    const btn = document.getElementById('mobileMenuBtn');
    const r = btn?.getBoundingClientRect();
    return { w: r?.width, h: r?.height };
  });
  if ((menuSize.w ?? 0) < 44 || (menuSize.h ?? 0) < 44) fail(`${width}px: ☰タップ領域`, JSON.stringify(menuSize));
  else ok(`${width}px: ☰ ${Math.round(menuSize.w)}×${Math.round(menuSize.h)}px`);

  await browser.close();
}

for (const w of WIDTHS) {
  await runWidth(w);
}

if (failed) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
