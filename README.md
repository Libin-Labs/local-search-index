# @lp-labs/local-search-index

A deterministic, dependency-free in-memory full-text index for small local datasets and offline
search. It uses Unicode letter/number tokenization, per-document term frequency and inverse
document frequency ranking.

## Install

```bash
npm install @lp-labs/local-search-index
```

The package provides ES2022 ESM and CommonJS builds plus TypeScript declarations. CommonJS:
`const { createLocalSearchIndex } = require('@lp-labs/local-search-index')`.

## Quickstart

```js
import { createLocalSearchIndex } from '@lp-labs/local-search-index';

const index = createLocalSearchIndex();
index.upsert({ id: 'a', text: 'Fast local text search' });
index.upsert({ id: 'b', text: 'Search your notes offline' });
const results = index.search('local search');
console.log(results.map(({ id }) => id)); // ['a', 'b']
```

## API

- `createLocalSearchIndex(options?)` creates an independent index.
- `upsert({ id, text })` adds or replaces a document. IDs are non-empty strings up to 256
  characters; text is indexed, not retained as a retrievable document.
- `remove(id)` returns whether a document existed. `clear()` removes all indexed data.
- `search(query, { limit? })` returns `{ id, score }[]`, ordered by descending TF-IDF-like score,
  then ascending ID for ties. Terms are AND-independent: a result matches at least one query term.
- `size` reports the number of indexed documents.

## Customization and limits

Use `maxDocuments` (default 100,000, maximum 1,000,000),
`maxTokensPerDocument` (default 20,000, maximum 100,000), and `maxTokenLength` (default 128,
maximum 1,024) to fit your memory budget. Search result `limit` defaults to 20 and is capped at
1,000. Replacing a document updates its postings; capacity failures do not replace it.
Invalid inputs throw `TypeError`/`RangeError`; capacity failures are `SearchIndexError` with code
`capacity`.

Tokenization uses NFKC normalization, locale-independent lowercasing and contiguous Unicode
letters/numbers. This is not stemming, linguistic segmentation, phrase search, typo correction,
field weighting, a persistent index, or a database adapter. The index is process-local and
memory-bound; scores are useful for ranking, not calibrated probabilities.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
