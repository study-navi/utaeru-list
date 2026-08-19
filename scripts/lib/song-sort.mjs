/**
 * 曲リスト並び替え（編集画面・公開 viewer 共通ロジック）
 */
import { artistCompareKey, artistNameBrowserSnippet, pickDisplayArtistName } from './artist-name.mjs';

export const SORT_OPTIONS = [
  { value: 'title-asc', label: '曲名 あ→ん' },
  { value: 'title-desc', label: '曲名 ん→あ' },
  { value: 'artist-asc', label: 'アーティスト あ→ん' },
  { value: 'artist-desc', label: 'アーティスト ん→あ' },
  { value: 'batch-order', label: 'UTAEMO新着順' },
  { value: 'added-desc', label: '追加が新しい順' },
  { value: 'added-asc', label: '追加が古い順' },
];

export const DEFAULT_SORT_BY_TARGET = {
  artist: 'artist-asc',
  title: 'title-asc',
};

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
  if (ta !== tb) return ta - tb;
  const aa = (a || '').toLowerCase();
  const bb = (b || '').toLowerCase();
  return dir * JA_COLLATOR.compare(aa, bb);
}

export function defaultSortForSearchTarget(target) {
  return DEFAULT_SORT_BY_TARGET[target] || DEFAULT_SORT_BY_TARGET.artist;
}

/** アコーディオン内の曲順（曲名系が選ばれていなければ曲名 あ→ん） */
export function withinGroupSortMode(sortMode) {
  if (sortMode === 'title-asc' || sortMode === 'title-desc') return sortMode;
  return 'title-asc';
}

export function sortModeSortsArtistGroups(sortMode) {
  return sortMode === 'artist-asc' || sortMode === 'artist-desc';
}

export function buildOriginalIndexMap(sourceList, keyOf) {
  const m = new Map();
  sourceList.forEach((s, i) => m.set(keyOf(s), i));
  return m;
}

export function hasAnyAddedAt(songs, getAddedAt) {
  return songs.some((s) => !!getAddedAt(s));
}

function compareByTitle(a, b, dir, getTitleTy, getArtistY, origIdx) {
  let c = compareReading(getTitleTy(a), getTitleTy(b), dir);
  if (c !== 0) return c;
  c = compareReading(getArtistY(a), getArtistY(b), 1);
  if (c !== 0) return c;
  return origIdx(a) - origIdx(b);
}

function compareByArtist(a, b, dir, getTitleTy, getArtistY, origIdx) {
  let c = compareReading(getArtistY(a), getArtistY(b), dir);
  if (c !== 0) return c;
  c = compareReading(getTitleTy(a), getTitleTy(b), 1);
  if (c !== 0) return c;
  return origIdx(a) - origIdx(b);
}

export function sortSongsList(songs, {
  sortMode,
  sourceList,
  keyOf,
  getTitleTy,
  getArtistY,
  getAddedAt,
  getBatchOrder,
}) {
  const idxMap = buildOriginalIndexMap(sourceList, keyOf);
  const origIdx = (s) => idxMap.get(keyOf(s)) ?? 999999;

  if (sortMode === 'title-asc' || sortMode === 'title-desc') {
    const dir = sortMode === 'title-asc' ? 1 : -1;
    return [...songs].sort((a, b) => compareByTitle(a, b, dir, getTitleTy, getArtistY, origIdx));
  }

  if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
    const dir = sortMode === 'artist-asc' ? 1 : -1;
    return [...songs].sort((a, b) => compareByArtist(a, b, dir, getTitleTy, getArtistY, origIdx));
  }

  if (sortMode === 'batch-order') {
    const batchIdx = (s) => (getBatchOrder ? getBatchOrder(s) : undefined);
    return [...songs].sort((a, b) => {
      const ba = batchIdx(a);
      const bb = batchIdx(b);
      const aIn = ba !== undefined;
      const bIn = bb !== undefined;
      if (aIn && !bIn) return -1;
      if (!aIn && bIn) return 1;
      if (aIn && bIn && ba !== bb) return ba - bb;
      return compareByTitle(a, b, 1, getTitleTy, getArtistY, origIdx);
    });
  }

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

  return songs;
}

export function sortArtistGroups(groups, { sortMode, getArtistY, getBatchOrder, getAddedAt }) {
  if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
    const dir = sortMode === 'artist-asc' ? 1 : -1;
    return [...groups].sort((ga, gb) =>
      compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), dir),
    );
  }

  if (sortMode === 'batch-order' && getBatchOrder) {
    const minBatch = (g) => {
      let min = 999999;
      for (const s of g.songs) {
        const idx = getBatchOrder(s);
        if (idx !== undefined && idx < min) min = idx;
      }
      return min;
    };
    return [...groups].sort((ga, gb) => {
      const ma = minBatch(ga);
      const mb = minBatch(gb);
      const aIn = ma < 999999;
      const bIn = mb < 999999;
      if (aIn && !bIn) return -1;
      if (!aIn && bIn) return 1;
      if (aIn && bIn && ma !== mb) return ma - mb;
      return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
    });
  }

  if (sortMode === 'added-desc' || sortMode === 'added-asc') {
    const dir = sortMode === 'added-desc' ? -1 : 1;
    const pickAdded = (g) => {
      let best = null;
      for (const s of g.songs) {
        const a = getAddedAt(s);
        if (!a) continue;
        if (!best || (dir < 0 ? a.localeCompare(best) > 0 : a.localeCompare(best) < 0)) best = a;
      }
      return best;
    };
    return [...groups].sort((ga, gb) => {
      const aa = pickAdded(ga);
      const ba = pickAdded(gb);
      if (aa && !ba) return -1;
      if (!aa && ba) return 1;
      if (!aa && !ba) {
        return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
      }
      const cmp = aa.localeCompare(ba);
      if (cmp !== 0) return dir * cmp;
      return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
    });
  }

  // 曲名系・その他: 見出しはアーティスト あ→ん
  return [...groups].sort((ga, gb) =>
    compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1),
  );
}

export function buildArtistGroups(songs, opts) {
  const {
    sortMode,
    sourceList,
    keyOf,
    getTitleTy,
    getArtistY,
    getAddedAt,
    getBatchOrder,
  } = opts;

  const byArtist = new Map();
  for (const s of songs) {
    const groupKey = artistCompareKey(s.a);
    if (!byArtist.has(groupKey)) byArtist.set(groupKey, []);
    byArtist.get(groupKey).push(s);
  }

  const withinMode = withinGroupSortMode(sortMode);
  const groups = [];
  for (const list of byArtist.values()) {
    const sorted = sortSongsList(list, {
      sortMode: withinMode,
      sourceList,
      keyOf,
      getTitleTy,
      getArtistY,
      getAddedAt,
      getBatchOrder,
    });
    groups.push({ artist: pickDisplayArtistName(sorted), songs: sorted });
  }
  return sortArtistGroups(groups, { sortMode, getArtistY, getBatchOrder, getAddedAt });
}

/** フラット一覧に切り替える条件 */
export function shouldUseFlatListMode({
  sortMode,
  searchTarget,
  q,
  songListView,
  newOnly,
  activeMark,
  activeTagsSize,
  catalogScope,
}) {
  if (songListView === 'selected') return true;
  if (searchTarget === 'title') return true;
  if (q) return true;
  if (sortMode === 'title-asc' || sortMode === 'title-desc') return true;
  if (sortMode === 'batch-order') return true;
  if (sortMode === 'added-desc' || sortMode === 'added-asc') return true;
  if (newOnly || activeMark || (activeTagsSize > 0) || catalogScope === 'new-batch') return true;
  return false;
}

/** @deprecated use shouldUseFlatListMode */
export function shouldUseFlatForAddedSort(searchTarget, sortMode) {
  return searchTarget === 'artist'
    && (sortMode === 'added-desc' || sortMode === 'added-asc');
}

/** ブラウザ向けインライン JS 断片 */
export function songSortBrowserSnippet() {
  return `
${artistNameBrowserSnippet()}
const SORT_OPTIONS = ${JSON.stringify(SORT_OPTIONS)};
const DEFAULT_SORT_BY_TARGET = ${JSON.stringify(DEFAULT_SORT_BY_TARGET)};
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
function defaultSortForSearchTarget(target) {
  return DEFAULT_SORT_BY_TARGET[target] || DEFAULT_SORT_BY_TARGET.artist;
}
function withinGroupSortMode(sortMode) {
  if (sortMode === 'title-asc' || sortMode === 'title-desc') return sortMode;
  return 'title-asc';
}
function buildOriginalIndexMap(sourceList, keyOfFn) {
  const m = new Map();
  sourceList.forEach(function(s, i) { m.set(keyOfFn(s), i); });
  return m;
}
function hasAnyAddedAt(songs, getAddedAt) {
  return songs.some(function(s) { return !!getAddedAt(s); });
}
function compareByTitle(a, b, dir, getTitleTy, getArtistY, origIdx) {
  var c = compareReading(getTitleTy(a), getTitleTy(b), dir);
  if (c !== 0) return c;
  c = compareReading(getArtistY(a), getArtistY(b), 1);
  if (c !== 0) return c;
  return origIdx(a) - origIdx(b);
}
function compareByArtist(a, b, dir, getTitleTy, getArtistY, origIdx) {
  var c = compareReading(getArtistY(a), getArtistY(b), dir);
  if (c !== 0) return c;
  c = compareReading(getTitleTy(a), getTitleTy(b), 1);
  if (c !== 0) return c;
  return origIdx(a) - origIdx(b);
}
function sortSongsList(songs, opts) {
  const sortMode = opts.sortMode;
  const sourceList = opts.sourceList;
  const keyOfFn = opts.keyOf;
  const getTitleTy = opts.getTitleTy;
  const getArtistY = opts.getArtistY;
  const getAddedAt = opts.getAddedAt;
  const getBatchOrder = opts.getBatchOrder;
  const idxMap = buildOriginalIndexMap(sourceList, keyOfFn);
  function origIdx(s) { return idxMap.get(keyOfFn(s)) ?? 999999; }
  if (sortMode === 'title-asc' || sortMode === 'title-desc') {
    const dir = sortMode === 'title-asc' ? 1 : -1;
    return [...songs].sort(function(a, b) { return compareByTitle(a, b, dir, getTitleTy, getArtistY, origIdx); });
  }
  if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
    const dir = sortMode === 'artist-asc' ? 1 : -1;
    return [...songs].sort(function(a, b) { return compareByArtist(a, b, dir, getTitleTy, getArtistY, origIdx); });
  }
  if (sortMode === 'batch-order') {
    function batchIdx(s) { return getBatchOrder ? getBatchOrder(s) : undefined; }
    return [...songs].sort(function(a, b) {
      const ba = batchIdx(a);
      const bb = batchIdx(b);
      const aIn = ba !== undefined;
      const bIn = bb !== undefined;
      if (aIn && !bIn) return -1;
      if (!aIn && bIn) return 1;
      if (aIn && bIn && ba !== bb) return ba - bb;
      return compareByTitle(a, b, 1, getTitleTy, getArtistY, origIdx);
    });
  }
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
  return songs;
}
function sortArtistGroups(groups, opts) {
  const sortMode = opts.sortMode;
  const getArtistY = opts.getArtistY;
  const getBatchOrder = opts.getBatchOrder;
  const getAddedAt = opts.getAddedAt;
  if (sortMode === 'artist-asc' || sortMode === 'artist-desc') {
    const dir = sortMode === 'artist-asc' ? 1 : -1;
    return [...groups].sort(function(ga, gb) {
      return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), dir);
    });
  }
  if (sortMode === 'batch-order' && getBatchOrder) {
    function minBatch(g) {
      var min = 999999;
      for (var i = 0; i < g.songs.length; i++) {
        var idx = getBatchOrder(g.songs[i]);
        if (idx !== undefined && idx < min) min = idx;
      }
      return min;
    }
    return [...groups].sort(function(ga, gb) {
      var ma = minBatch(ga);
      var mb = minBatch(gb);
      var aIn = ma < 999999;
      var bIn = mb < 999999;
      if (aIn && !bIn) return -1;
      if (!aIn && bIn) return 1;
      if (aIn && bIn && ma !== mb) return ma - mb;
      return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
    });
  }
  if (sortMode === 'added-desc' || sortMode === 'added-asc') {
    const dir = sortMode === 'added-desc' ? -1 : 1;
    function pickAdded(g) {
      var best = null;
      for (var i = 0; i < g.songs.length; i++) {
        var a = getAddedAt(g.songs[i]);
        if (!a) continue;
        if (!best || (dir < 0 ? a.localeCompare(best) > 0 : a.localeCompare(best) < 0)) best = a;
      }
      return best;
    }
    return [...groups].sort(function(ga, gb) {
      var aa = pickAdded(ga);
      var ba = pickAdded(gb);
      if (aa && !ba) return -1;
      if (!aa && ba) return 1;
      if (!aa && !ba) return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
      var cmp = aa.localeCompare(ba);
      if (cmp !== 0) return dir * cmp;
      return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
    });
  }
  return [...groups].sort(function(ga, gb) {
    return compareReading(getArtistY(ga.songs[0]), getArtistY(gb.songs[0]), 1);
  });
}
function buildArtistGroups(songs, opts) {
  const byArtist = new Map();
  for (var i = 0; i < songs.length; i++) {
    var s = songs[i];
    var groupKey = artistCompareKey(s.a);
    if (!byArtist.has(groupKey)) byArtist.set(groupKey, []);
    byArtist.get(groupKey).push(s);
  }
  var withinMode = withinGroupSortMode(opts.sortMode);
  var groups = [];
  for (var entry of byArtist.values()) {
    var sorted = sortSongsList(entry, {
      sortMode: withinMode,
      sourceList: opts.sourceList,
      keyOf: opts.keyOf,
      getTitleTy: opts.getTitleTy,
      getArtistY: opts.getArtistY,
      getAddedAt: opts.getAddedAt,
      getBatchOrder: opts.getBatchOrder,
    });
    groups.push({ artist: pickDisplayArtistName(sorted), songs: sorted });
  }
  return sortArtistGroups(groups, {
    sortMode: opts.sortMode,
    getArtistY: opts.getArtistY,
    getBatchOrder: opts.getBatchOrder,
    getAddedAt: opts.getAddedAt,
  });
}
function shouldUseFlatListMode(opts) {
  if (opts.songListView === 'selected') return true;
  if (opts.searchTarget === 'title') return true;
  if (opts.q) return true;
  if (opts.sortMode === 'title-asc' || opts.sortMode === 'title-desc') return true;
  if (opts.sortMode === 'batch-order') return true;
  if (opts.sortMode === 'added-desc' || opts.sortMode === 'added-asc') return true;
  if (opts.newOnly || opts.activeMark || opts.activeTagsSize > 0 || opts.catalogScope === 'new-batch') return true;
  return false;
}
function shouldUseFlatForAddedSort(searchTarget, sortMode) {
  return searchTarget === 'artist' && (sortMode === 'added-desc' || sortMode === 'added-asc');
}
`.trim();
}

/** 編集画面・viewer 共通のソート制御ヘルパー */
export function songSortControlBrowserSnippet({ sourceListName, metaAccessor, titleTyFn, isEditor }) {
  const initialTarget = isEditor ? 'artist' : 'artist';
  return `
let sortMode = defaultSortForSearchTarget('${initialTarget}');
let sortUserChosen = false;

function initSortSelect() {
  const sel = document.getElementById('sortSelect');
  if (!sel) return;
  if (!sel.dataset.inited) {
    sel.dataset.inited = '1';
    SORT_OPTIONS.forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function() {
      sortMode = sel.value;
      sortUserChosen = true;
      render();
    });
  }
  sel.value = sortMode;
}
function applyDefaultSortForSearchTarget() {
  if (sortUserChosen) return;
  sortMode = defaultSortForSearchTarget(searchTarget);
  const sel = document.getElementById('sortSelect');
  if (sel) sel.value = sortMode;
}
function updateSortSelectState(filtered) {
  const sel = document.getElementById('sortSelect');
  if (!sel) return;
  const canAdded = ${isEditor
    ? "songListView === 'selected' && hasAnyAddedAt(filtered, function(s) { return (songMeta[keyOf(s)] || {}).addedAt; })"
    : 'hasAnyAddedAt(filtered, function(s) { return (SONG_META[keyOf(s)] || {}).addedAt; })'};
  [...sel.options].forEach(function(o) {
    if (o.value === 'added-desc' || o.value === 'added-asc') {
      o.disabled = !canAdded;
      o.title = canAdded ? '' : '追加日が設定された曲があるとき使えます';
    }
  });
  if ((sortMode === 'added-desc' || sortMode === 'added-asc') && !canAdded) {
    sortMode = defaultSortForSearchTarget(searchTarget);
    sortUserChosen = false;
    sel.value = sortMode;
  }
}
function getTitleTyForSort(s) {
  ${titleTyFn}
}
function getAddedAtForSort(s) {
  return ${metaAccessor}.addedAt;
}
function applySortToFiltered(filtered) {
  return sortSongsList(filtered, {
    sortMode: sortMode,
    sourceList: ${sourceListName},
    keyOf: keyOf,
    getTitleTy: getTitleTyForSort,
    getArtistY: function(s) { return s.y; },
    getAddedAt: getAddedAtForSort,
    getBatchOrder: getBatchOrderIndex,
  });
}
function buildSortedArtistGroups(filtered) {
  return buildArtistGroups(filtered, {
    sortMode: sortMode,
    sourceList: ${sourceListName},
    keyOf: keyOf,
    getTitleTy: getTitleTyForSort,
    getArtistY: function(s) { return s.y; },
    getAddedAt: getAddedAtForSort,
    getBatchOrder: getBatchOrderIndex,
  });
}
`.trim();
}
