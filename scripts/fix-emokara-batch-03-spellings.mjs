#!/usr/bin/env node
/**
 * batch-03: スクショ表記への修正（3曲）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {{ id: number, t: string, a: string, y: string, k: string }[]} */
const FIXES = [
  { id: 2099, t: 'スキスキDieスキ超Ayeシテル', a: '宝鐘マリン', y: 'ほうしょうまりん', k: 'ほ' },
  { id: 2100, t: 'DARMA GRAND PRIX', a: 'ヨルシカ', y: 'よるしか', k: 'よ' },
  { id: 2116, t: 'アルビレオ', a: 'ロクデナシ', y: 'ろくでなし', k: 'ろ' },
];

const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');
const songs = eval(match[1]);

for (const fix of FIXES) {
  const s = songs.find((x) => x.id === fix.id);
  if (!s) throw new Error(`id ${fix.id} not found`);
  console.log(`Fix id=${fix.id}: ${s.t}/${s.a} -> ${fix.t}/${fix.a}`);
  s.t = fix.t;
  s.a = fix.a;
  s.y = fix.y;
  s.k = fix.k;
  delete s.ty;
  delete s.tk;
  delete s.genres;
}

fs.writeFileSync(indexPath, html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${JSON.stringify(songs)};`));
console.log('Fixed 3 songs');
