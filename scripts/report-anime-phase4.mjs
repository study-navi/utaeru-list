#!/usr/bin/env node
/**
 * Phase 4: アニソン候補抽出（B/C 保留用）と確定分レポート生成
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  getSongGenres,
  summarizeGenreStats,
  summarizeGenreCombinations,
} from './lib/master-genre-rules.mjs';
import { ANIME_VERIFIED_PHASE4, GENRE_CORRECTIONS_PHASE4 } from './data/anime-verified-phase4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const BASELINE = { jpop: 1644, anime: 45, vocaloid: 197, unclassified: 114, multi: 48, total: 1952 };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const songs = eval(html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

const stats = summarizeGenreStats(songs);
console.log('=== Phase 4 分類件数 ===');
console.log('基準:', BASELINE);
console.log('現在:', stats);
console.log('組み合わせ:', summarizeGenreCombinations(songs));

const newlyAnime = [];
const prevSongs = eval(execSync('git show d96ff05:index.html', { cwd: ROOT, encoding: 'utf8' })
  .match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);
const prevById = new Map(prevSongs.map((s) => [s.id, s]));

for (const s of songs) {
  const before = prevById.get(s.id)?.genres || [];
  const after = getSongGenres(s);
  if (!before.includes('アニソン') && after.includes('アニソン')) {
    const meta = ANIME_VERIFIED_PHASE4[s.id] || {};
    newlyAnime.push({ id: s.id, artist: s.a, title: s.t, before, after, ...meta });
  }
}

const corrections = [];
for (const [idStr, meta] of Object.entries(GENRE_CORRECTIONS_PHASE4)) {
  const id = Number(idStr);
  const s = songs.find((x) => x.id === id);
  const before = prevById.get(id)?.genres || [];
  if (!s) continue;
  corrections.push({ id, artist: s.a, title: s.t, before, after: meta.genres, ...meta });
}

// B/C 候補: J-POPのみでアニメ系アーティストだが未確定（参考）
const bCandidates = [];
for (const s of songs) {
  const g = getSongGenres(s);
  if (g.includes('アニソン')) continue;
  if (!g.includes('J-POP') && g.length) continue;
  // タイトルに作品名っぽい語（弱いヒューリスティック → B/C のみ）
  if (/\(.*(?:TV|OP|ED|Ver\.|ver\.).*\)/i.test(s.t)) {
    bCandidates.push({ id: s.id, artist: s.a, title: s.t, genres: g, confidence: 'C', reason: 'タイトルにTV/OP/ED表記' });
  }
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = path.join(REPORT_DIR, 'anime-phase4-added.json');
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  baseline: BASELINE,
  after: stats,
  newlyAnime,
  corrections,
  bCandidatesCount: bCandidates.length,
  bCandidatesSample: bCandidates.slice(0, 30),
}, null, 2));

console.log(`\n新規アニソン: ${newlyAnime.length}曲`);
console.log(`修正: ${corrections.length}曲`);
console.log(`B/C候補(未反映): ${bCandidates.length}曲`);
console.log(`レポート: ${reportPath}`);

console.log('\n=== 新規アニソン（全件） ===');
for (const r of newlyAnime) {
  console.log(`${r.artist} / ${r.title} / ${r.work} ${r.role} / ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`);
}

console.log('\n=== 修正 ===');
for (const r of corrections) {
  console.log(`${r.artist} / ${r.title} / ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)} (${r.note || ''})`);
}
