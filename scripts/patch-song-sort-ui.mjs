#!/usr/bin/env node
/**
 * index.html / hiro.html に並び替え UI + ロジックを適用
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songSortBrowserSnippet } from './lib/song-sort.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORT_CSS = `
  .sort-control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    min-height: 44px;
  }
  .sort-control-label {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .sort-control-select {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 8px 32px 8px 12px;
    border: 1px solid var(--border, var(--grid));
    border-radius: 10px;
    background: var(--page, var(--surface));
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
  }
  .sort-control-select:disabled {
    opacity: 0.5;
  }`;

const SORT_SNIPPET = songSortBrowserSnippet();

function patchIndexHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (html.includes('sort-control-row')) {
    console.log('index.html sort UI already present');
    return;
  }

  html = html.replace(
    '  .flat-artist-sub {',
    SORT_CSS + '\n  .flat-artist-sub {',
  );

  html = html.replace(
    `      <div class="ui-section-soft song-filter-block song-genre-block" id="genreFilterBlock">
        <div class="genre-filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>
      </div>`,
    `      <div class="ui-section-soft song-filter-block song-sort-block">
        <div class="sort-control-row">
          <label class="sort-control-label" for="sortSelect">並び替え</label>
          <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
        </div>
      </div>
      <div class="ui-section-soft song-filter-block song-genre-block" id="genreFilterBlock">
        <div class="genre-filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>
      </div>`,
  );

  html = html.replace(
    'function shouldShowGyoFilters() {',
    `// @song-sort-inject
${SORT_SNIPPET}
let sortMode = 'default';

function initSortSelect() {
  const sel = document.getElementById('sortSelect');
  if (!sel || sel.dataset.inited) return;
  sel.dataset.inited = '1';
  SORT_OPTIONS.forEach(function(opt) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  });
  sel.value = sortMode;
  sel.addEventListener('change', function() {
    sortMode = sel.value;
    render();
  });
}
function updateSortSelectState(filtered) {
  const sel = document.getElementById('sortSelect');
  if (!sel) return;
  const canAdded = songListView === 'selected' && hasAnyAddedAt(filtered, function(s) {
    return (songMeta[keyOf(s)] || {}).addedAt;
  });
  [...sel.options].forEach(function(o) {
    if (o.value === 'added-desc' || o.value === 'added-asc') {
      o.disabled = !canAdded;
      o.title = canAdded ? '' : '追加日が設定された曲があるとき使えます';
    }
  });
  if ((sortMode === 'added-desc' || sortMode === 'added-asc') && !canAdded) {
    sortMode = 'default';
    sel.value = 'default';
  }
}
function getTitleTyForSort(s) {
  return s.ty || '';
}
function getAddedAtForSort(s) {
  return (songMeta[keyOf(s)] || {}).addedAt;
}
function applySortToFiltered(filtered) {
  return sortSongsList(filtered, {
    sortMode: sortMode,
    searchTarget: searchTarget,
    sourceList: MASTER_SONGS,
    keyOf: keyOf,
    getTitleTy: getTitleTyForSort,
    getArtistY: function(s) { return s.y; },
    getAddedAt: getAddedAtForSort,
    useSelectedDefaultSort: songListView === 'selected' && sortMode === 'default',
    selectedDefaultSortFn: sortSongsForDisplay,
  });
}
// @end-song-sort-inject

function shouldShowGyoFilters() {`,
  );

  html = html.replace(
    `  const isSearchMode = !!q;
  const useFlatList = songListView === 'selected' || searchTarget === 'title' || (searchTarget === 'artist' && isSearchMode);
  const displaySongs = songListView === 'selected' ? sortSongsForDisplay(filtered) : filtered;`,
    `  updateSortSelectState(filtered);
  const isSearchMode = !!q;
  const useFlatList = songListView === 'selected' || searchTarget === 'title' || (searchTarget === 'artist' && isSearchMode) || shouldUseFlatForAddedSort(searchTarget, sortMode);
  const displaySongs = applySortToFiltered(filtered);`,
  );

  html = html.replace(
    `  const groups = [];
  let cur = null;
  for (const s of filtered) {
    if (!cur || cur.artist !== s.a) { cur = { artist: s.a, songs: [] }; groups.push(cur); }
    cur.songs.push(s);
  }

  const MAX_GROUPS = 250;
  const shown = groups.slice(0, MAX_GROUPS);`,
    `  const groups = [];
  let cur = null;
  for (const s of filtered) {
    if (!cur || cur.artist !== s.a) { cur = { artist: s.a, songs: [] }; groups.push(cur); }
    cur.songs.push(s);
  }
  const sortedGroups = sortArtistGroups(groups, {
    sortMode: sortMode,
    getArtistY: function(s) { return s.y; },
  });

  const MAX_GROUPS = 250;
  const shown = sortedGroups.slice(0, MAX_GROUPS);`,
  );

  html = html.replace(
    "  }).join('') + (groups.length > MAX_GROUPS ?",
    "  }).join('') + (sortedGroups.length > MAX_GROUPS ?",
  );
  html = html.replace(
    '他 ${groups.length - MAX_GROUPS} 組は絞り込みを続けると表示されます',
    '他 ${sortedGroups.length - MAX_GROUPS} 組は絞り込みを続けると表示されます',
  );

  if (!html.includes('initSortSelect();')) {
    html = html.replace('initSearchTargetTabs();', 'initSearchTargetTabs();\ninitSortSelect();');
  }

  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log('Patched index.html sort UI');
}

function patchHiroHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  if (html.includes('sort-control-row') && html.includes('let sortMode')) {
    console.log('hiro.html sort UI already present');
    return;
  }

  html = html.replace(
    '  .search-mode-segment {',
    SORT_CSS.replace(/var\(--border, var\(--grid\)\)/g, 'var(--grid)').replace(/var\(--page, var\(--surface\)\)/g, 'var(--surface)') + '\n  .search-mode-segment {',
  );

  if (!html.includes('id="sortSelect"')) {
    html = html.replace(
      `      <div class="gyo-row gyo-sub-row" id="gyoSubRow" hidden aria-label="五十音 1文字"></div>
    </div>
  </div>

  <div class="genre-filter-row filter-row" id="genreFilterRow"`,
      `      <div class="gyo-row gyo-sub-row" id="gyoSubRow" hidden aria-label="五十音 1文字"></div>
      <div class="sort-control-row">
        <label class="sort-control-label" for="sortSelect">並び替え</label>
        <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
      </div>
    </div>
  </div>

  <div class="genre-filter-row filter-row" id="genreFilterRow"`,
    );
  }

  if (!html.includes('// @song-sort-inject')) {
    html = html.replace(
      'function resolveTitleReading(s) {',
      `// @song-sort-inject
${SORT_SNIPPET}
let sortMode = 'default';

function initSortSelect() {
  const sel = document.getElementById('sortSelect');
  if (!sel || sel.dataset.inited) return;
  sel.dataset.inited = '1';
  SORT_OPTIONS.forEach(function(opt) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  });
  sel.value = sortMode;
  sel.addEventListener('change', function() {
    sortMode = sel.value;
    render();
  });
}
function getTitleTyForSort(s) {
  const tr = resolveTitleReading(s);
  return tr?.ty || '';
}
function getAddedAtForSort(s) {
  return (SONG_META[keyOf(s)] || {}).addedAt;
}
function applySortToFiltered(filtered) {
  return sortSongsList(filtered, {
    sortMode: sortMode,
    searchTarget: searchTarget,
    sourceList: SONGS,
    keyOf: keyOf,
    getTitleTy: getTitleTyForSort,
    getArtistY: function(s) { return s.y; },
    getAddedAt: getAddedAtForSort,
    useSelectedDefaultSort: false,
    selectedDefaultSortFn: null,
  });
}
// @end-song-sort-inject

function resolveTitleReading(s) {`,
    );
  }

  html = html.replace(
    `function isFlatListMode(q) {
  return searchTarget === 'title' || !!(q || activeMark || newOnly || activeTags.size > 0);
}`,
    `function isFlatListMode(q) {
  return searchTarget === 'title' || !!(q || activeMark || newOnly || activeTags.size > 0) || shouldUseFlatForAddedSort(searchTarget, sortMode);
}`,
  );

  html = html.replace(
    `  if (activeTags.size > 0) {
    filtered = filtered.filter(s => {
      const tags = (SONG_META[keyOf(s)] || {}).tags || [];
      return tags.some(id => activeTags.has(id));
    });
  }

  lastFiltered = filtered;`,
    `  if (activeTags.size > 0) {
    filtered = filtered.filter(s => {
      const tags = (SONG_META[keyOf(s)] || {}).tags || [];
      return tags.some(id => activeTags.has(id));
    });
  }

  filtered = applySortToFiltered(filtered);
  lastFiltered = filtered;`,
  );

  html = html.replace(
    `  const groups = [];
  let cur = null;
  for (const s of filtered) {
    if (!cur || cur.artist !== s.a) {
      cur = { artist: s.a, songs: [] };
      groups.push(cur);
    }
    cur.songs.push(s);
  }

  const MAX_GROUPS = 400;
  const shown = groups.slice(0, MAX_GROUPS);
  lastGroups = shown;

  if (isFlatListMode(q)) {
    resultsEl.innerHTML = \`<ul class="flat-song-list">\${filtered.map(s => flatSongRowHtml(s, q)).join('')}</ul>\`;
  } else {
    resultsEl.innerHTML = \`<div class="artist-accordion">\${shown.map((g, i) => artistAccordionHtml(g, q, i)).join('')}</div>\`;
  }

  if (groups.length > MAX_GROUPS) {`,
    `  const groups = [];
  let cur = null;
  for (const s of filtered) {
    if (!cur || cur.artist !== s.a) {
      cur = { artist: s.a, songs: [] };
      groups.push(cur);
    }
    cur.songs.push(s);
  }
  const sortedGroups = sortArtistGroups(groups, {
    sortMode: sortMode,
    getArtistY: function(s) { return s.y; },
  });

  const MAX_GROUPS = 400;
  const shown = sortedGroups.slice(0, MAX_GROUPS);
  lastGroups = shown;

  if (isFlatListMode(q)) {
    resultsEl.innerHTML = \`<ul class="flat-song-list">\${filtered.map(s => flatSongRowHtml(s, q)).join('')}</ul>\`;
  } else {
    resultsEl.innerHTML = \`<div class="artist-accordion">\${shown.map((g, i) => artistAccordionHtml(g, q, i)).join('')}</div>\`;
  }

  if (sortedGroups.length > MAX_GROUPS) {`,
  );

  html = html.replace(
    '    note.textContent = `他 ${groups.length - MAX_GROUPS} 組は絞り込みを続けると表示されます`;',
    '    note.textContent = `他 ${sortedGroups.length - MAX_GROUPS} 組は絞り込みを続けると表示されます`;',
  );

  if (!html.includes('initSortSelect();')) {
    html = html.replace(
      'document.querySelectorAll(\'.search-mode-tab\').forEach(tab => {',
      'initSortSelect();\ndocument.querySelectorAll(\'.search-mode-tab\').forEach(tab => {',
    );
  }

  fs.writeFileSync(path.join(ROOT, 'hiro.html'), html);
  console.log('Patched hiro.html sort UI');
}

patchIndexHtml();
patchHiroHtml();
