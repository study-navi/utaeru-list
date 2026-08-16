#!/usr/bin/env node
/**
 * Phase 6.1 → v1.0: 編集ナビ（旧アコーディオン）回帰 — 横タブ UI へ移行済み
 * 互換のためファイル名は維持。実体は test-edit-tabs-ui.mjs と同等の主要チェック。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-edit-tabs-ui.mjs');
const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(r.status ?? 1);
