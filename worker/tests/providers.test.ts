import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Qloo} from '../src/qloo';
import {Planner} from '../src/planner';
import {AppError, type Env, type MovieResponse, type StoreApi} from '../src/contracts';

function setup(output: unknown = {response: {tool_calls: [], text: null}}) {
  let qlooClaims = 0, modelClaims = 0;
  const released: string[] = [], inputs: {model: string; input: Record<string, unknown>}[] = [];
  const cache = new Map<string, MovieResponse>();
  const store = {
    async claimQlooRequest() { return `lease-${++qlooClaims}`; },
    async releaseQlooRequest(lease: string) { released.push(lease); },
    async claimModelRequest() { modelClaims++; },
    async readCache(key: string) { return structuredClone(cache.get(key) ?? null); },
    async writeCache(key: string, value: MovieResponse) { cache.set(key, structuredClone(value)); },
  } as StoreApi;
  const env = {QLOO_API_KEY: 'synthetic-secret-marker', AI: {async run(model: string, input: Record<string, unknown>) { inputs.push({model, input}); return output; }}} as Env;
  return {store, env, inputs, cache, released, qlooClaims: () => qlooClaims, modelClaims: () => modelClaims};
}
const body = (value: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(value), {status, headers});
const row = (id = 'synthetic-film') => ({entity_id: id, name: `Title ${id}`, types: ['urn:entity:movie'], properties: {release_year: 2025}, explainability: {signal: 'synthetic'}});
beforeEach(() => {vi.spyOn(console, 'warn').mockImplementation(() => {});});
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();});

describe('Qloo bounded physical requests', () => {
  it.each([
    [{results: {entities: [{...row(), properties: []}]}}, 'properties_shape'],
    [{results: {entities: [row()]}, warnings: [{message: 'synthetic-secret-marker'}]}, 'warning_entry'],
    [{results: {entities: [{...row(), properties: {description: 'x'.repeat(1048577)}}]}}, 'body_read_limit'],
  ])('logs only a fixed validation reason when a recommendation is rejected', async (output, reason) => {
    const s = setup();
    // Keep the reflection marker in an unrelated rejected field out of diagnostic logs.
    if (reason === 'warning_entry') s.env.QLOO_API_KEY = 'other-synthetic-key';
    vi.stubGlobal('fetch', async () => body(output));
    await expect(new Qloo(s.env, s.store).recommend(['seed'], [])).rejects.toMatchObject({code: 'invalid_response'});
    expect(console.warn).toHaveBeenCalledWith('Qloo validation rejected', reason);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('synthetic-secret-marker');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(s.env.QLOO_API_KEY);
  });
  it('uses the fixed search endpoint with strict search limits and no redirect', async () => {
    const s = setup(); const seen: {url: URL; init: RequestInit}[] = [];
    vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit) => {seen.push({url: new URL(url), init}); return body({results: Array.from({length: 7}, (_, i) => row(`film-${i}`))});});
    expect(await new Qloo(s.env, s.store).search('  synthetic  ', 'movie')).toHaveLength(5);
    expect(seen[0].url.origin).toBe('https://hackathon.api.qloo.com'); expect(seen[0].url.pathname).toBe('/search');
    expect(seen[0].url.searchParams.get('query')).toBe('synthetic'); expect(seen[0].url.searchParams.get('take')).toBe('5');
    expect(seen[0].url.searchParams.get('types')).toBe('urn:entity:movie'); expect(seen[0].url.searchParams.get('sort_by')).toBe('match');
    expect(seen[0].init.redirect).toBe('manual'); expect(seen[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(s.qlooClaims()).toBe(1); expect(s.released).toEqual(['lease-1']);
  });
  it('claims retries separately and releases leases even on failures', async () => {
    const s = setup(); let attempts = 0;
    vi.stubGlobal('fetch', async () => ++attempts === 1 ? body({}, 503) : body({results: {entities: [row()]}}));
    expect((await new Qloo(s.env, s.store).recommend(['seed'], [])).movies[0].rank).toBe(1);
    expect(s.qlooClaims()).toBe(2); expect(s.released).toEqual(['lease-1', 'lease-2']);
  });
  it('treats search 404 as empty and rejects redirects without retry', async () => {
    const s = setup(); vi.stubGlobal('fetch', async () => body({}, 404));
    expect(await new Qloo(s.env, s.store).search('missing', 'artist')).toEqual([]);
    vi.stubGlobal('fetch', async () => body({}, 302, {Location: 'https://elsewhere.invalid'}));
    await expect(new Qloo(s.env, s.store).recommend(['seed'], [])).rejects.toMatchObject({code: 'redirect_rejected'});
    expect(s.qlooClaims()).toBe(2);
  });
  it('uses recommendation-only cache for fifteen minutes with stable keys and independent values', async () => {
    const s = setup(); let now = Date.parse('2026-10-09T00:00:00Z');
    vi.stubGlobal('fetch', async () => body({results: {entities: [row()]}}));
    const q = new Qloo(s.env, s.store, () => now);
    const first = await q.recommend(['b', 'a', 'a'], ['x']); first.movies[0].name = 'mutated';
    expect((await q.recommend(['a', 'b'], ['x'])).movies[0].name).toBe('Title synthetic-film'); expect(s.qlooClaims()).toBe(1);
    now += 900000; await q.recommend(['a', 'b'], ['x']); expect(s.qlooClaims()).toBe(2);
    vi.stubGlobal('fetch', async () => body({results: []})); await q.search('x', 'movie'); await q.search('x', 'movie'); expect(s.qlooClaims()).toBe(4);
  });
  it('deduplicates and excludes movies, caps twenty results and normalizes safe metadata', async () => {
    const s = setup(); vi.stubGlobal('fetch', async () => body({results: {entities: [row('excluded'), row('same'), row('same'), ...Array.from({length: 25}, (_, i) => row(`other-${i}`))]}}));
    const result = await new Qloo(s.env, s.store).recommend(['seed'], ['excluded']);
    expect(result.movies).toHaveLength(20); expect(result.movies[0]).toMatchObject({entity_id: 'same', rank: 1, metadata: {release_year: 2025}});
    expect(result.movies[19].rank).toBe(20);
  });
  it.each([{results: null}, {results: {entities: [row(), {entity_id: 7, name: 'bad'}]}}, {results: {entities: [{...row(), properties: []}]}}, {results: {entities: [row()]}, warnings: [3]}, {success: false, results: {entities: []}}])('rejects malformed recommendation output without reflection', async (output) => {
    const s = setup(); vi.stubGlobal('fetch', async () => body(output));
    await expect(new Qloo(s.env, s.store).recommend(['seed'], [])).rejects.toMatchObject({code: 'invalid_response'});
    expect(s.released).toEqual(['lease-1']);
  });
  it('rejects invalid search types and malformed year types', async () => {
    const s = setup(); vi.stubGlobal('fetch', async () => body({results: [{...row(), properties: {release_year: '2025'}}]}));
    await expect(new Qloo(s.env, s.store).search('x', 'movie')).rejects.toMatchObject({code: 'invalid_response'});
    await expect(new Qloo(s.env, s.store).search(' ', 'movie')).rejects.toMatchObject({code: 'invalid_query'});
    await expect(new Qloo(s.env, s.store).recommend([], [])).rejects.toMatchObject({code: 'invalid_seeds'});
  });
  it('aborts each timed out physical request at ten seconds and performs only one retry', async () => {
    vi.useFakeTimers(); const s = setup(); const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {const signal = init.signal as AbortSignal; signals.push(signal); signal.addEventListener('abort', () => reject(new Error('secret provider error')));}));
    const pending = new Qloo(s.env, s.store).search('x', 'movie'); const assertion = expect(pending).rejects.toMatchObject({code: 'timeout'});
    await vi.advanceTimersByTimeAsync(20000); await assertion;
    expect(signals).toHaveLength(2); expect(signals.every(s => s.aborted)).toBe(true); expect(s.released).toEqual(['lease-1', 'lease-2']);
  });
  it('fails closed on quotas and never exposes network errors', async () => {
    const s = setup(); s.store.claimQlooRequest = async () => {throw new AppError('daily_limit', 429);};
    let requests = 0; vi.stubGlobal('fetch', async () => {requests++; throw new Error(s.env.QLOO_API_KEY);});
    await expect(new Qloo(s.env, s.store).search('x', 'movie')).rejects.toMatchObject({code: 'daily_limit'}); expect(requests).toBe(0);
    const t = setup(); await expect(new Qloo(t.env, t.store).search('x', 'movie')).rejects.toMatchObject({code: 'timeout', message: 'timeout'});
  });
  it('preserves the durable store Qloo daily quota error', async () => {
    const s = setup(); s.store.claimQlooRequest = async () => {throw new AppError('qloo_daily_limit', 429);};
    await expect(new Qloo(s.env, s.store).search('x', 'movie')).rejects.toMatchObject({code: 'qloo_daily_limit', status: 429});
  });
  it('honors bounded retry-after and never retries a second rate limit', async () => {
    vi.useFakeTimers(); const s = setup(); let attempts = 0;
    vi.stubGlobal('fetch', async () => {attempts++; return body({}, 429, {'Retry-After': '1'});});
    const pending = new Qloo(s.env, s.store).search('x', 'movie'); const assertion = expect(pending).rejects.toMatchObject({code: 'rate_limited'});
    await vi.advanceTimersByTimeAsync(1000); await assertion; expect(attempts).toBe(2); expect(s.qlooClaims()).toBe(2); expect(s.released).toEqual(['lease-1', 'lease-2']);
  });
  it('normalizes prototype keys and rejects decoded secret reflections in provider data', async () => {
    const s = setup(); const properties = JSON.parse('{"release_year":2025,"nested":{"__proto__":{"polluted":true},"safe":"value"}}');
    vi.stubGlobal('fetch', async () => body({results: {entities: [{...row(), properties}]}}));
    expect((await new Qloo(s.env, s.store).recommend(['seed'], [])).movies[0].metadata).toEqual({release_year: 2025});
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({results: [{...row(), name: s.env.QLOO_API_KEY}]}).replace('synthetic-secret-marker', '\\u0073ynthetic-secret-marker')));
    await expect(new Qloo(s.env, s.store).search('x', 'movie')).rejects.toMatchObject({code: 'invalid_response', message: 'invalid_response'});
  });
  it('accepts rich recommendation responses above 256KiB within a one-MiB bound', async () => {
    const s = setup();
    const description = 'Original Qloo description.';
    vi.stubGlobal('fetch', async () => body({results: {entities: [{...row(), properties: {release_year: 2025, description, unused_rich_metadata: 'x'.repeat(400000)}}]}}));
    const result = await new Qloo(s.env, s.store).recommend(['seed'], []);
    expect(result.movies[0].metadata).toEqual({release_year: 2025, description});
    expect(s.cache.size).toBe(1);
    expect(s.released).toEqual(['lease-1']);
  });
  it('rejects provider bodies above one MiB rather than silently truncating data', async () => {
    const s = setup(); vi.stubGlobal('fetch', async () => body({results: {entities: [{...row(), properties: {description: 'x'.repeat(1048577)}}]}}));
    await expect(new Qloo(s.env, s.store).recommend(['seed'], [])).rejects.toMatchObject({code: 'invalid_response'});
    expect(s.qlooClaims()).toBe(1); expect(s.cache.size).toBe(0);
  });
  it('continues the ten-second deadline through a stalled body and cancels its reader', async () => {
    vi.useFakeTimers(); const s = setup(); let cancelled = 0;
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({cancel() {cancelled++;}})));
    const pending = new Qloo(s.env, s.store).search('x', 'movie'); const assertion = expect(pending).rejects.toMatchObject({code: 'timeout'});
    await vi.advanceTimersByTimeAsync(20000); await assertion;
    expect(cancelled).toBe(2); expect(s.released).toEqual(['lease-1', 'lease-2']);
  });
});

describe('native Workers AI planner validation', () => {
  it.each([
    {output: null, reason: 'output_shape'},
    {output: {response: {tool_calls: [], text: null}, metadata: {finish_reason: 'length', payload: 'untrusted-payload-marker'}}, reason: 'finish_reason'},
    {output: {response: []}, reason: 'response_shape'},
    {output: {response: 'untrusted-payload-marker'}, reason: 'response_json'},
    {output: {response: {tool_calls: [], text: null, extra: 'untrusted-payload-marker'}}, reason: 'envelope_shape'},
    {output: {response: {tool_calls: 'untrusted-payload-marker', text: null}}, reason: 'tool_calls_shape'},
    {output: {response: {tool_calls: [], text: 3}}, reason: 'text_type'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: '{}', extra: true}], text: null}}, reason: 'call_shape'},
    {output: {response: {tool_calls: [{call_id: 3, name: 'recommend_for_group', arguments: '{}'}], text: null}}, reason: 'call_id'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 3, arguments: '{}'}], text: null}}, reason: 'call_name'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'rank_for_group', arguments: '{}'}], text: null}}, reason: 'call_unavailable'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: '{}'}, {call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: '{}'}], text: null}}, reason: 'call_id_duplicate'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: {}}], text: null}}, reason: 'arguments_type'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: 'untrusted-payload-marker'}], text: null}}, reason: 'arguments_json'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'recommend_for_group', arguments: '{"extra":"untrusted-payload-marker"}'}], text: null}}, reason: 'arguments_shape'},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'refine_preferences', arguments: '{"excluded_ids":[]}'}], text: null}}, reason: 'refine_ids_count', refine: true},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'refine_preferences', arguments: '{"excluded_ids":[3]}'}], text: null}}, reason: 'refine_id', refine: true},
    {output: {response: {tool_calls: [{call_id: 'untrusted-payload-marker', name: 'refine_preferences', arguments: '{"excluded_ids":["untrusted-payload-marker","untrusted-payload-marker"]}'}], text: null}}, reason: 'refine_ids_duplicate', refine: true},
    {output: {response: {tool_calls: [], text: 'synthetic-secret-marker'}}, reason: 'secret_reflection'},
  ])('records only a fixed reason for rejected planner output: $reason', async ({output, reason, refine}) => {
    const s = setup(output);
    await expect(new Planner(s.env, s.store).next([{role: 'user', content: 'private-history-marker'}], refine ? ['refine_preferences'] : ['recommend_for_group'], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output', status: 502, message: 'invalid_model_output'});
    expect(vi.mocked(console.warn).mock.calls).toEqual([['Planner validation rejected', reason]]);
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).not.toContain('untrusted-payload-marker');
    expect(logs).not.toContain('private-history-marker');
    expect(logs).not.toContain(s.env.QLOO_API_KEY);
  });
  it.each([false, true])('accepts binding response string or object and emits the raw strict envelope schema', async (asString) => {
    const envelope = {tool_calls: [{call_id: 'call-1', name: 'recommend_for_group', arguments: '{}'}], text: null};
    const s = setup({response: asString ? JSON.stringify(envelope) : envelope}); const budget = {model_attempts: 0, tool_calls: 0};
    expect(await new Planner(s.env, s.store).next([{role: 'developer', content: 'Choose a tool'}], ['recommend_for_group'], budget)).toEqual({tool_calls: [{call_id: 'call-1', name: 'recommend_for_group', args: {}}], text: null});
    expect(budget.model_attempts).toBe(1); expect(s.modelClaims()).toBe(1);
    expect(s.inputs[0].model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast'); expect(s.inputs[0].input.max_tokens).toBe(1024);
    const format = s.inputs[0].input.response_format as {type: string; json_schema: Record<string, unknown>};
    expect(format.type).toBe('json_schema'); expect(format.json_schema.type).toBe('object'); expect(format.json_schema.additionalProperties).toBe(false);
    expect(format.json_schema.required).toEqual(['tool_calls', 'text']);
    expect(JSON.stringify(s.inputs[0].input)).toContain('system'); expect(JSON.stringify(s.inputs[0].input)).not.toContain('developer');
  });
  it.each([
    {tool_calls: [], text: null, extra: true},
    {tool_calls: [{call_id: 'c', name: 'rank_for_group', arguments: '{}'}], text: null},
    {tool_calls: [{call_id: 'c', name: 'recommend_for_group', arguments: '{"x":1}'}], text: null},
    {tool_calls: [{call_id: 'c', name: 'recommend_for_group', args: {}}], text: null},
    {tool_calls: [], text: 2},
  ])('rejects invalid envelope, stages and tool arguments', async (output) => {
    const s = setup({response: output}); await expect(new Planner(s.env, s.store).next([], ['recommend_for_group'], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output'});
  });
  it.each([[], ['x', 'x'], ['x', 'y', 'z', 'w'], [3], ['']])('rejects invalid refine exclusion lists', async (ids) => {
    const s = setup({response: {tool_calls: [{call_id: 'c', name: 'refine_preferences', arguments: JSON.stringify({excluded_ids: ids})}], text: null}});
    await expect(new Planner(s.env, s.store).next([], ['refine_preferences'], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output'});
  });
  it('accepts exactly bounded unique refine IDs and rejects too many remaining tools', async () => {
    const s = setup({response: {tool_calls: [{call_id: 'c', name: 'refine_preferences', arguments: '{"excluded_ids":["one","two"]}'}], text: null}});
    expect((await new Planner(s.env, s.store).next([], ['refine_preferences'], {model_attempts: 0, tool_calls: 0})).tool_calls[0].args).toEqual({excluded_ids: ['one', 'two']});
    await expect(new Planner(s.env, s.store).next([], ['refine_preferences'], {model_attempts: 0, tool_calls: 8})).rejects.toMatchObject({code: 'invalid_model_output'});
  });
  it('bounds complete UTF-8 request before quota and masks secrets in history', async () => {
    const s = setup(); const p = new Planner(s.env, s.store);
    await p.next([{role: 'user', content: s.env.QLOO_API_KEY!}], [], {model_attempts: 0, tool_calls: 0});
    expect(JSON.stringify(s.inputs[0].input)).not.toContain(s.env.QLOO_API_KEY);
    await expect(p.next([{role: 'user', content: '界'.repeat(2100)}], [], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'model_context_limit'});
    expect(s.modelClaims()).toBe(1);
  });
  it('blocks fifth model call and retains attempts and quota after provider failure without retry', async () => {
    const s = setup(); s.env.AI.run = async () => {throw new Error(s.env.QLOO_API_KEY);}; const budget = {model_attempts: 3, tool_calls: 0};
    await expect(new Planner(s.env, s.store).next([], [], budget)).rejects.toMatchObject({code: 'model_unavailable', message: 'model_unavailable'});
    expect(budget.model_attempts).toBe(4); expect(s.modelClaims()).toBe(1);
    await expect(new Planner(s.env, s.store).next([], [], budget)).rejects.toMatchObject({code: 'model_attempt_limit'}); expect(s.modelClaims()).toBe(1);
  });
  it('uses a twenty-second model deadline even if the binding never resolves', async () => {
    vi.useFakeTimers(); const s = setup(); s.env.AI.run = () => new Promise(() => {});
    const assertion = expect(new Planner(s.env, s.store).next([], [], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'model_timeout'});
    await vi.advanceTimersByTimeAsync(20000); await assertion; expect(s.modelClaims()).toBe(1);
  });
  it.each([{finish_reason: 'length'}, {truncated: true}, {finish_reason: 'tool_calls'}, {success: false}, {errors: [{message: 'untrusted'}]}])('rejects unfinished or failed output when metadata is present', async (meta) => {
    const s = setup({response: {tool_calls: [], text: null}, ...meta});
    await expect(new Planner(s.env, s.store).next([], [], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output'});
  });
  it.each([false, true])('rejects secret reflection in raw or escaped decoded content', async (escaped) => {
    const s = setup(); let raw = JSON.stringify({tool_calls: [], text: s.env.QLOO_API_KEY});
    if (escaped) raw = raw.replace('synthetic', '\\u0073ynthetic'); s.env.AI.run = async () => ({response: raw});
    await expect(new Planner(s.env, s.store).next([], [], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output', message: 'invalid_model_output'});
  });
  it('preserves model quota failures and counts the failed attempt before dispatch', async () => {
    const s = setup(); s.store.claimModelRequest = async () => {throw new AppError('model_daily_limit', 429);}; const budget = {model_attempts: 0, tool_calls: 0};
    await expect(new Planner(s.env, s.store).next([], [], budget)).rejects.toMatchObject({code: 'model_daily_limit'});
    expect(budget.model_attempts).toBe(1); expect(s.inputs).toHaveLength(0);
  });
  it('rejects REST response shapes and duplicate call IDs rather than guessing', async () => {
    const s = setup({choices: [{message: {content: '{"tool_calls":[],"text":null}'}, finish_reason: 'stop'}]});
    await expect(new Planner(s.env, s.store).next([], [], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output'});
    const t = setup({response: {tool_calls: [{call_id: 'same', name: 'rank_for_group', arguments: '{}'}, {call_id: 'same', name: 'rank_for_group', arguments: '{}'}], text: null}});
    await expect(new Planner(t.env, t.store).next([], ['rank_for_group'], {model_attempts: 0, tool_calls: 0})).rejects.toMatchObject({code: 'invalid_model_output'});
  });
});
