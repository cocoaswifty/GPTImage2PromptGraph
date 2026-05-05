const DATA_URL = new URL("./data/cases.json", document.baseURI).toString();
const INDEX_URL = new URL("./index.json", document.baseURI).toString();
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 320;

const FIELD_WEIGHTS = {
  title: 6,
  tags: 5.5,
  category: 4.5,
  description: 2.5,
  prompt: 2,
};

const PHRASE_WEIGHTS = {
  title: 8,
  tags: 6,
  category: 5,
  description: 4,
  prompt: 3,
};

const state = {
  query: "",
  tags: new Set(),
  categories: new Set(),
  origins: new Set(),
  visibleCount: PAGE_SIZE,
  renderedCount: 0,
  selectedCaseId: null,
  dialogCaseId: null,
  resultIds: [],
  scoredResults: [],
  candidateCount: 0,
  appendFrame: 0,
};

const dom = {
  stats: document.querySelector("#stats"),
  searchInput: document.querySelector("#searchInput"),
  clearButton: document.querySelector("#clearButton"),
  randomButton: document.querySelector("#randomButton"),
  resultCount: document.querySelector("#resultCount"),
  resultSubcopy: document.querySelector("#resultSubcopy"),
  suggestedChips: document.querySelector("#suggestedChips"),
  filterGroups: document.querySelector("#filterGroups"),
  results: document.querySelector("#results"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  dialog: document.querySelector("#caseDialog"),
  dialogImage: document.querySelector("#dialogImage"),
  dialogMeta: document.querySelector("#dialogMeta"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogTags: document.querySelector("#dialogTags"),
  dialogPrompt: document.querySelector("#dialogPrompt"),
  openImageLink: document.querySelector("#openImageLink"),
  previousCaseButton: document.querySelector("#previousCaseButton"),
  nextCaseButton: document.querySelector("#nextCaseButton"),
  copyPromptButton: document.querySelector("#copyPromptButton"),
};

const cache = {
  cases: [],
  casesById: new Map(),
  index: null,
  counts: {
    tags: new Map(),
    categories: new Map(),
    origins: new Map(),
  },
  searchTokens: new Map(),
};

init().catch((error) => {
  console.error(error);
  dom.results.innerHTML = `<div class="empty-state">載入失敗：${escapeHtml(error.message || String(error))}</div>`;
  dom.resultCount.textContent = "載入失敗";
});

async function init() {
  const [casesPayload, indexPayload] = await Promise.all([fetchJson(DATA_URL), fetchJson(INDEX_URL).catch(() => null)]);
  cache.cases = Array.isArray(casesPayload?.cases) ? casesPayload.cases : [];
  cache.index = indexPayload;

  for (const item of cache.cases) {
    cache.casesById.set(item.id, item);
    incrementCount(cache.counts.tags, item.tags || []);
    incrementCount(cache.counts.categories, [item.category].filter(Boolean));
    incrementCount(cache.counts.origins, [item.origin_collection].filter(Boolean));
    cache.searchTokens.set(item.id, buildSearchIndex(item));
  }

  renderHeaderStats(casesPayload);
  renderFilterGroups();
  renderSuggestedChips();
  bindEvents();
  applyState({ resetSelection: true });
}

function bindEvents() {
  let searchTimer = 0;

  dom.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = dom.searchInput.value;
      state.visibleCount = PAGE_SIZE;
      applyState({ resetRendered: true });
    }, SEARCH_DEBOUNCE_MS);
  });

  if (dom.clearButton) {
    dom.clearButton.addEventListener("click", () => {
      window.clearTimeout(searchTimer);
      state.query = "";
      state.tags.clear();
      state.categories.clear();
      state.origins.clear();
      state.visibleCount = PAGE_SIZE;
      state.renderedCount = 0;
      dom.searchInput.value = "";
      syncChips();
      applyState({ resetSelection: true, resetRendered: true });
    });
  }

  if (dom.randomButton) {
    dom.randomButton.addEventListener("click", () => {
      if (!state.resultIds.length) {
        return;
      }
      const randomCaseId = state.resultIds[Math.floor(Math.random() * state.resultIds.length)];
      openCaseDialog(randomCaseId);
    });
  }

  dom.loadMoreButton?.addEventListener("click", () => {
    appendNextPage({ force: true });
  });

  dom.copyPromptButton?.addEventListener("click", async () => {
    const item = cache.casesById.get(state.selectedCaseId);
    if (!item) {
      return;
    }
    await navigator.clipboard.writeText(item.prompt || "");
    dom.copyPromptButton.textContent = "已複製";
    window.setTimeout(() => {
      dom.copyPromptButton.textContent = "複製 prompt";
    }, 1200);
  });

  dom.dialog?.addEventListener("close", () => {
    state.selectedCaseId = null;
    state.dialogCaseId = null;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== dom.searchInput) {
      event.preventDefault();
      dom.searchInput.focus();
    }
    if (event.key === "Escape" && dom.dialog?.open) {
      dom.dialog.close();
    }
    if (dom.dialog?.open && !isTextEditingTarget(event.target)) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openAdjacentCase(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        openAdjacentCase(1);
      }
    }
  });

  document.addEventListener("click", (event) => {
    const navButton = event.target instanceof HTMLElement ? event.target.closest("[data-dialog-nav]") : null;
    if (!navButton || navButton.disabled) {
      return;
    }

    openAdjacentCase(Number(navButton.dataset.dialogNav));
  });

  setupAutoLoad();
}

function renderHeaderStats(payload) {
  const total = payload?.count ?? cache.cases.length;
  const localImages = cache.cases.reduce((sum, item) => sum + (item.images?.length || 0), 0);
  const tagCount = cache.counts.tags.size;
  const categories = cache.counts.categories.size;
  const origins = cache.counts.origins.size;

  dom.stats.innerHTML = [
    statCard("Cases", total.toLocaleString(), "prompt cases ready for browsing"),
    statCard("Images", localImages.toLocaleString(), "local preview assets across the corpus"),
    statCard("Tags", tagCount.toLocaleString(), "indexed tag buckets"),
    statCard("Collections", `${origins}`, `${categories} categories across the corpus`),
  ].join("");
}

function statCard(label, value, caption) {
  return `
    <article class="stat-card">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(value)}</span>
      <span class="stat-caption">${escapeHtml(caption)}</span>
    </article>
  `;
}

function renderSuggestedChips() {
  const topTags = [...cache.counts.tags.entries()].sort(byCount).slice(0, 12);
  const topCategories = [...cache.counts.categories.entries()].sort(byCount).slice(0, 6);
  const topOrigins = [...cache.counts.origins.entries()].sort(byCount).slice(0, 4);
  const chips = [
    ...topTags.map(([label, count]) => chipButton(label, count, "tag")),
    ...topCategories.map(([label, count]) => chipButton(label, count, "category")),
    ...topOrigins.map(([label, count]) => chipButton(label, count, "origin")),
  ];
  dom.suggestedChips.innerHTML = chips.join("");
  dom.suggestedChips.querySelectorAll("[data-chip]").forEach((chip) => {
    chip.addEventListener("click", () => toggleChip(chip.dataset.group, chip.dataset.value));
  });
}

function renderFilterGroups() {
  const groups = [
    renderFilterGroup("Tags", "tag", [...cache.counts.tags.entries()].sort(byCount)),
    renderFilterGroup("Categories", "category", [...cache.counts.categories.entries()].sort(byCount)),
    renderFilterGroup("Collections", "origin", [...cache.counts.origins.entries()].sort(byCount)),
  ];
  dom.filterGroups.innerHTML = groups.join("");
  dom.filterGroups.querySelectorAll("[data-chip]").forEach((chip) => {
    chip.addEventListener("click", () => toggleChip(chip.dataset.group, chip.dataset.value));
  });
  syncChips();
}

function renderFilterGroup(title, group, entries) {
  const chips = entries
    .map(([label, count]) => chipButton(label, count, group))
    .join("");

  return `
    <section class="filter-group" data-group="${group}" data-od-id="filter-${escapeHtml(group)}">
      <div class="group-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="group-count">${entries.length}</span>
      </div>
      <div class="chip-list">${chips}</div>
    </section>
  `;
}

function chipButton(label, count, group) {
  return `
    <button class="chip" type="button" data-chip data-group="${escapeHtml(group)}" data-value="${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
      <span class="count">${count}</span>
    </button>
  `;
}

function toggleChip(group, value) {
  const target = getStateSet(group);
  if (target.has(value)) {
    target.delete(value);
  } else {
    target.add(value);
  }
  state.visibleCount = PAGE_SIZE;
  state.renderedCount = 0;
  syncChips();
  applyState({ resetRendered: true });
}

function syncChips() {
  const allChips = document.querySelectorAll("[data-chip]");
  allChips.forEach((chip) => {
    const active = getStateSet(chip.dataset.group).has(chip.dataset.value);
    chip.classList.toggle("active", active);
  });
}

function getStateSet(group) {
  if (group === "tag") {
    return state.tags;
  }
  if (group === "category") {
    return state.categories;
  }
  return state.origins;
}

function applyState({ resetSelection = false, resetRendered = false } = {}) {
  if (resetSelection) {
    state.selectedCaseId = null;
  }
  if (resetRendered) {
    state.renderedCount = 0;
    if (state.appendFrame) {
      window.cancelAnimationFrame(state.appendFrame);
      state.appendFrame = 0;
    }
  }

  const filtered = getFilteredCases();
  const scored = filtered
    .map((item) => ({ item, score: scoreCase(item) }))
    .filter(({ score }) => score > 0 || hasNoSearchContext())
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  state.scoredResults = scored;
  state.resultIds = scored.map(({ item }) => item.id);
  state.candidateCount = filtered.length;

  renderResults({ reset: resetRendered || state.renderedCount === 0 });
  updateMeta();

  if (!state.selectedCaseId && state.resultIds.length) {
    state.selectedCaseId = state.resultIds[0];
  }

  if (state.selectedCaseId) {
    const current = cache.casesById.get(state.selectedCaseId);
    if (current && !state.resultIds.includes(current.id) && state.resultIds.length) {
      state.selectedCaseId = state.resultIds[0];
    }
  }

  if (!state.resultIds.length) {
    state.selectedCaseId = null;
  }

  updateDialogNavigation();
  syncLoadMore(scored.length);
}

function getFilteredCases() {
  const queryTokens = tokenize(state.query);
  const filters = {
    tags: new Set(state.tags),
    categories: new Set(state.categories),
    origins: new Set(state.origins),
  };

  const candidates = collectCandidates(queryTokens, filters);
  const pool = candidates.size ? cache.cases.filter((item) => candidates.has(item.id)) : cache.cases.slice();

  return pool.filter((item) => {
    if (state.tags.size && !matchesAny(item.tags, state.tags)) {
      return false;
    }
    if (state.categories.size && !state.categories.has(item.category)) {
      return false;
    }
    if (state.origins.size && !state.origins.has(item.origin_collection)) {
      return false;
    }
    return true;
  });
}

function collectCandidates(queryTokens, filters) {
  const candidateIds = new Set();
  if (!cache.index) {
    return candidateIds;
  }

  addCandidatesFromBucket(candidateIds, "by_tag", new Set([...filters.tags, ...queryTokens]));
  addCandidatesFromBucket(candidateIds, "by_category", new Set([...filters.categories, ...queryTokens]));
  addCandidatesFromBucket(candidateIds, "by_origin_collection", filters.origins);
  return candidateIds;
}

function addCandidatesFromBucket(candidateIds, bucketName, needles) {
  const bucket = cache.index?.[bucketName];
  if (!bucket) {
    return;
  }
  for (const [key, values] of Object.entries(bucket)) {
    const normalized = normalizeKey(key);
    const keyTokens = tokenize(normalized);
    const matches = [...needles].some((needle) => keyTokens.has(needle) || normalized.includes(needle));
    if (matches) {
      values.forEach((id) => candidateIds.add(id));
    }
  }
}

function scoreCase(item) {
  const query = normalizeSpace(state.query.toLowerCase());
  const queryTokens = tokenize(query);
  const searchText = cache.searchTokens.get(item.id);
  if (queryTokens.size && searchText && ![...queryTokens].some((token) => searchText.includes(token)) && !searchText.includes(query)) {
    return 0;
  }
  let score = 0;

  score += scoreField(item.title, queryTokens, query, FIELD_WEIGHTS.title, PHRASE_WEIGHTS.title);
  score += scoreField((item.tags || []).join(" "), queryTokens, query, FIELD_WEIGHTS.tags, PHRASE_WEIGHTS.tags);
  score += scoreField(item.category || "", queryTokens, query, FIELD_WEIGHTS.category, PHRASE_WEIGHTS.category);
  score += scoreField(item.description || "", queryTokens, query, FIELD_WEIGHTS.description, PHRASE_WEIGHTS.description);
  score += scoreField(item.prompt || "", queryTokens, query, FIELD_WEIGHTS.prompt, PHRASE_WEIGHTS.prompt);

  if (state.tags.size) {
    score += 6 * countOverlap(new Set(item.tags || []), state.tags);
  }
  if (state.categories.size && state.categories.has(item.category)) {
    score += 4;
  }
  if (state.origins.size && state.origins.has(item.origin_collection)) {
    score += 5;
  }

  if (!queryTokens.size && !state.tags.size && !state.categories.size && !state.origins.size) {
    score += 1.5;
    score += Math.min(item.prompt_chars / 1000, 4) * 0.15;
    score += (item.tags?.length || 0) * 0.12;
  }

  if (searchText && !queryTokens.size && item.description) {
    score += 0.2;
  }

  if (item.images?.length) {
    score += 0.35;
  }

  return score;
}

function scoreField(fieldText, queryTokens, query, fieldWeight, phraseWeight) {
  if (!fieldText) {
    return 0;
  }

  const normalized = normalizeSpace(fieldText.toLowerCase());
  const counts = tokenCounts(normalized);
  const tokens = new Set(counts.keys());
  const overlap = [...queryTokens].filter((token) => tokens.has(token));

  if (!overlap.length && query && !normalized.includes(query)) {
    return 0;
  }

  let score = 0;
  for (const token of overlap) {
    const tf = counts.get(token) || 0;
    score += 1 + Math.min(tf, 3) * 0.65;
  }

  if (query && normalized.includes(query)) {
    score += phraseWeight;
  }

  if (queryTokens.size) {
    score += (overlap.length / queryTokens.size) * 2.5;
  }

  return score * fieldWeight;
}

function tokenCounts(text) {
  const counts = new Map();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) || 0) + countTokenOccurrences(text, token));
  }
  return counts;
}

function countTokenOccurrences(text, token) {
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(token)}(?:$|[^\\p{L}\\p{N}_])`, "giu");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function tokenize(text) {
  return new Set((text || "").match(/[\p{L}\p{N}_一-鿿]{2,}/gu) || []);
}

function countOverlap(left, right) {
  let total = 0;
  for (const item of right) {
    if (left.has(item)) {
      total += 1;
    }
  }
  return total;
}

function incrementCount(map, values) {
  for (const value of values) {
    map.set(value, (map.get(value) || 0) + 1);
  }
}

function matchesAny(values, selected) {
  return (values || []).some((value) => selected.has(value));
}

function hasNoSearchContext() {
  return !normalizeSpace(state.query).length && !state.tags.size && !state.categories.size && !state.origins.size;
}

function renderResults({ reset = false } = {}) {
  if (!state.scoredResults.length) {
    dom.results.innerHTML = `
      <div class="empty-state">
        <strong>沒有符合條件的案例。</strong>
        <div>試著清除篩選、放寬關鍵字，或先點上方快速入口。</div>
      </div>
    `;
    state.renderedCount = 0;
    return;
  }

  const selectedId = state.selectedCaseId || state.scoredResults[0].item.id;
  const start = reset ? 0 : state.renderedCount;
  const end = Math.min(state.visibleCount, state.scoredResults.length);
  const nextItems = state.scoredResults.slice(start, end);
  const cards = nextItems
    .map(({ item }, index) => renderCard(item, start + index === 0 && !state.selectedCaseId))
    .join("");
  if (reset) {
    dom.results.innerHTML = cards;
  } else if (cards) {
    dom.results.insertAdjacentHTML("beforeend", cards);
  }
  state.renderedCount = end;
  bindResultCards(reset ? dom.results : dom.results);
  if (selectedId) {
    state.selectedCaseId = selectedId;
  }
}

function bindResultCards(root) {
  root.querySelectorAll("[data-case-id]:not([data-bound])").forEach((card) => {
    card.dataset.bound = "true";
    card.addEventListener("click", () => openCaseDialog(card.dataset.caseId));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCaseDialog(card.dataset.caseId);
      }
    });
  });
}

function renderCard(item, isPrimary) {
  const imageUrl = resolveImage(item.images?.[0]);
  const excerpt = createExcerpt(item.prompt || item.description || "", 220);
  const tags = (item.tags || []).slice(0, 4).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("");
  return `
    <article class="case-card" data-case-id="${escapeHtml(item.id)}" tabindex="0" aria-label="${escapeHtml(item.title)}">
      <div class="thumb">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" fetchpriority="low" />
      </div>
      <div class="card-body">
        <div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-meta">
            <span>${escapeHtml(item.category)}</span>
            <span>·</span>
            <span>${escapeHtml(item.origin_collection)}</span>
            ${isPrimary ? `<span>· selected</span>` : ""}
          </div>
        </div>
        <p class="card-summary">${escapeHtml(excerpt)}</p>
        <div class="tag-row">${tags}</div>
        <div class="card-footer">
          <span>${item.prompt_chars.toLocaleString()} chars</span>
          <span>${(item.images || []).length} images</span>
        </div>
      </div>
    </article>
  `;
}

function updateMeta() {
  dom.resultCount.textContent = `${state.scoredResults.length.toLocaleString()} / ${cache.cases.length.toLocaleString()} 結果`;
  dom.resultSubcopy.textContent = `${state.candidateCount.toLocaleString()} 個候選池 · ${state.renderedCount.toLocaleString()} 顯示中`;
}

function syncLoadMore(total) {
  const shouldShow = total > state.renderedCount;
  if (!dom.loadMoreButton) {
    return;
  }
  dom.loadMoreButton.hidden = !shouldShow;
  if (shouldShow) {
    dom.loadMoreButton.textContent = `載入更多 (${Math.min(state.renderedCount + PAGE_SIZE, total)} / ${total})`;
  }
}

function appendNextPage({ force = false } = {}) {
  if (!state.scoredResults.length || state.renderedCount >= state.scoredResults.length) {
    return;
  }
  if (state.appendFrame) {
    if (!force) {
      return;
    }
    window.cancelAnimationFrame(state.appendFrame);
    state.appendFrame = 0;
  }

  const nextVisibleCount = Math.min(Math.max(state.visibleCount, state.renderedCount) + PAGE_SIZE, state.scoredResults.length);
  if (nextVisibleCount <= state.renderedCount) {
    return;
  }

  state.visibleCount = nextVisibleCount;

  state.appendFrame = window.requestAnimationFrame(() => {
    renderResults({ reset: false });
    updateMeta();
    syncLoadMore(state.scoredResults.length);
    state.appendFrame = 0;
  });
}

function setupAutoLoad() {
  if (!dom.loadMoreButton || !("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        appendNextPage();
      }
    },
    { rootMargin: "700px 0px" },
  );

  observer.observe(dom.loadMoreButton);
}

function openCaseDialog(caseId) {
  const item = cache.casesById.get(caseId);
  if (!item) {
    return;
  }

  state.selectedCaseId = item.id;
  state.dialogCaseId = item.id;
  const imageUrl = resolveImage(item.images?.[0]);

  dom.dialogImage.src = imageUrl;
  dom.dialogImage.alt = item.title;
  dom.dialogMeta.textContent = `${item.category} · ${item.origin_collection} · ${item.author || "Unknown author"}`;
  dom.dialogTitle.textContent = item.title;
  dom.dialogTags.innerHTML = (item.tags || []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("");
  dom.dialogPrompt.textContent = item.prompt || "";
  dom.openImageLink.href = imageUrl;

  if (dom.dialog && !dom.dialog.open) {
    dom.dialog.showModal();
  }
  if (dom.copyPromptButton) {
    dom.copyPromptButton.textContent = "複製 prompt";
  }
  updateDialogNavigation();
}

function openAdjacentCase(direction) {
  const currentId = state.dialogCaseId || state.selectedCaseId;
  const navigationIds = getNavigationIds();
  const currentIndex = navigationIds.indexOf(currentId);
  if (currentIndex === -1) {
    return;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= navigationIds.length) {
    return;
  }

  openCaseDialog(navigationIds[nextIndex]);
}

function updateDialogNavigation() {
  if (!dom.previousCaseButton || !dom.nextCaseButton) {
    return;
  }

  const currentId = state.dialogCaseId || state.selectedCaseId;
  const navigationIds = getNavigationIds();
  const currentIndex = navigationIds.indexOf(currentId);
  const hasCurrent = currentIndex !== -1;

  dom.previousCaseButton.disabled = !hasCurrent || currentIndex === 0;
  dom.nextCaseButton.disabled = !hasCurrent || currentIndex === navigationIds.length - 1;
}

function getNavigationIds() {
  if (state.resultIds.length) {
    return state.resultIds;
  }

  return [...document.querySelectorAll("[data-case-id]")]
    .map((card) => card.dataset.caseId)
    .filter(Boolean);
}

function isTextEditingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function createExcerpt(text, maxLength) {
  const normalized = normalizeSpace(text || "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function buildSearchIndex(item) {
  return normalizeSpace(
    [
      item.title,
      item.category,
      item.origin_collection,
      item.author,
      (item.tags || []).join(" "),
      item.description,
      item.prompt,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  );
}

function resolveImage(path) {
  if (!path) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(placeholderSvg());
  }
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) {
    return path;
  }
  return path.replace(/^prompt-graph\//, "");
}

function placeholderSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" style="background: Canvas; color: CanvasText;">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="Canvas" offset="0" />
          <stop stop-color="CanvasText" stop-opacity="0.08" offset="1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#g)" />
      <text x="80" y="150" fill="currentColor" font-family="Space Grotesk, sans-serif" font-size="64" font-weight="700">No preview image</text>
      <text x="80" y="240" fill="currentColor" fill-opacity="0.62" font-family="IBM Plex Sans TC, sans-serif" font-size="30">This case does not include a local image preview.</text>
    </svg>
  `;
}

function normalizeSpace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeKey(value) {
  return normalizeSpace(String(value || "").replace(/[-_]/g, " "));
}

function byCount(a, b) {
  return b[1] - a[1] || String(a[0]).localeCompare(String(b[0]));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  return response.json();
}
