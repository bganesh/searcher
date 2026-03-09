export const ELASTIC_URL = 'http://localhost:9200';
export const PAGE_SIZE = 10;

export const ROW_HEIGHT = 82;
export const SENTINEL_HEIGHT = 1;

export const state = {
  // Form inputs
  searchInput: '',
  tagsInput: '',
  exactTags: false,
  selectedIndex: '',

  // Available indices
  indexes: [],

  // UI state
  isLoading: false,
  errorMessage: '',

  // Paging
  totalHits: null,
  totalPages: null,
  activePage: null,
  pageSize: PAGE_SIZE,

  // Fetched-page cache
  loadedPages: new Map(),
  inFlight: new Map(),
  minLoadedPage: null,
  maxLoadedPage: null,

  // Pages actually in the DOM
  renderedPages: new Set(),
  minRenderedPage: null,
  maxRenderedPage: null,
};

export function calculateTotalPages(totalHits, pageSize) {
  return Math.max(1, Math.ceil(totalHits / pageSize));
}

export function calculateOffset(pageIndex, pageSize) {
  return (pageIndex - 1) * pageSize;
}

export function updateRenderedBounds(pageIndex) {
  state.renderedPages.add(pageIndex);
  if (state.minRenderedPage === null || pageIndex < state.minRenderedPage) state.minRenderedPage = pageIndex;
  if (state.maxRenderedPage === null || pageIndex > state.maxRenderedPage) state.maxRenderedPage = pageIndex;
  console.log(`[RENDERED BOUNDS] Page ${pageIndex} added. Range: [${state.minRenderedPage}, ${state.maxRenderedPage}]`);
}

export function clearRenderedState() {
  state.renderedPages.clear();
  state.minRenderedPage = null;
  state.maxRenderedPage = null;
  console.log('[RENDERED BOUNDS] Cleared');
}

export function clearCache() {
  state.loadedPages.clear();
  state.inFlight.clear();
  state.minLoadedPage = null;
  state.maxLoadedPage = null;
  state.renderedPages.clear();
  state.minRenderedPage = null;
  state.maxRenderedPage = null;
  state.totalHits = null;
  state.totalPages = null;
  state.activePage = null;
  console.log('[CACHE] Cleared');
}
