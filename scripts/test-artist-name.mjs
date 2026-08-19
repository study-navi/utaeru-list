#!/usr/bin/env node
/**
 * アーティスト名正規化の単体テスト
 */
import {
  normalizeArtistWhitespace,
  artistCompareKey,
  artistsEqual,
  pickDisplayArtistName,
  countDistinctArtists,
  classifyArtistNameVariants,
  displaySongTitle,
} from './lib/artist-name.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { buildArtistGroups } from './lib/song-sort.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function ok(msg) { console.log('OK:', msg); }
function fail(msg, detail) {
  failed++;
  console.error('FAIL:', msg, detail ? `— ${detail}` : '');
}

if (artistsEqual('大塚愛', '大塚 愛')) ok('大塚愛 と 大塚 愛 は同一');
else fail('大塚愛 space');

if (artistsEqual(' 大塚愛 ', '大塚愛')) ok('前後空白も同一');
else fail('trim');

if (artistsEqual('大塚\u3000愛', '大塚 愛') && artistsEqual('大塚\u3000愛', '大塚愛')) {
  ok('全角スペースと半角スペースが混在しても同一');
} else fail('fullwidth space');

if (artistsEqual('大塚  愛', '大塚愛')) ok('連続スペースも同一');
else fail('collapsed spaces');

if (normalizeArtistWhitespace('  大塚\u3000\u3000愛  ') === '大塚 愛') {
  ok('表示用正規化は空白を1つの半角に（比較時は除去）');
} else fail('normalizeArtistWhitespace', JSON.stringify(normalizeArtistWhitespace('  大塚\u3000\u3000愛  ')));

if (artistCompareKey('ＡＩ') === artistCompareKey('ai')) ok('全角英字と大小無視');
else fail('fullwidth alnum', artistCompareKey('ＡＩ') + ' vs ' + artistCompareKey('ai'));

if (!artistsEqual('A & B', 'A')) ok('& ありなしは同一にしない');
else fail('ampersand meaning');

if (!artistsEqual('ユリイ・カノン', 'ユリイ')) ok('・ ありなしは同一にしない');
else fail('middle-dot meaning');

const songs = [
  { a: '大塚 愛', t: '甘えんぼ', ty: 'あ' },
  { a: '大塚愛', t: 'さくらんぼ', ty: 'さ' },
  { a: '大塚愛', t: 'プラネタリウム', ty: 'ぷ' },
];
if (pickDisplayArtistName(songs) === '大塚愛') ok('代表表示名は最多の既存表記');
else fail('pickDisplayArtistName', pickDisplayArtistName(songs));
if (songs.map((s) => s.a).join('|') === '大塚 愛|大塚愛|大塚愛') ok('曲の a は変更しない');
else fail('display strings mutated');

if (countDistinctArtists(songs) === 1) ok('countDistinctArtists は正規化キー');
else fail('countDistinctArtists', String(countDistinctArtists(songs)));

const grouped = buildArtistGroups(songs, {
  sortMode: 'artist-asc',
  sourceList: songs,
  keyOf: (s) => s.a + '\u0001' + s.t,
  getTitleTy: (s) => s.ty,
  getArtistY: () => 'おおつかあい',
  getAddedAt: () => null,
  getBatchOrder: () => undefined,
});
if (grouped.length === 1 && grouped[0].songs.length === 3) ok('検索・絞り込み用グループ化でスペース表記は1組');
else fail('buildArtistGroups merge', JSON.stringify(grouped.map((g) => [g.artist, g.songs.length])));

if (displaySongTitle('い,いきものがかり,コイスルオトメ') === 'コイスルオトメ') {
  ok('カタログ形式の表示曲名');
} else fail('displaySongTitle');
if (displaySongTitle('さくらんぼ') === 'さくらんぼ') ok('通常曲名の表示は変更しない');
else fail('displaySongTitle passthrough');

if (classifyArtistNameVariants(['大塚愛', '大塚 愛']) === '統合してよい') ok('分類: スペースのみは統合してよい');
else fail('classify space');
if (classifyArtistNameVariants(['Kanaria', 'kanaria']) === '統合してよい') ok('分類: 大小のみは統合してよい');
else fail('classify case');
if (classifyArtistNameVariants(['ユリイ･カノン', 'ユリイ・カノン']) === '要確認') ok('分類: 中黒幅は要確認');
else fail('classify middle dot', classifyArtistNameVariants(['ユリイ･カノン', 'ユリイ・カノン']));

const master = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const ohtsuka = master.filter((s) => artistCompareKey(s.a) === artistCompareKey('大塚愛'));
if (ohtsuka.some((s) => s.a === '大塚 愛') && ohtsuka.some((s) => s.a === '大塚愛')) {
  ok('MASTER の表示文字列は大塚愛／大塚 愛のまま');
} else fail('master display preserved');
if (ohtsuka.length !== 9) fail('ohtsuka count', String(ohtsuka.length));
else ok('大塚愛系 9曲');

const ikimono = master.filter((s) => s.a === 'いきものがかり');
if (ikimono.length === 10 && ikimono.every((s) => s.a === 'いきものがかり')) {
  ok('いきものがかりのアーティスト名フィールドは統一');
} else fail('ikimono artist field', ikimono.map((s) => s.a + '/' + s.t).join(', '));
const koi = ikimono.find((s) => s.t.includes('コイスルオトメ'));
if (koi && displaySongTitle(koi.t) === 'コイスルオトメ' && koi.ty === 'こいするおとめ') {
  ok('コイスルオトメは表示曲名と読みを修正');
} else fail('koisuru otome', JSON.stringify(koi));

function assertOneGroup(label, names) {
  const list = master.filter((s) => names.includes(s.a));
  const grouped = buildArtistGroups(list, {
    sortMode: 'artist-asc',
    sourceList: list,
    keyOf: (s) => s.a + '\u0001' + s.t,
    getTitleTy: (s) => s.ty,
    getArtistY: (s) => s.y,
    getAddedAt: () => null,
    getBatchOrder: () => undefined,
  });
  const rawKept = names.every((n) => list.some((s) => s.a === n));
  if (grouped.length === 1 && countDistinctArtists(list) === 1 && rawKept) {
    ok(`${label}: 1組 / a は両表記のまま`);
  } else fail(label, JSON.stringify({ groups: grouped.length, distinct: countDistinctArtists(list), raw: [...new Set(list.map((s) => s.a))] }));
}
assertOneGroup('Kanaria/kanaria', ['Kanaria', 'kanaria']);
assertOneGroup('Mr.Children/Mr.children', ['Mr.Children', 'Mr.children']);
assertOneGroup('Mrs.GREEN APPLE', ['Mrs.GREEN APPLE', 'Mrs. GREEN APPLE']);

const catalog = [
  ['あたらよ', 'あ,あたらよ,夏霞', '夏霞'],
  ['いきものがかり', 'い,いきものがかり,コイスルオトメ', 'コイスルオトメ'],
  ['ちゃんみな', 'ち,ちゃんみな,SAD SONG', 'SAD SONG'],
  ['なとり', 'な,なとり,セレナーデ', 'セレナーデ'],
  ['なるみや', 'な,なるみや,リードコントロール', 'リードコントロール'],
  ['ぼくのりりっくのぼうよみ', 'ぼ,ぼくのりりっくのぼうよみ,Black Bird', 'Black Bird'],
  ['まるりとりゅうが', 'ま,まるりとりゅうが,嫉妬 (Album ver.)', '嫉妬 (Album ver.)'],
];
let catalogOk = true;
for (const [a, t, display] of catalog) {
  const s = master.find((x) => x.a === a && x.t === t);
  if (!s || displaySongTitle(s.t) !== display || s.t !== t) {
    catalogOk = false;
    fail('カタログ表示', JSON.stringify({ a, t, display, song: s }));
  }
}
if (catalogOk) ok('カタログ形式7曲は第3フィールド表示・t未変更');

const reviewNames = [
  'CreePy Nuts(R-指定＆DJ松永)',
  'Creepy Nuts(R-指定&DJ松永)',
  'ユリイ･カノン',
  'ユリイ・カノン',
  '秦 基博(ハタ･モトヒロ)',
  '秦 基博(ハタ・モトヒロ)',
  "L'Arc〜en〜Ciel",
  "L'Arc～en～Ciel",
  'Ms.Chilidren',
];
if (reviewNames.every((n) => master.some((s) => s.a === n))) ok('要確認リストの a はデータ上そのまま');
else fail('要確認 a', reviewNames.filter((n) => !master.some((s) => s.a === n)).join(', '));

function assertPublicSource(label, src) {
  const need = ['function artistCompareKey', 'function displaySongTitle', 'countDistinctArtists', 'displaySongTitle(s.t)'];
  const missing = need.filter((n) => !src.includes(n));
  if (missing.length) fail(`${label}: 公開処理欠落`, missing.join(', '));
  else ok(`${label}: 正規化と曲名表示を含む`);
}
assertPublicSource('index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
assertPublicSource('hiro.html', fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8'));
assertPublicSource('404.html', fs.readFileSync(path.join(ROOT, '404.html'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const b64 = indexHtml.match(/id="viewer-template-b64">([^<]+)</);
const tpl = b64 ? Buffer.from(b64[1], 'base64').toString('utf8') : '';
assertPublicSource('viewer-template-b64', tpl);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nArtist name unit tests passed.');
