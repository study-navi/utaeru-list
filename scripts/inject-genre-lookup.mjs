#!/usr/bin/env node
/**
 * index.html の MASTER_SONGS から GENRE_LOOKUP を hiro.html に注入する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenreLookup, parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(ROOT, 'index.html');
const hiroPath = path.join(ROOT, 'hiro.html');

const START = '// @genre-lookup-inject';
const END = '// @end-genre-lookup-inject';

const songs = parseMasterSongsFromIndexHtml(fs.readFileSync(indexPath, 'utf8'));
const lookup = buildGenreLookup(songs);
const block = `${START}\nconst GENRE_LOOKUP = ${JSON.stringify(lookup)};\n${END}`;

let hiro = fs.readFileSync(hiroPath, 'utf8');
const re = /\/\/ @genre-lookup-inject[\s\S]*?\/\/ @end-genre-lookup-inject/;
if (!re.test(hiro)) throw new Error('genre lookup markers not found in hiro.html');
hiro = hiro.replace(re, block);
fs.writeFileSync(hiroPath, hiro);

console.log(`Injected GENRE_LOOKUP (${Object.keys(lookup).length} keys) into hiro.html`);
