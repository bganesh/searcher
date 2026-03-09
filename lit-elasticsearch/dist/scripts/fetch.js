import { state, ELASTIC_URL, PAGE_SIZE, calculateTotalPages, calculateOffset } from './state.js';

// ── Existing: fetch available indices ───────────────────────
export async function fetchIndices() {
  try {
    const response = await fetch(`${ELASTIC_URL}/_cat/indices?format=json`);
    if (!response.ok) throw new Error('Failed to fetch indices');
    const allIndices = await response.json();
    state.indexes = ['*', ...allIndices
      .filter(index => !index.index.startsWith('.'))
      .map(index => index.index)
      .sort()];
    if (state.indexes.length > 0) state.selectedIndex = state.indexes[0];
  } catch (error) {
    console.error('Error fetching indices:', error);
    state.errorMessage = 'Failed to load indices. Please check if Elasticsearch is running.';
    throw error;
  }
}

// ── Shared: build the bool query from current state inputs ───
function buildQueryBody(from, size) {
  const mustClauses = [];
  const filterClauses = [];

  if (state.searchInput.trim()) {
    const searchTerms = parseSearchInput(state.searchInput);
    searchTerms.phrases.forEach(phrase => {
      mustClauses.push({ match_phrase: { content: { query: phrase } } });
    });
    searchTerms.terms.forEach(term => {
      mustClauses.push({ match: { content: { query: term } } });
    });
  }

  if (state.tagsInput.trim()) {
    const tags = state.tagsInput.trim().split(/,/).map(t => t.trim());
    const tagField = state.exactTags ? 'coded_tags' : 'coded_tags_normalized';
    const searchTags = state.exactTags ? tags : tags.map(tag => tag.replace(/[+\/]/g, ''));
    filterClauses.push({
      terms_set: {
        [tagField]: {
          terms: searchTags,
          minimum_should_match_script: { source: 'params.num_terms' }
        }
      }
    });
  }

  const queryBody = {
    from,
    size,
    query: { bool: {} },
    highlight: {
      fields: {
        content: {
          fragment_size: 150,
          number_of_fragments: 3,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>']
        }
      }
    }
  };

  if (mustClauses.length > 0) queryBody.query.bool.must = mustClauses;
  if (filterClauses.length > 0) queryBody.query.bool.filter = filterClauses;
  if (mustClauses.length === 0 && filterClauses.length === 0) queryBody.query = { match_all: {} };

  return queryBody;
}

// ── New: fetch a single page by index (with caching) ────────
export async function fetchPage(pageIndex) {
  if (state.totalPages !== null && (pageIndex < 1 || pageIndex > state.totalPages)) return null;

  if (state.loadedPages.has(pageIndex)) return state.loadedPages.get(pageIndex);
  if (state.inFlight.has(pageIndex)) return state.inFlight.get(pageIndex);

  const from = calculateOffset(pageIndex, state.pageSize);
  const size = state.pageSize;
  const queryBody = buildQueryBody(from, size);

  console.log(`[FETCH] Page ${pageIndex} (from=${from}, size=${size})`);

  const fetchPromise = fetch(`${ELASTIC_URL}/${state.selectedIndex}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody)
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const totalHits = data.hits.total.value;

      if (state.totalHits === null) {
        state.totalHits = totalHits;
        state.totalPages = calculateTotalPages(totalHits, state.pageSize);
        console.log(`[FETCH] Total hits: ${totalHits}, pages: ${state.totalPages}`);
      }

      // Keep raw hits so renderResults can use the existing card template
      const pageData = { page: pageIndex, hits: data.hits.hits };
      state.loadedPages.set(pageIndex, pageData);

      if (state.minLoadedPage === null || pageIndex < state.minLoadedPage) state.minLoadedPage = pageIndex;
      if (state.maxLoadedPage === null || pageIndex > state.maxLoadedPage) state.maxLoadedPage = pageIndex;

      state.inFlight.delete(pageIndex);
      return pageData;
    })
    .catch(err => {
      console.error(`[FETCH] Error page ${pageIndex}:`, err);
      state.inFlight.delete(pageIndex);
      throw err;
    });

  state.inFlight.set(pageIndex, fetchPromise);
  return fetchPromise;
}

// ── Existing: kept for reference / unused after migration ───
// (performSearch is no longer called directly; navigateToPage
//  uses fetchPage instead. Kept so nothing breaks if imported.)
export async function performSearch() {
  if (!state.searchInput.trim() && !state.tagsInput.trim()) {
    state.errorMessage = 'Please enter a search term or tag';
    return;
  }
  state.isLoading = true;
  state.errorMessage = '';
  try {
    const queryBody = buildQueryBody((state.activePage - 1) * PAGE_SIZE, PAGE_SIZE);
    const response = await fetch(`${ELASTIC_URL}/${state.selectedIndex}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody)
    });
    if (!response.ok) throw new Error(`Elasticsearch error: ${response.status} ${response.statusText}`);
    const data = await response.json();
    if (!data.hits) throw new Error('Invalid response format from Elasticsearch');
    if (data.hits.hits.length === 0) state.errorMessage = 'No results found';
  } catch (error) {
    console.error('Search error:', error);
    state.errorMessage = `Search failed: ${error.message}. Make sure Elasticsearch is running and the index exists.`;
  } finally {
    state.isLoading = false;
  }
}

// ── Shared parser (unchanged) ────────────────────────────────
function parseSearchInput(input) {
  const phrases = [];
  const terms = [];
  let currentPhrase = '';
  let inQuotes = false;

  input.split('').forEach(char => {
    if (char === '"') {
      inQuotes = !inQuotes;
      if (!inQuotes && currentPhrase) { phrases.push(currentPhrase.trim()); currentPhrase = ''; }
    } else if (inQuotes) {
      currentPhrase += char;
    } else if (char === ' ' && !inQuotes) {
      if (currentPhrase) { terms.push(currentPhrase.trim()); currentPhrase = ''; }
    } else {
      currentPhrase += char;
    }
  });

  if (currentPhrase) {
    if (inQuotes) phrases.push(currentPhrase.trim());
    else terms.push(currentPhrase.trim());
  }

  return { phrases, terms };
}
