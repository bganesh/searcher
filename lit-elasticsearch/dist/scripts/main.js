import { fetchIndices } from './fetch.js';
import { renderAll } from './render.js';

async function init() {
  await fetchIndices();
  renderAll();
}

init();
