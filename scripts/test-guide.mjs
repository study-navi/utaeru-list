#!/usr/bin/env node
/**
 * Utalis v1.0: 使い方ガイド (guide.html) のリンク・レイアウト確認
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guideUrl = 'file://' + path.join(ROOT, 'guide.html');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

const WIDTHS = [320, 375, 390, 430, 1280];

async function runGuideViewport(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(guideUrl, { waitUntil: 'domcontentloaded' });
  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim();
    const tocLinks = [...document.querySelectorAll('.guide-toc-list a')].map((a) => a.getAttribute('href'));
    const h2s = [...document.querySelectorAll('.guide-section h2')].map((h) => h.textContent?.trim());
    const footerLinks = [...document.querySelectorAll('.site-footer a')].map((a) => a.getAttribute('href'));
    const cssLoaded = !!document.querySelector('link[href="assets/guide.css"]');
    return {
      h1,
      tocLinks,
      h2Count: h2s.length,
      hasSave: h2s.some((t) => t?.includes('保存')),
      hasFaq: h2s.some((t) => t?.includes('困った')),
      footerLinks,
      cssLoaded,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  const label = `guide ${width}px`;
  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);
  if (data.h1 !== 'Utalis 使い方ガイド') fail(`${label}: タイトル`, data.h1);
  else ok(`${label}: タイトル`);
  if (!data.cssLoaded) fail(`${label}: guide.css`);
  else ok(`${label}: guide.css`);
  if (data.overflow) fail(`${label}: 横スクロール`);
  else ok(`${label}: 横スクロールなし`);
  if (!data.tocLinks.includes('#publish') || !data.tocLinks.includes('#save')) fail(`${label}: 目次`, JSON.stringify(data.tocLinks));
  else ok(`${label}: 目次`);
  if (!data.hasSave || !data.hasFaq || data.h2Count < 10) fail(`${label}: セクション`, String(data.h2Count));
  else ok(`${label}: 主要セクション`);
  if (!data.footerLinks.includes('terms.html') || !data.footerLinks.includes('privacy.html') || !data.footerLinks.includes('contact.html')) {
    fail(`${label}: 法務リンク`, JSON.stringify(data.footerLinks));
  } else ok(`${label}: 法務リンク`);

  await browser.close();
}

async function runIndexLink() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll('.site-footer a')].find((el) => el.textContent?.trim() === '使い方');
    return a?.getAttribute('href') || null;
  });
  await browser.close();
  if (href !== 'guide.html') fail('index.html フッター使い方リンク', href);
  else ok('index.html フッター使い方リンク');
}

async function runFileChecks() {
  const guide = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  if (!guide.includes('自動的にクラウドに保存される仕組みはありません')) fail('guide: 保存説明');
  else ok('guide: 保存説明（自動クラウド保存なし）');
  if (!guide.includes('おはこ') || !guide.includes('お気に入り')) fail('guide: 曲マーク');
  else ok('guide: 曲マーク');
  if (guide.includes('localStorage') && guide.includes('自動保存されます')) fail('guide: 誤った自動保存表現');
  else ok('guide: 誤った自動保存表現なし');
  if (!fs.existsSync(path.join(ROOT, 'assets/guide.css'))) fail('assets/guide.css 存在');
  else ok('assets/guide.css 存在');
}

async function main() {
  console.log('=== test-guide.mjs ===\n');
  await runFileChecks();
  await runIndexLink();
  for (const w of WIDTHS) await runGuideViewport(w);
  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((e) => { console.error(e); process.exit(1); });
