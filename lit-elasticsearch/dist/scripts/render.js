import { html, render } from '../lib/lit-html.js';
import { state } from './state.js';
import { handleSearch, handleIndexChange, handleExactTagsChange, navigateToPage } from './navigation.js';

export function renderAll() {
  renderSearchControls();
  renderResults();
  renderPagination();
}

// ── Search controls: UNCHANGED from original ─────────────────
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

// ── Results: iterate loaded pages, render existing card layout ─
export function renderResults() {
  const container = document.getElementById('results');

  if (state.errorMessage) {
    render(html`<div class="error-message">${state.errorMessage}</div>`, container);
    return;
  }

  if (state.isLoading) {
    render(html`<div class="loading">Loading...</div>`, container);
    return;
  }

  if (state.minRenderedPage === null || state.maxRenderedPage === null) {
    render(html``, container);
    return;
  }

  const pagesToRender = [];
  for (let p = state.minRenderedPage; p <= state.maxRenderedPage; p++) {
    if (state.loadedPages.has(p)) pagesToRender.push(state.loadedPages.get(p));
  }

  if (pagesToRender.length === 0) {
    render(html``, container);
    return;
  }

  const template = html`
    <div class="results">
      ${pagesToRender.map(pageData => html`
        <section class="page-section" data-page="${pageData.page}">
          <div class="page-sentinel-top"></div>
          ${pageData.hits.map(result => html`
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
          <div class="page-sentinel-bottom"></div>
        </section>
      `)}
    </div>
  `;

  render(template, container);
  console.log(`[RENDER] Pages ${state.minRenderedPage}–${state.maxRenderedPage}`);
}

// ── Pagination: ps_ style with page buttons + go-to input ────
export function renderPagination() {
  const container = document.getElementById('pagination');

  if (state.totalPages === null || state.activePage === null) {
    render(html``, container);
    return;
  }

  const pages = calculatePaginationPages(state.activePage, state.totalPages);

  const template = html`
    <div class="pagination">
      ${pages.map(item => {
        if (item === '…') {
          return html`<span class="pagination-ellipsis">…</span>`;
        }
        const isCurrent = item === state.activePage;
        return html`
          <button
            class=${isCurrent ? 'active' : ''}
            aria-current=${isCurrent ? 'page' : 'false'}
            @click=${() => navigateToPage(item)}
          >
            ${item}
          </button>
        `;
      })}

      <input
        type="number"
        class="goto-input"
        placeholder="Go to"
        min="1"
        .max=${state.totalPages}
        @keydown=${e => {
          if (e.key === 'Enter') {
            const val = parseInt(e.target.value);
            if (val >= 1 && val <= state.totalPages) {
              navigateToPage(val);
              e.target.value = '';
            }
          }
        }}
      />
    </div>
  `;

  render(template, container);
}

function calculatePaginationPages(active, total) {
  if (total <= 15) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, 2, 3, total - 2, total - 1, total, active]);
  if (active > 1) pages.add(active - 1);
  if (active < total) pages.add(active + 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

// Helper to inject highlight HTML (unchanged from original)
function unsafeHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString;
  return template.content;
}
