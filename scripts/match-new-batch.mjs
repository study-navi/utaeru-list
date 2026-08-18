#!/usr/bin/env node
/**
 * 新着バッチ照合レポート（CLI）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { runBatchMatchReport, buildNewBatchLookup } from './lib/new-batch-lookup.mjs';
import { CURRENT_NEW_BATCH } from './data/new-song-batches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const report = runBatchMatchReport(songs);

console.log(`Batch: ${report.batch.id} (${report.batch.label})`);
console.log(`CURRENT_NEW_BATCH: ${CURRENT_NEW_BATCH}`);
console.log(`Extracted: ${report.total}`);
console.log(`Registered: ${report.registered.length}`);
console.log(`Unregistered: ${report.unregistered.length}`);
console.log(`Needs review: ${report.needsReview.length}`);
console.log(`Lookup keys: ${Object.keys(buildNewBatchLookup(songs)).length}`);

if (report.unregistered.length) {
  console.log('\n--- Unregistered ---');
  report.unregistered.forEach((r) => console.log(`  ${r.artist} / ${r.title}`));
}
if (report.needsReview.length) {
  console.log('\n--- Needs review ---');
  report.needsReview.forEach((r) => {
    console.log(`  ${r.artist} / ${r.title} — ${r.reason}`);
    (r.candidates || []).forEach((c) => console.log(`    ? ${c}`));
  });
}

process.exit(report.unregistered.length || report.needsReview.length ? 1 : 0);
