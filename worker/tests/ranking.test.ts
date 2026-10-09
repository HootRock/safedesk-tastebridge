import {describe, expect, it} from 'vitest';
import {rankForGroup, makeEvidence} from '../src/ranking';
import type {MovieResponse} from '../src/contracts';

describe('Python group ranking contract', () => {
  it('rewards the weakest member as well as the mean, deduplicates and excludes', () => {
    const result = rankForGroup({a: ['a', 'a', 'shared', 'z'], b: ['shared', 'b']}, new Set(['z']));
    expect(result.map(r => r.entity_id)).toEqual(['shared', 'a', 'b']);
    expect(result[0]).toEqual({entity_id: 'shared', score: 0.9624999999999999, mean_utility: 0.975, min_utility: 0.95, ranks: {a: 2, b: 1}});
    expect(result[1].score).toBe(0.25);
    expect(result[2].score).toBe(0.2375);
  });
  it('breaks ties by ID, limits input to twenty unique items and returns top three', () => {
    expect(rankForGroup({a: ['b', 'a'], b: ['a', 'b']}, new Set()).map(r => r.entity_id)).toEqual(['a', 'b']);
    const ids = Array.from({length: 21}, (_, i) => `item-${i}`);
    expect(rankForGroup({a: ids}, new Set(ids.slice(0, 20)))).toEqual([]);
    expect(rankForGroup({}, new Set())).toEqual([]);
    expect(rankForGroup({a: ids}, new Set())).toHaveLength(3);
  });
  it('creates only actual rank and provider explainability evidence', () => {
    const ranking = rankForGroup({a: ['shared'], b: ['shared'], c: []}, new Set())[0];
    const response: MovieResponse = {movies: [{entity_id: 'shared', name: 'Synthetic', metadata: {}, rank: 1, explainability: {signal: 'provided'}}], warnings: [], fetched_at: '2026-10-09T00:00:00.000Z'};
    expect(makeEvidence(ranking, {a: response, b: {...response, movies: [{...response.movies[0], explainability: {}}]}, c: {...response, movies: []}})).toEqual([
      {evidence_id: 'a:shared:rank', member_id: 'a', entity_id: 'shared', kind: 'candidate_rank', value: 1},
      {evidence_id: 'a:shared:qloo', member_id: 'a', entity_id: 'shared', kind: 'qloo_explainability', value: {signal: 'provided'}},
      {evidence_id: 'b:shared:rank', member_id: 'b', entity_id: 'shared', kind: 'candidate_rank', value: 1},
    ]);
  });
  it('preserves prototype-like member IDs as ordinary own ranking keys', () => {
    const lists = Object.fromEntries([['__proto__', ['shared']], ['constructor', ['shared']], ['toString', ['shared']]]);
    const result = rankForGroup(lists, new Set());
    expect(result).toHaveLength(1); expect(result[0].score).toBe(1);
    expect(Object.keys(result[0].ranks)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(result[0].ranks).toEqual(JSON.parse('{"__proto__":1,"constructor":1,"toString":1}'));
    const response: MovieResponse = {movies: [{entity_id: 'shared', name: 'Synthetic', metadata: {}, rank: 1, explainability: null}], warnings: [], fetched_at: '2026-10-09T00:00:00.000Z'};
    const responses = Object.fromEntries([['__proto__', response], ['constructor', response], ['toString', response]]);
    expect(makeEvidence(result[0], responses).map(item => item.member_id)).toEqual(['__proto__', 'constructor', 'toString']);
  });
});
