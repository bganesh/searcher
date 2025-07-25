<script>
  import { onMount } from 'svelte';

  let searchInput = '';
  let currentPage = 1;
  let totalPages = 0;
  let results = [];
  let isLoading = false;
  let errorMessage = '';
  let indexes = [];
  let selectedIndex = '';
  const PAGE_SIZE = 10;

  onMount(async () => {
    try {
      const response = await fetch('http://localhost:9200/_cat/indices?format=json');
      if (!response.ok) {
        throw new Error('Failed to fetch indices');
      }
      const allIndices = await response.json();
      // Filter out system indices (starting with .) and sort
      indexes = ['*', ...allIndices
        .filter(index => !index.index.startsWith('.'))
        .map(index => index.index)
        .sort()];
      
      if (indexes.length > 0) {
        selectedIndex = indexes[0];
      }
    } catch (error) {
      console.error('Error fetching indices:', error);
      errorMessage = 'Failed to load indices. Please check if Elasticsearch is running.';
    }
  });

  async function performSearch(resetPage = false) {
    if (!searchInput.trim()) {
      errorMessage = 'Please enter a search term';
      return;
    }

    if (resetPage) {
      currentPage = 1;
    }
    
    isLoading = true;
    errorMessage = '';
    const searchTerms = parseSearchInput(searchInput);
    
    try {
      const response = await fetch(`http://localhost:9200/${selectedIndex}/_search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: (currentPage - 1) * PAGE_SIZE,
          size: PAGE_SIZE,
          query: {
            bool: {
              must: [
                ...searchTerms.phrases.map(phrase => ({
                  match_phrase: {
                    content: {
                      query: phrase,
                    }
                  }
                })),
                ...searchTerms.terms.map(term => ({
                  match: {
                    content: {
                      query: term,
                    }
                  }
                }))
              ]
            }
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
        })
      });

      if (!response.ok) {
        throw new Error(`Elasticsearch error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.hits) {
        throw new Error('Invalid response format from Elasticsearch');
      }

      results = data.hits.hits;
      totalPages = Math.ceil(data.hits.total.value / PAGE_SIZE);
      
      if (results.length === 0) {
        errorMessage = 'No results found';
      }
    } catch (error) {
      console.error('Search error:', error);
      errorMessage = `Search failed: ${error.message}. Make sure Elasticsearch is running and the index exists.`;
      results = [];
      totalPages = 0;
    } finally {
      isLoading = false;
    }
  }

  function handleSearch() {
    performSearch(true);
  }

  function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      performSearch(false);
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

  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      handleSearch();
    }
  }
</script>

<main>
  <div class="search-container">
    <select bind:value={selectedIndex} disabled={indexes.length === 0}>
      {#each indexes as index}
        <option value={index}>{index}</option>
      {/each}
    </select>
    <input
      type="text"
      bind:value={searchInput}
      on:keypress={handleKeyPress}
      placeholder='Enter search terms (use quotes for phrases, e.g. "exact phrase" keyword1 keyword2)'
    />
    <button on:click={handleSearch} disabled={isLoading}>
      {isLoading ? 'Searching...' : 'Search'}
    </button>
  </div>

  {#if errorMessage}
    <div class="error-message">
      {errorMessage}
    </div>
  {/if}

  {#if isLoading}
    <div class="loading">Loading...</div>
  {:else if results.length > 0}
    <div class="results">
      {#each results as result}
        <div class="result-card">
          <div class="result-title">
            <a href="http://localhost:3144/{result._source.filepath}" target="_blank" rel="noopener noreferrer">
              {result._source.filename}
            </a>
          </div>
          {#each result.highlight?.content || [] as snippet}
            <p>
              {@html snippet}
            </p>
          {/each}
        </div>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <button
          on:click={() => changePage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button
          on:click={() => changePage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .search-container {
    margin-bottom: 20px;
    display: flex;
    gap: 10px;
  }

  select {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 16px;
    min-width: 200px;  /* Minimum width to accommodate longer names */
    max-width: 300px;  /* Maximum width to prevent the dropdown from getting too wide */
    text-overflow: ellipsis; /* Show ... for truncated text */
  }
  
  /* Style for dropdown options to show full text */
  select option {
    min-width: 100%;
    white-space: normal; /* Allow text wrapping in options */
    word-wrap: break-word;
  }

  input {
    flex: 1;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 16px;
  }

  .error-message {
    color: #d32f2f;
    padding: 10px;
    margin-bottom: 20px;
    background-color: #ffebee;
    border-radius: 4px;
  }

  .loading {
    text-align: center;
    padding: 20px;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .result-card {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 15px;
  }

  .result-card h3 {
    margin: 0 0 10px 0;
    font-weight: bold;
  }

  .result-card p {
    margin: 0 0 10px 0;
    line-height: 1.4;
  }

  .pagination {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
  }

  button {
    padding: 8px 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  button:disabled {
    background: #f0f0f0;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    background: #f0f0f0;
  }

  :global(mark) {
    background-color: yellow;
    padding: 0 2px;
  }
</style>