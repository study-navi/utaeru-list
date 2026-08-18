#!/usr/bin/env node
/**
 * index.html / hiro.html に検索モード UI + フィルタロジックを適用
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEGMENT_CSS = `
  .search-mode-segment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin: 0 0 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--page);
  }
  .search-mode-tab {
    min-height: 44px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    cursor: pointer;
    color: var(--text-secondary);
    text-align: center;
  }
  .search-mode-tab + .search-mode-tab {
    border-left: 1px solid var(--border);
  }
  .search-mode-tab.active {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }
  .flat-title-primary {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.35;
  }
  .flat-artist-sub {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.35;
  }`;

function patchIndexHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  if (!html.includes('.search-mode-segment')) {
    html = html.replace(
      '  .search-target-tabs {',
      SEGMENT_CSS + '\n  .search-target-tabs {',
    );
    html = html.replace(
      `<div class="search-target-tabs" role="tablist" aria-label="検索対象">
          <button type="button" class="search-target-tab active" id="searchTargetTitle" data-target="title" aria-selected="true">曲名</button>
          <button type="button" class="search-target-tab" id="searchTargetArtist" data-target="artist" aria-selected="false">アーティスト</button>
        </div>`,
      `<div class="search-mode-segment" role="tablist" aria-label="検索モード">
          <button type="button" class="search-mode-tab" id="searchTargetTitle" data-target="title" aria-selected="false">曲名から探す</button>
          <button type="button" class="search-mode-tab active" id="searchTargetArtist" data-target="artist" aria-selected="true">アーティストから探す</button>
        </div>`,
    );
  }

  html = html.replace(
    "let searchTarget = 'title';",
    "let searchTarget = 'artist';",
  );

  html = html.replace(
    `function shouldShowArtistGyoFilters() {
  return songListView === 'all' && searchTarget === 'artist';
}
function kanaHeadsForActiveGyo(gyoLabel) {
  const heads = new Set();
  for (const s of MASTER_SONGS) {
    if (gyoOf(s.k) === gyoLabel) heads.add(s.k);
  }
  return [...heads].sort((a, b) => a.localeCompare(b, 'ja'));
}
// v1.0: 曲名読みフィールドは未実装。将来 ty/tk 等を追加する場合は matchesTitleSearch を拡張する。
function matchesTitleSearch(s, nq) {
  return norm(s.t).includes(nq);
}`,
    `function shouldShowGyoFilters() {
  return songListView === 'all';
}
function shouldShowArtistGyoFilters() {
  return shouldShowGyoFilters() && searchTarget === 'artist';
}
function kanaHeadsForActiveGyo(gyoLabel) {
  const heads = new Set();
  for (const s of MASTER_SONGS) {
    const head = searchTarget === 'title' ? s.tk : s.k;
    if (!head) continue;
    if (gyoOf(head) === gyoLabel) heads.add(head);
  }
  return [...heads].sort((a, b) => a.localeCompare(b, 'ja'));
}
function matchesTitleSearch(s, nq) {
  return norm(s.t).includes(nq) || (s.ty && norm(s.ty).includes(nq));
}`,
  );

  html = html.replace(
    `  const gyoFilterBlock = document.getElementById('gyoFilterBlock');
  if (gyoFilterBlock) gyoFilterBlock.hidden = !showArtistGyo;
  if (gyoRow) gyoRow.style.display = showArtistGyo ? '' : 'none';
  if (gyoSubRow && !showArtistGyo) gyoSubRow.hidden = true;
  if (showArtistGyo) updateGyoSubRow();`,
    `  const gyoFilterBlock = document.getElementById('gyoFilterBlock');
  const showGyo = shouldShowGyoFilters();
  if (gyoFilterBlock) gyoFilterBlock.hidden = !showGyo;
  if (gyoRow) gyoRow.style.display = showGyo ? '' : 'none';
  if (gyoSubRow) {
    if (!showGyo || !activeGyo) gyoSubRow.hidden = true;
    else updateGyoSubRow();
  }`,
  );

  html = html.replace(
    `      ? (searchTarget === 'artist' ? '選択中のアーティストを検索' : '選択中の曲名を検索')
      : (searchTarget === 'artist' ? 'アーティスト名を入力して検索' : '曲名を入力して検索');`,
    `      ? (searchTarget === 'artist' ? '選択中のアーティスト名を入力' : '選択中の曲名を入力')
      : (searchTarget === 'artist' ? 'アーティスト名を入力' : '曲名を入力');`,
  );

  html = html.replace(
    `      ? (searchTarget === 'artist'
        ? '選択済みの曲のうち、アーティスト名で絞り込めます。'
        : '選択済みの曲のうち、曲名で絞り込めます。')
      : (searchTarget === 'artist'
        ? 'アーティスト名または読み（ひらがな）で絞り込めます。五十音フィルターと組み合わせもできます。'
        : '曲名で絞り込めます。');`,
    `      ? (searchTarget === 'artist'
        ? '選択済みの曲のうち、アーティスト名で絞り込めます。'
        : '選択済みの曲のうち、曲名で絞り込めます。')
      : (searchTarget === 'artist'
        ? 'アーティスト名または読み（ひらがな）で絞り込めます。五十音と組み合わせもできます。'
        : '曲名または曲名の読みで絞り込めます。五十音と組み合わせもできます。');`,
  );

  html = html.replace(
    `  document.querySelectorAll('.search-target-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });`,
    `  document.querySelectorAll('.search-mode-tab').forEach(tab => {
    const active = tab.dataset.target === target;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });`,
  );

  html = html.replace(
    `  document.querySelectorAll('.search-target-tab').forEach(tab => {`,
    `  document.querySelectorAll('.search-mode-tab').forEach(tab => {`,
  );

  html = html.replace(
    `  if (shouldShowArtistGyoFilters() && activeGyo) {
    filtered = filtered.filter(s => gyoOf(s.k) === activeGyo);
    if (activeKana) filtered = filtered.filter(s => norm(s.k) === norm(activeKana));
  }`,
    `  if (shouldShowGyoFilters() && activeGyo) {
    if (searchTarget === 'title') {
      filtered = filtered.filter(s => s.tk && gyoOf(s.tk) === activeGyo);
      if (activeKana) filtered = filtered.filter(s => norm(s.tk) === norm(activeKana));
    } else {
      filtered = filtered.filter(s => gyoOf(s.k) === activeGyo);
      if (activeKana) filtered = filtered.filter(s => norm(s.k) === norm(activeKana));
    }
  }`,
  );

  html = html.replace(
    `function flatSongItemHtml(s, q) {
  const key = keyOf(s);
  const meta = songMeta[key];
  const expanded = expandedKeys.has(key);
  const tappable = songListView !== 'selected' ? ' is-tappable' : '';
  return \`
    <li class="song-item" data-key="\${escapeHtml(key)}">
      <div class="song-row\${tappable}">
        <input type="checkbox" class="song-check" id="sc-\${s.id}" data-key="\${escapeHtml(key)}" \${selectedKeys.has(key) ? 'checked' : ''} />
        <div class="song-row-main">
          <span class="flat-artist">\${highlightFor('artist', s.a, q)}</span><span class="flat-sep"> — </span>
          <label for="sc-\${s.id}" class="song-label">\${highlightFor('title', s.t, q)}</label>
          <span class="song-badges">\${badgesHtml(meta)}</span>
        </div>
        \${songRowActionsHtml(key, expanded)}
      </div>
      \${expanded ? songPanelHtml(s) : ''}
    </li>\`;
}`,
    `function flatSongItemHtml(s, q) {
  const key = keyOf(s);
  const meta = songMeta[key];
  const expanded = expandedKeys.has(key);
  const tappable = songListView !== 'selected' ? ' is-tappable' : '';
  const titleFirst = searchTarget === 'title' && songListView !== 'selected';
  const mainHtml = titleFirst
    ? \`<label for="sc-\${s.id}" class="song-label"><span class="flat-title-primary">\${highlightFor('title', s.t, q)}</span><span class="flat-artist-sub">\${highlightFor('artist', s.a, q)}</span></label>\`
    : \`<span class="flat-artist">\${highlightFor('artist', s.a, q)}</span><span class="flat-sep"> — </span><label for="sc-\${s.id}" class="song-label">\${highlightFor('title', s.t, q)}</label>\`;
  return \`
    <li class="song-item" data-key="\${escapeHtml(key)}">
      <div class="song-row\${tappable}">
        <input type="checkbox" class="song-check" id="sc-\${s.id}" data-key="\${escapeHtml(key)}" \${selectedKeys.has(key) ? 'checked' : ''} />
        <div class="song-row-main">
          \${mainHtml}
          <span class="song-badges">\${badgesHtml(meta)}</span>
        </div>
        \${songRowActionsHtml(key, expanded)}
      </div>
      \${expanded ? songPanelHtml(s) : ''}
    </li>\`;
}`,
  );

  html = html.replace(
    `  const isSearchMode = !!q;
  const useFlatList = isSearchMode || songListView === 'selected';`,
    `  const isSearchMode = !!q;
  const useFlatList = songListView === 'selected' || searchTarget === 'title' || (searchTarget === 'artist' && isSearchMode);`,
  );

  html = html.replace(
    `  if (!gyoSubRow) return;
  gyoSubRow.innerHTML = '';
  if (!shouldShowArtistGyoFilters() || !activeGyo) {
    gyoSubRow.hidden = true;
    return;
  }`,
    `  if (!gyoSubRow) return;
  gyoSubRow.innerHTML = '';
  if (!shouldShowGyoFilters() || !activeGyo) {
    gyoSubRow.hidden = true;
    return;
  }`,
  );

  html = html.replace(
    `const songsForExport = selectedSongs.map(s => ({ k: s.k, y: s.y, a: s.a, t: s.t }));`,
    `const songsForExport = selectedSongs.map(s => ({ k: s.k, y: s.y, a: s.a, t: s.t, ty: s.ty, tk: s.tk }));`,
  );
  html = html.replace(
    `  const songs = selectedSongs.map(s => ({ k: s.k, y: s.y, a: s.a, t: s.t }));`,
    `  const songs = selectedSongs.map(s => ({ k: s.k, y: s.y, a: s.a, t: s.t, ty: s.ty, tk: s.tk }));`,
  );

  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log('Patched index.html search mode');
}

function patchHiroHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'hiro.html'), 'utf8');

  if (!html.includes('// @title-reading-lookup-inject')) {
    html = html.replace(
      '// @end-genre-lookup-inject',
      `// @end-genre-lookup-inject
// @title-reading-lookup-inject
const TITLE_READING_LOOKUP = {};
// @end-title-reading-lookup-inject`,
    );
  }

  if (!html.includes('.search-mode-segment')) {
    html = html.replace(
      '  .search-label {',
      SEGMENT_CSS.replace(/var\(--page\)/g, 'var(--surface)').replace(/var\(--border\)/g, 'var(--grid)') + '\n  .search-label {',
    );
    html = html.replace(
      `<label class="search-label" for="searchInput">曲名・アーティスト名で検索</label>
      <div class="search-input-row">
        <input type="search" id="searchInput" placeholder="例：Story / AI" autocomplete="off" />
        <button class="clear-btn" id="clearBtn" aria-label="検索をクリア">✕</button>
      </div>
      <div class="gyo-row" id="gyoRow"></div>`,
      `<div class="search-mode-segment" role="tablist" aria-label="検索モード">
        <button type="button" class="search-mode-tab" id="searchTargetTitle" data-target="title" aria-selected="false">曲名から探す</button>
        <button type="button" class="search-mode-tab active" id="searchTargetArtist" data-target="artist" aria-selected="true">アーティストから探す</button>
      </div>
      <label class="search-label" for="searchInput">検索</label>
      <div class="search-input-row">
        <input type="search" id="searchInput" placeholder="アーティスト名を入力" autocomplete="off" />
        <button class="clear-btn" id="clearBtn" aria-label="検索をクリア">✕</button>
      </div>
      <div class="gyo-row" id="gyoRow"></div>
      <div class="gyo-row gyo-sub-row" id="gyoSubRow" hidden aria-label="五十音 1文字"></div>`,
    );
  }

  if (!html.includes('let searchTarget')) {
    html = html.replace(
      'const gyoRow = document.getElementById(\'gyoRow\');',
      `const gyoSubRow = document.getElementById('gyoSubRow');
const gyoRow = document.getElementById('gyoRow');
let searchTarget = 'artist';
let activeKana = null;

function resolveTitleReading(s) {
  if (s.ty) return { ty: s.ty, tk: s.tk || s.ty[0] };
  const hit = TITLE_READING_LOOKUP[keyOf(s)];
  return hit || null;
}
function shouldShowGyoSubRow() {
  return !!activeGyo;
}
function updateGyoSubRow() {
  if (!gyoSubRow) return;
  gyoSubRow.innerHTML = '';
  if (!shouldShowGyoSubRow()) {
    gyoSubRow.hidden = true;
    return;
  }
  gyoSubRow.hidden = false;
  const allSubChip = document.createElement('div');
  allSubChip.className = 'chip' + (activeKana ? '' : ' active');
  allSubChip.textContent = 'すべて';
  allSubChip.addEventListener('click', () => setKana(null));
  gyoSubRow.appendChild(allSubChip);
  const heads = new Set();
  for (const s of SONGS) {
    const head = searchTarget === 'title' ? (resolveTitleReading(s)?.tk || null) : s.k;
    if (!head) continue;
    if (gyoOf(head) === activeGyo) heads.add(head);
  }
  [...heads].sort((a, b) => a.localeCompare(b, 'ja')).forEach(ch => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeKana === ch ? ' active' : '');
    chip.textContent = ch;
    chip.addEventListener('click', () => setKana(ch));
    gyoSubRow.appendChild(chip);
  });
}
function setKana(char) {
  activeKana = char;
  updateGyoSubRow();
  render();
}
function setSearchTarget(target) {
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
  updateGyoSubRow();
  render();
}
document.querySelectorAll('.search-mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target;
    if (target && target !== searchTarget) setSearchTarget(target);
  });
});`,
    );
  }

  html = html.replace(
    `function setGyo(label) {
  activeGyo = label;
  [...gyoRow.children].forEach(c => c.classList.remove('active'));
  const idx = label ? GYO.findIndex(g => g.label === label) + 1 : 0;
  gyoRow.children[idx].classList.add('active');
  render();
}`,
    `function setGyo(label) {
  activeGyo = label;
  activeKana = null;
  [...gyoRow.children].forEach(c => c.classList.remove('active'));
  const idx = label ? GYO.findIndex(g => g.label === label) + 1 : 0;
  gyoRow.children[idx].classList.add('active');
  updateGyoSubRow();
  render();
}`,
  );

  html = html.replace(
    `  if (activeGyo) {
    filtered = filtered.filter(s => gyoOf(s.k) === activeGyo);
  }
  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }
  if (q) {
    const nq = norm(q);
    filtered = filtered.filter(s => norm(s.t).includes(nq) || norm(s.a).includes(nq) || norm(s.y).includes(nq));
  }`,
    `  if (activeGyo) {
    if (searchTarget === 'title') {
      filtered = filtered.filter(s => {
        const tr = resolveTitleReading(s);
        return tr?.tk && gyoOf(tr.tk) === activeGyo;
      });
      if (activeKana) {
        filtered = filtered.filter(s => {
          const tr = resolveTitleReading(s);
          return tr?.tk && norm(tr.tk) === norm(activeKana);
        });
      }
    } else {
      filtered = filtered.filter(s => gyoOf(s.k) === activeGyo);
      if (activeKana) filtered = filtered.filter(s => norm(s.k) === norm(activeKana));
    }
  }
  if (activeGenre) {
    filtered = filtered.filter(s => songMatchesGenreFilter(s));
  }
  if (q) {
    const nq = norm(q);
    filtered = filtered.filter(s => {
      if (searchTarget === 'artist') {
        return norm(s.a).includes(nq) || norm(s.y).includes(nq);
      }
      const tr = resolveTitleReading(s);
      return norm(s.t).includes(nq) || (tr?.ty && norm(tr.ty).includes(nq));
    });
  }`,
  );

  html = html.replace(
    `function isFlatListMode(q) {
  return !!(q || activeMark || newOnly || activeTags.size > 0);
}`,
    `function isFlatListMode(q) {
  return searchTarget === 'title' || !!(q || activeMark || newOnly || activeTags.size > 0);
}`,
  );

  html = html.replace(
    `function flatSongRowHtml(s, q) {
  const meta = SONG_META[keyOf(s)] || {};
  const badges = [];
  if (isNewArrival(meta.addedAt)) badges.push(\`<span class="v-badge" title="新着">🆕</span>\`);
  const tagObjs = Array.isArray(meta.tags)
    ? meta.tags.map(id => TAG_PRESETS.find(t => t.id === id)).filter(Boolean)
    : [];
  const shownTags = tagObjs.slice(0, 2);
  const restCount = tagObjs.length - shownTags.length;
  const tagsHtml = tagObjs.length
    ? \`<div class="v-tag-row">\${shownTags.map(t => \`<span class="v-tag">\${escapeHtml(t.label)}</span>\`).join('')}\${restCount > 0 ? \`<span class="v-tag v-tag-more">+\${restCount}</span>\` : ''}</div>\`
    : '';
  return \`
    <li class="flat-song-item">
      <div class="song-main-row">
        <span class="song-title">\${highlight(s.t, q)}</span>
        \${badges.length ? \`<span class="v-badges">\${badges.join('')}</span>\` : ''}
      </div>
      <div class="flat-song-artist">\${highlight(s.a, q)}</div>
      \${marksRowHtml(meta)}
      \${tagsHtml}
    </li>\`;
}`,
    `function flatSongRowHtml(s, q) {
  const meta = SONG_META[keyOf(s)] || {};
  const badges = [];
  if (isNewArrival(meta.addedAt)) badges.push(\`<span class="v-badge" title="新着">🆕</span>\`);
  const tagObjs = Array.isArray(meta.tags)
    ? meta.tags.map(id => TAG_PRESETS.find(t => t.id === id)).filter(Boolean)
    : [];
  const shownTags = tagObjs.slice(0, 2);
  const restCount = tagObjs.length - shownTags.length;
  const tagsHtml = tagObjs.length
    ? \`<div class="v-tag-row">\${shownTags.map(t => \`<span class="v-tag">\${escapeHtml(t.label)}</span>\`).join('')}\${restCount > 0 ? \`<span class="v-tag v-tag-more">+\${restCount}</span>\` : ''}</div>\`
    : '';
  const titleLine = searchTarget === 'title'
    ? \`<span class="flat-title-primary">\${highlight(s.t, searchTarget === 'title' ? q : '')}</span><span class="flat-artist-sub">\${highlight(s.a, '')}</span>\`
    : \`<span class="song-title">\${highlight(s.t, q)}</span>\`;
  const artistLine = searchTarget === 'title' ? '' : \`<div class="flat-song-artist">\${highlight(s.a, q)}</div>\`;
  return \`
    <li class="flat-song-item">
      <div class="song-main-row">
        \${titleLine}
        \${badges.length ? \`<span class="v-badges">\${badges.join('')}</span>\` : ''}
      </div>
      \${artistLine}
      \${marksRowHtml(meta)}
      \${tagsHtml}
    </li>\`;
}`,
  );

  html = html.replace(
    `  if (activeGyo) parts.push(\`\${activeGyo}行\`);`,
    `  if (activeGyo) parts.push(\`\${activeGyo}行\${activeKana ? '・' + activeKana : ''}\`);
  if (searchTarget === 'title') parts.unshift('曲名');
  else if (searchTarget === 'artist') parts.unshift('アーティスト');`,
  );

  fs.writeFileSync(path.join(ROOT, 'hiro.html'), html);
  console.log('Patched hiro.html search mode');
}

patchIndexHtml();
patchHiroHtml();
