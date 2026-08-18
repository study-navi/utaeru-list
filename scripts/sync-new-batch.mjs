#!/usr/bin/env node
/**
 * 新着バッチ: 照合 → lookup注入 → UI patch → 404/sync
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { runBatchMatchReport } from './lib/new-batch-lookup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  const r = spawnSync('node', [path.join(ROOT, 'scripts', script)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const report = runBatchMatchReport(songs);
console.log(`Batch ${report.batch.id}: ${report.registered.length}/${report.total} registered`);
if (report.unregistered.length || report.needsReview.length) {
  console.error('未登録または要確認があるため停止');
  process.exit(1);
}

run('inject-new-batch-lookup.mjs');
run('patch-new-batch-ui.mjs');
run('build-404-html.mjs');
run('sync-viewer-template.mjs');
console.log('New batch sync complete.');
