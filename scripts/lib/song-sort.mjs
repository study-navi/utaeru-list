/**
 * 曲リスト並び替え（編集画面・公開 viewer 共通ロジック）
 */

export const SORT_OPTIONS = [
  { value: 'default', label: '標準順' },
  { value: 'kana-asc', label: 'あ→ん' },
  { value: 'kana-desc', label: 'ん→あ' },
  { value: 'added-desc', label: '最近追加した順' },
  { value: 'added-asc', label: '古く追加した順' },
];

export const JA_COLLATOR = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });

/** ひらがな・カタカナ・漢字始まり → 0、英数字始まり → 1（日本語の後ろ） */
export function readingSortTier(str) {
  if (!str) return 2;
  const ch = str[0];
  if (/[a-zA-Z0-9]/.test(ch)) return 1;
  if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(ch)) return 0;
  return 1;
}

export function compareReading(a, b, dir = 1) {
  const ta = readingSortTier(a);
  const tb = readingSortTier(b);
  // 英数字は常に日本語読みの後（昇順・降順どちらでも tier は固定）
  if (ta !== tb) return ta - tb;
  const aa = (a || '').toLowerCase();
  const bb = (b || '').toLowerCase();
  return dir * JA_COLLATOR.compare(aa, bb);
}

export function buildOriginalIndexMap(sourceList, keyOf) {
  const m = new Map();
  sourceList.forEach((s, i) => m.set(keyOf(s), i));
  return m;
}

export function hasAnyAddedAt(songs, getAddedAt) {
  return songs.some((s) => !!getAddedAt(s));
}

export function sortSongsList(songs, {
  sortMode,
  searchTarget,
  sourceList,
  keyOf,
  getTitleTy,
  getArtistY,
  getAddedAt,
  useSelectedDefaultSort,
  selectedDefaultSortFn,
}) {
  if (sortMode === 'default') {
    if (useSelectedDefaultSort && selectedDefaultSortFn) {
      return selectedDefaultSortFn(songs);
    }
    return songs;
  }

  const idxMap = buildOriginalIndexMap(sourceList, keyOf);
  const origIdx = (s) => idxMap.get(keyOf(s)) ?? 999999;

  if (sortMode === 'added-desc' || sortMode === 'added-asc') {
    const dir = sortMode === 'added-desc' ? -1 : 1;
    return [...songs].sort((a, b) => {
      const aa = getAddedAt(a);
      const ba = getAddedAt(b);
      const aHas = !!aa;
      const bHas = !!ba;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return origIdx(a) - origIdx(b);
      const cmp = aa.localeCompare(ba);
      if (cmp !== 0) return dir * cmp;
      return origIdx(a) - origIdx(b);
    });
  }

  const dir = sortMode === 'kana-asc' ? 1 : -1;
  return [...songs].sort((a, b) => {
    let pA;
    let pB;
    let sA;
    let sB;
    if (searchTarget === 'title') {
      pA = getTitleTy(a) || '';
      pB = getTitleTy(b) || '';
      sA = getArtistY(a) || '';
      sB = getArtistY(b) || '';
    } else {
      pA = getArtistY(a) || '';
      pB = getArtistY(b) || '';
      sA = getTitleTy(a) || '';
      sB = getTitleTy(b) || '';
    }
    let c = compareReading(pA, pB, dir);
    if (c !== 0) return c;
    c = compareReading(sA, sB, dir);
    if (c !== 0) return c;
    return origIdx(a) - origIdx(b);
  });
}

export function sortArtistGroups(groups, { sortMode, getArtistY }) {
  if (sortMode !== 'kana-asc' && sortMode !== 'kana-desc') return groups;
  const dir = sortMode === 'kana-asc' ? 1 : -1;
  return [...groups].sort((ga, gb) => {
    const ya = getArtistY(ga.songs[0]) || '';
    const yb = getArtistY(gb.songs[0]) || '';
    return compareReading(ya, yb, dir);
  });
}

export function shouldUseFlatForAddedSort(searchTarget, sortMode) {
  return searchTarget === 'artist'
    && (sortMode === 'added-desc' || sortMode === 'added-asc');
}

/** Node テスト用: ブラウザ向けインライン JS 断片 */
export function songSortBrowserSnippet() {
  return `
const SORT_OPTIONS = ${JSON.stringify(SORT_OPTIONS)};
const JA_COLLATOR = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });
function readingSortTier(str) {
  if (!str) return 2;
  const ch = str[0];
  if (/[a-zA-Z0-9]/.test(ch)) return 1;
  if (/[\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9fff]/.test(ch)) return 0;
  return 1;
}
function compareReading(a, b, dir) {
  dir = dir === undefined ? 1 : dir;
  const ta = readingSortTier(a);
  const tb = readingSortTier(b);
  if (ta !== tb) return ta - tb;
  const aa = (a || '').toLowerCase();
  const bb = (b || '').toLowerCase();
  return dir * JA_COLLATOR.compare(aa, bb);
}
function buildOriginalIndexMap(sourceList, keyOfFn) {
  const m = new Map();
  sourceList.forEach(function(s, i) { m.set(keyOfFn(s), i); });
  return m;
}
function hasAnyAddedAt(songs, getAddedAt) {
  return songs.some(function(s) { return !!getAddedAt(s); });
}
function sortSongsList(songs, opts) {
  const sortMode = opts.sortMode;
  const searchTarget = opts.searchTarget;
  const sourceList = opts.sourceList;
  const keyOfFn = opts.keyOf;
  const getTitleTy = opts.getTitleTy;
  const getArtistY = opts.getArtistY;
  const getAddedAt = opts.getAddedAt;
  const useSelectedDefaultSort = opts.useSelectedDefaultSort;
  const selectedDefaultSortFn = opts.selectedDefaultSortFn;
  if (sortMode === 'default') {
    if (useSelectedDefaultSort && selectedDefaultSortFn) return selectedDefaultSortFn(songs);
    return songs;
  }
  const idxMap = buildOriginalIndexMap(sourceList, keyOfFn);
  function origIdx(s) { return idxMap.get(keyOfFn(s)) ?? 999999; }
  if (sortMode === 'added-desc' || sortMode === 'added-asc') {
    const dir = sortMode === 'added-desc' ? -1 : 1;
    return [...songs].sort(function(a, b) {
      const aa = getAddedAt(a);
      const ba = getAddedAt(b);
      const aHas = !!aa;
      const bHas = !!ba;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return origIdx(a) - origIdx(b);
      const cmp = aa.localeCompare(ba);
      if (cmp !== 0) return dir * cmp;
      return origIdx(a) - origIdx(b);
    });
  }
  const dir = sortMode === 'kana-asc' ? 1 : -1;
  return [...songs].sort(function(a, b) {
    var pA, pB, sA, sB;
    if (searchTarget === 'title') {
      pA = getTitleTy(a) || ''; pB = getTitleTy(b) || '';
      sA = getArtistY(a) || ''; sB = getArtistY(b) || '';
    } else {
      pA = getArtistY(a) || ''; pB = getArtistY(b) || '';
      sA = getTitleTy(a) || ''; sB = getTitleTy(b) || '';
    }
    var c = compareReading(pA, pB, dir);
    if (c !== 0) return c;
    c = compareReading(sA, sB, dir);
    if (c !== 0) return c;
    return origIdx(a) - origIdx(b);
  });
}
function sortArtistGroups(groups, opts) {
  const sortMode = opts.sortMode;
  const getArtistY = opts.getArtistY;
  if (sortMode !== 'kana-asc' && sortMode !== 'kana-desc') return groups;
  const dir = sortMode === 'kana-asc' ? 1 : -1;
  return [...groups].sort(function(ga, gb) {
    const ya = getArtistY(ga.songs[0]) || '';
    const yb = getArtistY(gb.songs[0]) || '';
    return compareReading(ya, yb, dir);
  });
}
function shouldUseFlatForAddedSort(searchTarget, sortMode) {
  return searchTarget === 'artist' && (sortMode === 'added-desc' || sortMode === 'added-asc');
}
`.trim();
}
