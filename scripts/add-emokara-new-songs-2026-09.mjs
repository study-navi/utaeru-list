#!/usr/bin/env node
/**
 * エモカラ新着（2026-09 3枚スクショ分）を MASTER_SONGS に追加
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

/** @type {{ t: string, a: string, y: string, k: string }[]} */
const ENTRIES = [
  { t: 'スキスキDieスキ超Ayeシテル', a: '宝鐘マリン', y: 'ほうしょうまりん', k: 'ほ' },
  { t: 'DARMA GRAND PRIX', a: 'ヨルシカ', y: 'よるしか', k: 'よ' },
  { t: 'シャケナベイベー', a: 'AKASAKI', y: 'あかさき', k: 'あ' },
  { t: '日記', a: 'MACO', y: 'まこ', k: 'ま' },
  { t: 'あなたの彼女', a: 'MACO', y: 'まこ', k: 'ま' },
  { t: 'キャットフード', a: 'doriko', y: 'どりこ', k: 'ど' },
  { t: 'サンタマリア', a: '米津玄師', y: 'よねづけんし', k: 'よ' },
  { t: '春風', a: 'Rihwa', y: 'りふぁ', k: 'り' },
  { t: 'Orange Iris《レコおと》', a: 'こすぴ', y: 'こすぴ', k: 'こ' },
  { t: 'spectrum《レコおと》', a: 'シマエナガ', y: 'しまえなが', k: 'し' },
  { t: 'あんた', a: 'ティーナ・カリーナ', y: 'てぃーなかりーな', k: 'て' },
  { t: 'power of the dream', a: 'lol', y: 'ろる', k: 'ろ' },
  { t: 'Bouquet', a: '家入レオ', y: 'いえいりれお', k: 'い' },
  { t: 'HELP', a: 'flumpool', y: 'ふらんぷーる', k: 'ふ' },
  { t: 'クエスチョン', a: 'meiyo', y: 'めいよ', k: 'め' },
  { t: '魔法が解けたら', a: 'Saucy Dog', y: 'そーしーどっぐ', k: 'そ' },
  { t: 'チャンピオン', a: 'Kanaria', y: 'かなりあ', k: 'か' },
  { t: 'アルビレオ', a: 'ロクデナシ', y: 'ろくでなし', k: 'ろ' },
  { t: 'アンバランスなKissをして', a: '高橋ひろ', y: 'たかはしひろ', k: 'た' },
  { t: 'ひとりじゃない', a: 'DEEN', y: 'でぃーん', k: 'で' },
  { t: '僕たちの行方', a: '高橋瞳', y: 'たかはしひとみ', k: 'た' },
  { t: 'やさしい気持ち', a: 'CHARA', y: 'ちゃら', k: 'ち' },
  { t: 'There will be love there -愛のある場所-', a: 'the brilliant green', y: 'ざぶりりあんとぐりーん', k: 'ざ' },
  { t: 'Stage of the ground', a: 'BUMP OF CHICKEN', y: 'ばんぷおぶちきん', k: 'ば' },
  { t: '19 Memories', a: '加藤ミリヤ', y: 'かとうみりや', k: 'か' },
  { t: 'しょうちのすけ', a: '推定少女', y: 'すいていしょうじょ', k: 'す' },
  { t: 'Prisoner Of Love', a: '宇多田ヒカル', y: 'うただひかる', k: 'う' },
  { t: 'オルフェ', a: '宮野真守', y: 'みやのまもる', k: 'み' },
  { t: 'One day', a: 'The ROOTLESS', y: 'ざるーとれす', k: 'ざ' },
  { t: 'ソプラノ', a: 'HERO', y: 'ひーろー', k: 'ひ' },
  { t: 'ふたりずっと', a: 'MACO', y: 'まこ', k: 'ま' },
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
