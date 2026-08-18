#!/usr/bin/env node
/**
 * 基準状態・互換性の検証スクリプト。
 * 機能追加や改修の前後で実行し、既存仕様を壊していないか確認する。
 *
 * 使い方:
 *   node scripts/verify-baseline.mjs
 *   node scripts/verify-baseline.mjs --skip-checksums   # HTML の checksum 比較をスキップ
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'baseline', 'BASELINE.json');

const skipChecksums = process.argv.includes('--skip-checksums');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`OK: ${message}`);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function sha256(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseJsArray(source, varName) {
  const re = new RegExp(`const ${varName} = (\\[[\\s\\S]*?\\]);`);
  const match = source.match(re);
  if (!match) throw new Error(`${varName} が見つかりません`);
  return JSON.parse(match[1]);
}

function parseBuilderConfig(html) {
  const re = /<script type="application\/json" id="builder-config">([\s\S]*?)<\/script>/;
  const match = html.match(re);
  if (!match) throw new Error('builder-config ブロックが見つかりません');
  return JSON.parse(match[1]);
}

function decodeViewerTemplate(indexHtml) {
  const match = indexHtml.match(/id="viewer-template-b64">([^<]+)/);
  if (!match) throw new Error('viewer-template-b64 が見つかりません');
  return Buffer.from(match[1], 'base64').toString('utf8');
}

function keyOf(s) {
  return s.a + '\u0001' + s.t;
}

function assertSongShape(song, fields, label) {
  for (const field of fields) {
    if (!(field in song)) {
      throw new Error(`${label}: 必須フィールド "${field}" がありません`);
    }
  }
  for (const field of ['k', 'y', 'a', 't']) {
    if (typeof song[field] !== 'string') {
      throw new Error(`${label}: "${field}" は文字列である必要があります`);
    }
  }
  if ('genres' in song) {
    if (!Array.isArray(song.genres)) {
      throw new Error(`${label}: "genres" は配列である必要があります`);
    }
  }
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
let errors = 0;

function check(name, fn) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(`${name} — ${err.message}`);
    errors += 1;
  }
}

console.log(`基準状態: ${baseline.label} (${baseline.establishedAt}, ${baseline.gitCommitShort})\n`);

check('baseline/BASELINE.json が読み込める', () => {
  if (!baseline.files?.['index.html'] || !baseline.files?.['hiro.html']) {
    throw new Error('files 定義が不完全です');
  }
});

for (const file of ['index.html', 'hiro.html']) {
  check(`${file} が存在する`, () => {
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error('ファイルがありません');
  });

  if (!skipChecksums) {
    check(`${file} のサイズが基準値と一致`, () => {
      const actual = fs.statSync(path.join(ROOT, file)).size;
      const expected = baseline.files[file].bytes;
      if (actual !== expected) {
        throw new Error(`expected ${expected}, got ${actual}`);
      }
    });

    check(`${file} の SHA256 が基準値と一致`, () => {
      const actual = sha256(file);
      const expected = baseline.files[file].sha256;
      if (actual !== expected) {
        throw new Error(`expected ${expected}, got ${actual}`);
      }
    });
  }
}

const indexHtml = read('index.html');
const hiroHtml = read('hiro.html');

check('MASTER_SONGS の件数が基準値と一致', () => {
  const songs = parseJsArray(indexHtml, 'MASTER_SONGS');
  if (songs.length !== baseline.catalog.masterSongCount) {
    throw new Error(`expected ${baseline.catalog.masterSongCount}, got ${songs.length}`);
  }
});

check('MASTER_SONGS のスキーマ (id, k, y, a, t)', () => {
  const songs = parseJsArray(indexHtml, 'MASTER_SONGS');
  for (const song of songs.slice(0, 20)) {
    assertSongShape(song, baseline.songFields.master, 'MASTER_SONGS');
  }
  const keys = songs.map(keyOf);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length > 0) throw new Error(`重複キー: ${dup[0]}`);
});

check('CATALOG_UPDATED が基準値と一致', () => {
  const match = indexHtml.match(/const CATALOG_UPDATED = '([^']+)';/);
  if (!match) throw new Error('CATALOG_UPDATED が見つかりません');
  if (match[1] !== baseline.catalog.updatedLabel) {
    throw new Error(`expected ${baseline.catalog.updatedLabel}, got ${match[1]}`);
  }
});

check('曲キー区切り文字が \\u0001', () => {
  if (!indexHtml.includes("return s.a + '\\u0001' + s.t")) {
    throw new Error('keyOf の区切り文字が変更されている可能性があります');
  }
});

check('builder-config インポート処理が存在', () => {
  if (!indexHtml.includes('id="builder-config"')) {
    throw new Error('import 用 builder-config 参照が見つかりません');
  }
});

check('viewer-template-b64 のプレースホルダーがすべて存在', () => {
  const tpl = decodeViewerTemplate(indexHtml);
  for (const ph of baseline.viewerTemplate.placeholders) {
    if (!tpl.includes(ph)) throw new Error(`プレースホルダー ${ph} がテンプレートにありません`);
  }
});

check('hiro.html の builder-config がパース可能', () => {
  const config = parseBuilderConfig(hiroHtml);
  for (const field of baseline.builderConfig.requiredFields) {
    if (!(field in config)) throw new Error(`必須フィールド "${field}" がありません`);
  }
});

check('hiro.html の SONGS スキーマ (k, y, a, t)', () => {
  const songs = parseJsArray(hiroHtml, 'SONGS');
  for (const song of songs) {
    assertSongShape(song, baseline.songFields.exported, 'SONGS');
  }
});

check('hiro.html の selected 件数と SONGS 件数が一致', () => {
  const config = parseBuilderConfig(hiroHtml);
  const songs = parseJsArray(hiroHtml, 'SONGS');
  if (config.selected.length !== songs.length) {
    throw new Error(`selected ${config.selected.length} != SONGS ${songs.length}`);
  }
  for (const song of songs) {
    if (!config.selected.includes(keyOf(song))) {
      throw new Error(`builder-config.selected に ${keyOf(song)} がありません`);
    }
  }
});

check('hiro.html が viewer テンプレート構造と一致（データ除く）', () => {
  const tpl = decodeViewerTemplate(indexHtml);
  const normalize = (html) =>
    html
      .replace(/const SONGS = __SONGS_JSON__;/, 'SONGS;')
      .replace(/const SONGS = \[[\s\S]*?\];/, 'SONGS;')
      .replace(/<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/, 'CONFIG')
      .replace(/document\.getElementById\('statUpdated'\)\.textContent = '[^']*';/, 'UPDATED;')
      .replace(/<title>[\s\S]*?<\/title>/, '<title>TITLE</title>')
      .replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '<h1>NAME</h1>')
      .replace(/<p class="subtitle"[^>]*>[\s\S]*?<\/p>/, '<p class="subtitle">SUB</p>')
      .replace(/__PAGE_TITLE__/g, 'TITLE')
      .replace(/__STREAMER_NAME__/g, 'NAME')
      .replace(/__SUBTITLE__/g, 'SUB')
      .replace(/__UPDATED_LABEL__/g, 'DATE')
      .replace(/__BUILDER_CONFIG_JSON__/g, 'CONFIG')
      .replace(/（\d{4}\/\d{1,2}\/\d{1,2}時点のカタログ）/g, '（DATE時点のカタログ）')
      .replace(/<!-- __ACCENT_DARK__ __ACCENT_DARK_INK__ __ACCENT_DARK_WASH__ -->/g, '')
      .replace(/--accent(?:-ink|-wash)?: [^;]+;/g, '--accent: COLOR;')
      .replace(/#[0-9a-fA-F]{6}/g, 'COLOR');

  if (normalize(tpl).trim() !== normalize(hiroHtml).trim()) {
    throw new Error('hiro.html と viewer テンプレートの構造が一致しません。テンプレート側の更新が必要です');
  }
});

// --- Phase 0/1: configVersion / songMeta / tagPresets（追加フィールド・旧HTML互換） ---

const optionalFields = Object.keys(baseline.builderConfig.optionalFields || {});

check('index.html が CONFIG_VERSION を宣言している', () => {
  if (!/const CONFIG_VERSION = \d+;/.test(indexHtml)) {
    throw new Error('CONFIG_VERSION の宣言が見つかりません');
  }
});

check('書き出し処理（builderConfig）が既存6フィールド + 追加フィールドを含む', () => {
  const requiredFields = baseline.builderConfig.requiredFields;
  const m = indexHtml.match(/const builderConfig = \{([\s\S]*?)\n  \};/);
  if (!m) throw new Error('builderConfig オブジェクトの組み立て箇所が見つかりません');
  const body = m[1];
  for (const field of requiredFields) {
    if (!body.includes(`${field}:`) && !body.includes(`${field},`)) {
      throw new Error(`既存必須フィールド "${field}" が書き出し処理から失われています`);
    }
  }
  for (const field of optionalFields) {
    if (!body.includes(field)) {
      throw new Error(`追加フィールド "${field}" が書き出し処理に含まれていません`);
    }
  }
});

check('インポート処理が configVersion 欠如（v1）を安全にデフォルト値へフォールバックする', () => {
  if (!/Number\.isInteger\(config\.configVersion\)/.test(indexHtml)) {
    throw new Error('configVersion 欠如時のフォールバック処理が見つかりません');
  }
  if (!/config\.songMeta[\s\S]{0,40}typeof config\.songMeta === 'object'/.test(indexHtml)) {
    throw new Error('songMeta 欠如時のフォールバック処理が見つかりません');
  }
  if (!/Array\.isArray\(config\.tagPresets\)/.test(indexHtml)) {
    throw new Error('tagPresets 欠如時のフォールバック処理が見つかりません');
  }
});

check('hiro.html が旧形式（v1: configVersion フィールドなし）のまま後方互換の実例になっている', () => {
  const config = parseBuilderConfig(hiroHtml);
  if ('configVersion' in config) {
    throw new Error('hiro.html に configVersion が含まれています。Phase 0/1 では旧形式のまま据え置く想定です（baseline.hiroSample.note 参照）');
  }
  for (const field of optionalFields) {
    if (field in config) {
      throw new Error(`hiro.html に追加フィールド "${field}" が含まれています。旧形式互換の実例として不適切です`);
    }
  }
});

console.log('');
if (errors > 0) {
  console.error(`${errors} 件の検証エラー`);
  process.exit(1);
}
console.log('すべての検証に合格しました。');
