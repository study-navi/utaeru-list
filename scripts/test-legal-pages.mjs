#!/usr/bin/env node
/**
 * 法務3ページ（terms / privacy / contact）の表示・リンク・回帰テスト
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [320, 375, 390, 430, 1280];
const PAGES = [
  { file: 'terms.html', title: '利用規約', current: 'terms.html' },
  { file: 'privacy.html', title: 'プライバシーポリシー', current: 'privacy.html' },
  { file: 'contact.html', title: 'お問い合わせ', current: 'contact.html' },
];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function fileUrl(name) {
  return 'file://' + path.join(ROOT, name);
}

async function checkPage(page, spec, width) {
  const label = `${spec.file}@${width}px`;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.setViewportSize({ width, height: 800 });
  await page.goto(fileUrl(spec.file), { waitUntil: 'domcontentloaded', timeout: 30000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok(`${label}: 横スクロールなし`);
  else fail(`${label}: 横スクロールなし`);

  const h1 = await page.locator('h1').textContent();
  if (h1?.includes(spec.title)) ok(`${label}: タイトル`);
  else fail(`${label}: タイトル`, h1);

  const navLinks = await page.evaluate(() =>
    [...document.querySelectorAll('.legal-nav a')].map((a) => ({ href: a.getAttribute('href'), current: a.getAttribute('aria-current') }))
  );
  const expected = ['index.html', 'guide.html', 'terms.html', 'privacy.html', 'contact.html'];
  if (navLinks.map((l) => l.href).join(',') === expected.join(',')) ok(`${label}: 上部ナビ`);
  else fail(`${label}: 上部ナビ`, JSON.stringify(navLinks));

  const current = navLinks.find((l) => l.current === 'page');
  if (current?.href === spec.current) ok(`${label}: 現在地表示`);
  else fail(`${label}: 現在地表示`, JSON.stringify(current));

  const footerHrefs = await page.evaluate(() =>
    [...document.querySelectorAll('.site-footer a')].map((a) => a.getAttribute('href'))
  );
  if (footerHrefs.includes('guide.html') && footerHrefs.includes('index.html')) ok(`${label}: フッター導線`);
  else fail(`${label}: フッター導線`, footerHrefs.join(','));

  if (!errors.length) ok(`${label}: Consoleエラーなし`);
  else fail(`${label}: Consoleエラーなし`, errors.join('; '));
}

async function checkContent() {
  const terms = fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8');
  const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  const contact = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');

  if (!terms.includes('法務専門家')) ok('terms: ドラフト免責なし');
  else fail('terms: ドラフト免責なし');
  if (terms.includes('うたエモ（UTAEMO）') && terms.includes('編集キー') && terms.includes('日本法')) ok('terms: 必須トピック');
  else fail('terms: 必須トピック');

  if (!privacy.includes('法務専門家')) ok('privacy: ドラフト免責なし');
  else fail('privacy: ドラフト免責なし');
  if (privacy.includes('DELETE /api/auth/account') && privacy.includes('Google クラウド下書きではありません') && privacy.includes('utaeru_session')) ok('privacy: ストレージ・削除API記載');
  else fail('privacy: ストレージ・削除API記載');
  if (privacy.includes('google_sub') || privacy.includes('Google アカウント ID（sub）')) ok('privacy: Google sub');
  else fail('privacy: Google sub');
  if (privacy.includes('Google Analytics') && privacy.includes('利用していません')) ok('privacy: 解析なし');
  else fail('privacy: 解析なし');

  if (contact.includes('github.com/utalis/utalis.github.io/issues/new')) ok('contact: GitHub Issues URL');
  else fail('contact: GitHub Issues URL');
  if (!contact.includes('@') || !contact.match(/@[a-z0-9.-]+\.[a-z]{2,}/i)) ok('contact: 架空メールなし');
  else fail('contact: 架空メールなし');

  for (const [name, html] of [['terms', terms], ['privacy', privacy], ['contact', contact]]) {
    if (/Utalis|うたりす/.test(html)) fail(`${name}: 旧名称なし`);
    else ok(`${name}: 旧名称なし`);
  }
}

async function checkIndexFooter() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl('index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 15000 }).catch(() => {});
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('.site-footer-nav a, footer a, .catalog-footer a')].map((a) => a.getAttribute('href')).filter(Boolean)
  );
  const all = hrefs.join(' ');
  if (all.includes('terms.html') && all.includes('privacy.html') && all.includes('contact.html')) ok('index: フッターから法務3ページ');
  else fail('index: フッターから法務3ページ', all);
  await browser.close();
}

async function main() {
  console.log('=== test-legal-pages.mjs ===\n');
  await checkContent();
  await checkIndexFooter();

  const browser = await chromium.launch();
  for (const spec of PAGES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await checkPage(page, spec, width);
      await page.close();
    }
  }
  await browser.close();

  console.log('');
  if (failed) {
    console.error(`\n${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
