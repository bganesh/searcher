import { fetchIndices } from './fetch.js';
import { renderAll } from './render.js';
import { setupIntersectionObserver } from './observers.js';

async function init() {
  await fetchIndices();
  renderAll();
  // Observer is set up by navigateToPage after first search;
  // calling here is a no-op (no sentinels yet) but harmless.
}

init();
