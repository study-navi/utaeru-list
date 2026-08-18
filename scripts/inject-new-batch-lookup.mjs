#!/usr/bin/env node
/**
 * index.html / hiro.html に NEW_BATCH_LOOKUP を注入
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNewBatchLookup, buildNewBatchOrderMap, runBatchMatchReport } from './lib/new-batch-lookup.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { CURRENT_NEW_BATCH } from './data/new-song-batches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '// @new-batch-inject';
const END = '// @end-new-batch-inject';

const indexPath = path.join(ROOT, 'index.html');
const hiroPath = path.join(ROOT, 'hiro.html');

const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(indexPath, 'utf8'));
const report = runBatchMatchReport(songs);
if (report.unregistered.length > 0) {
  console.error('未登録曲があるため注入を中止します:');
  report.unregistered.forEach((r) => console.error(`  ${r.artist} / ${r.title}`));
  process.exit(1);
}
if (report.needsReview.length > 0) {
  console.error('要確認曲があるため注入を中止します:');
  report.needsReview.forEach((r) => console.error(`  ${r.artist} / ${r.title} — ${r.reason}`));
  process.exit(1);
}

const lookup = buildNewBatchLookup(songs);
const order = buildNewBatchOrderMap(songs);
const block = `${START}
const CURRENT_NEW_BATCH = ${JSON.stringify(CURRENT_NEW_BATCH)};
const NEW_BATCH_LOOKUP = ${JSON.stringify(lookup)};
const NEW_BATCH_ORDER = ${JSON.stringify(order)};
function isCurrentNewBatchSong(s) {
  const batches = NEW_BATCH_LOOKUP[keyOf(s)];
  return !!(batches && batches.indexOf(CURRENT_NEW_BATCH) >= 0);
}
function getBatchOrderIndex(s) {
  return NEW_BATCH_ORDER[keyOf(s)];
}
${END}`;

function inject(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (re.test(html)) {
    html = html.replace(re, block);
  } else if (html.includes('// @end-genre-lookup-inject')) {
    html = html.replace('// @end-genre-lookup-inject', `// @end-genre-lookup-inject\n${block}`);
  } else if (html.includes('function getSongGenres(song) {')) {
    html = html.replace(
      'function getSongGenres(song) {',
      `${block}\nfunction getSongGenres(song) {`,
    );
  } else {
    throw new Error(`inject point not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, html);
  console.log(`Injected NEW_BATCH_LOOKUP (${Object.keys(lookup).length} keys) into ${path.basename(filePath)}`);
}

inject(indexPath);
inject(hiroPath);
