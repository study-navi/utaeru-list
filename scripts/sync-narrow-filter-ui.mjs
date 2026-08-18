#!/usr/bin/env node
/**
 * 検索・絞り込みUIをコンパクト化（新着+ジャンル統合、すべてボタン廃止）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NARROW_FILTER_CSS = `
  .narrow-filter-block {
    margin: 0;
    padding-top: 0;
  }
  .narrow-filter-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 0 0 6px 2px;
    letter-spacing: 0.04em;
  }
  .narrow-filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    overflow: visible;
  }
  .narrow-filter-row .chip {
    flex: 1 1 calc(25% - 5px);
    min-width: calc(33.333% - 4px);
    min-height: 36px;
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 999px;
    justify-content: center;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--grid);
    color: var(--text-secondary);
    box-sizing: border-box;
  }
  .narrow-filter-row .chip.active {
    background: var(--accent-wash);
    border-color: var(--accent);
    color: var(--accent);
  }
  @media (max-width: 360px) {
    .narrow-filter-row .chip {
      flex: 1 1 calc(33.333% - 4px);
      min-width: calc(33.333% - 4px);
      font-size: 11px;
      padding: 6px 6px;
    }
  }
  @media (min-width: 430px) {
    .narrow-filter-row .chip {
      flex: 0 1 auto;
      min-width: 0;
    }
  }`;

const COMPACT_SEARCH_CSS = `
  .search-bar {
    padding: 6px 0 8px;
    margin-bottom: 4px;
  }
  .search-shell {
    padding: 8px;
    border-radius: 12px;
  }
  .search-mode-segment {
    margin: 0 0 8px;
  }
  .sort-control-row {
    margin: 0 0 6px;
  }`;

const NARROW_FILTER_JS = `
const NARROW_FILTER_OPTIONS = [
  { kind: 'catalog', value: 'new-batch', label: '新着' },
  { kind: 'genre', value: 'J-POP', label: 'J-POP' },
  { kind: 'genre', value: 'アニソン', label: 'アニソン' },
  { kind: 'genre', value: 'ボカロ', label: 'ボカロ' },
  { kind: 'genre', value: '洋楽', label: '洋楽' },
  { kind: 'genre', value: '演歌', label: '演歌' },
  { kind: 'genre', value: 'その他', label: 'その他' },
];
const GENRE_FILTER_OPTIONS = [
  { value: 'J-POP', label: 'J-POP' },
  { value: 'アニソン', label: 'アニソン' },
  { value: 'ボカロ', label: 'ボカロ' },
  { value: '洋楽', label: '洋楽' },
  { value: '演歌', label: '演歌' },
  { value: 'その他', label: 'その他' },
];
const narrowFilterRow = document.getElementById('narrowFilterRow');
function refreshNarrowFilterChips() {
  if (!narrowFilterRow) return;
  [...narrowFilterRow.children].forEach(function(chip) {
    const kind = chip.dataset.filterKind;
    const value = chip.dataset.filterValue;
    let active = false;
    if (kind === 'catalog') active = catalogScope === value;
    else if (kind === 'genre') active = activeGenre === value;
    chip.classList.toggle('active', active);
  });
}
function toggleCatalogNewBatch() {
  catalogScope = catalogScope === 'new-batch' ? 'all' : 'new-batch';
  refreshNarrowFilterChips();
  render();
}
function toggleGenreFilter(value) {
  activeGenre = activeGenre === value ? null : value;
  refreshNarrowFilterChips();
  render();
}
function setGenre(value) {
  activeGenre = value;
  refreshNarrowFilterChips();
  render();
}
if (narrowFilterRow) {
  NARROW_FILTER_OPTIONS.forEach(function(opt) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = opt.label;
    chip.dataset.filterKind = opt.kind;
    chip.dataset.filterValue = opt.value;
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    const activate = function() {
      if (opt.kind === 'catalog') toggleCatalogNewBatch();
      else toggleGenreFilter(opt.value);
    };
    chip.addEventListener('click', activate);
    chip.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    narrowFilterRow.appendChild(chip);
  });
}`;

function stripOldFilterCss(html) {
  return html
    .replace(/  \.catalog-filter-row \{[\s\S]*?  \}\n/g, '')
    .replace(/  \.catalog-filter-row \.chip \{[\s\S]*?  \}\n/g, '')
    .replace(/  \.genre-filter-row \{[\s\S]*?  \}\n/g, '')
    .replace(/  @media \(min-width: 430px\) \{\n    \.genre-filter-row \{[\s\S]*?  \}\n  \}\n/g, '')
    .replace(/  \.genre-filter-row \.chip \{[\s\S]*?  \}\n/g, '')
    .replace(/  @media \(max-width: 360px\) \{\n    \.genre-filter-row \.chip \{[\s\S]*?  \}\n  \}\n/g, '');
}

function injectNarrowCss(html) {
  html = stripOldFilterCss(html);
  if (!html.includes('.narrow-filter-row')) {
    html = html.replace('  .search-bar {', NARROW_FILTER_CSS + COMPACT_SEARCH_CSS + '\n  .search-bar {');
  }
  // index editor uses different search block — inject near genre-filter or catalog
  if (html.includes('  .catalog-filter-row {') && !html.includes('.narrow-filter-row')) {
    html = html.replace('  .catalog-filter-row {', NARROW_FILTER_CSS + '\n  .catalog-filter-row {');
  }
  return html;
}

function replaceFilterJs(html) {
  // Remove old catalog row init + genre row init block
  const oldBlock = /let catalogScope = 'all';\nlet activeGenre = null;\nconst CATALOG_FILTER_OPTIONS = \[[\s\S]*?genreFilterRow\.appendChild\(chip\);\n\}\);\n/;
  if (!oldBlock.test(html)) throw new Error('filter JS block not found');
  html = html.replace(oldBlock, `let catalogScope = 'all';
let activeGenre = null;
function songMatchesCatalogFilter(s) {
  if (catalogScope !== 'new-batch') return true;
  return isCurrentNewBatchSong(s);
}
function songMatchesGenreFilter(s) {
  if (!activeGenre) return true;
  return lookupSongGenres(s).includes(activeGenre);
}
${NARROW_FILTER_JS}
`);
  // index.html uses getSongGenres instead of lookupSongGenres
  html = html.replace('return lookupSongGenres(s).includes(activeGenre);', 'return getSongGenres(s).includes(activeGenre);');
  // Remove duplicate songMatchesCatalogFilter/songMatchesGenreFilter if existed before block
  html = html.replace(/function songMatchesCatalogFilter\(s\) \{[\s\S]*?\}\nfunction songMatchesGenreFilter\(s\) \{[\s\S]*?\}\n(?=const NARROW_FILTER)/, '');
  return html;
}

function patchHiroHtml(html) {
  html = injectNarrowCss(html);
  html = html.replace(
    `      <div class="sort-control-row">
        <label class="sort-control-label" for="sortSelect">並び替え</label>
        <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
      </div>
    </div>
  </div>

  <div class="catalog-filter-row filter-row" id="catalogFilterRow" role="group" aria-label="カタログ"></div>
  <div class="genre-filter-row filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>`,
    `      <div class="sort-control-row">
        <label class="sort-control-label" for="sortSelect">並び替え</label>
        <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
      </div>
      <div class="narrow-filter-block">
        <div class="narrow-filter-label">絞り込み</div>
        <div class="narrow-filter-row" id="narrowFilterRow" role="group" aria-label="絞り込み"></div>
      </div>
    </div>
  </div>`,
  );
  // hiro has lookupSongGenres in songMatchesGenreFilter - fix replaceFilterJs for hiro
  html = replaceFilterJs(html);
  html = html.replace('return getSongGenres(s).includes(activeGenre);', 'return lookupSongGenres(s).includes(activeGenre);');
  // Remove duplicate GENRE_FILTER_OPTIONS and songMatches if still present before narrow block
  html = html.replace(/const GENRE_FILTER_OPTIONS = \[\n  \{ value: null, label: 'すべて' \},[\s\S]*?\];\nfunction songMatchesGenreFilter\(s\) \{[\s\S]*?\}\n/g, '');
  html = html.replace(/const genreFilterRow = document\.getElementById\('genreFilterRow'\);\nfunction setGenre[\s\S]*?genreFilterRow\.appendChild\(chip\);\n\}\);\n/g, '');
  html = html.replace(/const catalogFilterRow = document\.getElementById\('catalogFilterRow'\);\nfunction setCatalogScope[\s\S]*?catalogFilterRow\.appendChild\(chip\);\n  \}\);\n\}\n/g, '');
  html = html.replace(/const CATALOG_FILTER_OPTIONS = \[[\s\S]*?\];\nfunction songMatchesCatalogFilter\(s\) \{[\s\S]*?\}\n/g, '');
  return html;
}

function patchIndexHtml(html) {
  html = injectNarrowCss(html);
  // Reorder: search -> gyo -> sort -> narrow filter
  html = html.replace(
    `      <div class="ui-section-soft song-filter-block song-sort-block">
        <div class="sort-control-row">
          <label class="sort-control-label" for="sortSelect">並び替え</label>
          <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
        </div>
      </div>
      <div class="ui-section-soft song-filter-block song-genre-block" id="genreFilterBlock">
        <div class="catalog-filter-row" id="catalogFilterRow" role="group" aria-label="カタログ"></div>
        <div class="genre-filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>
      </div>
      <div class="ui-section-soft song-filter-block" id="gyoFilterBlock">
        <div class="gyo-row" id="gyoRow"></div>
        <div class="gyo-row gyo-sub-row" id="gyoSubRow" hidden aria-label="五十音 1文字"></div>
      </div>`,
    `      <div class="ui-section-soft song-filter-block" id="gyoFilterBlock">
        <div class="gyo-row" id="gyoRow"></div>
        <div class="gyo-row gyo-sub-row" id="gyoSubRow" hidden aria-label="五十音 1文字"></div>
      </div>
      <div class="ui-section-soft song-filter-block song-sort-block">
        <div class="sort-control-row">
          <label class="sort-control-label" for="sortSelect">並び替え</label>
          <select class="sort-control-select" id="sortSelect" aria-label="並び替え"></select>
        </div>
      </div>
      <div class="ui-section-soft song-filter-block song-narrow-filter-block" id="narrowFilterBlock">
        <div class="narrow-filter-label">絞り込み</div>
        <div class="narrow-filter-row" id="narrowFilterRow" role="group" aria-label="絞り込み"></div>
      </div>`,
  );
  html = replaceFilterJs(html);
  html = html.replace(/const GENRE_FILTER_OPTIONS = \[\n  \{ value: null, label: 'すべて' \},[\s\S]*?\];\nfunction songMatchesGenreFilter\(s\) \{[\s\S]*?\}\n/g, '');
  html = html.replace(/const genreFilterRow = document\.getElementById\('genreFilterRow'\);\nfunction setGenre[\s\S]*?genreFilterRow\.appendChild\(chip\);\n\}\);\n/g, '');
  html = html.replace(/const catalogFilterRow = document\.getElementById\('catalogFilterRow'\);\nfunction setCatalogScope[\s\S]*?catalogFilterRow\.appendChild\(chip\);\n  \}\);\n\}\n/g, '');
  html = html.replace(/const CATALOG_FILTER_OPTIONS = \[[\s\S]*?\];\nfunction songMatchesCatalogFilter\(s\) \{[\s\S]*?\}\n/g, '');
  return html;
}

function sync() {
  const hiroPath = path.join(ROOT, 'hiro.html');
  const indexPath = path.join(ROOT, 'index.html');
  let hiro = fs.readFileSync(hiroPath, 'utf8');
  let index = fs.readFileSync(indexPath, 'utf8');
  hiro = patchHiroHtml(hiro);
  index = patchIndexHtml(index);
  fs.writeFileSync(hiroPath, hiro);
  fs.writeFileSync(indexPath, index);
  console.log('Patched hiro.html and index.html narrow filter UI');
}

sync();
