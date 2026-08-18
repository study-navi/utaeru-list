#!/usr/bin/env node
/**
 * MASTER_SONGS に genres フィールドを付与して index.html を更新する。
 * 既存 id/k/y/a/t は変更しない。genres 以外の差分が出ないことを検証する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySongGenres } from './lib/master-genre-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');

const songs = eval(match[1]);
const beforeSnapshot = songs.map((s) => ({ id: s.id, k: s.k, y: s.y, a: s.a, t: s.t }));

for (const song of songs) {
  song.genres = classifySongGenres(song);
}

for (let i = 0; i < songs.length; i++) {
  const b = beforeSnapshot[i];
  const s = songs[i];
  for (const key of ['id', 'k', 'y', 'a', 't']) {
    if (b[key] !== s[key]) {
      throw new Error(`Unexpected change: id=${s.id} ${key}`);
    }
  }
}

const json = JSON.stringify(songs);
const nextHtml = html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${json};`);
fs.writeFileSync(indexPath, nextHtml);

console.log(`Patched ${songs.length} songs in index.html`);
