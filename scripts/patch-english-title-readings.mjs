#!/usr/bin/env node
/**
 * アルファベットのままの曲名読み (ty/tk) を、外来語のひらがな読みに置き換える。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { englishTitleToHiragana, kanaizeEmbeddedLatin } from './lib/english-to-kana.mjs';
import { titleForReading } from './lib/title-reading.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');
const songs = eval(match[1]);

let changed = 0;
for (const s of songs) {
  const latinHead = s.tk && /[a-z]/i.test(s.tk) && !/[ぁ-んァ-ヶゔ]/.test(s.tk);
  let ty = s.ty;
  if (latinHead) {
    ty = englishTitleToHiragana(titleForReading(s.t));
  } else {
    ty = kanaizeEmbeddedLatin(s.ty);
  }
  const tk = ty ? [...ty][0] : '';
  if (!ty || !tk) throw new Error(`no reading: ${s.id} ${s.t}`);
  if (ty !== s.ty || tk !== s.tk) changed++;
  s.ty = ty;
  s.tk = tk;
}

const ordered = songs.map(({ id, k, y, a, t, ty, tk, genres }) => {
  const row = { id, k, y, a, t, ty, tk };
  if (genres !== undefined) row.genres = genres;
  return row;
});
const next = html.replace(match[0], `const MASTER_SONGS = ${JSON.stringify(ordered)};`);
fs.writeFileSync(indexPath, next);
console.log(`Updated ${changed} English title readings`);
