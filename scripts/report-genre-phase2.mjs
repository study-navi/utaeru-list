#!/usr/bin/env node
/**
 * ジャンル分類 Phase 2 検証（ランダム50曲・誤分類重点チェック）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  getSongGenres,
  summarizeGenreStats,
  summarizeGenreCombinations,
  isExcludedFromJPop,
  classifyBaseGenres,
} from './lib/master-genre-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const songs = eval(html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

const prev = eval(execSync('git show e80d5a6:index.html', { cwd: ROOT, encoding: 'utf8' })
  .match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

console.log('=== 分類件数 ===');
console.log('変更前:', summarizeGenreStats(prev));
console.log('変更後:', summarizeGenreStats(songs));
console.log('組み合わせ:', summarizeGenreCombinations(songs));

let newJpop = 0;
for (const s of songs) {
  const now = getSongGenres(s);
  const was = prev.find((p) => p.id === s.id)?.genres || [];
  if (now.includes('J-POP') && !was.includes('J-POP')) newJpop++;
}
console.log('新規J-POP分類:', newJpop);

const newlyJpop = songs.filter((s) => {
  const now = getSongGenres(s);
  const was = prev.find((p) => p.id === s.id)?.genres || [];
  return now.includes('J-POP') && !was.includes('J-POP');
});

// seeded random 50
function seededPick(arr, n, seed = 42) {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

console.log('\n=== ランダム50曲（新規J-POP） ===');
for (const s of seededPick(newlyJpop, 50)) {
  console.log(`${s.a} / ${s.t} → ${JSON.stringify(getSongGenres(s))}`);
}

const focusRes = [
  [/feat\.?\s*(初音|鏡音|ミク|可不|flower|GUMI)/i, 'VOCALOID feat'],
  [/Disney|ディズニー/i, 'Disney'],
  [/(?:\(|[（])[Cc][Vv]/, 'CV/キャラ'],
  [/演歌|坂本冬美|美空ひばり/, '演歌'],
  [/Ed Sheeran|TWICE|BIGBANG|Beyonce|Ariana|BON JOVI/i, '洋楽/K-POP'],
  [/HoneyWorks|すとぷり|まふまふ|96猫|μ's|Aqours|にじさんじ|うまぴょい/i, '特殊/ゲーム/歌い手'],
  [/^(DECO\*27|ハチ|40mP|ピノキオP|ジミーサムP|Neru|じん|Eve)$/i, 'VOCALOID P'],
];

console.log('\n=== 誤分類重点チェック ===');
let issues = 0;
for (const [re, label] of focusRes) {
  const hits = songs.filter((s) => {
    const g = getSongGenres(s);
    return re.test(`${s.a} ${s.t}`) && JSON.stringify(g) === '["J-POP"]';
  });
  if (hits.length) {
    issues += hits.length;
    console.log(`⚠ ${label}: J-POPのみ ${hits.length}件`);
    hits.slice(0, 5).forEach((s) => console.log(`   ${s.a} / ${s.t}`));
  } else {
    console.log(`OK ${label}`);
  }
}

// ボカロ維持
const prevVoc = prev.filter((s) => (s.genres || []).includes('ボカロ')).length;
const nowVoc = songs.filter((s) => getSongGenres(s).includes('ボカロ')).length;
console.log('\n=== ボカロ件数 ===');
console.log(`変更前: ${prevVoc} → 変更後: ${nowVoc}（漏れ補完含む）`);

const removedVoc = prev.filter((s) => {
  const was = s.genres || [];
  const now = getSongGenres(songs.find((x) => x.id === s.id));
  return was.includes('ボカロ') && !now.includes('ボカロ');
});
if (removedVoc.length) {
  console.log('⚠ ボカロ削除:', removedVoc.map((s) => `${s.a}/${s.t}`));
} else {
  console.log('OK 既存ボカロ分類は維持');
}

console.log('\n=== 未分類代表 ===');
songs.filter((s) => !getSongGenres(s).length).slice(0, 10).forEach((s) => {
  console.log(`${s.a} / ${s.t}`);
});

if (issues) process.exit(1);
