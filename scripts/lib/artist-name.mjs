/**
 * アーティスト名の比較・検索・グループ化用正規化。
 * 表示文字列そのものは変更しない（呼び出し側で header 用に代表名を選ぶ）。
 */

function toHiragana(str) {
  return String(str ?? '').replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function foldFullwidthAlnum(str) {
  return String(str ?? '').replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}

/** 前後空白削除・全角/NBSP→半角・連続空白を1つに */
export function normalizeArtistWhitespace(name) {
  return String(name ?? '')
    .replace(/[\u3000\u00A0]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * 比較・重複判定キー。
 * スペースは除去、英字は大小無視、全角英数字は半角化。
 * feat / & / ・ などは残す（意味が変わる表記を結合しない）。
 */
export function artistCompareKey(name) {
  return foldFullwidthAlnum(toHiragana(normalizeArtistWhitespace(name)))
    .toLowerCase()
    .replace(/ /g, '');
}

export function artistsEqual(a, b) {
  return artistCompareKey(a) === artistCompareKey(b);
}

export function artistSearchKey(name) {
  return artistCompareKey(name);
}

export function pickDisplayArtistName(songs) {
  const counts = new Map();
  for (const s of songs) {
    const name = s && typeof s === 'object' ? s.a : s;
    if (name == null || name === '') continue;
    const prev = counts.get(name) || { name, count: 0, spaces: 0 };
    prev.count += 1;
    prev.spaces = (String(name).match(/\s/g) || []).length;
    counts.set(name, prev);
  }
  const ranked = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.spaces !== b.spaces) return a.spaces - b.spaces;
    return 0;
  });
  return ranked.length ? ranked[0].name : '';
}

export function countDistinctArtists(songs) {
  const keys = new Set();
  for (const s of songs) {
    if (!s || s.a == null) continue;
    keys.add(artistCompareKey(s.a));
  }
  return keys.size;
}

const MEANING_MARK_RE = /feat\.?|featuring|\bwith\b|&|＆|\/|・|･|\+|×|\bvs\.?\b/i;

export function hasMeaningChangingMarker(name) {
  return MEANING_MARK_RE.test(String(name ?? ''));
}

export function classifyArtistNameVariants(names) {
  const unique = [...new Set(names.filter((n) => n != null && String(n) !== ''))];
  if (unique.length <= 1) return '統合してよい';
  const compareKeys = new Set(unique.map(artistCompareKey));
  if (compareKeys.size === 1) {
    const meaning = unique.map(hasMeaningChangingMarker);
    if (meaning.some(Boolean) && !meaning.every(Boolean)) return '統合しない';
    return '統合してよい';
  }
  const nfkcKeys = new Set(
    unique.map((n) =>
      normalizeArtistWhitespace(n).normalize('NFKC').toLowerCase().replace(/\s+/g, ''),
    ),
  );
  if (nfkcKeys.size === 1) return '要確認';
  if (unique.some(hasMeaningChangingMarker)) return '統合しない';
  return '要確認';
}

export function groupSongsByArtistCompareKey(songs) {
  const byKey = new Map();
  for (const s of songs) {
    const key = artistCompareKey(s.a);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  return byKey;
}

export function findArtistVariantGroups(songs) {
  const byKey = new Map();
  for (const s of songs) {
    const key = artistCompareKey(s.a);
    if (!byKey.has(key)) byKey.set(key, new Map());
    const names = byKey.get(key);
    if (!names.has(s.a)) names.set(s.a, []);
    names.get(s.a).push(s);
  }
  const groups = [];
  for (const [key, names] of byKey) {
    if (names.size < 2) continue;
    const variants = [...names.entries()].map(([name, list]) => ({
      name,
      count: list.length,
      titles: list.map((s) => s.t),
    }));
    groups.push({
      key,
      class: classifyArtistNameVariants(variants.map((v) => v.name)),
      variants,
    });
  }
  groups.sort((a, b) => a.key.localeCompare(b.key, 'ja'));
  return groups;
}

/** カタログ特殊形式 `あ,アーティスト,曲名` の表示用曲名 */
export function displaySongTitle(t) {
  if (t == null) return '';
  const parts = String(t).split(',');
  if (parts.length >= 3 && /^[ぁ-ん]$/.test(parts[0])) {
    return parts.slice(2).join(',');
  }
  return String(t);
}

export function artistNameBrowserSnippet() {
  return `
function normalizeArtistWhitespace(name) {
  return String(name == null ? '' : name)
    .replace(/[\\u3000\\u00A0]/g, ' ')
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
    .replace(/[\\r\\n\\t]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}
function foldFullwidthAlnum(str) {
  return String(str == null ? '' : str).replace(/[\\uFF10-\\uFF19\\uFF21-\\uFF3A\\uFF41-\\uFF5A]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
}
function artistToHiragana(str) {
  return String(str == null ? '' : str).replace(/[ァ-ヶ]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  });
}
function artistCompareKey(name) {
  return foldFullwidthAlnum(artistToHiragana(normalizeArtistWhitespace(name))).toLowerCase().replace(/ /g, '');
}
function artistsEqual(a, b) {
  return artistCompareKey(a) === artistCompareKey(b);
}
function artistSearchKey(name) {
  return artistCompareKey(name);
}
function pickDisplayArtistName(songs) {
  const counts = new Map();
  for (var i = 0; i < songs.length; i++) {
    var name = songs[i] && typeof songs[i] === 'object' ? songs[i].a : songs[i];
    if (name == null || name === '') continue;
    var prev = counts.get(name) || { name: name, count: 0, spaces: 0 };
    prev.count += 1;
    prev.spaces = (String(name).match(/\\s/g) || []).length;
    counts.set(name, prev);
  }
  var ranked = [...counts.values()].sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    if (a.spaces !== b.spaces) return a.spaces - b.spaces;
    return 0;
  });
  return ranked.length ? ranked[0].name : '';
}
function countDistinctArtists(songs) {
  var keys = new Set();
  for (var i = 0; i < songs.length; i++) {
    if (!songs[i] || songs[i].a == null) continue;
    keys.add(artistCompareKey(songs[i].a));
  }
  return keys.size;
}
function displaySongTitle(t) {
  if (t == null) return '';
  var parts = String(t).split(',');
  if (parts.length >= 3 && /^[ぁ-ん]$/.test(parts[0])) return parts.slice(2).join(',');
  return String(t);
}
`.trim();
}
