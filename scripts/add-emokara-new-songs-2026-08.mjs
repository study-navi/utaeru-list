#!/usr/bin/env node
/**
 * エモカラ新着（2026-08 3枚スクショ分）を MASTER_SONGS に追加
 * 公式表記は JOYSOUND / 配信元に合わせる
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {{ t: string, a: string, y: string, k: string }[]} */
const ENTRIES = [
  { t: '#情とは', a: 'This is LAST', y: 'てぃすいずらすと', k: 'て' },
  { t: 'SOULSOUP', a: 'Official髭男dism', y: 'おふぃしゃるひげだんでぃずむ', k: 'お' },
  { t: 'Friends，Family & God feat. G-k.i.d & KEIJU', a: 'Kvi Baba', y: 'くゔぃばば', k: 'く' },
  { t: '君を誰より愛してんのにな。', a: 'ACE COLLECTION', y: 'えーすこれくしょん', k: 'え' },
  { t: '元彼女のみなさまへ', a: 'コレサワ', y: 'これさわ', k: 'こ' },
  { t: '黙ってロックをやれって言ってんの!', a: '猫舘こたつ', y: 'ねこだてこたつ', k: 'ね' },
  { t: 'シェードの埃は延長', a: 'ずっと真夜中でいいのに。', y: 'ずっとまよなかでいいのに', k: 'ず' },
  { t: '君中心に揺れる世界は', a: 'マルシィ', y: 'まるしぃ', k: 'ま' },
  { t: 'ナルバキスン (Look at me, Gwisun)', a: 'D-LITE(from BIGBANG)', y: 'でぃーらいとふろむびっぐばん', k: 'で' },
  { t: 'courage', a: '戸松遥', y: 'とまつはるか', k: 'と' },
  { t: 'パズルガール', a: 'とあ', y: 'とあ', k: 'と' },
  { t: 'きみわずらい', a: 'まねきケチャ', y: 'まねきけちゃ', k: 'ま' },
  { t: 'うるとらみらくるくるふぁいなるアルティメットチョコびーむ', a: 'わーすた', y: 'わーすた', k: 'わ' },
  { t: '生きていたんだよな', a: 'あいみょん', y: 'あいみょん', k: 'あ' },
  { t: 'D-Day', a: 'D-LITE(from BIGBANG)', y: 'でぃーらいとふろむびっぐばん', k: 'で' },
  { t: 'ずっと、ふたりで', a: '家入レオ', y: 'いえいりれお', k: 'い' },
  { t: 'WINGS', a: 'D-LITE(from BIGBANG)', y: 'でぃーらいとふろむびっぐばん', k: 'で' },
  { t: 'ちっぽけな愛のうた', a: '小枝理子&小笠原秋', y: 'こえだりこあんどおがさわらあき', k: 'こ' },
  { t: '裸執事', a: '金瓶梅', y: 'きんぺいばい', k: 'き' },
  { t: '星のすみか', a: '藍坊主', y: 'あいぼうず', k: 'あ' },
  { t: '1925', a: '冨田悠斗(とみー/T-POCKET)', y: 'とみたゆうととみーてぃーぽけっと', k: 'と' },
  { t: 'タカラモノ ～この声がなくなるまで～', a: 'ナオト・インティライミ', y: 'なおといんてぃらいみ', k: 'な' },
  { t: 'Happy Birthday to you you', a: 'YUI', y: 'ゆい', k: 'ゆ' },
  { t: '旅人', a: '高杉 さと美', y: 'たかすぎさとみ', k: 'た' },
  { t: 'My Special Day', a: 'Dew', y: 'でゅー', k: 'で' },
  { t: '深愛', a: '水樹奈々', y: 'みずきなな', k: 'み' },
  { t: 'ハグルマ', a: 'KANA-BOON', y: 'かなぶーん', k: 'か' },
  { t: 'おかえりらぶっ!', a: 'すとぷり', y: 'すとぷり', k: 'す' },
  { t: 'かまってちょうだい///', a: 'ゴールデンボンバー', y: 'ごーるでんぼんばー', k: 'ご' },
  { t: '鼓動', a: 'カグラナナ', y: 'かぐらなな', k: 'か' },
  { t: 'なんでもないよ、', a: 'マカロニえんぴつ', y: 'まかろにえんぴつ', k: 'ま' },
  { t: 'ブラザービート', a: 'Snow Man', y: 'すのーまん', k: 'す' },
  { t: 'フューチャー・イヴ', a: 'sasakure.UK', y: 'ささくれゆーけー', k: 'さ' },
  { t: '夢をみせて', a: 'Co shu Nie', y: 'こしゅにー', k: 'こ' },
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
  songs.push({
    id: nextId++,
    k: entry.k,
    y: entry.y,
    a: entry.a,
    t: entry.t,
  });
  existing.add(key);
  added.push(entry);
}

const json = JSON.stringify(songs);
fs.writeFileSync(indexPath, html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${json};`));

console.log(`Added ${added.length} songs (${songs.length} total)`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} duplicates:`);
  for (const s of skipped) console.log(`  - ${s.t} / ${s.a}`);
}
