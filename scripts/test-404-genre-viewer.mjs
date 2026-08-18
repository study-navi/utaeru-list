#!/usr/bin/env node
/**
 * 404.html 生成後のジャンル viewer hotfix 回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML404 = path.join(ROOT, '404.html');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

async function main() {
  const src = fs.readFileSync(HTML404, 'utf8');
  for (const needle of ['GENRE_LOOKUP', 'GENRE_FILTER_OPTIONS', 'genreFilterRow', 'function setGenre', 'songMatchesGenreFilter']) {
    if (src.includes(needle)) ok(`404.html contains ${needle}`);
    else fail(`404.html missing ${needle}`);
  }

  // initPublicViewer が genre ブロックを含むこと
  const initStart = src.indexOf('function initPublicViewer');
  const initEnd = src.indexOf('applySiteFooterLinks();');
  const initBlock = src.slice(initStart, initEnd);
  if (initBlock.includes('const GENRE_LOOKUP') && initBlock.includes('GENRE_FILTER_OPTIONS')) {
    ok('404 initPublicViewer includes genre block');
  } else fail('404 initPublicViewer genre block');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // hiro.html 相当の fixture で viewer ロジックを検証（404 SPA bootstrap は file:// 非対応）
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  const cfg = {
    streamerName: 'テスト',
    subtitle: 'genre',
    themeType: 'preset',
    presetIndex: 0,
    songMeta: {},
    tagPresets: [],
    updatedAt: '2026-08-18T00:00:00.000Z',
  };
  const songs = [
    { k: 'あ', y: 'あ', a: '米津玄師', t: 'KICK BACK' },
    { k: 'あ', y: 'あ', a: 'シド', t: 'モノクロのキス' },
  ];
  html = html.replace(/<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
    `<script type="application/json" id="builder-config">${JSON.stringify(cfg)}</script>`);
  html = html.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = ${JSON.stringify(songs)};`);
  const p = path.join(ROOT, 'scripts', '.fixture-404-genre-test.html');
  fs.writeFileSync(p, html);

  await page.goto(`file://${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('statSongs')?.textContent !== '-', { timeout: 15000 });

  await page.locator('#genreFilterRow .chip', { hasText: 'アニソン' }).click();
  await page.waitForTimeout(150);
  const meta = await page.locator('#resultMeta').textContent();
  if (meta === '2曲 / 2組') ok(`genre click handler: ${meta}`);
  else fail('genre click handler', meta);

  if (errors.some((e) => e.includes('GENRE_FILTER_OPTIONS is not defined'))) {
    fail('GENRE_FILTER_OPTIONS undefined');
  } else ok('browser: GENRE_FILTER_OPTIONS エラーなし');

  await browser.close();
  fs.unlinkSync(p);

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\n404 genre hotfix tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
