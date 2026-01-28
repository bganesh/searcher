import { state } from './state.js';
import { performSearch } from './fetch.js';
import { renderAll } from './render.js';

export async function handleSearch() {
  state.currentPage = 1;
  await performSearch();
  renderAll();
}

export async function handlePageChange(newPage) {
  if (newPage >= 1 && newPage <= state.totalPages) {
    state.currentPage = newPage;
    await performSearch();
    renderAll();
    window.scrollTo(0, 0);
  }
}

export async function handleIndexChange() {
  await handleSearch();
}

export async function handleExactTagsChange() {
  await handleSearch();
}
