#!/usr/bin/env node
/**
 * MASTER_SONGS の明らかなアーティスト名誤記を正式表記へ修正する。
 * id / k / y / t / ty / tk / genres など a 以外は変更しない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {Record<string, string>} */
const ARTIST_TYPO_FIXES = {
  'Mr.children': 'Mr.Children',
  'Ms.Chilidren': 'Mr.Children',
};

const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');

const songs = eval(match[1]);
const beforeCount = songs.length;
const changes = [];

for (const song of songs) {
  const next = ARTIST_TYPO_FIXES[song.a];
  if (!next) continue;
  changes.push({ id: song.id, from: song.a, to: next, title: song.t });
  song.a = next;
}

const unchangedFields = ['id', 'k', 'y', 't', 'ty', 'tk', 'genres'];
for (const song of songs) {
  for (const key of unchangedFields) {
    if (song[key] === undefined && key === 'genres') continue;
  }
}

if (songs.length !== beforeCount) {
  throw new Error(`Song count changed: ${beforeCount} -> ${songs.length}`);
}

for (const [from] of Object.entries(ARTIST_TYPO_FIXES)) {
  if (songs.some((s) => s.a === from)) {
    throw new Error(`Typo artist still present: ${from}`);
  }
}

const json = JSON.stringify(songs);
const nextHtml = html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${json};`);
fs.writeFileSync(indexPath, nextHtml);

console.log(`Patched ${changes.length} song(s) in MASTER_SONGS (${beforeCount} total)`);
for (const c of changes) {
  console.log(`  id=${c.id} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)} / ${c.title}`);
}
