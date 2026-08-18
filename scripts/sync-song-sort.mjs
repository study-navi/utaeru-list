#!/usr/bin/env node
/**
 * index.html / hiro.html の並び替え inject ブロックを最新版に同期
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songSortBrowserSnippet, songSortControlBrowserSnippet } from './lib/song-sort.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '// @song-sort-inject';
const END = '// @end-song-sort-inject';

const SORT_SNIPPET = songSortBrowserSnippet();
const INDEX_CONTROL = songSortControlBrowserSnippet({
  sourceListName: 'MASTER_SONGS',
  metaAccessor: '(songMeta[keyOf(s)] || {})',
  titleTyFn: 'return s.ty || \'\';',
  isEditor: true,
});
const HIRO_CONTROL = songSortControlBrowserSnippet({
  sourceListName: 'SONGS',
  metaAccessor: '(SONG_META[keyOf(s)] || {})',
  titleTyFn: `const tr = resolveTitleReading(s);
  return tr?.ty || '';`,
  isEditor: false,
});

function replaceInjectBlock(html, controlSnippet) {
  const block = `${START}
${SORT_SNIPPET}
${controlSnippet}
${END}`;
  const re = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (!re.test(html)) throw new Error('song-sort inject block not found');
  return html.replace(re, block);
}

function patchIndexRender(html) {
  html = html.replace(
    `  updateSortSelectState(filtered);
  const isSearchMode = !!q;
  const useFlatList = songListView === 'selected' || searchTarget === 'title' || (searchTarget === 'artist' && isSearchMode) || shouldUseFlatForAddedSort(searchTarget, sortMode);
  const displaySongs = applySortToFiltered(filtered);`,
    `  updateSortSelectState(filtered);
  const isSearchMode = !!q;
  const useFlatList = shouldUseFlatListMode({
    sortMode: sortMode,
    searchTarget: searchTarget,
    q: q,
    songListView: songListView,
    newOnly: false,
    activeMark: false,
    activeTagsSize: 0,
    catalogScope: catalogScope,
  }) || (searchTarget === 'artist' && isSearchMode);
  const displaySongs = applySortToFiltered(filtered);`,
  );

  html = html.replace(
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
    `  const sortedGroups = buildSortedArtistGroups(filtered);

  const MAX_GROUPS = 250;
  const shown = sortedGroups.slice(0, MAX_GROUPS);`,
  );

  html = html.replace(
    `function setSearchTarget(target) {
  if (target !== 'title' && target !== 'artist') return;
  searchTarget = target;
  activeKana = null;
  document.querySelectorAll('.search-mode-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  updateSongListChrome();
  render();
}`,
    `function setSearchTarget(target) {
  if (target !== 'title' && target !== 'artist') return;
  searchTarget = target;
  activeKana = null;
  document.querySelectorAll('.search-mode-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  applyDefaultSortForSearchTarget();
  updateSongListChrome();
  render();
}`,
  );

  return html;
}

function ensureHiroInitSort(html) {
  if (!html.includes('initSortSelect();\nrender();') && !html.includes('initSortSelect();\r\nrender();')) {
    html = html.replace(/\nrender\(\);\n<\/script>/, '\ninitSortSelect();\nrender();\n</script>');
  }
  return html;
}

function patchHiroRender(html) {
  html = html.replace(
    `function isFlatListMode(q) {
  return searchTarget === 'title' || !!(q || activeMark || newOnly || activeTags.size > 0 || catalogScope === 'new-batch') || shouldUseFlatForAddedSort(searchTarget, sortMode);
}`,
    `function isFlatListMode(q) {
  return shouldUseFlatListMode({
    sortMode: sortMode,
    searchTarget: searchTarget,
    q: q,
    songListView: null,
    newOnly: newOnly,
    activeMark: activeMark,
    activeTagsSize: activeTags.size,
    catalogScope: catalogScope,
  });
}`,
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
  const sortedGroups = sortArtistGroups(groups, {
    sortMode: sortMode,
    getArtistY: function(s) { return s.y; },
  });

  const MAX_GROUPS = 400;
  const shown = sortedGroups.slice(0, MAX_GROUPS);`,
    `  const sortedGroups = buildSortedArtistGroups(filtered);

  const MAX_GROUPS = 400;
  const shown = sortedGroups.slice(0, MAX_GROUPS);`,
  );

  html = html.replace(
    `function setSearchTarget(target) {
  if (target !== 'title' && target !== 'artist') return;
  searchTarget = target;
  activeKana = null;
  initSortSelect();
document.querySelectorAll('.search-mode-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  searchInput.placeholder = target === 'artist' ? 'アーティスト名を入力' : '曲名を入力';
  searchInput.setAttribute('aria-label', searchInput.placeholder);
  updateGyoSubRow();
  render();
}`,
    `function setSearchTarget(target) {
  if (target !== 'title' && target !== 'artist') return;
  searchTarget = target;
  activeKana = null;
  document.querySelectorAll('.search-mode-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  searchInput.placeholder = target === 'artist' ? 'アーティスト名を入力' : '曲名を入力';
  searchInput.setAttribute('aria-label', searchInput.placeholder);
  applyDefaultSortForSearchTarget();
  updateGyoSubRow();
  render();
}`,
  );

  return html;
}

function syncFile(name, controlSnippet, patchRender) {
  const filePath = path.join(ROOT, name);
  let html = fs.readFileSync(filePath, 'utf8');
  html = replaceInjectBlock(html, controlSnippet);
  html = patchRender(html);
  if (name === 'hiro.html') html = ensureHiroInitSort(html);
  fs.writeFileSync(filePath, html);
  console.log(`Synced song sort in ${name}`);
}

syncFile('index.html', INDEX_CONTROL, patchIndexRender);
syncFile('hiro.html', HIRO_CONTROL, patchHiroRender);
