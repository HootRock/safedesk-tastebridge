import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Qloo} from '../src/qloo';
import {type Env, type MovieResponse, type StoreApi} from '../src/contracts';

const row = (properties: unknown, id = 'synthetic-film') => ({entity_id: id, name: `Film ${id}`, types: ['urn:entity:movie'], properties});
function setup(entities: unknown[]) {
  const cache = new Map<string, MovieResponse>();
  let requests = 0;
  const store = {
    async claimQlooRequest() {requests++; return 'synthetic-lease';},
    async releaseQlooRequest() {},
    async readCache(key: string) {return structuredClone(cache.get(key) ?? null);},
    async writeCache(key: string, response: MovieResponse) {cache.set(key, structuredClone(response));},
  } as StoreApi;
  const env = {QLOO_API_KEY: 'synthetic-key-marker'} as Env;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({results: {entities}})));
  return {qloo: new Qloo(env, store, () => Date.parse('2026-10-09T00:00:00Z')), env, cache, requests: () => requests};
}
beforeEach(() => {vi.spyOn(console, 'warn').mockImplementation(() => {});});
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});

describe('bounded Qloo metadata for recommendation cards', () => {
  it('retains only card fields while discarding large and deeply nested unused metadata', async () => {
    let unused: unknown = {large: 'x'.repeat(500000)};
    for (let depth = 0; depth < 30; depth++) unused = {nested: unused};
    const metadata = {release_year: 2025, duration: 125, content_rating: 'PG-13', genres: ['Drama', 'Mystery'], plot_summary: 'Original Qloo summary.', description: 'Original Qloo description.', image: {url: 'https://example.invalid/poster.jpg'}};
    const s = setup([row({...metadata, unused, image: {...metadata.image, unrelated: {large: 'ignored'}}})]);
    const result = await s.qloo.recommend(['seed'], []);
    expect(result.movies[0].metadata).toEqual(metadata);
    expect(result.movies[0].rank).toBe(1);
    expect(s.requests()).toBe(1);
  });
  it('omits optional fields with unexpected types without inventing replacements', async () => {
    const s = setup([row({release_year: '2025', duration: '125', content_rating: 3, genres: {name: 'Drama'}, plot_summary: [], description: {text: 'wrong type'}, image: {url: ['https://example.invalid/a.jpg']}})]);
    expect((await s.qloo.recommend(['seed'], [])).movies[0].metadata).toEqual({});
  });
  it('retains values exactly at the metadata bounds', async () => {
    const metadata = {release_year: 3000, duration: 1000, content_rating: 'r'.repeat(100), genres: Array.from({length: 10}, () => 'g'.repeat(100)), plot_summary: 'p'.repeat(4000), description: 'd'.repeat(4000), image: {url: 'u'.repeat(2048)}};
    const s = setup([row(metadata)]);
    expect((await s.qloo.recommend(['seed'], [])).movies[0].metadata).toEqual(metadata);
  });
  it.each([
    ['release_year', -1], ['release_year', 3001], ['release_year', 2025.5],
    ['duration', 0], ['duration', 1001], ['duration', 125.5],
    ['content_rating', 'r'.repeat(101)],
    ['genres', Array.from({length: 11}, () => 'Drama')], ['genres', ['g'.repeat(101)]], ['genres', ['Drama', 3]],
    ['plot_summary', 'p'.repeat(4001)], ['description', 'd'.repeat(4001)],
    ['image', {url: 'u'.repeat(2049)}], ['image', ['https://example.invalid/a.jpg']],
  ])('omits out-of-bounds %s without truncating it', async (field, value) => {
    const s = setup([row({[field as string]: value})]);
    expect((await s.qloo.recommend(['seed'], [])).movies[0].metadata).toEqual({});
  });
  it('returns less than twenty KB for twenty richly populated provider films', async () => {
    const s = setup(Array.from({length: 20}, (_, index) => row({release_year: 2025, duration: 120, content_rating: 'PG', genres: ['Drama'], plot_summary: 'Qloo plot.', description: 'Qloo description.', image: {url: 'https://example.invalid/poster.jpg', irrelevant: 'x'.repeat(1000)}, unused_rich_field: {description: 'x'.repeat(24000)}}, `film-${index}`)));
    const result = await s.qloo.recommend(['seed'], []);
    expect(result.movies).toHaveLength(20);
    expect(result.movies.map(movie => movie.rank)).toEqual(Array.from({length: 20}, (_, index) => index + 1));
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(20000);
    expect(result.movies[0].metadata).not.toHaveProperty('unused_rich_field');
  });
  it('does not expose prototype keys in projected metadata or nested image data', async () => {
    const properties = JSON.parse('{"release_year":2025,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"image":{"url":"https://example.invalid/a.jpg","__proto__":{"polluted":true},"prototype":{"polluted":true}}}');
    const s = setup([row(properties)]);
    const result = await s.qloo.recommend(['seed'], []);
    expect(result.movies[0].metadata).toEqual({release_year: 2025, image: {url: 'https://example.invalid/a.jpg'}});
    expect(Object.hasOwn(result.movies[0].metadata, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([false, true])('rejects secret reflection in discarded fields before projection, escaped=%s', async (escaped) => {
    const s = setup([row({release_year: 2025})]);
    let payload = JSON.stringify({results: {entities: [row({release_year: 2025, discarded: s.env.QLOO_API_KEY})]}});
    if (escaped) payload = payload.replace('synthetic-key-marker', '\\u0073ynthetic-key-marker');
    vi.stubGlobal('fetch', async () => new Response(payload));
    await expect(s.qloo.recommend(['seed'], [])).rejects.toMatchObject({code: 'invalid_response'});
    expect(s.cache.size).toBe(0);
    expect(vi.mocked(console.warn).mock.calls).toEqual([['Qloo validation rejected', 'secret_reflection']]);
  });
  it('ignores old rich cache entries and reuses independent projected entries with stable seed keys', async () => {
    const s = setup([row({release_year: 2025, duration: 120, unused: 'x'.repeat(500000)})]);
    const oldKey = JSON.stringify(['https://hackathon.api.qloo.com', ['a', 'b'], []]);
    s.cache.set(oldKey, {movies: [{entity_id: 'old-film', name: 'Old film', metadata: {unused: 'x'.repeat(500000)}, rank: 1, explainability: null}], warnings: [], fetched_at: '2026-10-09T00:00:00.000Z'});
    const first = await s.qloo.recommend(['b', 'a', 'a'], []);
    expect(first.movies[0]).toMatchObject({entity_id: 'synthetic-film', metadata: {release_year: 2025, duration: 120}});
    first.movies[0].metadata.duration = 999;
    expect((await s.qloo.recommend(['a', 'b'], [])).movies[0].metadata).toEqual({release_year: 2025, duration: 120});
    expect(s.requests()).toBe(1);
    expect(s.cache.size).toBe(2);
  });
});
