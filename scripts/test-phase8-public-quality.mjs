#!/usr/bin/env node
/**
 * Phase 8: 一般公開品質（ヒーロー・フッター・法務ページ・公開成功UI・エラー文言）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexUrl = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const indexHtml = read('index.html');
const html404 = read('404.html');
const build404 = read('scripts/build-404-html.mjs');

for (const file of ['terms.html', 'privacy.html', 'contact.html', 'favicon.svg']) {
  if (!fs.existsSync(path.join(ROOT, file))) fail(`file exists: ${file}`);
  else ok(`file exists: ${file}`);
}

if (!indexHtml.includes('site-hero')) fail('index: site-hero');
else ok('index: site-hero');

if (!indexHtml.includes('id="heroStartBtn"')) fail('index: heroStartBtn');
else ok('index: heroStartBtn');

if (!indexHtml.includes('id="publishSuccessModal"')) fail('index: publishSuccessModal');
else ok('index: publishSuccessModal');

if (!indexHtml.includes('id="publishSuccessShare"')) fail('index: publishSuccessShare');
else ok('index: publishSuccessShare');

if (!indexHtml.includes('id="barShareUrl"')) fail('index: barShareUrl');
else ok('index: barShareUrl');

if (!indexHtml.includes('property="og:image"')) fail('index: og:image meta');
else ok('index: og:image meta');

if (!indexHtml.includes('twitter:card')) fail('index: twitter card meta');
else ok('index: twitter card meta');

if (!fs.existsSync(path.join(ROOT, 'og-image.png'))) fail('og-image.png exists');
else ok('og-image.png exists');

const ogSize = await import('node:child_process').then(({ execSync }) =>
  execSync('sips -g pixelWidth -g pixelHeight og-image.png', { cwd: ROOT, encoding: 'utf8' }),
).catch(() => '');
if (!ogSize.includes('1200') || !ogSize.includes('630')) fail('og-image.png 1200x630', ogSize.trim());
else ok('og-image.png 1200x630');

if (!indexHtml.includes('href="favicon.svg"')) fail('index: favicon link');
else ok('index: favicon link');

if (!indexHtml.includes('href="terms.html"')) fail('index: footer terms link');
else ok('index: footer terms link');

if (indexHtml.includes('次へ')) fail('index: no 次へ button');
else ok('index: no 次へ button');

if (/placeholder="[^"]*hiro/i.test(indexHtml)) fail('index: no hiro in placeholders');
else ok('index: no hiro in user placeholders');

if (/showPageState\([^)]*\+\s*res\.status/.test(build404)) {
  fail('build-404-html: no HTTP status in user-facing showPageState');
} else ok('build-404-html: user-friendly API errors');

if (/showPageState\([^)]*\(\s*'\s*\+\s*res\.status/.test(html404)) {
  fail('404.html: no HTTP status in user messages');
} else ok('404.html: no HTTP status in user messages');

if (!html404.includes('site-footer-nav')) fail('404.html: site footer nav');
else ok('404.html: site footer nav');

if (!html404.includes('うまく読み込めませんでした')) fail('404.html: friendly load error');
else ok('404.html: friendly load error');

const terms = read('terms.html');
const privacy = read('privacy.html');
for (const [file, section] of [
  ['terms.html', '禁止事項'],
  ['terms.html', '免責'],
  ['privacy.html', 'Google ログイン'],
  ['privacy.html', '編集キー'],
]) {
  if (!terms.includes(section) && file === 'terms.html') fail(`${file}: ${section}`);
  else if (file === 'terms.html') ok(`${file}: ${section}`);
  if (!privacy.includes(section) && file === 'privacy.html') fail(`${file}: ${section}`);
  else if (file === 'privacy.html') ok(`${file}: ${section}`);
}

const contact = read('contact.html');
if (contact.includes('issues/new')) ok('contact: direct new issue link');
else fail('contact: direct new issue link');

if (privacy.includes('sessionStorage')) ok('privacy: sessionStorage documented');
else fail('privacy: sessionStorage documented');

if (privacy.includes('streamer_owners')) ok('privacy: streamer_owners documented');
else fail('privacy: streamer_owners documented');

if (terms.includes('ID予約') || terms.includes('ソフト削除')) ok('terms: soft delete / ID reservation');
else fail('terms: soft delete / ID reservation');

if (indexHtml.includes('aria-modal="true"')) ok('index: modal aria-modal');
else fail('index: modal aria-modal');

async function browserChecks() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.log('SKIP: Playwright browser unavailable — static checks only');
    return;
  }
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  if (errors.length) fail('browser: no JS errors', errors.join('; '));
  else ok('browser: no JS errors');

  const hero = await page.locator('.site-hero-title').textContent();
  if (!hero?.includes('歌える曲リスト')) fail('browser: hero title', hero || '');
  else ok('browser: hero title');

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hero: document.querySelector('.site-hero')?.scrollWidth > document.documentElement.clientWidth,
  }));
  if (overflow.doc || overflow.hero) fail('browser: no horizontal scroll at 375px', JSON.stringify(overflow));
  else ok('browser: no horizontal scroll at 375px');

  await page.click('#heroStartBtn');
  await page.waitForTimeout(200);
  const basicOpen = await page.locator('#accBasic.open').count();
  if (basicOpen !== 1) fail('browser: hero opens basic accordion');
  else ok('browser: hero opens basic accordion');

  const shareFn = await page.evaluate(() => typeof sharePublicUrl === 'function');
  if (!shareFn) fail('browser: sharePublicUrl defined');
  else ok('browser: sharePublicUrl defined');

  await browser.close();
}

await browserChecks();

console.log(failed ? `\n${failed} failure(s)` : '\nAll Phase 8 public quality checks passed.');
process.exit(failed ? 1 : 0);
