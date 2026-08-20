#!/usr/bin/env node
/**
 * アーティスト名正規化の単体テスト
 */
import {
  normalizeArtistWhitespace,
  normalizeArtistName,
  artistCompareKey,
  artistsEqual,
  pickDisplayArtistName,
  countDistinctArtists,
  classifyArtistNameVariants,
  displaySongTitle,
  findArtistVariantGroups,
} from './lib/artist-name.mjs';
import { parseMasterSongsFromIndexHtml } from './lib/genre-lookup.mjs';
import { buildArtistGroups } from './lib/song-sort.mjs';
import { addBypassStart } from './lib/test-bypass-start.mjs';
import { chromium } from 'playwright-core';
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

if (normalizeArtistName('Buono！') === 'Buono!') ok('normalizeArtistName: 全角感嘆符');
else fail('normalizeArtistName bang', JSON.stringify(normalizeArtistName('Buono！')));

if (artistsEqual("L'Arc〜en〜Ciel", "L'Arc～en～Ciel")) ok('〜 と ～ は同一');
else fail('wave dash vs fullwidth tilde');
if (artistsEqual("L'Arc〜en〜Ciel", "L'Arc~en~Ciel")) ok('〜 と ASCII tilde は同一');
else fail('wave vs ascii tilde');
if (artistsEqual("May′n", "May'n")) ok('プライムとアポストロフィは同一');
else fail('prime vs apostrophe');
if (artistsEqual("19's Sound Factory", "19\u2019s Sound Factory")) ok('curly apostrophe は同一');
else fail('curly apostrophe');
if (artistsEqual('じーざす(ワンダフル☆オポチュニティ！)', 'じーざす(ワンダフル☆オポチュニティ!)')) ok('全角！は同一');
else fail('fullwidth exclamation');
if (artistsEqual('Team.ねこかん［猫］', 'Team.ねこかん[猫]')) ok('全角括弧は同一');
else fail('fullwidth brackets');
if (artistsEqual('井上陽水／安全地帯', '井上陽水/安全地帯')) ok('全角スラッシュは同一（同一コラボ表記）');
else fail('fullwidth slash');

const nfc = 'é';
const nfd = 'e\u0301';
if (artistsEqual(nfc, nfd)) ok('NFC と NFD は同一');
else fail('unicode normalize nfc/nfd', artistCompareKey(nfc) + ' vs ' + artistCompareKey(nfd));
if (artistsEqual('\uFF2C\uFF27', 'lg')) ok('NFKC 全角英字');
else fail('nfkc letters');

if (artistsEqual('A\u200B&B', 'A&B')) ok('ゼロ幅スペースを除去');
else fail('zwsp');

if (!artistsEqual('Aimer', 'Aimer × milet')) ok('Aimer とコラボは同一にしない');
else fail('aimer collab');
if (!artistsEqual('YOASOBI', 'YOASOBI feat. 幾田りら')) ok('YOASOBI feat. は同一にしない');
else fail('yoasobi feat');
if (!artistsEqual('米津玄師', '米津玄師、宇多田ヒカル')) ok('米津玄師と連名は同一にしない');
else fail('yonezu comma');
if (!artistsEqual('LiSA', 'LiSA×Uru')) ok('LiSA と × コラボは同一にしない');
else fail('lisa collab');
if (!artistsEqual('Buono!', 'Buono! feat. x')) ok('feat. ありなしは同一にしない');
else fail('feat marker');
if (!artistsEqual('米津玄師', 'DAOKO×米津玄師')) ok('× コラボは単独と同一にしない');
else fail('daoko collab');

if (!artistsEqual('A & B', 'A')) ok('& ありなしは同一にしない');
else fail('ampersand meaning');

if (!artistsEqual('ユリイ・カノン', 'ユリイ')) ok('・ ありなしは同一にしない');
else fail('middle-dot meaning');

const songs = [
  { a: '大塚 愛', t: '甘えんぼ', ty: 'あ' },
  { a: '大塚愛', t: 'さくらんぼ', ty: 'さ' },
  { a: '大塚愛', t: 'プラネタリウム', ty: 'ぷ' },
];
if (pickDisplayArtistName(songs) === '大塚愛') ok('代表表示名は正式表記（件数ではない）');
else fail('pickDisplayArtistName', pickDisplayArtistName(songs));
if (songs.map((s) => s.a).join('|') === '大塚 愛|大塚愛|大塚愛') ok('曲の a は変更しない');
else fail('display strings mutated');

const manyWrongChildren = [
  ...Array.from({ length: 100 }, () => ({ a: 'Mr.children', t: 'x' })),
  { a: 'Mr.Children', t: 'y' },
];
if (pickDisplayArtistName(manyWrongChildren) === 'Mr.Children') ok('誤表記が多数でも Mr.Children');
else fail('count must not win', pickDisplayArtistName(manyWrongChildren));
if (pickDisplayArtistName([{ a: 'kanaria', t: 'KING' }, { a: 'kanaria', t: 'QUEEN' }]) === 'Kanaria') {
  ok('kanaria のみでも見出しは Kanaria');
} else fail('Kanaria mapping', pickDisplayArtistName([{ a: 'kanaria', t: 'KING' }]));

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
if (classifyArtistNameVariants(['ユリイ･カノン', 'ユリイ・カノン']) === '統合してよい') ok('分類: 中黒幅は統合してよい');
else fail('classify middle dot', classifyArtistNameVariants(['ユリイ･カノン', 'ユリイ・カノン']));

const master = parseMasterSongsFromIndexHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
if (master.length !== 1952) fail('MASTER_SONGS count', String(master.length));
else ok('MASTER_SONGS 1952曲（件数維持）');

const variantGroups = findArtistVariantGroups(master).filter((g) => g.class === '統合してよい' || g.variants.length > 1);
if (variantGroups.length >= 6) ok(`表記ゆれグループ ${variantGroups.length} 組を同一キーに`);
else fail('variant group count', String(variantGroups.length));

const larc = master.filter((s) => /L'Arc/i.test(s.a));
if (larc.length === 11 && countDistinctArtists(larc) === 1) ok("L'Arc 11曲が1組");
else fail('LArc merge', JSON.stringify({ n: larc.length, distinct: countDistinctArtists(larc), names: [...new Set(larc.map((s) => s.a))] }));

if (!artistsEqual('Ms.Chilidren', 'Mr.Children')) ok('Ms.Chilidren は比較キー上 Mr.Children と別（誤記パターン）');
else fail('Ms.Chilidren compare key');

const watchOk = ['LiSA', 'RADWIMPS', 'YOASOBI', '米津玄師', 'back number', 'Buono!'].every((n) => {
  const list = master.filter((s) => artistsEqual(s.a, n) && !/feat|×|x |、/.test(s.a));
  return countDistinctArtists(list) === 1;
});
if (watchOk) ok('指定アーティストの単独表記は1キー');
else fail('watchlist split');
const ohtsuka = master.filter((s) => s.a === '大塚愛');
if (ohtsuka.length === 9 && ohtsuka.every((s) => s.a === '大塚愛')) {
  ok('大塚愛 9曲は MASTER 上も正式表記のみ');
} else fail('ohtsuka unified', JSON.stringify({ count: ohtsuka.length, names: [...new Set(ohtsuka.map((s) => s.a))] }));

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
const mrChildren = master.filter((s) => s.a === 'Mr.Children');
if (mrChildren.length === 13 && countDistinctArtists(mrChildren) === 1) {
  ok('Mr.Children 13曲は MASTER 上も正式表記のみ');
} else {
  fail('Mr.Children unified in master', JSON.stringify({
    count: mrChildren.length,
    distinct: countDistinctArtists(mrChildren),
    names: [...new Set(master.filter((s) => artistCompareKey(s.a) === artistCompareKey('Mr.Children')).map((s) => s.a))],
  }));
}
const mrsGreen = master.filter((s) => s.a === 'Mrs. GREEN APPLE');
if (mrsGreen.length === 22 && mrsGreen.every((s) => s.a === 'Mrs. GREEN APPLE')) {
  ok('Mrs. GREEN APPLE 22曲は MASTER 上も正式表記のみ');
} else {
  fail('Mrs. GREEN APPLE unified in master', JSON.stringify({
    count: mrsGreen.length,
    names: [...new Set(master.filter((s) => artistCompareKey(s.a) === artistCompareKey('Mrs. GREEN APPLE')).map((s) => s.a))],
  }));
}
assertOneGroup("L'Arc wave/tilde", ["L'Arc〜en〜Ciel", "L'Arc～en～Ciel"]);
assertOneGroup('ユリイ・カノン 中黒', ['ユリイ･カノン', 'ユリイ・カノン']);
assertOneGroup('Creepy Nuts ＆/&', ['CreePy Nuts(R-指定＆DJ松永)', 'Creepy Nuts(R-指定&DJ松永)']);
assertOneGroup('秦 基博 中黒', ['秦 基博(ハタ･モトヒロ)', '秦 基博(ハタ・モトヒロ)']);
assertOneGroup('シェリル starring', ['シェリル･ノーム starring May′n', 'シェリル・ノーム starring May\'n']);

function assertDisplay(label, names, expected) {
  const list = master.filter((s) => names.includes(s.a));
  const got = pickDisplayArtistName(list);
  if (got === expected) ok(`${label}: 見出し ${expected}`);
  else fail(`${label}: 見出し`, `${got} !== ${expected}`);
}
assertDisplay('Kanaria', ['Kanaria', 'kanaria'], 'Kanaria');
assertDisplay('Mr.Children', ['Mr.Children'], 'Mr.Children');
assertDisplay('Mrs. GREEN APPLE', ['Mrs. GREEN APPLE'], 'Mrs. GREEN APPLE');
assertDisplay("L'Arc", ["L'Arc〜en〜Ciel", "L'Arc～en～Ciel"], "L'Arc\u301Cen\u301CCiel");
assertDisplay('ユリイ・カノン', ['ユリイ･カノン', 'ユリイ・カノン'], 'ユリイ・カノン');
assertDisplay('Creepy Nuts', ['CreePy Nuts(R-指定＆DJ松永)', 'Creepy Nuts(R-指定&DJ松永)'], 'Creepy Nuts(R-指定&DJ松永)');
assertDisplay('秦 基博', ['秦 基博(ハタ･モトヒロ)', '秦 基博(ハタ・モトヒロ)'], '秦 基博(ハタ・モトヒロ)');
assertDisplay('シェリル', ['シェリル･ノーム starring May′n', 'シェリル・ノーム starring May\'n'], 'シェリル・ノーム starring May\'n');
assertDisplay('大塚愛', ['大塚愛'], '大塚愛');

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
];
if (reviewNames.every((n) => master.some((s) => s.a === n))) ok('要確認リストの a はデータ上そのまま');
else fail('要確認 a', reviewNames.filter((n) => !master.some((s) => s.a === n)).join(', '));
if (!master.some((s) => s.a === 'Mr.children' || s.a === 'Ms.Chilidren')) {
  ok('Mr.children / Ms.Chilidren の誤記は MASTER から除去');
} else fail('Mr.Children typos remain in master');
if (!master.some((s) => s.a === 'Mrs.GREEN APPLE' || s.a === '大塚 愛')) {
  ok('空白差の旧表記（Mrs.GREEN APPLE / 大塚 愛）は MASTER から除去');
} else fail('whitespace variants remain in master');

function assertPublicSource(label, src) {
  const need = ['function normalizeArtistName', 'function artistCompareKey', 'function displaySongTitle', 'countDistinctArtists', 'displaySongTitle(s.t)'];
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

async function runBrowserChecks() {
  const widths = [320, 375, 390, 430, 1280];
  const browser = await chromium.launch();

  const indexPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const indexErrors = [];
  indexPage.on('pageerror', (e) => indexErrors.push(e.message));
  await addBypassStart(indexPage);
  await indexPage.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await indexPage.waitForFunction(() => document.documentElement.dataset.utalisEntryReady === '1', { timeout: 20000 });
  await indexPage.click('#editTabSongs');
  await indexPage.waitForTimeout(200);

  const editor = await indexPage.evaluate(() => {
    const larc = MASTER_SONGS.filter((s) => /L.?Arc/i.test(s.a) || artistCompareKey(s.a) === artistCompareKey("L'Arc〜en〜Ciel"));
    const groups = typeof buildSortedArtistGroups === 'function' ? buildSortedArtistGroups(larc) : [];
    const q = "L'Arc";
    const searchHits = MASTER_SONGS.filter((s) => matchesArtistSearch(s, q));
    return {
      master: MASTER_SONGS.length,
      larcSongs: larc.length,
      larcGroups: groups.length,
      larcHeader: groups[0]?.artist || '',
      larcGroupSongs: groups[0]?.songs.length || 0,
      searchHits: searchHits.length,
      distinctLarc: countDistinctArtists(larc),
    };
  });
  if (editor.master !== 1952) fail('editor MASTER_SONGS', String(editor.master));
  else ok('editor MASTER_SONGS 1952');
  if (editor.larcSongs === 11 && editor.larcGroups === 1 && editor.distinctLarc === 1 && editor.larcGroupSongs === 11) {
    ok("editor L'Arc 11曲が1アコーディオン");
  } else fail("editor L'Arc", JSON.stringify(editor));
  if (editor.larcHeader === "L'Arc\u301Cen\u301CCiel") ok("editor L'Arc 見出しは波ダッシュ正式表記");
  else fail("editor L'Arc header", editor.larcHeader);
  if (editor.searchHits >= 11) ok('editor アーティスト検索 LArc');
  else fail('editor search larc', String(editor.searchHits));

  await indexPage.fill('#searchInput', "L'Arc");
  await indexPage.dispatchEvent('#searchInput', 'input');
  await indexPage.waitForTimeout(250);
  const meta = await indexPage.locator('#resultMeta').textContent();
  if (meta && meta.includes('11曲') && meta.includes('1組')) ok('editor 検索UI 11曲/1組');
  else fail('editor search meta', meta);

  await indexPage.fill('#searchInput', '');
  await indexPage.dispatchEvent('#searchInput', 'input');
  await indexPage.waitForTimeout(150);

  for (const width of widths) {
    await indexPage.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    const overflow = await indexPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    if (overflow) fail(`editor ${width}px: 横スクロール`);
    else ok(`editor ${width}px: 横スクロールなし`);
  }
  if (indexErrors.length) fail('editor Console', indexErrors.join('; '));
  else ok('editor Consoleエラーなし');
  await indexPage.close();

  const hiroPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const hiroErrors = [];
  hiroPage.on('pageerror', (e) => hiroErrors.push(e.message));
  await hiroPage.goto('file://' + path.join(ROOT, 'hiro.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await hiroPage.waitForFunction(() => typeof SONGS !== 'undefined' && SONGS.length > 0, { timeout: 15000 });
  const hiroInit = await hiroPage.evaluate(() => ({
    songs: SONGS.length,
    groups: document.querySelectorAll('.artist-accordion-item, .artist-group').length,
    hasSearch: !!document.getElementById('searchInput'),
    hasRandom: !!document.getElementById('randomBtn'),
  }));
  if (hiroInit.songs > 0 && hiroInit.groups > 0) ok('viewer 曲一覧とアコーディオン');
  else fail('viewer list', JSON.stringify(hiroInit));

  await hiroPage.locator('#songSearchPanelToggle').click();
  await hiroPage.waitForTimeout(280);

  async function searchViewer(q, mode) {
    await hiroPage.evaluate((m) => {
      if (typeof setSearchTarget === 'function') setSearchTarget(m);
    }, mode);
    await hiroPage.fill('#searchInput', q);
    await hiroPage.dispatchEvent('#searchInput', 'input');
    await hiroPage.waitForTimeout(200);
    return hiroPage.locator('#resultMeta').textContent();
  }
  const titleMeta = await searchViewer('ストロー', 'title');
  if (titleMeta && !titleMeta.startsWith('0曲')) ok('viewer 曲名検索');
  else fail('viewer title search', titleMeta);
  const artistMeta = await searchViewer('aiko', 'artist');
  if (artistMeta && !artistMeta.startsWith('0曲')) ok('viewer アーティスト検索');
  else fail('viewer artist search', artistMeta);

  await hiroPage.fill('#searchInput', '');
  await hiroPage.dispatchEvent('#searchInput', 'input');
  await hiroPage.waitForTimeout(150);
  await hiroPage.click('#randomBtn');
  const randomVisible = await hiroPage.evaluate(() => {
    const el = document.getElementById('randomPick');
    return el && getComputedStyle(el).display !== 'none';
  });
  if (randomVisible) ok('viewer ランダム');
  else fail('viewer random');

  for (const width of widths) {
    await hiroPage.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    const overflow = await hiroPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    if (overflow) fail(`viewer ${width}px: 横スクロール`);
    else ok(`viewer ${width}px: 横スクロールなし`);
  }
  if (hiroErrors.length) fail('viewer Console', hiroErrors.join('; '));
  else ok('viewer Consoleエラーなし');
  await hiroPage.close();
  await browser.close();
}

await runBrowserChecks();

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nArtist name unit tests passed.');
