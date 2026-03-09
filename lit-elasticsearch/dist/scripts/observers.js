import { state, ROW_HEIGHT, SENTINEL_HEIGHT, updateRenderedBounds } from './state.js';
import { fetchPage } from './fetch.js';
import { renderResults, renderPagination } from './render.js';

let scrollObserver = null;
let pageObserver = null;
const sentinelRatios = new Map();

// root: null  →  uses the viewport (full-page scroll)
const observerRoot = null;

export function setupIntersectionObserver() {
  sentinelRatios.clear();

  if (scrollObserver) scrollObserver.disconnect();
  if (pageObserver) pageObserver.disconnect();

  // Triggers loading next/previous pages when sentinels enter viewport
  scrollObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const section = entry.target.closest('[data-page]');
        const pageNum = parseInt(section.dataset.page);

        if (
          entry.target.classList.contains('page-sentinel-bottom') &&
          pageNum === state.maxRenderedPage &&
          state.maxRenderedPage < state.totalPages &&
          !state.inFlight.has(state.maxRenderedPage + 1)
        ) {
          console.log(`[SCROLL DOWN] Page ${pageNum} bottom visible, loading next`);
          loadNextPage();
        }

        if (
          entry.target.classList.contains('page-sentinel-top') &&
          pageNum === state.minRenderedPage &&
          state.minRenderedPage > 1 &&
          !state.inFlight.has(state.minRenderedPage - 1)
        ) {
          console.log(`[SCROLL UP] Page ${pageNum} top visible, loading previous`);
          loadPreviousPage();
        }
      });
    },
    { root: observerRoot, threshold: 0 }
  );

  // Tracks which page is most visible → drives active page highlight in pagination
  pageObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        sentinelRatios.set(parseInt(entry.target.dataset.page), entry.intersectionRatio);
      });

      let maxRatio = -1;
      let activePage = null;
      sentinelRatios.forEach((ratio, page) => {
        if (ratio > maxRatio) { maxRatio = ratio; activePage = page; }
      });

      if (activePage !== null && activePage !== state.activePage) {
        console.log(`[ACTIVE PAGE] ${state.activePage} -> ${activePage}`);
        state.activePage = activePage;
        renderPagination();
        prefetchAdjacentPages(activePage);
      }
    },
    { root: observerRoot, threshold: [0, 0.25, 0.5, 0.75, 1.0] }
  );

  document.querySelectorAll('.page-sentinel-top, .page-sentinel-bottom')
    .forEach(s => scrollObserver.observe(s));

  document.querySelectorAll('.page-section')
    .forEach(s => pageObserver.observe(s));

  console.log(`[OBSERVER] Watching ${document.querySelectorAll('.page-sentinel-top, .page-sentinel-bottom').length} sentinels`);
}

export function disconnectObservers() {
  if (scrollObserver) scrollObserver.disconnect();
  if (pageObserver) pageObserver.disconnect();
  sentinelRatios.clear();
  console.log('[OBSERVER] Disconnected');
}

async function loadNextPage() {
  const next = state.maxRenderedPage + 1;
  if (next <= state.totalPages && !state.inFlight.has(next)) {
    try {
      await fetchPage(next);
      updateRenderedBounds(next);
      renderResults();
      setupIntersectionObserver();
    } catch (err) {
      console.error(`[LOAD NEXT] Error:`, err);
    }
  }
}

async function loadPreviousPage() {
  const prev = state.minRenderedPage - 1;
  if (prev >= 1 && !state.inFlight.has(prev)) {
    const oldScrollY = window.scrollY;
    try {
      await fetchPage(prev);
      updateRenderedBounds(prev);
      renderResults();
      setupIntersectionObserver();
      // Restore scroll position after prepending content
      // Approximate page height: pageSize rows + sentinel
      const pageHeight = state.pageSize * ROW_HEIGHT + SENTINEL_HEIGHT;
      window.scrollTo(0, oldScrollY + pageHeight);
    } catch (err) {
      console.error(`[LOAD PREV] Error:`, err);
    }
  }
}

function prefetchAdjacentPages(pageNum) {
  if (pageNum > 1 && !state.loadedPages.has(pageNum - 1) && !state.inFlight.has(pageNum - 1)) {
    fetchPage(pageNum - 1).catch(() => {});
  }
  if (pageNum < state.totalPages && !state.loadedPages.has(pageNum + 1) && !state.inFlight.has(pageNum + 1)) {
    fetchPage(pageNum + 1).catch(() => {});
  }
}
