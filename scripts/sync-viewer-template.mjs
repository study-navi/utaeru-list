#!/usr/bin/env node
/**
 * hiro.html を正本に index.html 内 viewer-template-b64 を同期する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hiro = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
const indexPath = path.join(ROOT, 'index.html');

const start = hiro.indexOf('<!DOCTYPE html>');
const end = hiro.lastIndexOf('</html>') + '</html>'.length;
if (start < 0 || end <= start) throw new Error('hiro.html HTML block not found');

let tpl = hiro.slice(start, end).trim();
tpl = tpl.replace(/<title>[\s\S]*?<\/title>/, '<title>__PAGE_TITLE__</title>');
tpl = tpl.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '<h1>__STREAMER_NAME__</h1>');
tpl = tpl.replace(/<p class="subtitle"[^>]*>[\s\S]*?<\/p>/, '<p class="subtitle">__SUBTITLE__</p>');
tpl = tpl.replace(/--accent: #[0-9a-fA-F]{6};/, '--accent: __ACCENT_LIGHT__;');
tpl = tpl.replace(/--accent-ink: #[0-9a-fA-F]{6};/, '--accent-ink: __ACCENT_LIGHT_INK__;');
tpl = tpl.replace(/--accent-wash: #[0-9a-fA-F]{6};/, '--accent-wash: __ACCENT_LIGHT_WASH__;');
tpl = tpl.replace(
  /<meta name="color-scheme" content="light">/,
  '<meta name="color-scheme" content="light"><!-- __ACCENT_DARK__ __ACCENT_DARK_INK__ __ACCENT_DARK_WASH__ -->',
);
tpl = tpl.replace(
  /const SONGS = \[[\s\S]*?\];/,
  'const SONGS = __SONGS_JSON__;',
);
tpl = tpl.replace(
  /<script type="application\/json" id="builder-config">[\s\S]*?<\/script>/,
  '<script type="application/json" id="builder-config">__BUILDER_CONFIG_JSON__</script>',
);
tpl = tpl.replace(
  /document\.getElementById\('statUpdated'\)\.textContent = '[^']*';/,
  "document.getElementById('statUpdated').textContent = '__UPDATED_LABEL__';",
);

const b64 = Buffer.from(tpl, 'utf8').toString('base64');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml.replace(
  /(<script type="application\/json" id="viewer-template-b64">)[^<]+(<\/script>)/,
  `$1${b64}$2`,
);
fs.writeFileSync(indexPath, indexHtml);
console.log('Synced viewer-template-b64 (' + tpl.length + ' chars, ' + b64.length + ' b64 chars)');
