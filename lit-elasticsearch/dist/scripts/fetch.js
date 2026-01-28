import { state, ELASTIC_URL, PAGE_SIZE } from './state.js';

export async function fetchIndices() {
  try {
    const response = await fetch(`${ELASTIC_URL}/_cat/indices?format=json`);
    if (!response.ok) {
      throw new Error('Failed to fetch indices');
    }
    const allIndices = await response.json();
    state.indexes = ['*', ...allIndices
      .filter(index => !index.index.startsWith('.'))
      .map(index => index.index)
      .sort()];
    
    if (state.indexes.length > 0) {
      state.selectedIndex = state.indexes[0];
    }
  } catch (error) {
    console.error('Error fetching indices:', error);
    state.errorMessage = 'Failed to load indices. Please check if Elasticsearch is running.';
    throw error;
  }
}

export async function performSearch() {
  if (!state.searchInput.trim() && !state.tagsInput.trim()) {
    state.errorMessage = 'Please enter a search term or tag';
    return;
  }

  state.isLoading = true;
  state.errorMessage = '';
  
  try {
    const mustClauses = [];
    const filterClauses = [];
    
    // Handle regular search
    if (state.searchInput.trim()) {
      const searchTerms = parseSearchInput(state.searchInput);
      
      searchTerms.phrases.forEach(phrase => {
        mustClauses.push({
          match_phrase: {
            content: { query: phrase }
          }
        });
      });
      
      searchTerms.terms.forEach(term => {
        mustClauses.push({
          match: {
            content: { query: term }
          }
        });
      });
    }
    
    // Handle tags search
    if (state.tagsInput.trim()) {
      const tags = state.tagsInput.trim().split(/,/).map(t => t.trim());
      const tagField = state.exactTags ? 'coded_tags' : 'coded_tags_normalized';
      
      const searchTags = state.exactTags 
        ? tags 
        : tags.map(tag => tag.replace(/[+\/]/g, ''));
      
      filterClauses.push({
        terms_set: {
          [tagField]: {
            terms: searchTags,
            minimum_should_match_script: {
              source: "params.num_terms"
            }
          }
        }
      });
    }
    
    const queryBody = {
      from: (state.currentPage - 1) * PAGE_SIZE,
      size: PAGE_SIZE,
      query: {
        bool: {}
      },
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

    // Add must clauses if they exist
    if (mustClauses.length > 0) {
      queryBody.query.bool.must = mustClauses;
    }

    // Add filter clauses if they exist
    if (filterClauses.length > 0) {
      queryBody.query.bool.filter = filterClauses;
    }

    // If no clauses at all, match all
    if (mustClauses.length === 0 && filterClauses.length === 0) {
      queryBody.query = { match_all: {} };
    }
    
    const response = await fetch(`${ELASTIC_URL}/${state.selectedIndex}/_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody)
    });

    if (!response.ok) {
      throw new Error(`Elasticsearch error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.hits) {
      throw new Error('Invalid response format from Elasticsearch');
    }

    state.results = data.hits.hits;
    state.totalPages = Math.ceil(data.hits.total.value / PAGE_SIZE);
    
    if (state.results.length === 0) {
      state.errorMessage = 'No results found';
    }
  } catch (error) {
    console.error('Search error:', error);
    state.errorMessage = `Search failed: ${error.message}. Make sure Elasticsearch is running and the index exists.`;
    state.results = [];
    state.totalPages = 0;
  } finally {
    state.isLoading = false;
  }
}

function parseSearchInput(input) {
  const phrases = [];
  const terms = [];
  let currentPhrase = '';
  let inQuotes = false;

  input.split('').forEach(char => {
    if (char === '"') {
      inQuotes = !inQuotes;
      if (!inQuotes && currentPhrase) {
        phrases.push(currentPhrase.trim());
        currentPhrase = '';
      }
    } else if (inQuotes) {
      currentPhrase += char;
    } else if (char === ' ' && !inQuotes) {
      if (currentPhrase) {
        terms.push(currentPhrase.trim());
        currentPhrase = '';
      }
    } else {
      currentPhrase += char;
    }
  });

  if (currentPhrase) {
    if (inQuotes) {
      phrases.push(currentPhrase.trim());
    } else {
      terms.push(currentPhrase.trim());
    }
  }

  return { phrases, terms };
}
