import {AppError, type Choice, type Env, type Kind, type Movie, type MovieResponse, type StoreApi} from './contracts';

const HOST = 'https://hackathon.api.qloo.com';
const MAX_RESPONSE_BYTES = 256 * 1024;
type ValidationReason = 'entity_shape' | 'entity_types' | 'properties_shape' | 'explainability_type' | 'metadata_depth' | 'metadata_number' | 'body_advertised_limit' | 'body_read_limit' | 'body_missing' | 'body_encoding' | 'secret_reflection' | 'json_shape' | 'response_status' | 'search_results' | 'release_year' | 'recommendation_entities' | 'warnings_type' | 'warning_entry';
function invalid(reason: ValidationReason = 'entity_shape'): never {
  // Fixed reasons identify the failed guard without logging provider data or credentials.
  console.warn('Qloo validation rejected', reason);
  throw new AppError('invalid_response', 502);
}
function object(value: unknown, reason: ValidationReason = 'entity_shape'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(reason);
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) invalid();
  return value;
}
// Keep JSON data only and drop keys that can affect object prototypes downstream.
function safeJson(value: unknown, depth = 0): unknown {
  if (depth > 20) invalid('metadata_depth');
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) invalid('metadata_number'); return value; }
  if (Array.isArray(value)) return value.map(item => safeJson(item, depth + 1));
  return Object.fromEntries(Object.entries(object(value)).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)).map(([key, item]) => [key, safeJson(item, depth + 1)]));
}
function parseRow(value: unknown, kind: Kind) {
  const row = object(value), entity_id = string(row.entity_id), name = string(row.name);
  if (row.types != null && (!Array.isArray(row.types) || row.types.some(type => typeof type !== 'string'))) invalid('entity_types');
  const properties = row.properties == null ? {} : object(row.properties, 'properties_shape');
  if (row.explainability != null && (typeof row.explainability !== 'object')) invalid('explainability_type');
  return {row, entity_id, name, properties, matches: !row.types || !(row.types as string[]).length || (row.types as string[]).includes(`urn:entity:${kind}`)};
}
function validIds(ids: string[]): boolean {
  return Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100 && !id.includes(','));
}
async function boundedBody(response: Response, controller: AbortController): Promise<string> {
  const advertised = Number(response.headers.get('Content-Length'));
  if (advertised > MAX_RESPONSE_BYTES) {controller.abort(); invalid('body_advertised_limit');}
  if (!response.body) invalid('body_missing');
  const reader = response.body.getReader();
  const cancel = () => {void reader.cancel().catch(() => {});};
  controller.signal.addEventListener('abort', cancel, {once: true});
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new AppError('timeout', 504);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {cancel(); invalid('body_read_limit');}
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes);} catch {invalid('body_encoding');}
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('timeout', 504);
  } finally {
    controller.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
export class Qloo {
  constructor(private env: Env, private store: StoreApi, private clock: () => number = Date.now) {}
  private async get(path: '/search' | '/v2/insights', params: Record<string, string>): Promise<Record<string, unknown>> {
    const key = this.env.QLOO_API_KEY;
    if (!key || !key.trim() || /[^\x20-\x7e]/.test(key)) throw new AppError('qloo_unconfigured', 503);
    for (let attempt = 0; attempt < 2; attempt++) {
      let lease: string;
      try { lease = await this.store.claimQlooRequest(); }
      catch (error) {
        if (error instanceof AppError && ['daily_limit', 'qloo_daily_limit', 'qloo_busy', 'rate_limited', 'quota_unavailable'].includes(error.code)) throw error;
        throw new AppError('quota_unavailable', 503);
      }
      let retry = false, delay = 0;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const operation = (async () => {
          let response: Response;
          try { response = await fetch(`${HOST}${path}?${new URLSearchParams(params)}`, {headers: {'X-Api-Key': key}, redirect: 'manual', signal: controller.signal}); }
          catch { throw new AppError('timeout', 504); }
          if (response.status >= 300 && response.status < 400) throw new AppError('redirect_rejected', 502);
          if (response.status === 401 || response.status === 403) throw new AppError('unauthorized', 502);
          if (response.status === 404 && path === '/search') return {results: []};
          if (response.status === 429) {
            const value = response.headers.get('Retry-After');
            const seconds = value?.trim() ? Number(value) : Infinity;
            if (!attempt && Number.isFinite(seconds) && seconds >= 0 && seconds <= 10) {retry = true; delay = seconds * 1000; return {};}
            throw new AppError('rate_limited', 429);
          }
          if (response.status >= 500 && !attempt) {retry = true; return {};}
          if (!response.ok) throw new AppError('service_error', 502);
          let raw: string;
          raw = await boundedBody(response, controller);
          if (raw.includes(key)) invalid('secret_reflection');
          let data: Record<string, unknown>;
          try { data = object(JSON.parse(raw)); } catch { invalid('json_shape'); }
          // Check decoded values as well, including JSON unicode escape sequences.
          if (JSON.stringify(data).includes(key)) invalid('secret_reflection');
          if (data.success === false) invalid('response_status');
          return data;
        })();
        const deadline = new Promise<never>((_, reject) => {timer = setTimeout(() => {controller.abort(); reject(new AppError('timeout', 504));}, 10000);});
        const data = await Promise.race([operation, deadline]);
        if (!retry) return data;
      } catch (error) {
        if (error instanceof AppError && error.code === 'timeout' && !attempt) retry = true;
        else if (error instanceof AppError) throw error;
        else throw new AppError('service_error', 502);
      } finally {
        clearTimeout(timer);
        try { await this.store.releaseQlooRequest(lease); } catch { throw new AppError('quota_unavailable', 503); }
      }
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new AppError('service_error', 502);
  }
  async search(query: string, kind: Kind): Promise<Choice[]> {
    if (typeof query !== 'string' || query.trim().length < 1 || query.trim().length > 200 || !['movie', 'artist'].includes(kind)) throw new AppError('invalid_query', 422);
    const data = await this.get('/search', {query: query.trim(), types: `urn:entity:${kind}`, take: '5', sort_by: 'match'});
    if (!Array.isArray(data.results)) invalid('search_results');
    const choices: Choice[] = [];
    for (const value of data.results) {
      const row = parseRow(value, kind);
      const year = row.properties.release_year ?? null;
      if (year != null && !Number.isSafeInteger(year)) invalid('release_year');
      if (row.matches && choices.length < 5) choices.push({entity_id: row.entity_id, name: row.name, kind, year: year as number | null});
    }
    return choices;
  }
  async recommend(seedIds: string[], excludedIds: string[]): Promise<MovieResponse> {
    if (!validIds(seedIds) || !validIds(excludedIds) || new Set(seedIds).size < 1 || new Set(seedIds).size > 5) throw new AppError('invalid_seeds', 422);
    const seeds = [...new Set(seedIds)].sort(), excluded = [...new Set(excludedIds)].sort();
    const key = JSON.stringify([HOST, seeds, excluded]);
    let cached: MovieResponse | null;
    try { cached = await this.store.readCache(key); } catch { throw new AppError('cache_unavailable', 503); }
    if (cached) {
      const age = this.clock() - Date.parse(cached.fetched_at);
      if (age >= 0 && age < 900000) return structuredClone(cached);
    }
    const params: Record<string, string> = {'filter.type': 'urn:entity:movie', 'signal.interests.entities': seeds.join(','), take: '20'};
    if (excluded.length) params['filter.exclude.entities'] = excluded.join(',');
    const data = await this.get('/v2/insights', params);
    const entities = object(data.results, 'recommendation_entities').entities;
    if (!Array.isArray(entities)) invalid('recommendation_entities');
    const movies: Movie[] = [], seen = new Set(excluded);
    for (const value of entities) {
      const row = parseRow(value, 'movie');
      const metadata = safeJson(row.properties) as Record<string, unknown>;
      const explainability = row.row.explainability == null ? null : safeJson(row.row.explainability) as Record<string, unknown> | unknown[];
      if (!row.matches || seen.has(row.entity_id)) continue;
      seen.add(row.entity_id);
      if (movies.length < 20) movies.push({entity_id: row.entity_id, name: row.name, metadata, rank: movies.length + 1, explainability});
    }
    const warnings = data.warnings ?? [];
    if (!Array.isArray(warnings)) invalid('warnings_type');
    if (warnings.some(item => typeof item !== 'string')) invalid('warning_entry');
    const result: MovieResponse = {movies, warnings, fetched_at: new Date(this.clock()).toISOString()};
    try { await this.store.writeCache(key, structuredClone(result)); } catch { throw new AppError('cache_unavailable', 503); }
    return result;
  }
}
