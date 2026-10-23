#!/usr/bin/env node
/**
 * エモカラ新着（2026-10 3枚スクショ分）を MASTER_SONGS に追加
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

const SPIKA_UMA =
  'スピカ[スペシャルウィーク(CV.和氣あず未)、サイレンススズカ(CV.高野麻里佳)、トウカイテイオー(CV.Machico)、ウオッカ(CV.大橋彩香)、ダイワスカーレット(CV.木村千咲)、ゴールドシップ(CV.上田瞳)、メジロマックイーン(CV.大西沙織)]';

/** @type {{ t: string, a: string, y: string, k: string }[]} */
const ENTRIES = [
  { t: 'This Love', a: 'アンジェラ・アキ', y: 'あんじぇらあき', k: 'あ' },
  { t: '月のしずく', a: 'RUI', y: 'るい', k: 'る' },
  { t: 'Believe', a: '玉置成実', y: 'たまきなるみ', k: 'た' },
  { t: 'Realize', a: '玉置成実', y: 'たまきなるみ', k: 'た' },
  { t: '虹', a: 'AAA', y: 'とりぷるえー', k: 'と' },
  { t: 'PLEDGE', a: 'the GazettE', y: 'ざぎぜっと', k: 'ざ' },
  { t: 'soundless voice', a: 'ひとしずくP', y: 'ひとしずくぴー', k: 'ひ' },
  { t: 'アイのうた', a: '福井舞', y: 'ふくいまい', k: 'ふ' },
  { t: 'Dear', a: "19's Sound Factory", y: 'ないんてぃーんずさうんどふぁくとりー', k: 'な' },
  { t: 'Paradise Lost', a: '茅原実里', y: 'ちはらみのり', k: 'ち' },
  { t: 'クズ', a: 'GADORO', y: 'がどろ', k: 'が' },
  { t: '準透明少年', a: 'ヨルシカ', y: 'よるしか', k: 'よ' },
  { t: '大好きになればいいんじゃない？', a: 'すとぷり', y: 'すとぷり', k: 'す' },
  { t: 'CHEERS', a: 'Mrs. GREEN APPLE', y: 'みせすぐりーんあっぷる', k: 'み' },
  { t: 'ユメヲカケル!', a: SPIKA_UMA, y: 'すぴか', k: 'す' },
  { t: '我儘姫', a: 'ふじを', y: 'ふじを', k: 'ふ' },
  { t: 'おかえり', a: 'Tani Yuuki', y: 'たにゆうき', k: 'た' },
  { t: '左右盲', a: 'ヨルシカ', y: 'よるしか', k: 'よ' },
  { t: 'ホワイトノイズ', a: 'Official髭男dism', y: 'おふぃしゃるひげだんでぃずむ', k: 'お' },
  { t: '心得', a: 'Uru', y: 'うる', k: 'う' },
  { t: '花一匁', a: 'ずっと真夜中でいいのに。', y: 'ずっとまよなかでいいのに', k: 'ず' },
  { t: 'エール', a: 'マルシィ', y: 'まるしぃ', k: 'ま' },
  { t: '天ノ弱 -うぃんぐPiano Ver.-', a: 'Akie秋絵', y: 'あきえあきえ', k: 'あ' },
  { t: '悪い人', a: '戦慄かなの', y: 'せんりつかなの', k: 'せ' },
  { t: 'Same Blue', a: 'Official髭男dism', y: 'おふぃしゃるひげだんでぃずむ', k: 'お' },
  { t: '美少女無罪・パイレーツ', a: '宝鐘マリン', y: 'ほうしょうまりん', k: 'ほ' },
  { t: '願いごと', a: 'マルシィ', y: 'まるしぃ', k: 'ま' },
  { t: '明日の私に幸あれ', a: 'ナナヲアカリ', y: 'ななをあかり', k: 'な' },
  { t: 'ケセラバサラ', a: '鈴華ゆう子', y: 'れいかゆうこ', k: 'れ' },
  { t: '恋人', a: 'マルシィ', y: 'まるしぃ', k: 'ま' },
  { t: '劇薬中毒', a: '=LOVE', y: 'いこーるらぶ', k: 'い' },
  { t: 'Angelic Angel', a: "μ's", y: 'みゅーず', k: 'み' },
  { t: 'セーラー服と機関銃', a: '橋本環奈', y: 'はしもとかんな', k: 'は' },
  { t: 'きっと大丈夫', a: 'Little Glee Monster', y: 'りとるぐりーもんすたー', k: 'り' },
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
