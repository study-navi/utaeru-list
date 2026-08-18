/**
 * MASTER_SONGS 標準ジャンル分類ルール
 *
 * Phase 1: アニソン・ボカロ（保守的）
 * Phase 2: 一般邦楽への J-POP 付与（除外リスト付き）
 * Phase 4: アニソン分類拡充（曲単位・確信度 A のみ）
 */

import { ANIME_VERIFIED_PHASE4, GENRE_CORRECTIONS_PHASE4 } from '../data/anime-verified-phase4.mjs';

export const MASTER_GENRE_LABELS = ['J-POP', 'アニソン', 'ボカロ'];

/** VOCALOID 原曲としてカタログ上すべてボカロ扱いできるアーティスト名 */
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
  'Eve',
  'syudou',
  'Giga',
  'ひとしずくP×やま△',
]);

export const VOCALOID_FEAT_RE = /feat\.?\s*(初音ミク|鏡音(?:リン|レン)|巡音ルカ|MEIKO|KAITO|可不(?:\(KAFU\))?|KAFU|flower|GUMI|MAYU|重音テト|結月ゆかり)/i;

export const EXPLICIT_ANIME_TITLE_RE = /(?:from|FROM)\s+[A-Z][A-Z\s\-]+|ONE PIECE|ドラゴンボール|鬼滅の刃|呪術廻戦|進撃の巨人|名探偵コナン|エヴァンゲリオン|ガンダム|ポケットモンスター|ポケモン|ジブリ|Disney|ディズニー|ウタ from/i;

/** J-POP 付与から除外するアーティスト（完全一致） */
export const JPOP_EXCLUDE_ARTISTS = new Set([
  'Ed Sheeran',
  'Ariana Grande and John Legend',
  'Beyonce',
  'BON JOVI',
  'STEVIE WONDER',
  'CELINE DION',
  'TWICE',
  'BIGBANG',
  'ディズニー',
  '東京ディズニーリゾート',
  'WIZ KHALIFA(Feat.CHARLIE PUTH)',
  '坂本冬美',
  '美空ひばり',
  'Alan Walker',
  '石川さゆり',
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
  191: ['ボカロ'],
  192: ['ボカロ'],
  193: ['ボカロ'],
  195: ['ボカロ'],
  196: ['ボカロ'],
  197: ['ボカロ'],
  198: ['ボカロ'],
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
  // --- アニメタイアップ（曲単位で確認済み） ---
  94: ['J-POP', 'アニソン'], // abingdon boys school / JAP
  476: ['J-POP', 'アニソン'], // kimeru / OVERLAP
  288: ['J-POP', 'アニソン'], // エミリア(cv.) / Stay Alive
  978: ['J-POP', 'アニソン'], // ターニャ(cv.) / Los!Los!Los!
  990: ['J-POP', 'アニソン'], // DALI / ムーンライト伝説
  465: ['J-POP', 'アニソン'], // きただにひろし / ウィーアー！
  975: ['J-POP', 'アニソン'], // 玉置成実 / Reason
  718: ['J-POP', 'アニソン'], // May'n / ユニバーサル・バニー (マクロスF)
  1530: ['J-POP', 'アニソン'], // fripSide / only my railgun
  1531: ['J-POP', 'アニソン'], // fripSide / LEVEL5
  408: ['J-POP', 'アニソン'], // 影山ヒロノブ / WE GOTTA POWER
  407: ['J-POP', 'アニソン'], // 影山ヒロノブ / 僕達は天使だった
  42: ['J-POP', 'アニソン'], // AKINO / 創聖のアクエリオン
  43: ['J-POP', 'アニソン'], // AKINO / 海色
  715: ['J-POP', 'アニソン'],
  716: ['J-POP', 'アニソン'],
  717: ['J-POP', 'アニソン'],
  1760: ['J-POP', 'アニソン'], // May'n/中島愛 / ライオン
  1441: ['J-POP', 'アニソン'], // ヒグチアイ / 悪魔の子
};

function getVerifiedGenresById(id) {
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
  return ['J-POP', ...genres];
}

export function isExcludedFromJPop(song) {
  const combined = `${song.a} ${song.t}`;
  if (JPOP_EXCLUDE_ARTISTS.has(song.a)) return true;
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

  if (isVocaloidOnlyProducerArtist(song.a)) {
    genres.push('ボカロ');
  } else if (VOCALOID_FEAT_RE.test(combined)) {
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
