import {AppError, Env, exact, MODEL, parseMembers, parseRecommend, Session, StoreApi, text, version} from './contracts';
import {Store} from './store';
import {Qloo} from './qloo';
import {runAgent} from './agent';

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
}
function health(env: Env) {
  const ready = !!env.AI && typeof env.AI.run === 'function';
  return {mode: 'live', model: 'cloudflare', model_name: MODEL, model_enabled: ready, cloudflare_ready: ready, public_hosting: true, qloo_configured: !!env.QLOO_API_KEY};
}
function cookie(request: Request): string {
  return /(?:^|;\s*)hackathon_session=([A-Za-z0-9_-]{1,100})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1] || '';
}
function sameToken(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function requireSession(request: Request, store: StoreApi, write = false): Promise<Session> {
  const session = await store.sessionRead(cookie(request));
  if (!session) throw new AppError('session_required', 401);
  if (write) {
    const token = request.headers.get('X-Action-Token') || '';
    if (!sameToken(session.token, token)) throw new AppError('action_token_required', 403);
    const url = new URL(request.url), origin = request.headers.get('Origin');
    if (url.protocol !== 'https:' || (origin && origin !== url.origin)) throw new AppError('wrong_origin', 403);
  }
  return session;
}
async function readJSON(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AppError('json_required', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('invalid_arguments', 422);
  let size = 0, body = '';
  const decoder = new TextDecoder('utf-8', {fatal: true});
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {await reader.cancel(); throw new AppError('body_too_large', 413);}
      body += decoder.decode(value, {stream: true});
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('invalid_arguments', 422);
  } finally {reader.releaseLock();}
}

export async function handleRequest(request: Request, env: Env, injectedStore?: StoreApi, runner = runAgent): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/')) {
    if (path === '/' || path === '/index.html') return new Response(null, {status: 302, headers: {Location: '/tastebridge', 'Cache-Control': 'no-store'}});
    if (path === '/tastebridge') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    if (path.startsWith('/assets/')) return env.ASSETS.fetch(request);
    return new Response('Not found', {status: 404, headers: {'X-Content-Type-Options': 'nosniff'}});
  }
  try {
    if (path === '/api/health' && request.method === 'GET') return json(health(env));
    if (!env.DB && !injectedStore) throw new AppError('storage_unconfigured', 503);
    const store = injectedStore ?? new Store(env.DB);
    if (path === '/api/session' && request.method === 'GET') {
      const existing = await store.sessionRead(cookie(request));
      const session = existing ?? await store.sessionCreate();
      return json({...health(env), action_token: session.token}, 200, existing ? {} : {'Set-Cookie': `hackathon_session=${session.id}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`});
    }
    const write = request.method !== 'GET';
    const session = await requireSession(request, store, write);
    if (path === '/api/tastebridge/entities/search' && request.method === 'GET') {
      const query = text((url.searchParams.get('query') || '').trim(), 1, 200);
      const kind = url.searchParams.get('kind');
      if (kind !== 'movie' && kind !== 'artist') throw new AppError('invalid_query', 422);
      const choices = await new Qloo(env, store).search(query, kind);
      await store.rememberChoices(session.id, choices);
      return json(choices);
    }
    if (path === '/api/tastebridge/groups') {
      if (request.method === 'GET') return json(await store.getGroup(session.id));
      if (request.method === 'POST') {
        const body = exact(await readJSON(request), ['members']);
        return json(await store.createGroup(session.id, parseMembers(body.members)));
      }
      throw new AppError('method_not_allowed', 405);
    }
    if (path === '/api/tastebridge/groups/preferences' && request.method === 'PUT') {
      const body = exact(await readJSON(request), ['members', 'expected_version']);
      return json(await store.updateGroup(session.id, version(body.expected_version), parseMembers(body.members)));
    }
    if (path === '/api/tastebridge/recommendations' && request.method === 'POST') {
      const body = parseRecommend(await readJSON(request));
      const runId = crypto.randomUUID().replaceAll('-', '');
      await runner(store, env, runId, session.id, body);
      return json({run_id: runId});
    }
    const match = /^\/api\/tastebridge\/recommendations\/([A-Za-z0-9_-]{1,100})$/.exec(path);
    if (match && request.method === 'GET') return json(await store.getRun(session.id, match[1]));
    throw new AppError('not_found', 404);
  } catch (error) {
    return error instanceof AppError ? json({detail: error.code}, error.status) : json({detail: 'service_unavailable'}, 503);
  }
}
export default {fetch: (request: Request, env: Env) => handleRequest(request, env)};
