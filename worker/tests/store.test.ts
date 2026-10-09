import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {Store} from '../src/store';
import {initialRun, type Member, type MovieRun} from '../src/contracts';
import {testDatabase} from './d1';

describe('durable D1 Store', () => {
  let db: D1Database, dispose: () => Promise<void>, now: number, store: Store;
  beforeEach(async () => {({db, dispose} = await testDatabase()); now = Date.UTC(2026, 9, 9, 12); store = new Store(db, () => now);});
  afterEach(async () => {await dispose();});
  const id = () => crypto.randomUUID();
  async function setup() {
    const session = await store.sessionCreate();
    const ids = [id(), id()];
    await store.rememberChoices(session.id, ids.map(entity_id => ({entity_id, name: 'Synthetic choice', kind: 'movie' as const, year: null})));
    const members: Member[] = ids.map((entity_id, i) => ({member_id: id(), nickname: `Member ${i}`, entity_ids: [entity_id]}));
    const group = await store.createGroup(session.id, members);
    return {session, members, group};
  }
  function completed(session: string, version: number, runId: string, candidateId = id()): MovieRun {
    return {...initialRun(runId, session, version), status: 'completed', candidates: [{entity_id: candidateId, name: 'Synthetic film', metadata: {}, ranking: {entity_id: candidateId, score: 1, mean_utility: 1, min_utility: 1, ranks: {}}}]};
  }
  it('expires session access and keeps cryptographic session/action tokens distinct', async () => {
    const session = await store.sessionCreate();
    expect(session.id).not.toBe(session.token);
    expect(await store.sessionRead(session.id)).toEqual(session);
    now += 86400000;
    expect(await store.sessionRead(session.id)).toBeNull();
    await expect(store.rememberChoices(session.id, [])).rejects.toMatchObject({code: 'session_required'});
  });
  it('requires session-owned confirmed entities and one group per session', async () => {
    const {session, members} = await setup();
    const other = await store.sessionCreate();
    await expect(store.createGroup(other.id, members)).rejects.toMatchObject({code: 'unconfirmed_entity'});
    await expect(store.createGroup(session.id, members)).rejects.toMatchObject({code: 'group_exists'});
    await expect(store.getGroup(other.id)).rejects.toMatchObject({code: 'group_unavailable'});
  });
  it('allows only one concurrent preference CAS winner across Store instances', async () => {
    const {session, members} = await setup();
    const rival = new Store(db, () => now);
    const results = await Promise.allSettled([store.updateGroup(session.id, 1, members), rival.updateGroup(session.id, 1, members)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.getGroup(session.id)).toMatchObject({version: 2});
  });
  it('limits global running leases to two and reclaims crashed leases after 240 seconds', async () => {
    const a = await setup(), b = await setup(), c = await setup();
    await Promise.all([store.claimRun(a.session.id, id(), 1), new Store(db, () => now).claimRun(b.session.id, id(), 1)]);
    await expect(store.claimRun(c.session.id, id(), 1)).rejects.toMatchObject({code: 'run_in_progress'});
    now += 240000;
    await expect(store.claimRun(c.session.id, id(), 1)).resolves.toMatchObject({group: {version: 1}, previous: null});
  });
  it('counts at most four durable attempts per session in a sliding 600 second window', async () => {
    const {session} = await setup();
    for (let i = 0; i < 4; i++) {const runId = id(); await store.claimRun(session.id, runId, 1); await store.releaseRun(session.id, runId);}
    await expect(store.claimRun(session.id, id(), 1)).rejects.toMatchObject({code: 'session_rate_limit'});
    now += 600000;
    await expect(store.claimRun(session.id, id(), 1)).resolves.toBeDefined();
  });
  it('denies stale claim and stale publication without mutating previous completed result', async () => {
    const {session, members} = await setup();
    const firstId = id(); await store.claimRun(session.id, firstId, 1);
    const first = completed(session.id, 1, firstId); await store.publishRun(first, 1, []); await store.releaseRun(session.id, firstId);
    const nextId = id(); await store.claimRun(session.id, nextId, 1);
    await store.updateGroup(session.id, 1, members);
    await expect(store.publishRun(completed(session.id, 1, nextId), 1, [first.candidates[0].entity_id])).rejects.toMatchObject({code: 'version_conflict'});
    expect((await store.getRun(session.id, firstId)).candidates).toEqual(first.candidates);
    expect(await store.getGroup(session.id)).toMatchObject({version: 2, excluded_ids: [], feedback_rounds: 0});
    await expect(store.claimRun(session.id, id(), 1)).rejects.toMatchObject({code: 'version_conflict'});
  });
  it('commits three successful watched rounds, preserving exclusions on preference edits', async () => {
    const {session, members} = await setup(); let expected = 1; const exclusions: string[] = [];
    let runId = id(); await store.claimRun(session.id, runId, expected); let result = completed(session.id, expected, runId);
    await store.publishRun(result, expected, []); await store.releaseRun(session.id, runId);
    for (let round = 1; round <= 3; round++) {
      const watched = result.candidates[0].entity_id; exclusions.push(watched); runId = id();
      const claim = await store.claimRun(session.id, runId, expected); expect(claim.previous?.run_id).toBe(result.run_id);
      result = completed(session.id, expected, runId); await store.publishRun(result, expected, [watched]); expected++;
      expect(result.group_version).toBe(expected);
      expect((await store.getRun(session.id, runId)).group_version).toBe(expected);
      await store.releaseRun(session.id, runId);
      expect(await store.getGroup(session.id)).toMatchObject({excluded_ids: exclusions, feedback_rounds: round, version: expected});
      if (round === 1) {await store.updateGroup(session.id, expected, members); expected++; expect((await store.getGroup(session.id)).excluded_ids).toEqual(exclusions);}
      now += 600001;
    }
    runId = id(); await store.claimRun(session.id, runId, expected);
    await expect(store.publishRun(completed(session.id, expected, runId), expected, [result.candidates[0].entity_id])).rejects.toMatchObject({code: 'feedback_limit'});
  });
  it('rejects fabricated exclusions, failed publication, and expired lease publication', async () => {
    const {session} = await setup(); const runId = id(); await store.claimRun(session.id, runId, 1);
    await expect(store.publishRun(completed(session.id, 1, runId), 1, [id()])).rejects.toMatchObject({code: 'invalid_feedback'});
    await expect(store.publishRun({...initialRun(runId, session.id, 1), status: 'failed'}, 1, [])).rejects.toMatchObject({code: 'invalid_run'});
    now += 240000;
    await expect(store.publishRun(completed(session.id, 1, runId), 1, [])).rejects.toMatchObject({code: 'run_expired'});
    expect(await store.getGroup(session.id)).toMatchObject({version: 1, feedback_rounds: 0});
  });
  it('isolates run ownership and persists a stable expired failure instead of forever running', async () => {
    const {session} = await setup(); const other = await store.sessionCreate(), runId = id(); await store.claimRun(session.id, runId, 1);
    await expect(store.getRun(other.id, runId)).rejects.toMatchObject({code: 'run_unavailable'});
    now += 240000; const failed = await store.getRun(session.id, runId);
    expect(failed).toMatchObject({status: 'failed', error_code: 'run_expired', candidates: []});
    expect(await store.getRun(session.id, runId)).toEqual(failed);
  });
  it('retains prior successful result when a subsequent run fails', async () => {
    const {session} = await setup(); const goodId = id(); await store.claimRun(session.id, goodId, 1);
    const good = completed(session.id, 1, goodId); await store.publishRun(good, 1, []); await store.releaseRun(session.id, goodId);
    const failedId = id(); await store.claimRun(session.id, failedId, 1);
    await store.saveRun({...initialRun(failedId, session.id, 1), status: 'failed', error_code: 'provider_failed'}); await store.releaseRun(session.id, failedId);
    expect((await store.claimRun(session.id, id(), 1)).previous?.run_id).toBe(goodId);
    await expect(store.saveRun({...good, session_id: id(), status: 'failed'})).rejects.toMatchObject({code: 'run_unavailable'});
  });
  it('counts failed model claims and resets at UTC midnight without cross-isolate overshoot', async () => {
    await db.prepare("INSERT INTO quotas(kind,day,count) VALUES ('model',?,99)").bind(Math.floor(now / 86400000)).run();
    const attempts = await Promise.allSettled([store.claimModelRequest(), new Store(db, () => now).claimModelRequest()]);
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(store.claimModelRequest()).rejects.toMatchObject({code: 'model_daily_limit'});
    now = Date.UTC(2026, 9, 10); await expect(store.claimModelRequest()).resolves.toBeUndefined();
  });
  it('atomically reserves two Qloo slots without charging denied physical requests', async () => {
    const claims = await Promise.allSettled([store.claimQlooRequest(), new Store(db, () => now).claimQlooRequest(), new Store(db, () => now).claimQlooRequest()]);
    expect(claims.filter(r => r.status === 'fulfilled')).toHaveLength(2);
    expect(await db.prepare("SELECT count FROM quotas WHERE kind='qloo'").first('count')).toBe(2);
    const lease = claims.find(r => r.status === 'fulfilled')! as PromiseFulfilledResult<string>; await store.releaseQlooRequest(lease.value);
    await store.claimQlooRequest(); now += 15000; await store.claimQlooRequest();
    expect(await db.prepare("SELECT count FROM quotas WHERE kind='qloo'").first('count')).toBe(4);
  });
  it('stops at 500 Qloo calls and does not leave a slot reserved on denial', async () => {
    await db.prepare("INSERT INTO quotas(kind,day,count) VALUES ('qloo',?,499)").bind(Math.floor(now / 86400000)).run();
    const lease = await store.claimQlooRequest(); await store.releaseQlooRequest(lease);
    await expect(store.claimQlooRequest()).rejects.toMatchObject({code: 'qloo_daily_limit'});
    expect(await db.prepare('SELECT COUNT(*) AS n FROM qloo_slots WHERE expires > ?').bind(now).first('n')).toBe(0);
  });
  it('expires private cache at 15 minutes and bounds it to 256 entries', async () => {
    const value = {movies: [], warnings: [], fetched_at: new Date(now).toISOString()};
    await store.writeCache('synthetic', value); expect(await store.readCache('synthetic')).toEqual(value);
    now += 900000; expect(await store.readCache('synthetic')).toBeNull();
    const keys = Array.from({length: 256}, id);
    await db.prepare('INSERT INTO cache(key,data,created,expires) SELECT value,?,?,? FROM json_each(?)').bind(JSON.stringify(value), now, now+900000, JSON.stringify(keys)).run();
    await store.writeCache(id(), value);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM cache').first('n')).toBe(256);
  });
  it('commits exact multi-film feedback on an honest empty result and denies replay', async () => {
    const {session} = await setup(); const firstId = id(); await store.claimRun(session.id, firstId, 1);
    const first = completed(session.id, 1, firstId);
    first.candidates.push(completed(session.id, 1, id()).candidates[0]);
    await store.publishRun(first, 1, []); await store.releaseRun(session.id, firstId);
    const nextId = id(); await store.claimRun(session.id, nextId, 1);
    const empty = {...initialRun(nextId, session.id, 1), status: 'empty' as const};
    const seen = first.candidates.map(c => c.entity_id);
    await store.publishRun(empty, 1, seen);
    expect(await store.getGroup(session.id)).toMatchObject({version: 2, feedback_rounds: 1, excluded_ids: seen});
    expect((await store.getRun(session.id, nextId)).status).toBe('empty');
    await expect(store.publishRun(empty, 1, seen)).rejects.toMatchObject({code: 'version_conflict'});
    expect((await store.getGroup(session.id)).feedback_rounds).toBe(1);
  });
  it('allows only one competing publication to change exclusions and result', async () => {
    const {session} = await setup(); const runId = id(); await store.claimRun(session.id, runId, 1);
    const a = completed(session.id, 1, runId), b = completed(session.id, 1, runId);
    const results = await Promise.allSettled([store.publishRun(a, 1, []), new Store(db, () => now).publishRun(b, 1, [])]);
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    const published = await store.getRun(session.id, runId);
    expect([a.candidates[0].entity_id, b.candidates[0].entity_id]).toContain(published.candidates[0].entity_id);
  });
  it('cascades expired session data without making expired provider cache available', async () => {
    const {session} = await setup(); const runId = id(); await store.claimRun(session.id, runId, 1);
    now += 86400000; await store.sessionCreate();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM choices WHERE session_id=?').bind(session.id).first('n')).toBe(0);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM groups WHERE session_id=?').bind(session.id).first('n')).toBe(0);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE session_id=?').bind(session.id).first('n')).toBe(0);
  });
  it('uses 38 D1 statements for four members, four model calls, and one physical retry per member', async () => {
    const {session} = await setup(); let statements = 0;
    const counted = {prepare(query: string) {statements++; return db.prepare(query);}, batch: db.batch.bind(db)} as D1Database;
    const countedStore = new Store(counted, () => now); await countedStore.sessionRead(session.id);
    const runId = id(); await countedStore.claimRun(session.id, runId, 1);
    for (let i = 0; i < 4; i++) {
      await countedStore.claimModelRequest(); const key = id(); await countedStore.readCache(key);
      for (let physical = 0; physical < 2; physical++) {const lease = await countedStore.claimQlooRequest(); await countedStore.releaseQlooRequest(lease);}
      await countedStore.writeCache(key, {movies: [], warnings: [], fetched_at: new Date(now).toISOString()});
    }
    await countedStore.publishRun(completed(session.id, 1, runId), 1, []); await countedStore.releaseRun(session.id, runId);
    expect(statements).toBe(38);
  });
});
