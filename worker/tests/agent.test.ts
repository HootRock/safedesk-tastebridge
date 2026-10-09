import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppError, WORKFLOW_MS, initialRun, type Counters, type Env, type Group, type Message, type MovieResponse, type MovieRun, type Plan, type StoreApi, type ToolName} from '../src/contracts';
import {runAgent} from '../src/agent';

const control = vi.hoisted(() => ({
  plans: [] as unknown[], queries: [] as {seeds:string[]; excluded:string[]}[],
  offered: [] as string[][], failQuery: false, stallModel: false,
}));
vi.mock('../src/planner', () => ({Planner: class {
  async next(_messages:Message[], available:ToolName[], budget:Counters):Promise<Plan> {
    budget.model_attempts++;
    control.offered.push([...available]);
    if (control.stallModel) return new Promise(() => {});
    const override = control.plans.shift();
    if (override instanceof Error) throw override;
    if (override) return override as Plan;
    return plan(available[0]);
  }
}}));
vi.mock('../src/qloo', () => ({Qloo: class {
  async recommend(seeds:string[], excluded:string[]):Promise<MovieResponse> {
    control.queries.push({seeds:[...seeds],excluded:[...excluded]});
    if (control.failQuery) throw new Error('Authorization failed: synthetic-secret-do-not-echo');
    return {movies:Array.from({length:8}, (_,i) => `film-${i+1}`).filter(id => !excluded.includes(id)).map((entity_id,i) => ({entity_id,name:`Movie ${entity_id}`,metadata:{release_year:2000+i},rank:i+1,explainability:null})),warnings:[],fetched_at:'2026-10-09T00:00:00Z'};
  }
}}));

function plan(name:ToolName, args:Record<string,unknown> = {}):Plan {
  return {tool_calls:[{call_id:`call-${name}`,name,args}],text:null};
}
function fixture() {
  let group:Group = {session_id:'session',version:1,members:[{member_id:'a',nickname:'A',entity_ids:['seed-a']},{member_id:'b',nickname:'B',entity_ids:['seed-b']}],excluded_ids:[],feedback_rounds:0,updated_at:'2026-10-09T00:00:00Z'};
  let previous:MovieRun|null = null;
  let raced = false;
  const runs = new Map<string,MovieRun>();
  const releases:string[] = [];
  const publications:string[][] = [];
  const store = {
    async claimRun(session:string, id:string, expected:number) {
      if (expected !== group.version) throw new AppError('version_conflict');
      runs.set(id,initialRun(id,session,expected));
      return {group:structuredClone(group),previous:previous && structuredClone(previous)};
    },
    async saveRun(run:MovieRun) { runs.set(run.run_id,structuredClone(run)); },
    async releaseRun(_session:string,id:string) { releases.push(id); },
    async publishRun(run:MovieRun, expected:number, excluded:string[]) {
      if (raced || expected !== group.version) throw new AppError('version_conflict');
      publications.push([...excluded]);
      if (excluded.length) {
        group.excluded_ids = [...new Set([...group.excluded_ids,...excluded])];
        group.feedback_rounds++; group.version++;
      }
      run.group_version = group.version;
      runs.set(run.run_id,structuredClone(run));
      if (run.status === 'completed') previous = structuredClone(run);
    },
  } as unknown as StoreApi;
  const env = {} as Env;
  return {store,env,runs,releases,publications,get group(){return group;},get previous(){return previous;},setPrevious(run:MovieRun){previous=run;},race(){raced=true;}};
}

beforeEach(() => {
  control.plans=[]; control.queries=[]; control.offered=[];
  control.failQuery=false; control.stallModel=false;
});
afterEach(() => vi.useRealTimers());

describe('awaited movie workflow', () => {
  it('queries every confirmed member once and publishes actual ranks and Python evidence events', async () => {
    const f=fixture();
    const run=await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    expect(run.status).toBe('completed');
    expect(run.candidates.map(c=>c.entity_id)).toEqual(['film-1','film-2','film-3']);
    expect(run.candidates[0].ranking).toEqual({entity_id:'film-1',score:1,mean_utility:1,min_utility:1,ranks:{a:1,b:1}});
    expect(run.evidence[0]).toEqual({evidence_id:'a:film-1:rank',member_id:'a',entity_id:'film-1',kind:'candidate_rank',value:1});
    expect(control.queries).toEqual([{seeds:['seed-a'],excluded:[]},{seeds:['seed-b'],excluded:[]}]);
    expect(control.offered).toEqual([['recommend_for_group'],['rank_for_group']]);
    expect(run.counters).toEqual({model_attempts:2,tool_calls:2});
    expect(run.events.map(e=>[e.seq,e.tool_name,e.decision,e.mode,e.source])).toEqual([[1,'recommend_movies','allowed','live',null],[2,'recommend_movies','allowed','live',null],[3,'recommend_for_group','allowed','live',null],[4,'rank_for_group','allowed','live',null]]);
    expect(run.explanations).toEqual(['Group score combines the average and lowest candidate-rank utility equally.','Not in a candidate list means missing from this query, not dislike.','Qloo explanation details unavailable; rank evidence only.']);
    expect(f.releases).toEqual(['initial']);
  });

  it('commits exactly three watched-film updates with changing versions', async () => {
    const f=fixture();
    await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    for(let i=1;i<=3;i++) {
      const id=f.previous!.candidates[0].entity_id;
      control.plans.push(plan('refine_preferences',{excluded_ids:[id]}));
      const run=await runAgent(f.store,f.env,`feedback-${i}`,'session',{expected_version:f.group.version,seen_entity_id:id});
      expect(run.status).toBe('completed');
      expect(run.group_version).toBe(i+1);
      expect(run.candidates.some(c=>c.entity_id===id)).toBe(false);
      expect(run.counters).toEqual({model_attempts:3,tool_calls:3});
    }
    expect(f.group.excluded_ids).toEqual(['film-1','film-2','film-3']);
    expect(f.group.feedback_rounds).toBe(3);
    const blocked=await runAgent(f.store,f.env,'fourth','session',{expected_version:4,seen_entity_id:'film-4'});
    expect(blocked.error_code).toBe('feedback_limit');
    expect(blocked.status).toBe('rate_limited');
    expect(control.queries).toHaveLength(8);
    expect(f.releases).toHaveLength(5);
  });

  it('asks clarification on vague feedback without operating tools or changing preferences', async () => {
    const f=fixture();
    control.plans.push({tool_calls:[],text:'Which movie have you seen?'});
    const run=await runAgent(f.store,f.env,'vague','session',{expected_version:1,feedback:'Something happier'});
    expect(run.status).toBe('needs_clarification');
    expect(run.explanations).toEqual(['Which movie have you seen?']);
    expect(run.counters.tool_calls).toBe(0);
    expect(control.queries).toHaveLength(0);
    expect(f.publications).toHaveLength(0);
  });

  it.each([
    ['rank_for_group',{},'member_queries_required'],
    ['refine_preferences',{excluded_ids:['invented']},'invalid_stage'],
    ['recommend_for_group',{invented:'argument'},'invalid_arguments'],
  ] as const)('rejects invalid initial call %s', async (name,args,code) => {
    const f=fixture(); control.plans.push(plan(name,args));
    const run=await runAgent(f.store,f.env,'invalid','session',{expected_version:1});
    expect(run.status).toBe('failed'); expect(run.error_code).toBe(code);
    expect(run.candidates).toEqual([]); expect(control.queries).toHaveLength(0);
    expect(f.publications).toHaveLength(0); expect(f.releases).toEqual(['invalid']);
  });

  it('rejects refinement that differs from the exact watched ID', async () => {
    const f=fixture(); await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    control.plans.push(plan('refine_preferences',{excluded_ids:['film-2']}));
    const run=await runAgent(f.store,f.env,'mismatch','session',{expected_version:1,seen_entity_id:'film-1'});
    expect(run.error_code).toBe('seen_entity_mismatch');
    expect(f.group.excluded_ids).toEqual([]); expect(control.queries).toHaveLength(2);
  });

  it.each(['wrong-version','failed','empty'] as const)('does not trust a %s prior shortlist for exact feedback', async kind => {
    const f=fixture(); const prior=await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    const altered=structuredClone(prior);
    if(kind==='wrong-version') altered.group_version=2; else altered.status=kind;
    f.setPrevious(altered);
    const run=await runAgent(f.store,f.env,'unshown','session',{expected_version:1,seen_entity_id:'film-1'});
    expect(run.error_code).toBe('unrecommended_entity');
    expect(control.queries).toHaveLength(2);
  });

  it('rejects completed-stage replay without requerying members', async () => {
    const f=fixture(); control.plans.push(plan('recommend_for_group'),plan('recommend_for_group'));
    const run=await runAgent(f.store,f.env,'replay','session',{expected_version:1});
    expect(run.error_code).toBe('invalid_stage');
    expect(control.queries).toHaveLength(2); expect(f.publications).toHaveLength(0);
  });

  it('does not publish any candidate or exclusion after a version race', async () => {
    const f=fixture(); await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    const previous=structuredClone(f.previous); f.race();
    control.plans.push(plan('refine_preferences',{excluded_ids:['film-1']}));
    const run=await runAgent(f.store,f.env,'raced','session',{expected_version:1,seen_entity_id:'film-1'});
    expect(run.status).toBe('failed'); expect(run.error_code).toBe('version_conflict');
    expect(run.candidates).toEqual([]); expect(run.evidence).toEqual([]);
    expect(f.previous).toEqual(previous); expect(f.group.excluded_ids).toEqual([]);
    expect(f.releases).toEqual(['initial','raced']);
  });

  it('sanitizes provider failures and retains the last successful shortlist', async () => {
    const f=fixture(); await runAgent(f.store,f.env,'initial','session',{expected_version:1});
    const previous=structuredClone(f.previous); control.failQuery=true;
    control.plans.push(plan('refine_preferences',{excluded_ids:['film-1']}));
    const run=await runAgent(f.store,f.env,'failure','session',{expected_version:1,seen_entity_id:'film-1'});
    expect(run.status).toBe('failed'); expect(run.error_code).toBe('provider_failure');
    expect(JSON.stringify(run)).not.toContain('synthetic-secret');
    expect(f.previous).toEqual(previous); expect(f.group.excluded_ids).toEqual([]);
    expect(f.runs.get('failure')?.candidates).toEqual([]);
  });

  it('returns and persists timeout before a never-settling model can extend the workflow', async () => {
    vi.useFakeTimers(); const f=fixture(); control.stallModel=true;
    const pending=runAgent(f.store,f.env,'timeout','session',{expected_version:1});
    await vi.advanceTimersByTimeAsync(WORKFLOW_MS+1);
    const run=await pending;
    expect(run.error_code).toBe('workflow_timeout'); expect(run.status).toBe('failed');
    expect(f.runs.get('timeout')?.status).toBe('failed');
    expect(f.releases).toEqual(['timeout']); expect(control.queries).toHaveLength(0);
  });

  it('releases claimed resources when publication fails', async () => {
    const f=fixture(); f.race();
    const run=await runAgent(f.store,f.env,'publish-failure','session',{expected_version:1});
    expect(run.error_code).toBe('version_conflict');
    expect(f.releases).toEqual(['publish-failure']);
  });

  it('supports member IDs that match object prototype names', async () => {
    const f=fixture(); f.group.members[0].member_id='__proto__';
    const run=await runAgent(f.store,f.env,'prototype-member','session',{expected_version:1});
    expect(run.status).toBe('completed');
    expect(run.candidates[0].ranking.ranks.__proto__).toBe(1);
    expect(run.evidence.some(item=>item.member_id==='__proto__')).toBe(true);
  });

  it.each(['qloo_daily_limit','rate_limited','model_context_limit'] as const)('preserves safe quota code %s', async code => {
    const f=fixture(); control.plans.push(new AppError(code,429));
    const run=await runAgent(f.store,f.env,'limited','session',{expected_version:1});
    expect(run.error_code).toBe(code); expect(run.status).toBe('rate_limited');
    expect(f.publications).toHaveLength(0);
  });

  it('throws a failed claim for the POST route instead of creating a phantom run', async () => {
    const f=fixture();
    await expect(runAgent(f.store,f.env,'unclaimed','session',{expected_version:2})).rejects.toMatchObject({code:'version_conflict',status:400});
    expect(f.runs.has('unclaimed')).toBe(false);
    expect(f.releases).toEqual(['unclaimed']);
  });
});
