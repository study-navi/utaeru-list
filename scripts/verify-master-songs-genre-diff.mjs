#!/usr/bin/env node
/**
 * MASTER_SONGS の genres 追加以外に id/k/y/a/t が変わっていないことを検証
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadSongs(ref) {
  const html = execSync(`git show ${ref}:index.html`, { cwd: ROOT, encoding: 'utf8' });
  return eval(html.match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);
}

const baseRef = process.argv[2] || '3797ede';
const before = loadSongs(baseRef);
const after = eval(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const MASTER_SONGS = (\[[\s\S]*?\]);/)[1]);

if (before.length !== after.length) {
  console.error('FAIL: 曲数', before.length, after.length);
  process.exit(1);
}

let failed = 0;
for (let i = 0; i < before.length; i++) {
  const b = before[i];
  const a = after[i];
  for (const key of ['id', 'k', 'y', 'a', 't']) {
    if (b[key] !== a[key]) {
      console.error(`FAIL id=${a.id} ${key}: ${JSON.stringify(b[key])} -> ${JSON.stringify(a[key])}`);
      failed++;
    }
  }
}

if (failed) process.exit(1);
console.log(`OK: ${after.length}曲 — genres以外のMASTER_SONGS差分なし (base=${baseRef})`);
