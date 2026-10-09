import {AppError, initialRun, parseMembers, SESSION_MS, type Choice, type Group, type Member, type MovieResponse, type MovieRun, type Session, type StoreApi} from './contracts';

type GroupRow = {session_id: string; version: number; members: string; excluded: string; feedback_rounds: number; updated_at: string};
const groupJson = `json_object('session_id',g.session_id,'version',g.version,'members',json(g.members),'excluded_ids',json(g.excluded),'feedback_rounds',g.feedback_rounds,'updated_at',g.updated_at)`;
const confirmed = `NOT EXISTS (SELECT 1 FROM json_each(?) m, json_each(m.value,'$.entity_ids') e WHERE NOT EXISTS (SELECT 1 FROM choices c WHERE c.session_id=? AND c.entity_id=e.value))`;
const alive = `EXISTS (SELECT 1 FROM sessions s WHERE s.id=? AND s.expires>?)`;
function group(row: GroupRow): Group {return {session_id: row.session_id, version: row.version, members: JSON.parse(row.members), excluded_ids: JSON.parse(row.excluded), feedback_rounds: row.feedback_rounds, updated_at: row.updated_at};}

/** Per-call D1 statements: claimRun 3, publish 1, release 1, model 1,
 * Qloo claim 1 + release 1, cache read 1/write 2. Four members with each
 * physical request retried once, cache once per member => 4*(1+4+2)=28;
 * +4 model +3 claim +1 publish +1 release +1 session read =38 statements.
 * Guard diagnostics execute only on denied operations; triggers are atomic
 * inside their containing D1 statement and never an isolate-memory lock.
 */
export class Store implements StoreApi {
  constructor(private db: D1Database, private now: () => number = Date.now) {}
  private sql(query: string, ...values: (string | number | null)[]) {return this.db.prepare(query).bind(...values);}
  async sessionRead(id: string): Promise<Session | null> {
    return this.sql('SELECT id,token,created FROM sessions WHERE id=? AND expires>?', id, this.now()).first<Session>();
  }
  async sessionCreate(): Promise<Session> {
    const created = this.now(), session = {id: crypto.randomUUID(), token: crypto.randomUUID(), created};
    await this.db.batch([
      this.sql('DELETE FROM sessions WHERE expires<=?', created),
      this.sql('DELETE FROM cache WHERE expires<=?', created),
      this.sql('INSERT INTO sessions(id,token,created,expires) VALUES (?,?,?,?)', session.id, session.token, created, created + SESSION_MS),
    ]);
    return session;
  }
  async rememberChoices(session: string, choices: Choice[]): Promise<void> {
    if (!choices.length) {if (!await this.sessionRead(session)) throw new AppError('session_required', 401); return;}
    const result = await this.sql(`INSERT INTO choices(session_id,entity_id,data) SELECT ?,json_extract(value,'$.entity_id'),value FROM json_each(?) WHERE ${alive} ON CONFLICT(session_id,entity_id) DO UPDATE SET data=excluded.data`, session, JSON.stringify(choices), session, this.now()).run();
    if (!result.meta.changes) throw new AppError('session_required', 401);
  }
  private async groupFailure(session: string, expected?: number): Promise<never> {
    const row = await this.sql('SELECT s.expires,g.version FROM sessions s LEFT JOIN groups g ON g.session_id=s.id WHERE s.id=?', session).first<{expires: number; version: number | null}>();
    if (!row || row.expires<=this.now()) throw new AppError('session_required', 401);
    if (row.version == null) throw new AppError('group_unavailable', 404);
    if (expected != null && row.version !== expected) throw new AppError('version_conflict', 409);
    throw new AppError('unconfirmed_entity', 422);
  }
  async createGroup(session: string, members: Member[]): Promise<Group> {
    const json = JSON.stringify(parseMembers(members));
    const row = await this.sql(`INSERT INTO groups(session_id,members,updated_at) SELECT ?,?,? WHERE ${alive} AND ${confirmed} ON CONFLICT(session_id) DO NOTHING RETURNING *`, session, json, new Date(this.now()).toISOString(), session, this.now(), json, session).first<GroupRow>();
    if (row) return group(row);
    if (!await this.sessionRead(session)) throw new AppError('session_required', 401);
    if (await this.sql('SELECT version FROM groups WHERE session_id=?', session).first()) throw new AppError('group_exists', 409);
    throw new AppError('unconfirmed_entity', 422);
  }
  async getGroup(session: string): Promise<Group> {
    const row = await this.sql('SELECT g.* FROM groups g JOIN sessions s ON s.id=g.session_id WHERE g.session_id=? AND s.expires>?', session, this.now()).first<GroupRow>();
    if (!row) return this.groupFailure(session);
    return group(row);
  }
  async updateGroup(session: string, expected: number, members: Member[]): Promise<Group> {
    const json = JSON.stringify(parseMembers(members));
    const row = await this.sql(`UPDATE groups SET members=?,version=version+1,updated_at=? WHERE session_id=? AND version=? AND ${alive} AND ${confirmed} RETURNING *`, json, new Date(this.now()).toISOString(), session, expected, session, this.now(), json, session).first<GroupRow>();
    if (!row) return this.groupFailure(session, expected);
    return group(row);
  }
  async claimRun(session: string, runId: string, expected: number): Promise<{group: Group; previous: MovieRun | null}> {
    const now = this.now();
    const results = await this.db.batch([
      this.sql(`INSERT INTO runs(id,session_id,group_version,data,claim_group,created,expires,lease_until)
        SELECT ?,?,g.version,?,${groupJson},?,s.expires,? FROM groups g JOIN sessions s ON s.id=g.session_id
        WHERE g.session_id=? AND g.version=? AND s.expires>?
        AND (SELECT COUNT(*) FROM runs WHERE session_id=? AND created>?)<4
        AND (SELECT COUNT(*) FROM runs WHERE released=0 AND lease_until>? AND expires>?)<2
        AND NOT EXISTS(SELECT 1 FROM runs WHERE session_id=? AND released=0 AND lease_until>? AND expires>?)
        ON CONFLICT(id) DO NOTHING`, runId, session, JSON.stringify(initialRun(runId, session, expected)), now, now+240000, session, expected, now, session, now-600000, now, now, session, now, now),
      this.sql('SELECT claim_group FROM runs WHERE id=? AND session_id=?', runId, session),
      this.sql('SELECT r.data FROM groups g JOIN runs r ON r.id=g.published_run WHERE g.session_id=?', session),
    ]);
    if (!results[0].meta.changes) {
      const state = await this.sql(`SELECT s.expires,g.version,(SELECT COUNT(*) FROM runs WHERE session_id=? AND created>?) AS attempts FROM sessions s LEFT JOIN groups g ON g.session_id=s.id WHERE s.id=?`, session, now-600000, session).first<{expires: number; version: number | null; attempts: number}>();
      if (!state || state.expires<=now) throw new AppError('session_required', 401);
      if (state.version == null) throw new AppError('group_unavailable', 404);
      if (state.version!==expected) throw new AppError('version_conflict', 409);
      throw new AppError(state.attempts>=4 ? 'session_rate_limit' : 'run_in_progress', 429);
    }
    return {group: JSON.parse((results[1].results[0] as {claim_group: string}).claim_group), previous: results[2].results.length ? JSON.parse((results[2].results[0] as {data: string}).data) : null};
  }
  async releaseRun(session: string, runId: string): Promise<void> {
    await this.sql('UPDATE runs SET released=1 WHERE id=? AND session_id=?', runId, session).run();
  }
  async saveRun(run: MovieRun): Promise<void> {
    if (!['failed','rate_limited','needs_clarification'].includes(run.status)) throw new AppError('invalid_run', 422);
    const result = await this.sql(`UPDATE runs SET data=? WHERE id=? AND session_id=? AND group_version=? AND published=0 AND json_extract(data,'$.status')='running' AND ${alive}`, JSON.stringify(run), run.run_id, run.session_id, run.group_version, run.session_id, this.now()).run();
    if (!result.meta.changes) throw new AppError('run_unavailable', 404);
  }
  async getRun(session: string, runId: string): Promise<MovieRun> {
    const now = this.now();
    const results = await this.db.batch([
      this.sql(`UPDATE runs SET data=json_set(data,'$.status','failed','$.error_code','run_expired','$.candidates',json('[]'),'$.evidence',json('[]'),'$.explanations',json('[]')),released=1 WHERE id=? AND session_id=? AND lease_until<=? AND json_extract(data,'$.status')='running' AND ${alive}`, runId, session, now, session, now),
      this.sql(`SELECT data FROM runs WHERE id=? AND session_id=? AND expires>? AND ${alive}`, runId, session, now, session, now),
    ]);
    if (!results[1].results.length) throw new AppError('run_unavailable', 404);
    return JSON.parse((results[1].results[0] as {data: string}).data);
  }
  async publishRun(run: MovieRun, expected: number, excluded: string[]): Promise<void> {
    if (!['completed','empty'].includes(run.status)) throw new AppError('invalid_run', 422);
    if (excluded.length>3 || new Set(excluded).size!==excluded.length || excluded.some(id => typeof id!=='string' || !id.length)) throw new AppError('invalid_feedback', 422);
    const pending = JSON.stringify(excluded), now = this.now(), publishedVersion = expected + (excluded.length ? 1 : 0);
    const result = await this.sql(`UPDATE runs SET data=?,published=1,pending_exclusions=?,published_at=?
      WHERE id=? AND session_id=? AND group_version=? AND ?=? AND published=0 AND released=0 AND lease_until>? AND expires>?
      AND json_extract(data,'$.status')='running' AND ${alive}
      AND EXISTS(SELECT 1 FROM groups g WHERE g.session_id=runs.session_id AND g.version=?
        AND (?=0 OR (g.feedback_rounds<3 AND g.published_run IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE EXISTS(SELECT 1 FROM json_each(g.excluded) x WHERE x.value=e.value)
            OR NOT EXISTS(SELECT 1 FROM runs p,json_each(p.data,'$.candidates') c WHERE p.id=g.published_run AND json_extract(c.value,'$.entity_id')=e.value)))))`,
      JSON.stringify({...run, group_version: publishedVersion}), pending, new Date(now).toISOString(), run.run_id, run.session_id, expected, run.group_version, expected, now, now, run.session_id, now, expected, excluded.length, pending).run();
    if (!result.meta.changes) {
      const state = await this.sql(`SELECT r.lease_until,r.released,r.published,r.group_version,s.expires,g.version,g.feedback_rounds FROM runs r JOIN sessions s ON s.id=r.session_id JOIN groups g ON g.session_id=r.session_id WHERE r.id=? AND r.session_id=?`, run.run_id, run.session_id).first<{lease_until: number; released: number; published: number; group_version: number; expires: number; version: number; feedback_rounds: number}>();
      if (!state) throw new AppError('run_unavailable', 404);
      if (state.expires<=now) throw new AppError('session_required', 401);
      if (state.version!==expected) throw new AppError('version_conflict', 409);
      if (run.group_version!==expected) throw new AppError('invalid_run', 422);
      if (state.lease_until<=now || state.released || state.published) throw new AppError('run_expired', 409);
      if (excluded.length && state.feedback_rounds>=3) throw new AppError('feedback_limit', 409);
      throw new AppError('invalid_feedback', 422);
    }
    run.group_version = publishedVersion;
  }
  async claimModelRequest(): Promise<void> {
    const result = await this.sql(`INSERT INTO quotas(kind,day,count) VALUES ('model',?,1) ON CONFLICT(kind,day) DO UPDATE SET count=count+1 WHERE count<100 RETURNING count`, Math.floor(this.now()/SESSION_MS)).first();
    if (!result) throw new AppError('model_daily_limit', 429);
  }
  async claimQlooRequest(): Promise<string> {
    const now = this.now(), day = Math.floor(now/SESSION_MS), lease = crypto.randomUUID();
    const result = await this.sql(`UPDATE qloo_slots SET lease=?,expires=?,day=? WHERE slot=(SELECT slot FROM qloo_slots WHERE expires<=? ORDER BY slot LIMIT 1) AND COALESCE((SELECT count FROM quotas WHERE kind='qloo' AND day=?),0)<500 RETURNING lease`, lease, now+15000, day, now, day).first();
    if (!result) {
      const count = await this.sql("SELECT count FROM quotas WHERE kind='qloo' AND day=?", day).first<number>('count');
      throw new AppError((count ?? 0)>=500 ? 'qloo_daily_limit' : 'qloo_busy', 429);
    }
    return lease;
  }
  async releaseQlooRequest(lease: string): Promise<void> {
    await this.sql('UPDATE qloo_slots SET lease=NULL,expires=0 WHERE lease=?', lease).run();
  }
  async readCache(key: string): Promise<MovieResponse | null> {
    const row = await this.sql('SELECT data FROM cache WHERE key=? AND expires>?', key, this.now()).first<{data: string}>();
    return row ? JSON.parse(row.data) : null;
  }
  async writeCache(key: string, value: MovieResponse): Promise<void> {
    const now = this.now();
    await this.db.batch([
      this.sql('INSERT INTO cache(key,data,created,expires) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,created=excluded.created,expires=excluded.expires', key, JSON.stringify(value), now, now+900000),
      this.sql('DELETE FROM cache WHERE expires<=? OR key IN (SELECT key FROM cache ORDER BY created DESC,rowid DESC LIMIT -1 OFFSET 256)', now),
    ]);
  }
}
