import { createLocalSearchIndex, type SearchResult } from '@lp-labs/local-search-index';
const index = createLocalSearchIndex({ maxDocuments: 2 });
index.upsert({ id: 'one', text: 'local search' });
const results: SearchResult[] = index.search('search');
void results;
