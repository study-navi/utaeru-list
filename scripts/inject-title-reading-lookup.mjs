#!/usr/bin/env node
/**
 * index.html の MASTER_SONGS から TITLE_READING_LOOKUP を hiro.html に注入する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTitleLookup } from './lib/title-reading.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');
const hiroPath = path.join(ROOT, 'hiro.html');

const START = '// @title-reading-lookup-inject';
const END = '// @end-title-reading-lookup-inject';

const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(indexPath, 'utf8'));
const lookup = buildTitleLookup(songs);
const block = `${START}\nconst TITLE_READING_LOOKUP = ${JSON.stringify(lookup)};\n${END}`;

let hiro = fs.readFileSync(hiroPath, 'utf8');
const re = /\/\/ @title-reading-lookup-inject[\s\S]*?\/\/ @end-title-reading-lookup-inject/;
if (!re.test(hiro)) throw new Error('title reading lookup markers not found in hiro.html');
hiro = hiro.replace(re, block);
fs.writeFileSync(hiroPath, hiro);

console.log(`Injected TITLE_READING_LOOKUP (${Object.keys(lookup).length} keys) into hiro.html`);
