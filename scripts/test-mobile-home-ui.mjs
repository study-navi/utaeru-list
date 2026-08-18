#!/usr/bin/env node
/**
 * スマホホーム / ヘッダー / 編集タブ UI 回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { addBypassStart } from './lib/test-bypass-start.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const VIEWPORTS = [
  { label: '320px', width: 320, height: 800 },
  { label: '375px', width: 375, height: 800 },
  { label: '390px', width: 390, height: 800 },
  { label: '430px', width: 430, height: 800 },
  { label: '1280px', width: 1280, height: 900 },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function checkStartScreen(browser, label, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#startScreen:not([hidden])', { timeout: 25000 });
  const data = await page.evaluate(() => {
    const screen = document.getElementById('startScreen');
    const inner = document.querySelector('.start-screen-inner');
    const googleBtn = document.getElementById('startGoogleLoginBtn');
    const guestBtn = document.getElementById('startGuestBtn');
    const subVisible = (() => {
      const el = document.querySelector('.start-wordmark-sub');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    })();
    return {
      visible: screen && !screen.hidden,
      height: inner?.offsetHeight || 0,
      subVisible,
      googleH: googleBtn?.offsetHeight || 0,
      guestH: guestBtn?.offsetHeight || 0,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  if (data.visible) ok(`${label}: スタート画面表示`);
  else fail(`${label}: スタート画面表示`);
  if (data.googleH >= 44 && data.guestH >= 44) ok(`${label}: 主要ボタン 44px+`);
  else fail(`${label}: 主要ボタン高さ`, `${data.googleH}/${data.guestH}`);
  if (!data.scroll) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロール`);
  if (label !== '1280px' && !data.subVisible) ok(`${label}: うたエモ重複非表示`);
  else if (label === '1280px') ok(`${label}: スタート画面確認`);
  else fail(`${label}: うたエモ重複`, String(data.subVisible));
  if (!errors.length) ok(`${label}: スタート Consoleエラーなし`);
  else fail(`${label}: スタート Console`, errors.join('; '));
  await ctx.close();
  return data.height;
}

async function checkEditor(page, label) {
  await addBypassStart(page);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 });
  await page.fill('#streamerIdInput', 'hiro');
  await page.dispatchEvent('#streamerIdInput', 'input');
  await page.waitForTimeout(150);

  const data = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.edit-tab')].map((tab) => {
      const textEl = tab.querySelector('.edit-tab-text');
      const text = textEl?.textContent?.trim() || '';
      const lines = textEl ? Math.round(textEl.scrollHeight / parseFloat(getComputedStyle(textEl).lineHeight)) : 0;
      return {
        text,
        lines,
        h: tab.offsetHeight,
        w: tab.offsetWidth,
      };
    });
    const barId = document.getElementById('barStreamerId');
    const brandIntro = document.querySelector('.brand-intro');
    const brandStyle = brandIntro ? getComputedStyle(brandIntro).display : 'none';
    const menuBtn = document.getElementById('mobileMenuBtn');
    const accountBtn = document.getElementById('accountMenuBtn');
    const publishBtn = document.getElementById('publishBtn');
    const headerTapH = Math.max(menuBtn?.offsetHeight || 0, accountBtn?.offsetHeight || 0, publishBtn?.offsetHeight || 0);
    return {
      tabs,
      tabWrap: document.querySelector('.edit-tabs')?.scrollWidth || 0,
      tabClient: document.querySelector('.edit-tabs')?.clientWidth || 0,
      barIdText: barId?.textContent?.trim() || '',
      barIdLines: barId ? Math.round(barId.scrollHeight / parseFloat(getComputedStyle(barId).lineHeight || '16')) : 0,
      brandIntroDisplay: brandStyle,
      publishH: publishBtn?.offsetHeight || 0,
      headerTapH,
      scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  const brokenTab = data.tabs.find((t) => t.lines > 1 || /曲を選\s*$/.test(t.text));
  if (!brokenTab) ok(`${label}: タブ名改行なし`);
  else fail(`${label}: タブ名改行`, JSON.stringify(brokenTab));

  if (data.tabs.every((t) => t.h >= 44)) ok(`${label}: タブ 44px+`);
  else fail(`${label}: タブ高さ`, JSON.stringify(data.tabs));

  if (data.barIdLines <= 1) ok(`${label}: ID改行なし (${data.barIdText})`);
  else fail(`${label}: ID改行`, data.barIdText);

  if (label !== '1280px') {
    if (data.brandIntroDisplay === 'none') ok(`${label}: 編集ヘッダー重複非表示`);
    else fail(`${label}: brand-intro 残存`, data.brandIntroDisplay);
  } else if (data.brandIntroDisplay !== 'none') ok(`${label}: PC brand-intro 表示`);
  else ok(`${label}: PC レイアウト`);

  if (data.publishH >= 44 && data.headerTapH >= 44) ok(`${label}: ヘッダーボタン 44px+`);
  else fail(`${label}: ヘッダーボタン`, `${data.publishH}/${data.headerTapH}`);

  if (!data.scroll) ok(`${label}: 編集画面 横スクロールなし`);
  else fail(`${label}: 編集画面 横スクロール`);
}

async function main() {
  console.log('=== test-mobile-home-ui.mjs ===\n');
  const browser = await chromium.launch();
  const heights = {};
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (vp.width <= 430) {
        heights[vp.label] = await checkStartScreen(browser, vp.label, vp.width, vp.height);
      }
      await checkEditor(page, vp.label);
      if (!errors.length) ok(`${vp.label}: Consoleエラーなし`);
      else fail(`${vp.label}: Console`, errors.join('; '));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (heights['375px']) {
    console.log(`\n375px スタート画面高さ: ${heights['375px']}px`);
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nAll mobile home UI tests passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
