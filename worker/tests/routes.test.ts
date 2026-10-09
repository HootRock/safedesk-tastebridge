import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleRequest} from '../src/index';
import {AppError, Env, Group, initialRun, StoreApi} from '../src/contracts';
vi.mock('../src/qloo', () => ({Qloo: class {async search() {return []}}}));

const session = {id: 'known-session', token: 'known-action', created: Date.now()};
const group: Group = {session_id: session.id, version: 1, members: [], excluded_ids: [], feedback_rounds: 0, updated_at: new Date().toISOString()};
let store: StoreApi;
let runner: ReturnType<typeof vi.fn>;
const env = {DB: {}, AI: {run: vi.fn()}, ASSETS: {fetch: vi.fn(async () => new Response('asset'))}, QLOO_API_KEY: 'test-key'} as unknown as Env;
function req(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://tastebridge.example${path}`, {method, headers: {'Cookie': 'hackathon_session=known-session', 'Content-Type': 'application/json', ...headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
}
beforeEach(() => {
  store = {sessionRead: vi.fn(async id => id === session.id ? session : null), sessionCreate: vi.fn(async () => session), rememberChoices: vi.fn(async () => {}), createGroup: vi.fn(async () => group), getGroup: vi.fn(async () => group), updateGroup: vi.fn(async () => ({...group, version: 2})), claimRun: vi.fn(), releaseRun: vi.fn(), saveRun: vi.fn(), getRun: vi.fn(async () => ({...initialRun('r', session.id, 1), status: 'completed'})), publishRun: vi.fn(), claimModelRequest: vi.fn(), claimQlooRequest: vi.fn(), releaseQlooRequest: vi.fn(), readCache: vi.fn(), writeCache: vi.fn()} as StoreApi;
  runner = vi.fn(async () => ({...initialRun('r', session.id, 1), status: 'completed'}));
});
describe('compatible TasteBridge routes', () => {
  it('health is JSON, private and accurately configuration-only', async () => {
    const r = await handleRequest(req('/api/health'), env, store, runner);
    expect(r.headers.get('Content-Type')).toContain('application/json');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toMatchObject({model: 'cloudflare', mode: 'live', public_hosting: true, qloo_configured: true});
  });
  it('new sessions receive a secure first-party cookie and an action token', async () => {
    const r = await handleRequest(new Request('https://tastebridge.example/api/session'), env, store, runner);
    expect(r.headers.get('Set-Cookie')).toMatch(/hackathon_session=.*HttpOnly; Secure; SameSite=Lax/);
    expect(await r.json()).toMatchObject({action_token: session.token});
  });
  it('rejects mutation without action token before provider or state calls', async () => {
    const r = await handleRequest(req('/api/tastebridge/recommendations', 'POST', {expected_version: 1}), env, store, runner);
    expect(r.status).toBe(403); expect(runner).not.toHaveBeenCalled();
  });
  it('rejects a foreign Origin even with a valid token', async () => {
    const r = await handleRequest(req('/api/tastebridge/recommendations', 'POST', {expected_version: 1}, {'X-Action-Token': session.token, Origin: 'https://foreign.example'}), env, store, runner);
    expect(r.status).toBe(403); expect(runner).not.toHaveBeenCalled();
  });
  it('rejects extra fields and oversized bodies before invoking the agent', async () => {
    for (const body of [{expected_version: 1, invented: true}, {expected_version: 1, feedback: 'x'.repeat(20000)}]) {
      const r = await handleRequest(req('/api/tastebridge/recommendations', 'POST', body, {'X-Action-Token': session.token}), env, store, runner);
      expect([413, 422]).toContain(r.status);
    }
    expect(runner).not.toHaveBeenCalled();
  });
  it('awaits completed persistence before returning the original run_id response', async () => {
    let done = false;
    runner.mockImplementationOnce(async () => {await Promise.resolve(); done = true; return initialRun('r', session.id, 1)});
    const r = await handleRequest(req('/api/tastebridge/recommendations', 'POST', {expected_version: 1}, {'X-Action-Token': session.token, Origin: 'https://tastebridge.example'}), env, store, runner);
    expect(done).toBe(true); expect(await r.json()).toHaveProperty('run_id');
  });
  it('passes both session and run id to the ownership-guarded lookup', async () => {
    await handleRequest(req('/api/tastebridge/recommendations/owned-run'), env, store, runner);
    expect(store.getRun).toHaveBeenCalledWith(session.id, 'owned-run');
  });
  it('returns stable errors and never reflects an arbitrary storage exception', async () => {
    vi.mocked(store.getGroup).mockRejectedValueOnce(new Error('private-diagnostic-value'));
    const r = await handleRequest(req('/api/tastebridge/groups'), env, store, runner);
    expect(r.status).toBe(503); expect(await r.text()).not.toContain('private-diagnostic-value');
    vi.mocked(store.getGroup).mockRejectedValueOnce(new AppError('group_unavailable', 404));
    expect((await handleRequest(req('/api/tastebridge/groups'), env, store, runner)).status).toBe(404);
  });
  it('redirects the root to TasteBridge and avoids an unsupported SafeDesk page', async () => {
    expect((await handleRequest(req('/'), env, store, runner)).headers.get('Location')).toBe('/tastebridge');
    expect((await handleRequest(req('/safedesk'), env, store, runner)).status).toBe(404);
  });
  it('redirects the static HTML entry to the supported TasteBridge route', async () => {
    const response = await handleRequest(req('/index.html'), env, store, runner);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/tastebridge');
  });
  it('never routes an unknown API path to SPA assets', async () => {
    const r = await handleRequest(req('/api/not-a-route'), env, store, runner);
    expect(r.status).toBe(404); expect(r.headers.get('Content-Type')).toContain('application/json');
  });
});
