#!/usr/bin/env node
/**
 * MASTER_SONGS の k/y 整合性検証
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const songs = eval(html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

if (songs.length !== 1952) fail('1,952曲', String(songs.length));
else ok('1,952曲');

const ids = new Set();
for (const s of songs) {
  if (ids.has(s.id)) fail('id重複', String(s.id));
  ids.add(s.id);
  if (!s.k || !s.y) fail('k/y欠損', String(s.id));
  if ([...s.k].length !== 1) fail('kは1文字', `${s.id}:${s.k}`);
  if (s.k !== s.y[0]) fail('k === y[0]', `${s.id} k=${s.k} y=${s.y}`);
  if (s.genres !== undefined) {
    if (!Array.isArray(s.genres)) fail('genresは配列', String(s.id));
    const allowed = new Set(['J-POP', 'アニソン', 'ボカロ']);
    for (const g of s.genres) {
      if (!allowed.has(g)) fail('genres値', `${s.id}:${g}`);
    }
  }
}
if (!failed) ok('全曲 k/y 整合');

const byArtist = new Map();
for (const s of songs) {
  if (!byArtist.has(s.a)) byArtist.set(s.a, new Set());
  byArtist.get(s.a).add(s.y + '|' + s.k);
}
const multi = [...byArtist.entries()].filter(([, v]) => v.size > 1);
if (multi.length) fail('アーティスト y/k 表記ゆれ残存', multi.map(([a]) => a).join(', '));
else ok('アーティスト y/k 表記統一');

if (failed) process.exit(1);
console.log('\nMASTER_SONGS validation passed.');
