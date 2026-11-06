import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLocalSearchIndex, SearchIndexError } from '../dist/esm/index.js';

const require = createRequire(import.meta.url);

test('CommonJS build exposes the same search API', () => {
  const { createLocalSearchIndex: createCjsIndex } = require('../dist/cjs/index.js');
  const index = createCjsIndex();
  index.upsert({ id: 'cjs', text: 'consumer test' });
  assert.equal(index.search('consumer')[0].id, 'cjs');
});

test('indexes terms and ranks a document with more occurrences higher', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'weak', text: 'blue sky' });
  index.upsert({ id: 'strong', text: 'blue blue sky' });
  assert.equal(index.search('blue')[0].id, 'strong');
});

test('search returns documents matching any distinct query term', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'a', text: 'apple' });
  index.upsert({ id: 'b', text: 'banana' });
  assert.deepEqual(
    index.search('apple banana apple').map((item) => item.id),
    ['a', 'b'],
  );
});

test('ties use stable ascending identifiers', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'z', text: 'same' });
  index.upsert({ id: 'a', text: 'same' });
  assert.deepEqual(
    index.search('same').map(({ id }) => id),
    ['a', 'z'],
  );
});

test('normalizes Unicode and ignores punctuation', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'one', text: 'ＣＡＦÉ, Straße!' });
  assert.deepEqual(
    index.search('café straße').map(({ id }) => id),
    ['one'],
  );
});

test('replacing a document removes obsolete postings', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'one', text: 'old term' });
  index.upsert({ id: 'one', text: 'new term' });
  assert.deepEqual(index.search('old'), []);
  assert.equal(index.search('new')[0].id, 'one');
});

test('failed replacement preserves prior data and capacity', () => {
  const index = createLocalSearchIndex({ maxDocuments: 1, maxTokensPerDocument: 1 });
  index.upsert({ id: 'one', text: 'old' });
  assert.throws(() => index.upsert({ id: 'two', text: 'other' }), SearchIndexError);
  assert.throws(() => index.upsert({ id: 'one', text: 'two words' }), SearchIndexError);
  assert.equal(index.search('old')[0].id, 'one');
  assert.equal(index.size, 1);
});

test('remove and clear release all indexed terms', () => {
  const index = createLocalSearchIndex({ maxDocuments: 1 });
  index.upsert({ id: 'one', text: 'term' });
  assert.equal(index.remove('one'), true);
  assert.equal(index.remove('one'), false);
  index.upsert({ id: 'two', text: 'next' });
  index.clear();
  assert.equal(index.size, 0);
  assert.deepEqual(index.search('next'), []);
});

test('empty token queries and zero limit return no results', () => {
  const index = createLocalSearchIndex();
  index.upsert({ id: 'one', text: 'word' });
  assert.deepEqual(index.search('!?'), []);
  assert.deepEqual(index.search('word', { limit: 0 }), []);
});

test('document and query validation rejects malformed inputs', () => {
  const index = createLocalSearchIndex();
  assert.throws(() => index.upsert({ id: '', text: 'x' }), TypeError);
  assert.throws(() => index.upsert({ id: 'x', text: 1 }), TypeError);
  assert.throws(() => index.search(2), TypeError);
  assert.throws(() => index.search('x', { limit: -1 }), RangeError);
  assert.throws(() => createLocalSearchIndex({ maxDocuments: 0 }), RangeError);
});

test('truncates oversized tokens without affecting other searchable tokens', () => {
  const index = createLocalSearchIndex({ maxTokenLength: 3 });
  index.upsert({ id: 'a', text: 'longword ok' });
  assert.deepEqual(
    index.search('longword').map(({ id }) => id),
    [],
  );
  assert.equal(index.search('ok')[0].id, 'a');
});

test('generated ranking matches a deterministic frequency oracle', () => {
  const index = createLocalSearchIndex();
  const corpus = [];
  for (let i = 0; i < 80; i++) {
    const text = Array.from({ length: (i * 13) % 17 }, (_, j) => `t${(i + j * 7) % 9}`).join(' ');
    corpus.push({ id: `d${i}`, text });
    index.upsert({ id: `d${i}`, text });
  }
  const actual = index.search('t1 t4 t8', { limit: 100 });
  const terms = new Set(['t1', 't4', 't8']);
  const scores = corpus
    .map(({ id, text }) => {
      const tokens = text.split(' ');
      let score = 0;
      for (const term of terms) {
        const count = tokens.filter((token) => token === term).length;
        const docs = corpus.filter((item) => item.text.split(' ').includes(term)).length;
        if (count) score += (1 + Math.log(count)) * Math.log(1 + corpus.length / docs);
      }
      return { id, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
  assert.deepEqual(
    actual.map(({ id }) => id),
    scores.map(({ id }) => id),
  );
});

test('large deterministic corpus remains searchable', () => {
  const index = createLocalSearchIndex({ maxDocuments: 2000, maxTokensPerDocument: 20 });
  for (let i = 0; i < 1000; i++) index.upsert({ id: String(i), text: `group${i % 7} item${i}` });
  assert.equal(index.size, 1000);
  assert.equal(index.search('group3', { limit: 1000 }).length, 143);
});
