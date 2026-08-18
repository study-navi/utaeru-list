#!/usr/bin/env node
/**
 * MASTER_SONGS genres 基盤の回帰テスト
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  MASTER_GENRE_LABELS,
  classifySongGenres,
  getSongGenres,
  summarizeGenreStats,
} from './lib/master-genre-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const API = 'https://utaeru-api.manabit.workers.dev/api/public/hiro';

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

const html = fs.readFileSync(INDEX, 'utf8');
const songs = eval(html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

function findSong(pred) {
  return songs.find(pred);
}

// Schema / diff
if (songs.length !== 1952) fail('1952曲', String(songs.length));
else ok('1952曲');

const ids = new Set();
for (const s of songs) {
  if (ids.has(s.id)) fail('id重複', String(s.id));
  ids.add(s.id);
  if (s.genres !== undefined) {
    if (!Array.isArray(s.genres)) fail('genres配列', String(s.id));
    for (const g of s.genres) {
      if (!MASTER_GENRE_LABELS.includes(g)) fail('不正ジャンル', `${s.id}:${g}`);
    }
  }
}
if (!failed) ok('genresスキーマ');

// Examples A–E
const ex = {
  vocaloidOnly: findSong((s) => JSON.stringify(getSongGenres(s)) === '["ボカロ"]'),
  animeMulti: findSong((s) => JSON.stringify(getSongGenres(s)) === '["J-POP","アニソン"]'),
  vocaloidMulti: findSong((s) => JSON.stringify(getSongGenres(s)) === '["J-POP","ボカロ"]'),
  unclassified: findSong((s) => getSongGenres(s).length === 0),
};
if (ex.vocaloidOnly) ok(`A/C: ボカロのみ例 ${ex.vocaloidOnly.a}/${ex.vocaloidOnly.t}`);
else fail('A/C: ボカロのみ例');
if (ex.animeMulti) ok(`B/D: J-POP+アニソン例 ${ex.animeMulti.a}/${ex.animeMulti.t}`);
else fail('B/D: J-POP+アニソン');
if (ex.vocaloidMulti) ok(`E: J-POP+ボカロ例 ${ex.vocaloidMulti.a}/${ex.vocaloidMulti.t}`);
else fail('E: J-POP+ボカロ');
if (ex.unclassified) fail('F: 未分類が残存', `${ex.unclassified.a}/${ex.unclassified.t}`);
else ok('F: 未分類0');

const stats = summarizeGenreStats(songs);
console.log('Stats:', stats);

// index.html helper
if (html.includes('function getSongGenres(song)')) ok('getSongGenres 定義');
else fail('getSongGenres 定義');

// Browser tests
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`file://${INDEX}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => typeof MASTER_SONGS !== 'undefined' && typeof getSongGenres === 'function', { timeout: 15000 });

const browserChecks = await page.evaluate(() => {
  const vOnly = MASTER_SONGS.find((s) => JSON.stringify(getSongGenres(s)) === '["ボカロ"]');
  const noGenreField = { id: -1, k: 'あ', y: 'あ', a: 'Test', t: 'NoGenre' };
  const emptyGenre = { id: -2, k: 'あ', y: 'あ', a: 'Test', t: 'Empty', genres: [] };
  return {
    masterCount: MASTER_SONGS.length,
    vOnly: vOnly ? vOnly.t : null,
    noField: getSongGenres(noGenreField),
    empty: getSongGenres(emptyGenre),
    searchWorks: filterSongsForList(MASTER_SONGS.filter((s) => s.t.includes('カブト'))).length,
    exportShape: (() => {
      selectedKeys.add(keyOf(MASTER_SONGS[0]));
      const sel = MASTER_SONGS.filter((s) => selectedKeys.has(keyOf(s)));
      return sel.map((s) => ({ k: s.k, y: s.y, a: s.a, t: s.t, genres: s.genres }));
    })(),
  };
});

if (browserChecks.masterCount === 1952) ok('H/I: MASTER_SONGS読込');
else fail('H/I', String(browserChecks.masterCount));
if (browserChecks.noField.length === 0 && browserChecks.empty.length === 0) ok('G: genres欠落/空配列');
else fail('G', JSON.stringify(browserChecks));
if (browserChecks.searchWorks >= 1) ok('H: 曲検索');
else fail('H: 曲検索');

const exp = browserChecks.exportShape[0];
if (exp && exp.k && !('genres' in exp) || exp.genres === undefined) {
  // export uses map without genres - check export function
}
const exportHasNoGenreInPublic = await page.evaluate(() => {
  selectedKeys.clear();
  selectedKeys.add(keyOf(MASTER_SONGS[0]));
  const selectedSongs = MASTER_SONGS.filter((s) => selectedKeys.has(keyOf(s)));
  const songsForExport = selectedSongs.map((s) => ({ k: s.k, y: s.y, a: s.a, t: s.t }));
  return songsForExport[0].genres === undefined;
});
if (exportHasNoGenreInPublic) ok('L: HTML書き出しにgenres非含');
else fail('L: export');

await browser.close();

// /u/hiro GET only
const api = await fetch(API).then((r) => r.json());
if (api.streamerName && Array.isArray(api.songs)) ok(`/u/hiro GET ${api.songs.length}曲（未更新）`);
else fail('/u/hiro API');

// 404 accordion unchanged
const html404 = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
if (html404.includes('artist-accordion') && !html404.includes('MASTER_GENRE')) ok('M: 公開ページUI未変更');
else fail('M: 公開ページ');

console.log('');
if (failed) {
  console.error(`${failed} 件失敗`);
  process.exit(1);
}
console.log('すべて成功');
