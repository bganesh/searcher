export const ELASTIC_URL = 'http://localhost:9200';
export const PAGE_SIZE = 10;


export const state = {
  // Form inputs
  searchInput: '',
  tagsInput: '',
  exactTags: false,
  selectedIndex: '',
  
  // Available indices
  indexes: [],
  
  // Results
  results: [],
  
  // Pagination
  currentPage: 1,
  totalPages: 0,
  
  // UI state
  isLoading: false,
  errorMessage: ''
};
