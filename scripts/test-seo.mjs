#!/usr/bin/env node
/**
 * Utalis v1.0: SEO / Search Console 事前対応テスト
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.UTALIS_SITE || 'https://utalis.github.io';
const indexUrl = 'file://' + path.join(ROOT, 'index.html');
const WIDTHS = [320, 375, 390, 430, 1280];

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function fetchText(url) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text(), ok: res.ok };
}

async function runLocalFileChecks() {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

  if (!index.includes('<title>Utalis（うたりす）｜配信者向け 歌える曲リスト作成</title>')) fail('index title');
  else ok('index title');

  if (!index.includes('VTuber')) fail('index description に VTuber');
  else ok('index description に VTuber');

  if (!index.includes('link rel="canonical" href="https://utalis.github.io/"')) fail('index canonical');
  else ok('index canonical');

  if (!index.includes('study-navi.github.io')) ok('index: 旧URLをcanonicalにしていない');
  else fail('index: 旧URL canonical 混入');

  if (!index.includes('application/ld+json')) fail('JSON-LD');
  else ok('JSON-LD');

  if (index.includes('aggregateRating') || index.includes('reviewCount')) fail('JSON-LD: 架空評価');
  else ok('JSON-LD: 架空評価なし');

  if (!index.includes('og-image.png')) fail('OGP image');
  else ok('OGP image 維持');

  if (!index.includes('favicon.svg')) fail('favicon');
  else ok('favicon 維持');

  if (!index.includes('brand-summary')) fail('brand-summary');
  else ok('brand-summary 追加');

  if (!guide.includes('link rel="canonical" href="https://utalis.github.io/guide.html"')) fail('guide canonical');
  else ok('guide canonical');

  if (!robots.includes('Allow: /')) fail('robots Allow');
  else ok('robots Allow: /');

  if (robots.includes('Disallow: /')) fail('robots Disallow 誤設定');
  else ok('robots Disallow なし');

  if (!robots.includes('Sitemap: https://utalis.github.io/sitemap.xml')) fail('robots Sitemap');
  else ok('robots Sitemap');

  if (!sitemap.includes('https://utalis.github.io/')) fail('sitemap トップ');
  else ok('sitemap トップ');

  if (!sitemap.includes('https://utalis.github.io/guide.html')) fail('sitemap guide');
  else ok('sitemap guide');

  if (sitemap.includes('/u/')) fail('sitemap: /u/ 大量生成');
  else ok('sitemap: /u/ なし');
}

async function runProductionChecks() {
  for (const url of [
    `${SITE}/`,
    `${SITE}/guide.html`,
    `${SITE}/robots.txt`,
    `${SITE}/sitemap.xml`,
  ]) {
    const { status, ok: isOk } = await fetchText(url);
    if (!isOk) fail(`本番 HTTP 200: ${url}`, String(status));
    else ok(`本番 HTTP 200: ${url}`);
  }

  const sitemap = await fetchText(`${SITE}/sitemap.xml`);
  const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) {
    const r = await fetch(loc);
    if (!r.ok) fail(`sitemap URL 200: ${loc}`, String(r.status));
    else ok(`sitemap URL 200: ${loc}`);
  }
}

async function runIndexViewport(width) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined', { timeout: 15000 });

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    tagline: document.querySelector('.brand-summary')?.textContent?.trim() ?? '',
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.content ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
  }));

  const label = `${width}px`;
  if (errors.length) fail(`${label}: JSエラー`, errors.join('; '));
  else ok(`${label}: JSエラーなし`);
  if (layout.overflow) fail(`${label}: 横スクロール`);
  else ok(`${label}: 横スクロールなし`);
  if (!layout.tagline.includes('歌える曲リスト')) fail(`${label}: tagline`, layout.tagline);
  else ok(`${label}: tagline 表示`);
  if (!layout.title.includes('歌える曲リスト')) fail(`${label}: document.title`, layout.title);
  else ok(`${label}: document.title`);
  if (layout.canonical !== 'https://utalis.github.io/') fail(`${label}: canonical`, layout.canonical);
  else ok(`${label}: canonical`);

  await browser.close();
}

async function runPublicPageProbe() {
  const res = await fetch(`${SITE}/u/hiro`, { redirect: 'follow' });
  ok(`/u/hiro HTTP ${res.status}（404 SPA: 調査用）`);
  const text = await res.text();
  if (text.includes('initPublicViewer') || text.includes('bootstrapPublicViewer')) ok('/u/hiro: 404.html SPA 応答');
  else fail('/u/hiro: 404 SPA 構造');
  if (!text.includes('og:image')) ok('/u/hiro: 静的OGPなし（JS描画）');
}

async function main() {
  console.log('=== test-seo.mjs ===\n');
  console.log(`SITE=${SITE}\n`);
  await runLocalFileChecks();
  console.log('');
  for (const w of WIDTHS) await runIndexViewport(w);
  console.log('');
  try {
    await runProductionChecks();
    await runPublicPageProbe();
  } catch (err) {
    fail('本番 fetch', err.message);
  }
  console.log('');
  if (failed) {
    console.error(`${failed} 件失敗`);
    process.exit(1);
  }
  console.log('すべて成功');
}

main().catch((e) => { console.error(e); process.exit(1); });
