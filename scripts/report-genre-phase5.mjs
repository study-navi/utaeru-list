#!/usr/bin/env node
/**
 * Phase 5 ジャンル分類レポート
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { summarizeGenreStats, summarizeGenreCombinations } from './lib/master-genre-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const stats = summarizeGenreStats(songs);
const combos = summarizeGenreCombinations(songs);

const otherSongs = songs.filter((s) => (s.genres || []).includes('その他')).map((s) => ({
  id: s.id, artist: s.a, title: s.t, genres: s.genres,
}));

const eve = songs.filter((s) => s.a === 'Eve').map((s) => ({ id: s.id, title: s.t, genres: s.genres }));
const syudou = songs.filter((s) => s.a === 'syudou' || s.a.startsWith('syudou feat')).map((s) => ({
  id: s.id, artist: s.a, title: s.t, genres: s.genres,
}));

const report = {
  generatedAt: new Date().toISOString(),
  stats,
  combinations: combos,
  otherSongs,
  eve,
  syudou,
};

const outPath = path.join(ROOT, 'reports', 'genre-phase5.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Stats:', stats);
console.log('Report:', outPath);
console.log('その他', otherSongs.length, '曲');
