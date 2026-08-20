#!/usr/bin/env node
/**
 * MASTER_SONGS のアーティスト名 a を正式表記へ修正する。
 * - 明らかな誤記（固定マップ）
 * - 空白だけが異なる表記（比較キー衝突かつ空白差のみ）
 *
 * 波ダッシュ・Unicode記号・大小文字などは比較キー側で吸収（ここでは触らない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artistCompareKey,
  normalizeArtistName,
  ARTIST_CANONICAL_DISPLAY,
  CANONICAL_ARTIST_NAMES,
  officialLookScore,
  findArtistVariantGroups,
} from './lib/artist-name.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {Record<string, string>} */
const ARTIST_TYPO_FIXES = {
  'Mr.children': 'Mr.Children',
  'Ms.Chilidren': 'Mr.Children',
};

function stripSpaces(name) {
  return normalizeArtistName(name).replace(/ /g, '');
}

function isWhitespaceOnlyVariant(names) {
  const unique = [...new Set(names)];
  if (unique.length < 2) return false;
  const stripped = unique.map(stripSpaces);
  if (new Set(stripped).size !== 1) return false;
  const normalized = unique.map(normalizeArtistName);
  if (new Set(normalized).size === 1) return false;
  return true;
}

function pickCanonical(names) {
  const unique = [...new Set(names)];
  for (const n of unique) {
    const mapped = ARTIST_CANONICAL_DISPLAY[artistCompareKey(n)];
    if (mapped && unique.some((u) => artistCompareKey(u) === artistCompareKey(mapped))) {
      return mapped;
    }
  }
  for (const c of CANONICAL_ARTIST_NAMES) {
    if (unique.some((u) => artistCompareKey(u) === artistCompareKey(c))) return c;
  }
  return [...unique].sort((a, b) => {
    const diff = officialLookScore(b) - officialLookScore(a);
    if (diff) return diff;
    return a.localeCompare(b, 'ja');
  })[0];
}

function buildWhitespaceFixes(songs) {
  /** @type {Record<string, string>} */
  const fixes = {};
  for (const group of findArtistVariantGroups(songs)) {
    const names = group.variants.map((v) => v.name);
    if (!isWhitespaceOnlyVariant(names)) continue;
    const canonical = pickCanonical(names);
    for (const name of names) {
      if (name !== canonical) fixes[name] = canonical;
    }
  }
  return fixes;
}

const html = fs.readFileSync(indexPath, 'utf8');
const songs = parseMasterSongsFromIndexHtml(html);
const beforeCount = songs.length;
const whitespaceFixes = buildWhitespaceFixes(songs);
const allFixes = { ...whitespaceFixes, ...ARTIST_TYPO_FIXES };

const changes = [];
for (const song of songs) {
  const next = allFixes[song.a];
  if (!next || next === song.a) continue;
  changes.push({ id: song.id, from: song.a, to: next, title: song.t });
  song.a = next;
}

if (songs.length !== beforeCount) {
  throw new Error(`Song count changed: ${beforeCount} -> ${songs.length}`);
}

for (const [from] of Object.entries(allFixes)) {
  if (songs.some((s) => s.a === from)) {
    throw new Error(`Source artist still present: ${from}`);
  }
}

function yDiffersOnlyByWhitespace(values) {
  const unique = [...new Set(values)];
  if (unique.length < 2) return false;
  const stripped = unique.map((y) => y.replace(/ /g, ''));
  return new Set(stripped).size === 1;
}

function pickCanonicalY(counts) {
  return [...counts.entries()].sort((a, b) => {
    const spaceDiff = a[0].includes(' ') - b[0].includes(' ');
    if (spaceDiff) return spaceDiff;
    const countDiff = b[1] - a[1];
    if (countDiff) return countDiff;
    return a[0].localeCompare(b[0], 'ja');
  })[0][0];
}

const byArtist = new Map();
for (const song of songs) {
  if (!byArtist.has(song.a)) byArtist.set(song.a, new Map());
  const ym = byArtist.get(song.a);
  ym.set(song.y, (ym.get(song.y) || 0) + 1);
}
for (const [artist, yCounts] of byArtist) {
  const ys = [...yCounts.keys()];
  if (!yDiffersOnlyByWhitespace(ys)) continue;
  const canonicalY = pickCanonicalY(yCounts);
  for (const song of songs) {
    if (song.a !== artist || song.y === canonicalY) continue;
    changes.push({ id: song.id, from: `${artist} y=${song.y}`, to: `${artist} y=${canonicalY}`, title: song.t });
    song.y = canonicalY;
    song.k = canonicalY[0];
  }
}

const json = JSON.stringify(songs);
const nextHtml = html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${json};`);
fs.writeFileSync(indexPath, nextHtml);

const byMapping = new Map();
for (const c of changes) {
  const key = `${c.from}\0${c.to}`;
  if (!byMapping.has(key)) byMapping.set(key, { from: c.from, to: c.to, count: 0, titles: [] });
  const row = byMapping.get(key);
  row.count += 1;
  if (row.titles.length < 5) row.titles.push(c.title);
}

console.log(`Patched ${changes.length} song(s) in MASTER_SONGS (${beforeCount} total)`);
for (const row of [...byMapping.values()].sort((a, b) => a.from.localeCompare(b.from, 'ja'))) {
  console.log(`  ${JSON.stringify(row.from)} -> ${JSON.stringify(row.to)} (${row.count}曲)`);
}
