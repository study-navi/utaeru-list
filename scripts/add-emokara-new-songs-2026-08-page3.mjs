#!/usr/bin/env node
/**
 * エモカラ新着 3枚目画像後半（17曲）を MASTER_SONGS に追加
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {{ t: string, a: string, y: string, k: string }[]} */
const ENTRIES = [
  { t: 'かもめが翔んだ日', a: '渡辺真知子', y: 'わたなべまちこ', k: 'わ' },
  { t: 'CHA-LA HEAD-CHA-LA', a: '影山ヒロノブ', y: 'かげやまひろのぶ', k: 'か' },
  { t: '春を愛する人', a: 'GLAY', y: 'ぐれい', k: 'ぐ' },
  { t: '抱いてセニョリータ', a: '山下智久', y: 'やましたともひさ', k: 'や' },
  { t: '約束の場所', a: 'CHEMISTRY', y: 'けみすとりー', k: 'け' },
  { t: '彩り', a: 'Mr.Children', y: 'みすたーちるどれん', k: 'み' },
  { t: 'キッス ～帰り道のラブソング～', a: 'テゴマス', y: 'てごます', k: 'て' },
  { t: 'GO FOR IT!!', a: '西野カナ', y: 'にしのかな', k: 'に' },
  { t: '桃ノ花ビラ', a: '大塚愛', y: 'おおつかあい', k: 'お' },
  { t: '銀色飛行船', a: 'supercell', y: 'すーぱーせる', k: 'す' },
  { t: 'WHITE BREATH〈UNDER:COVER version〉', a: 'T.M.Revolution', y: 'てぃーえむれぼりゅーしょん', k: 'て' },
  { t: '瞳', a: 'aiko', y: 'あいこ', k: 'あ' },
  { t: '暁の車', a: 'FictionJunction YUUKA', y: 'ふぃくしょんじゃんくしょんゆうか', k: 'ふ' },
  { t: '20-CRY-', a: '加藤ミリヤ', y: 'かとうみりや', k: 'か' },
  { t: 'ムラサキ', a: '赤西仁', y: 'あかにしじん', k: 'あ' },
  { t: 'Esperanza', a: '西野カナ', y: 'にしのかな', k: 'に' },
];

const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');
const songs = eval(match[1]);

function normKey(a, t) {
  return `${String(a).normalize('NFKC').toLowerCase().replace(/\s+/g, '')}\u0001${String(t).normalize('NFKC').toLowerCase().replace(/\s+/g, '')}`;
}
const existing = new Set(songs.map((s) => normKey(s.a, s.t)));

let nextId = Math.max(...songs.map((s) => s.id)) + 1;
const added = [];
const skipped = [];

for (const entry of ENTRIES) {
  const key = normKey(entry.a, entry.t);
  if (existing.has(key)) {
    skipped.push(entry);
    continue;
  }
  songs.push({ id: nextId++, k: entry.k, y: entry.y, a: entry.a, t: entry.t });
  existing.add(key);
  added.push(entry);
}

fs.writeFileSync(indexPath, html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${JSON.stringify(songs)};`));
console.log(`Added ${added.length} songs (${songs.length} total)`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} duplicates`);
  for (const s of skipped) console.log(`  - ${s.t} / ${s.a}`);
}
