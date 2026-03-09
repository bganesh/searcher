import { state, clearCache, clearRenderedState, updateRenderedBounds } from './state.js';
import { fetchPage } from './fetch.js';
import { renderAll, renderResults, renderPagination } from './render.js';
import { setupIntersectionObserver, disconnectObservers } from './observers.js';

// ── Core navigation: jump to a specific page ─────────────────
export async function navigateToPage(pageIndex) {
  console.log(`[NAVIGATE] Jumping to page ${pageIndex}`);

  disconnectObservers();
  window.scrollTo(0, 0);

  // Clear only loaded/rendered state; keep form inputs and index list
  state.loadedPages.clear();
  state.inFlight.clear();
  state.minLoadedPage = null;
  state.maxLoadedPage = null;
  clearRenderedState();

  state.activePage = pageIndex;
  state.isLoading = true;
  state.errorMessage = '';
  renderAll(); // show loading state immediately

  try {
    await fetchPage(pageIndex);
    updateRenderedBounds(pageIndex);
    state.isLoading = false;
    renderAll();
    setupIntersectionObserver();
  } catch (err) {
    console.error(`[NAVIGATE] Error:`, err);
    state.isLoading = false;
    state.errorMessage = `Search failed: ${err.message}`;
    renderAll();
  }
}

// ── Called when user hits Search button or Enter ─────────────
export async function handleSearch() {
  if (!state.searchInput.trim() && !state.tagsInput.trim()) {
    state.errorMessage = 'Please enter a search term or tag';
    renderAll();
    return;
  }
  clearCache();
  await navigateToPage(1);
}

// ── Existing handlers (kept for compatibility) ───────────────
export async function handlePageChange(newPage) {
  if (newPage >= 1 && (state.totalPages === null || newPage <= state.totalPages)) {
    await navigateToPage(newPage);
  }
}

export async function handleIndexChange() {
  if (state.searchInput.trim() || state.tagsInput.trim()) {
    clearCache();
    await navigateToPage(1);
  }
}

export async function handleExactTagsChange() {
  if (state.searchInput.trim() || state.tagsInput.trim()) {
    clearCache();
    await navigateToPage(1);
  }
}
