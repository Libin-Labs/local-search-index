export interface SearchDocument {
  id: string;
  text: string;
}

export interface SearchOptions {
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
}

export interface LocalSearchIndexOptions {
  maxDocuments?: number;
  maxTokensPerDocument?: number;
  maxTokenLength?: number;
}

export interface LocalSearchIndex {
  readonly size: number;
  upsert(document: SearchDocument): void;
  remove(id: string): boolean;
  search(query: string, options?: SearchOptions): SearchResult[];
  clear(): void;
}

export class SearchIndexError extends Error {
  constructor(
    readonly code: 'capacity' | 'invalid-document',
    message: string,
  ) {
    super(message);
    this.name = 'SearchIndexError';
  }
}

const plain = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function assertPlainObject(value: unknown, name: string): void {
  if (!plain(value)) throw new TypeError(`${name} must be a plain object.`);
}

function boundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function tokenize(text: string, maximumLength: number): string[] {
  return (
    text
      .normalize('NFKC')
      .toLocaleLowerCase('und')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length <= maximumLength) ?? []
  );
}

export function createLocalSearchIndex(options: LocalSearchIndexOptions = {}): LocalSearchIndex {
  assertPlainObject(options, 'Options');
  const maxDocuments = boundedInteger(
    options.maxDocuments ?? 100_000,
    'maxDocuments',
    1,
    1_000_000,
  );
  const maxTokens = boundedInteger(
    options.maxTokensPerDocument ?? 20_000,
    'maxTokensPerDocument',
    1,
    100_000,
  );
  const maxTokenLength = boundedInteger(options.maxTokenLength ?? 128, 'maxTokenLength', 1, 1024);
  const documents = new Map<string, Map<string, number>>();
  const postings = new Map<string, Map<string, number>>();

  function validateId(id: unknown): asserts id is string {
    if (typeof id !== 'string' || id.length === 0 || id.length > 256) {
      throw new TypeError('Document id must be a non-empty string of at most 256 characters.');
    }
  }

  const removePostings = (id: string, terms: Map<string, number>) => {
    for (const term of terms.keys()) {
      const entries = postings.get(term)!;
      entries.delete(id);
      if (entries.size === 0) postings.delete(term);
    }
  };

  return {
    get size() {
      return documents.size;
    },
    upsert(input) {
      if (!plain(input)) throw new TypeError('Document must be a plain object.');
      const id = input.id;
      const text = input.text;
      validateId(id);
      if (typeof text !== 'string') throw new TypeError('Document text must be a string.');
      const tokens = tokenize(text, maxTokenLength);
      if (tokens.length > maxTokens) {
        throw new SearchIndexError('capacity', `Document exceeds ${maxTokens} indexed tokens.`);
      }
      if (!documents.has(id) && documents.size >= maxDocuments) {
        throw new SearchIndexError('capacity', `Index is limited to ${maxDocuments} documents.`);
      }
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      const previous = documents.get(id);
      if (previous) removePostings(id, previous);
      documents.set(id, counts);
      for (const [term, count] of counts) {
        let entries = postings.get(term);
        if (!entries) postings.set(term, (entries = new Map()));
        entries.set(id, count);
      }
    },
    remove(id) {
      validateId(id);
      const previous = documents.get(id);
      if (!previous) return false;
      removePostings(id, previous);
      documents.delete(id);
      return true;
    },
    search(query, config = {}) {
      if (typeof query !== 'string') throw new TypeError('Query must be a string.');
      assertPlainObject(config, 'Search options');
      const limit = boundedInteger(config.limit ?? 20, 'limit', 0, 1000);
      const terms = [...new Set(tokenize(query, maxTokenLength))];
      if (terms.length === 0 || limit === 0 || documents.size === 0) return [];
      const scores = new Map<string, number>();
      for (const term of terms) {
        const entries = postings.get(term);
        if (!entries) continue;
        const idf = Math.log(1 + documents.size / entries.size);
        for (const [id, frequency] of entries) {
          scores.set(id, (scores.get(id) ?? 0) + (1 + Math.log(frequency)) * idf);
        }
      }
      return [...scores]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'))
        .slice(0, limit);
    },
    clear() {
      documents.clear();
      postings.clear();
    },
  };
}
