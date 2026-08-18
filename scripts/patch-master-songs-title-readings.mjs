#!/usr/bin/env node
/**
 * MASTER_SONGS に曲名読み ty/tk を付与する（ビルド時のみ・ランタイム推測なし）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import KuroshiroPkg from 'kuroshiro';
import KuromojiAnalyzerPkg from 'kuroshiro-analyzer-kuromoji';

const Kuroshiro = KuroshiroPkg.default || KuroshiroPkg;
const KuromojiAnalyzer = KuromojiAnalyzerPkg.default || KuromojiAnalyzerPkg;
import {
  deriveTitleReadingSafe,
  firstKanaChar,
  norm,
  titleForReading,
} from './lib/title-reading.mjs';
import { OVERRIDES } from './data/title-readings-overrides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');

const html = fs.readFileSync(indexPath, 'utf8');
const match = html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/);
if (!match) throw new Error('MASTER_SONGS not found');
const songs = eval(match[1]);

const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

let safe = 0;
let override = 0;
let converted = 0;
let failed = 0;
const failures = [];

for (const s of songs) {
  const key = `${s.a}\u0001${s.t}`;
  let ty = null;

  if (OVERRIDES[key]) {
    ty = norm(OVERRIDES[key]);
    override++;
  } else {
    ty = deriveTitleReadingSafe(s.t);
    if (ty) safe++;
    else {
      const src = titleForReading(s.t);
      try {
        ty = norm(await kuroshiro.convert(src, { to: 'hiragana' }));
        converted++;
      } catch (e) {
        failed++;
        failures.push({ id: s.id, t: s.t, err: e.message });
        continue;
      }
    }
  }

  if (!ty) {
    failed++;
    failures.push({ id: s.id, t: s.t, err: 'empty ty' });
    continue;
  }
  const tk = firstKanaChar(ty);
  if (!tk) {
    failed++;
    failures.push({ id: s.id, t: s.t, err: 'empty tk' });
    continue;
  }
  s.ty = ty;
  s.tk = tk;
}

if (failed) {
  console.error('Failures:', failures.slice(0, 20));
  throw new Error(`${failed} songs missing ty/tk`);
}

const ordered = songs.map(({ id, k, y, a, t, genres, ty, tk }) => {
  const row = { id, k, y, a, t, ty, tk };
  if (genres !== undefined) row.genres = genres;
  return row;
});

const json = JSON.stringify(ordered);
const nextHtml = html.replace(/const MASTER_SONGS = (\[[\s\S]*?\]);/, `const MASTER_SONGS = ${json};`);
fs.writeFileSync(indexPath, nextHtml);

console.log(`Patched ${songs.length} songs: safe=${safe} override=${override} kuroshiro=${converted}`);
// sanity samples
for (const sample of ['Ado\u0001新時代 (ウタ from ONE PIECE FILM RED)', 'バルーン\u0001シャルル', 'KANA-BOON\u0001シルエット']) {
  const [a, t] = sample.split('\u0001');
  const hit = ordered.find((s) => s.a === a && s.t === t);
  console.log(`  ${t.slice(0, 12)}… ty=${hit?.ty?.slice(0, 12)} tk=${hit?.tk}`);
}
