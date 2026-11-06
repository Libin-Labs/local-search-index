import { createLocalSearchIndex } from '@lp-labs/local-search-index';
const index = createLocalSearchIndex();
index.upsert({ id: 'one', text: 'commonjs search' });
const count: number = index.search('search').length;
void count;
