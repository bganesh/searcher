import { html, render } from '../lib/lit-html.js';
import { state } from './state.js';
import { handleSearch, handlePageChange, handleIndexChange, handleExactTagsChange } from './navigation.js';

export function renderAll() {
  renderSearchControls();
  renderResults();
  renderPagination();
}

function renderSearchControls() {
  const template = html`
    <div class="search-container">
      <select 
        .value=${state.selectedIndex}
        @change=${(e) => {
          state.selectedIndex = e.target.value;
          handleIndexChange();
        }}
        ?disabled=${state.indexes.length === 0}
      >
        ${state.indexes.map(index => html`
          <option value=${String(index)}>${index}</option>
        `)}
      </select>
      <input
        type="text"
        .value=${state.searchInput}
        @input=${(e) => { state.searchInput = e.target.value; }}
        @keypress=${(e) => { if (e.key === 'Enter') handleSearch(); }}
        placeholder="Enter search terms (use quotes for phrases)"
      />
      <button 
        @click=${handleSearch}
        ?disabled=${state.isLoading}
      >
        ${state.isLoading ? 'Searching...' : 'Search'}
      </button>
    </div>

    <div class="tags-container">
      <input
        type="text"
        .value=${state.tagsInput}
        @input=${(e) => { state.tagsInput = e.target.value; }}
        @keypress=${(e) => { if (e.key === 'Enter') handleSearch(); }}
        placeholder="Enter tags (space-separated, e.g., PQ/q Pp)"
      />
      <label>
        <input 
          type="checkbox"
          .checked=${state.exactTags}
          @change=${(e) => {
            state.exactTags = e.target.checked;
            handleExactTagsChange();
          }}
        />
        Exact tags
      </label>
    </div>
  `;
  
  render(template, document.getElementById('search-controls'));
}

function renderResults() {
  let template;
  
  if (state.errorMessage) {
    template = html`
      <div class="error-message">
        ${state.errorMessage}
      </div>
    `;
  } else if (state.isLoading) {
    template = html`
      <div class="loading">Loading...</div>
    `;
  } else if (state.results.length > 0) {
    template = html`
      <div class="results">
        ${state.results.map(result => html`
          <div class="result-card">
            <div class="result-title">
              <a 
                href=${'http://localhost:3144/' + result._source.filepath}
                target="_blank"
                rel="noopener noreferrer"
              >
                ${result._source.filename}
              </a>
            </div>
            ${result._source.coded_tags && result._source.coded_tags.length > 0 ? html`
              <div class="tags-display">
                <strong>Tags:</strong> ${result._source.coded_tags.join(', ')}
              </div>
            ` : ''}
            ${(result.highlight?.content || []).map(snippet => html`
              <p>${unsafeHTML(snippet)}</p>
            `)}
          </div>
        `)}
      </div>
    `;
  } else {
    template = html``;
  }
  
  render(template, document.getElementById('results'));
}

function renderPagination() {
  if (state.totalPages <= 1) {
    render(html``, document.getElementById('pagination'));
    return;
  }
  
  const template = html`
    <div class="pagination">
      <button
        @click=${() => handlePageChange(state.currentPage - 1)}
        ?disabled=${state.currentPage === 1}
      >
        Previous
      </button>
      <span>Page ${state.currentPage} of ${state.totalPages}</span>
      <button
        @click=${() => handlePageChange(state.currentPage + 1)}
        ?disabled=${state.currentPage === state.totalPages}
      >
        Next
      </button>
    </div>
  `;
  
  render(template, document.getElementById('pagination'));
}

// Helper to render HTML from strings (for highlights)
function unsafeHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString;
  return template.content;
}
