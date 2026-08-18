/**
 * MASTER_SONGS 標準ジャンル分類ルール
 *
 * Phase 1: アニソン・ボカロ（保守的）
 * Phase 2: 一般邦楽への J-POP 付与（除外リスト付き）
 * Phase 4: アニソン分類拡充（曲単位・確信度 A のみ）
 * Phase 5: 6ジャンル体系（洋楽・演歌・その他）+ 未分類107曲
 */

import { ANIME_VERIFIED_PHASE4, GENRE_CORRECTIONS_PHASE4 } from '../data/anime-verified-phase4.mjs';
import { GENRE_VERIFIED_PHASE5, GENRE_CORRECTIONS_PHASE5 } from '../data/genre-verified-phase5.mjs';

export const MASTER_GENRE_LABELS = ['J-POP', 'アニソン', 'ボカロ', '洋楽', '演歌', 'その他'];

/** VOCALOID P名義でカタログ上すべてボカロ扱いできるアーティスト（本人歌唱曲は曲単位で除外） */
export const VOCALOID_ONLY_ARTISTS = new Set([
  '40mP',
  '40mP&シャノ',
  '1640mP',
  'cosMo@暴走P',
  'DECO*27',
  'Kanaria',
  'kanaria',
  'kemu',
  'MARETU',
  'n-buna',
  'Neru',
  'Orangestar',
  'doriko',
  '八王子P',
  'かいりきベア',
  'きくお',
  'ぬゆり',
  'ピノキオP',
  'ピノキオピー',
  'みきとP',
  'ミキト(みきとP)',
  'すりぃ',
  'トーマ',
  'ハチ',
  '煮ル果実',
  'じん',
  'sasakure.UK',
  'EasyPoP',
  'A応P',
  'オワタP',
  'うたたP',
  'かにみそP',
  '木村わいP',
  'ギガP',
  'くらげP',
  'ジミーサムP',
  '蝶々P',
  '電ポルP',
  'におP',
  'ヘブンズP',
  'マイキP',
  'レフティーモンスターP',
  'supercell',
  'ryo(supercell)',
  'Last Note.',
  'れをる',
  'halyosy',
  'ナユタン星人',
  'いよわ',
  'Giga',
  'ひとしずくP×やま△',
]);

export const WESTERN_ARTISTS = new Set([
  'Ed Sheeran',
  'Ariana Grande and John Legend',
  'Beyonce',
  'BON JOVI',
  'STEVIE WONDER',
  'CELINE DION',
  'TWICE',
  'BIGBANG',
  'WIZ KHALIFA(Feat.CHARLIE PUTH)',
  'Alan Walker',
]);

export const ENKA_ARTISTS = new Set([
  '石川さゆり',
  '坂本冬美',
  '美空ひばり',
]);

export const VOCALOID_FEAT_RE = /feat\.?\s*(初音ミク|鏡音(?:リン|レン)|巡音ルカ|MEIKO|KAITO|可不(?:\(KAFU\))?|KAFU|flower|GUMI|MAYU|重音テト|結月ゆかり)/i;

export const EXPLICIT_ANIME_TITLE_RE = /(?:from|FROM)\s+[A-Z][A-Z\s\-]+|ONE PIECE|ドラゴンボール|鬼滅の刃|呪術廻戦|進撃の巨人|名探偵コナン|エヴァンゲリオン|ガンダム|ポケットモンスター|ポケモン|ジブリ|Disney|ディズニー|ウタ from/i;

/** J-POP 付与から除外するアーティスト（完全一致） */
export const JPOP_EXCLUDE_ARTISTS = new Set([
  ...WESTERN_ARTISTS,
  ...ENKA_ARTISTS,
  'ディズニー',
  '東京ディズニーリゾート',
]);

/** J-POP 付与から除外するアーティスト名の前方一致 */
export const JPOP_EXCLUDE_ARTIST_PREFIXES = [
  'HoneyWorks',
  'ぬゆり',
  'すとぷり',
  'まふまふ',
  '96猫',
  'After the Rain',
  '天月-あまつき-',
  '天月',
  'EHIKARA',
  'Dios/シグナルP',
  'どうぶつビスケッツ×PPP',
  'AAA DEN-O form',
  '黒澤ルビィ',
  "μ's",
  'Aqours',
  'にじさんじ',
  'mona(CV:',
  'fripSide feat.',
  'Clef feat.',
  'HoneyWorks feat.',
  'Spontania feat.',
  'DREAMS COME TRUE feat.',
  'CHiCO with HoneyWorks',
  'fripSide',
  'EGOIST',
  'Pastel*Palettes',
  'UNDEAD(朔間',
  '歌組雪月花',
  '双葉杏(CV',
  '星街すいせい',
  '泉こなた(',
  'LIP×LIP',
];

/** @type {RegExp[]} J-POP 付与から除外するパターン */
export const JPOP_EXCLUDE_CONTENT_RES = [
  /Disney|ディズニー/i,
  /演歌|歌謡曲/,
  /童謡|わらべうた|きらきら星/,
  /(?:\(|[（])[Cc][Vv]/,
  /うまぴょい|Get music!|AIKATSU|アイカツ/i,
  /(?:ラブライブ|アイドルマスター|BanG Dream|バンドリ!?|プロセカ|ウマ娘|ホロライブ|にじさんじ|μ's|Aqours|Liella!|ニジガク|けいおん!|アイマス|SideM|シャニマス|ツキウタ|ツキプロ|うたプリ|アイチュウ|あんさんぶる|ヒプマイ|パラライ|Ensemble Stars|声優)/i,
  /VOCALOID|初音ミク|鏡音(?:リン|レン)|巡音ルカ|可不(?:\(KAFU\))?|重音テト|結月ゆかり/i,
  VOCALOID_FEAT_RE,
  /DEN-O form|仮面ライダー|スーパー戦隊|ウルトラマン|テニミュ|2\.5次元/i,
];

export const VERIFIED_GENRES_BY_ID = {
  1863: ['J-POP', 'ボカロ'],
  89: ['J-POP', 'ボカロ'],
  70: ['J-POP', 'アニソン'],
  74: ['J-POP', 'アニソン'],
  75: ['J-POP', 'アニソン'],
  77: ['J-POP', 'アニソン'],
  78: ['J-POP', 'アニソン'],
  79: ['J-POP', 'アニソン'],
  81: ['J-POP', 'アニソン'],
  1839: ['J-POP', 'アニソン'],
  1841: ['J-POP', 'アニソン'],
  1844: ['J-POP', 'アニソン'],
  1845: ['J-POP', 'アニソン'],
  1849: ['J-POP', 'アニソン'],
  1952: ['J-POP', 'アニソン'],
  1953: ['J-POP', 'アニソン'],
  1955: ['J-POP', 'アニソン'],
  1956: ['J-POP', 'アニソン'],
  1957: ['J-POP', 'アニソン'],
  1958: ['J-POP', 'アニソン'],
  297: ['J-POP', 'アニソン'],
  301: ['J-POP', 'アニソン'],
  1856: ['J-POP', 'アニソン'],
  1871: ['J-POP', 'アニソン'],
  372: ['J-POP', 'アニソン'],
  94: ['J-POP', 'アニソン'],
  476: ['J-POP', 'アニソン'],
  288: ['J-POP', 'アニソン'],
  978: ['J-POP', 'アニソン'],
  990: ['J-POP', 'アニソン'],
  465: ['J-POP', 'アニソン'],
  975: ['J-POP', 'アニソン'],
  718: ['J-POP', 'アニソン'],
  1530: ['J-POP', 'アニソン'],
  1531: ['J-POP', 'アニソン'],
  408: ['J-POP', 'アニソン'],
  407: ['J-POP', 'アニソン'],
  42: ['J-POP', 'アニソン'],
  43: ['J-POP', 'アニソン'],
  715: ['J-POP', 'アニソン'],
  716: ['J-POP', 'アニソン'],
  717: ['J-POP', 'アニソン'],
  1760: ['J-POP', 'アニソン'],
  1441: ['J-POP', 'アニソン'],
};

function getVerifiedGenresById(id) {
  if (GENRE_CORRECTIONS_PHASE5[id]) {
    return normalizeGenreList(GENRE_CORRECTIONS_PHASE5[id].genres);
  }
  if (GENRE_VERIFIED_PHASE5[id]) {
    return normalizeGenreList(GENRE_VERIFIED_PHASE5[id].genres);
  }
  if (GENRE_CORRECTIONS_PHASE4[id]) {
    return normalizeGenreList(GENRE_CORRECTIONS_PHASE4[id].genres);
  }
  if (ANIME_VERIFIED_PHASE4[id]) {
    return normalizeGenreList(ANIME_VERIFIED_PHASE4[id].genres);
  }
  if (VERIFIED_GENRES_BY_ID[id]) {
    return normalizeGenreList(VERIFIED_GENRES_BY_ID[id]);
  }
  return null;
}

function isVocaloidOnlyProducerArtist(artist) {
  if (VOCALOID_ONLY_ARTISTS.has(artist)) return true;
  for (const name of VOCALOID_ONLY_ARTISTS) {
    if (artist.startsWith(`${name} feat`) || artist.startsWith(`${name} ft`)) return true;
    if (artist.startsWith(`${name} `)) return true;
  }
  if (/^Orangestar feat/.test(artist)) return true;
  if (/^いよわ feat/.test(artist)) return true;
  if (/^ぬゆり feat/.test(artist)) return true;
  return false;
}

function normalizeGenreList(genres) {
  if (!Array.isArray(genres)) return [];
  const out = [];
  for (const label of MASTER_GENRE_LABELS) {
    if (genres.includes(label)) out.push(label);
  }
  return out;
}

function addJPopForAnime(genres, artist) {
  if (!genres.includes('アニソン')) return genres;
  if (genres.includes('J-POP')) return genres;
  if (isVocaloidOnlyProducerArtist(artist)) return genres;
  if (genres.includes('洋楽') || genres.includes('演歌') || genres.includes('その他')) return genres;
  return ['J-POP', ...genres];
}

export function isExcludedFromJPop(song) {
  const combined = `${song.a} ${song.t}`;
  if (JPOP_EXCLUDE_ARTISTS.has(song.a)) return true;
  if (WESTERN_ARTISTS.has(song.a)) return true;
  if (ENKA_ARTISTS.has(song.a)) return true;
  for (const prefix of JPOP_EXCLUDE_ARTIST_PREFIXES) {
    if (song.a.startsWith(prefix)) return true;
  }
  for (const re of JPOP_EXCLUDE_CONTENT_RES) {
    if (re.test(combined)) return true;
  }
  if (isVocaloidOnlyProducerArtist(song.a)) return true;
  if (/^sumika$/i.test(song.a.trim()) && /^Flower$/i.test(song.t.trim())) return false;
  if (/^L'Arc～en～Ciel$/i.test(song.a.trim()) && /^flower$/i.test(song.t.trim())) return false;
  return false;
}

/** Phase 1: アニソン・ボカロ */
export function classifyBaseGenres(song) {
  const verified = getVerifiedGenresById(song.id);
  if (verified) return verified;

  const genres = [];
  const combined = `${song.a} ${song.t}`;

  if (WESTERN_ARTISTS.has(song.a)) {
    return ['洋楽'];
  }
  if (ENKA_ARTISTS.has(song.a)) {
    return ['演歌'];
  }
  if (song.a === 'ディズニー' || song.a === '東京ディズニーリゾート') {
    return ['その他'];
  }

  if (isVocaloidOnlyProducerArtist(song.a)) {
    genres.push('ボカロ');
  } else if (VOCALOID_FEAT_RE.test(combined) || VOCALOID_FEAT_RE.test(song.a)) {
    genres.push('ボカロ');
    if (!isVocaloidOnlyProducerArtist(song.a)) genres.push('J-POP');
  }

  if (EXPLICIT_ANIME_TITLE_RE.test(song.t)) {
    if (!genres.includes('アニソン')) genres.push('アニソン');
  }

  return normalizeGenreList(addJPopForAnime(genres, song.a));
}

/** Phase 2: 未分類の一般邦楽へ J-POP を付与 */
export function enrichWithJPop(song, genres) {
  const verified = getVerifiedGenresById(song.id);
  if (verified) return verified;

  if (genres.some((g) => g === '洋楽' || g === '演歌' || g === 'その他')) {
    return genres;
  }

  if (genres.includes('ボカロ') && !genres.includes('J-POP')) {
    return genres;
  }

  if (isExcludedFromJPop(song)) {
    return genres;
  }

  if (genres.length === 0) {
    return ['J-POP'];
  }

  if (genres.includes('アニソン') && !genres.includes('J-POP')) {
    return ['J-POP', ...genres];
  }

  return genres;
}

/**
 * @param {{ id: number, a: string, t: string, genres?: string[] }} song
 * @returns {string[]}
 */
export function classifySongGenres(song) {
  const base = classifyBaseGenres(song);
  return enrichWithJPop(song, base);
}

/** @param {{ genres?: string[] }} song */
export function getSongGenres(song) {
  if (!song) return [];
  if (Array.isArray(song.genres)) return normalizeGenreList(song.genres);
  return [];
}

export function summarizeGenreStats(songs) {
  const stats = {
    total: songs.length,
    jpop: 0,
    anime: 0,
    vocaloid: 0,
    western: 0,
    enka: 0,
    other: 0,
    multi: 0,
    unclassified: 0,
  };
  for (const s of songs) {
    const g = getSongGenres(s);
    if (!g.length) {
      stats.unclassified += 1;
      continue;
    }
    if (g.length > 1) stats.multi += 1;
    if (g.includes('J-POP')) stats.jpop += 1;
    if (g.includes('アニソン')) stats.anime += 1;
    if (g.includes('ボカロ')) stats.vocaloid += 1;
    if (g.includes('洋楽')) stats.western += 1;
    if (g.includes('演歌')) stats.enka += 1;
    if (g.includes('その他')) stats.other += 1;
  }
  return stats;
}

export function summarizeGenreCombinations(songs) {
  const counts = new Map();
  for (const s of songs) {
    const key = getSongGenres(s).join('+') || '(未分類)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}
