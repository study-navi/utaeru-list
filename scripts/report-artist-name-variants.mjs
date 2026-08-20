#!/usr/bin/env node
/**
 * MASTER_SONGS 全曲のアーティスト名表記ゆれレポート
 * 誤記・空白差は patch-master-songs-artist-canonical.mjs で a を修正する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import {
  artistCompareKey,
  classifyArtistNameVariants,
  findArtistVariantGroups,
  hasMeaningChangingMarker,
  normalizeArtistWhitespace,
} from './lib/artist-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));

const sameKey = findArtistVariantGroups(songs);

const nfkcMap = new Map();
for (const s of songs) {
  const key = normalizeArtistWhitespace(s.a).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (!nfkcMap.has(key)) nfkcMap.set(key, new Map());
  const names = nfkcMap.get(key);
  if (!names.has(s.a)) names.set(s.a, []);
  names.get(s.a).push(s);
}
const nfkcOnly = [];
for (const [key, names] of nfkcMap) {
  if (names.size < 2) continue;
  const compareKeys = new Set([...names.keys()].map(artistCompareKey));
  if (compareKeys.size === 1) continue;
  nfkcOnly.push({
    key,
    class: classifyArtistNameVariants([...names.keys()]),
    variants: [...names.entries()].map(([name, list]) => ({
      name,
      count: list.length,
      titles: list.map((s) => s.t),
    })),
  });
}

function printGroup(g) {
  console.log(`\n[${g.class}] key=${g.key}`);
  for (const v of g.variants) {
    console.log(`  表記: ${JSON.stringify(v.name)}  曲数: ${v.count}`);
    console.log(`    曲: ${v.titles.join(' / ')}`);
  }
}

console.log('MASTER_SONGS', songs.length, '曲 / 生のアーティスト名', new Set(songs.map((s) => s.a)).size, '件');
console.log('正規化キー衝突（スペース・大小・全角英数字）:', sameKey.length, '組');
for (const g of sameKey) printGroup(g);

console.log('\nNFKC では同じだが比較キーが違う（中黒・＆ 等）:', nfkcOnly.length, '組');
for (const g of nfkcOnly) printGroup(g);

const ikimono = songs.filter((s) => /いきもの/.test(s.a) || /いきもの/.test(s.t));
console.log('\nいきものがかり関連');
for (const s of ikimono) {
  console.log(`  a=${JSON.stringify(s.a)} t=${JSON.stringify(s.t)}`);
}

const trailing = songs.filter((s) => s.a !== s.a.trim() || /[\u3000\u00A0\u200B-\u200D\uFEFF]/.test(s.a));
console.log('\n前後空白・不可視空白:', trailing.length, '件');

const meaningSplit = songs.filter((s) => hasMeaningChangingMarker(s.a)).length;
console.log('feat/&/・/with 等を含むアーティスト名:', meaningSplit, '件（自動統合しない）');
