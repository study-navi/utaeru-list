#!/usr/bin/env node
/**
 * 新着バッチ UI + フィルタ + バッジ表示を index.html / hiro.html に適用
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG_CSS = `
  .catalog-filter-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 6px;
    margin: 0 0 6px;
    padding: 0 2px;
  }
  .catalog-filter-row .chip {
    min-height: 44px;
    justify-content: center;
    border-radius: 10px;
    font-size: 13px;
    padding: 8px 4px;
    width: 100%;
  }
  .v-badge-utaemo-new {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.02em;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--accent-wash);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .song-badge-utaemo-new {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.02em;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--accent-wash, var(--surface-2));
    color: var(--accent);
    border: 1px solid var(--accent);
  }`;

function patchIndexHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (html.includes('catalogFilterRow')) {
    console.log('index.html new-batch UI already present');
    return;
  }

  if (!html.includes('.catalog-filter-row')) {
    html = html.replace('  .genre-filter-row {', CATALOG_CSS + '\n  .genre-filter-row {');
  }

  html = html.replace(
    `      <div class="ui-section-soft song-filter-block song-genre-block" id="genreFilterBlock">
        <div class="genre-filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>
      </div>`,
    `      <div class="ui-section-soft song-filter-block song-genre-block" id="genreFilterBlock">
        <div class="catalog-filter-row" id="catalogFilterRow" role="group" aria-label="カタログ"></div>
        <div class="genre-filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>
      </div>`,
  );

  html = html.replace(
    'let activeGenre = null;',
    `let catalogScope = 'all';
let activeGenre = null;
const CATALOG_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'new-batch', label: '新着' },
];
function songMatchesCatalogFilter(s) {
  if (catalogScope !== 'new-batch') return true;
  return isCurrentNewBatchSong(s);
}
const catalogFilterRow = document.getElementById('catalogFilterRow');
function setCatalogScope(value) {
  catalogScope = value;
  if (catalogFilterRow) {
    [...catalogFilterRow.children].forEach((c, i) => {
      c.classList.toggle('active', CATALOG_FILTER_OPTIONS[i].value === value);
    });
  }
  render();
}
if (catalogFilterRow) {
  CATALOG_FILTER_OPTIONS.forEach(({ value, label }) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (value === 'all' ? ' active' : '');
    chip.textContent = label;
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.addEventListener('click', () => setCatalogScope(value));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCatalogScope(value); }
    });
    catalogFilterRow.appendChild(chip);
  });
}`,
  );

  html = html.replace(
    `  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }`,
    `  if (catalogScope === 'new-batch') {
    filtered = filtered.filter(s => songMatchesCatalogFilter(s));
  }
  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }`,
  );

  html = html.replace(
    'function badgesHtml(meta) {',
    `function utaemoNewBadgeHtml(s) {
  if (!isCurrentNewBatchSong(s)) return '';
  return '<span class="song-badge song-badge-utaemo-new" title="UTAEMO新着">NEW</span>';
}
function badgesHtml(meta) {`,
  );

  html = html.replace(
    '  if (meta.addedAt) parts.push(`<span class="song-badge" title="追加日 ${escapeHtml(meta.addedAt)}">📅</span>`);',
    '  if (meta.addedAt) parts.push(`<span class="song-badge" title="リストへ追加 ${escapeHtml(meta.addedAt)}">📅</span>`);',
  );

  // song row badges - add NEW after badgesHtml call sites
  html = html.replace(
    '<span class="song-badges">${badgesHtml(meta)}</span>',
    '<span class="song-badges">${utaemoNewBadgeHtml(s)}${badgesHtml(meta)}</span>',
  );

  html = html.replace(
    "if (previewIsNewArrival(meta.addedAt)) badges.push('<span class=\"pv-badge\" title=\"新着\">🆕</span>');",
    "if (isCurrentNewBatchSong(s)) badges.push('<span class=\"pv-badge v-badge-utaemo-new\" title=\"UTAEMO新着\">NEW</span>');\n  if (previewIsNewArrival(meta.addedAt)) badges.push('<span class=\"pv-badge\" title=\"リスト追加から30日以内\">🆕</span>');",
  );

  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log('Patched index.html new-batch UI');
}

function patchHiroHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');
  if (html.includes('catalogFilterRow')) {
    console.log('hiro.html new-batch UI already present');
    return;
  }

  if (!html.includes('.catalog-filter-row')) {
    html = html.replace('  .genre-filter-row {', CATALOG_CSS + '\n  .genre-filter-row {');
  }

  html = html.replace(
    `  <div class="genre-filter-row filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>`,
    `  <div class="catalog-filter-row filter-row" id="catalogFilterRow" role="group" aria-label="カタログ"></div>
  <div class="genre-filter-row filter-row" id="genreFilterRow" role="group" aria-label="ジャンル"></div>`,
  );

  html = html.replace(
    'let activeGenre = null;',
    `let catalogScope = 'all';
let activeGenre = null;
const CATALOG_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'new-batch', label: '新着' },
];
function songMatchesCatalogFilter(s) {
  if (catalogScope !== 'new-batch') return true;
  return isCurrentNewBatchSong(s);
}
const catalogFilterRow = document.getElementById('catalogFilterRow');
function setCatalogScope(value) {
  catalogScope = value;
  if (catalogFilterRow) {
    [...catalogFilterRow.children].forEach((c, i) => {
      c.classList.toggle('active', CATALOG_FILTER_OPTIONS[i].value === value);
    });
  }
  render();
}
if (catalogFilterRow) {
  CATALOG_FILTER_OPTIONS.forEach(({ value, label }) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (value === 'all' ? ' active' : '');
    chip.textContent = label;
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.addEventListener('click', () => setCatalogScope(value));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCatalogScope(value); }
    });
    catalogFilterRow.appendChild(chip);
  });
}`,
  );

  html = html.replace(
    `  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }`,
    `  if (catalogScope === 'new-batch') {
    filtered = filtered.filter(s => songMatchesCatalogFilter(s));
  }
  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }`,
  );

  html = html.replace(
    "newChip.textContent = '🆕 新着';",
    "newChip.textContent = '🆕 最近追加';",
  );

  html = html.replace(
    "if (newOnly) parts.push('🆕 新着');",
    "if (newOnly) parts.push('🆕 最近追加');",
  );

  html = html.replace(
    'if (isNewArrival(meta.addedAt)) badges.push(`<span class="v-badge" title="新着">🆕</span>`);',
    'if (isCurrentNewBatchSong(s)) badges.push(`<span class="v-badge v-badge-utaemo-new" title="UTAEMO新着">NEW</span>`);\n  if (isNewArrival(meta.addedAt)) badges.push(`<span class="v-badge" title="リスト追加から30日以内">🆕</span>`);',
    // replace_all for both flat and accordion badge locations
  );

  html = html.replace(
    'return searchTarget === \'title\' || !!(q || activeMark || newOnly || activeTags.size > 0) || shouldUseFlatForAddedSort(searchTarget, sortMode);',
    'return searchTarget === \'title\' || !!(q || activeMark || newOnly || activeTags.size > 0 || catalogScope === \'new-batch\') || shouldUseFlatForAddedSort(searchTarget, sortMode);',
  );

  html = html.replace(
    `function updateFilterSummary() {
  const parts = [];
  if (activeGenre) parts.push(activeGenre);`,
    `function updateFilterSummary() {
  const parts = [];
  if (catalogScope === 'new-batch') parts.push('新着');
  if (activeGenre) parts.push(activeGenre);`,
  );

  fs.writeFileSync(path.join(ROOT, 'hiro.html'), html);
  console.log('Patched hiro.html new-batch UI');
}

patchIndexHtml();
patchHiroHtml();
