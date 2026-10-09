import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {handleRequest} from '../src/index';
import {MODEL, type Choice, type Env, type Group, type Member, type MovieRun, type RecommendInput} from '../src/contracts';
import {testDatabase} from './d1';

const ORIGIN='https://tastebridge.example';
type Client={cookie:string; token:string; sessionId:string};

describe('real router / D1 / agent / providers integration', () => {
  let db:D1Database, dispose:()=>Promise<void>, env:Env, now:number;
  let seedIds:string[], filmIds:string[], calls:{path:string; seeds:string[]; excluded:string[]}[];
  let aiCalls:number, failInsights:boolean, retryEveryMember:boolean, statements:number;
  let retryKeys:Set<string>;

  beforeEach(async () => {
    ({db,dispose}=await testDatabase());
    now=Date.now(); vi.spyOn(Date,'now').mockImplementation(()=>now);
    seedIds=Array.from({length:4},()=>crypto.randomUUID());
    filmIds=Array.from({length:9},()=>crypto.randomUUID());
    calls=[]; aiCalls=0; statements=0; failInsights=false; retryEveryMember=false; retryKeys=new Set();
    const counted={prepare(query:string){statements++; return db.prepare(query);},batch:db.batch.bind(db),exec:db.exec.bind(db)} as D1Database;
    env={DB:counted,QLOO_API_KEY:'synthetic-test-key',ASSETS:{fetch:async()=>new Response('synthetic asset')},AI:{
      async run(model,input) {
        expect(model).toBe(MODEL);
        expect(input.max_tokens).toBe(1024);
        expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThanOrEqual(6000);
        const messages=input.messages as {role:string;content:string}[];
        const prompt=JSON.parse(messages[1].content) as {messages:{role:string;content:string}[];application_tools:{name:string}[]};
        const offered=prompt.application_tools.map(tool=>tool.name);
        expect(offered).toHaveLength(1);
        const context=JSON.parse(prompt.messages.find(message=>message.role==='user')!.content) as {seen_entity_id:string|null;shown_candidates:{entity_id:string}[]};
        const name=offered[0];
        const args=name==='refine_preferences' ? {excluded_ids:[context.seen_entity_id]} : {};
        if(name==='refine_preferences') expect(context.shown_candidates.some(candidate=>candidate.entity_id===context.seen_entity_id)).toBe(true);
        const response={tool_calls:[{call_id:crypto.randomUUID(),name,arguments:JSON.stringify(args)}],text:null};
        aiCalls++;
        // Exercise both native binding response representations with strict raw JSON.
        return {response:aiCalls%2 ? JSON.stringify(response) : response,finish_reason:'stop'};
      },
    }};
    vi.stubGlobal('fetch',async (request:Request|string|URL,init?:RequestInit) => {
      const url=new URL(request instanceof Request ? request.url : String(request));
      expect(url.origin).toBe('https://hackathon.api.qloo.com');
      expect(new Headers(init?.headers).get('X-Api-Key')).toBe(env.QLOO_API_KEY);
      expect(init?.redirect).toBe('manual');
      if(url.pathname==='/search') {
        const index=Number(url.searchParams.get('query')?.replace('member-',''));
        expect(index).toBeGreaterThanOrEqual(0); expect(index).toBeLessThan(4);
        calls.push({path:url.pathname,seeds:[],excluded:[]});
        return Response.json({results:[{entity_id:seedIds[index],name:`Synthetic preference ${index}`,types:[url.searchParams.get('types')],properties:{release_year:2000+index}}]});
      }
      expect(url.pathname).toBe('/v2/insights');
      const seeds=(url.searchParams.get('signal.interests.entities')||'').split(',');
      const excluded=(url.searchParams.get('filter.exclude.entities')||'').split(',').filter(Boolean);
      expect(seeds.every(id=>seedIds.includes(id))).toBe(true);
      expect(excluded.every(id=>filmIds.includes(id))).toBe(true);
      calls.push({path:url.pathname,seeds,excluded});
      if(failInsights) return new Response('synthetic upstream unavailable',{status:503});
      const key=JSON.stringify([seeds,excluded]);
      if(retryEveryMember&&!retryKeys.has(key)) {retryKeys.add(key); return new Response('synthetic retry',{status:503});}
      return Response.json({results:{entities:filmIds.filter(id=>!excluded.includes(id)).map((entity_id,index)=>({entity_id,name:`Synthetic movie ${index}`,types:['urn:entity:movie'],properties:{release_year:2000+index},explainability:{synthetic:true}}))}});
    });
  });
  afterEach(async () => {vi.unstubAllGlobals(); vi.restoreAllMocks(); await dispose();});

  async function request(path:string,client?:Client,method='GET',body?:unknown,extra:Record<string,string>={}) {
    const response=await handleRequest(new Request(`${ORIGIN}${path}`,{method,headers:{...(client?{Cookie:client.cookie,'X-Action-Token':client.token}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:ORIGIN}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    return response;
  }
  async function setup(count=4) {
    const session=await request('/api/session'); expect(session.status).toBe(200);
    const setCookie=session.headers.get('Set-Cookie')!;
    expect(setCookie).toMatch(/^hackathon_session=[a-f0-9-]+; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
    const cookie=setCookie.split(';')[0], sessionId=cookie.split('=')[1];
    const token=(await session.json() as {action_token:string}).action_token;
    expect(token).not.toBe(sessionId); expect(token).toMatch(/^[a-f0-9-]{36}$/);
    const client={cookie,token,sessionId};
    const members:Member[]=[];
    for(let i=0;i<count;i++) {
      const found=await request(`/api/tastebridge/entities/search?query=member-${i}&kind=${i%2?'artist':'movie'}`,client);
      expect(found.status).toBe(200); const choices=await found.json() as Choice[];
      expect(choices[0].entity_id).toBe(seedIds[i]);
      members.push({member_id:crypto.randomUUID(),nickname:`Member ${i}`,entity_ids:[choices[0].entity_id]});
    }
    const rejected=await request('/api/tastebridge/groups',client,'POST',{members},{'X-Action-Token':'wrong-synthetic-token'});
    expect(rejected.status).toBe(403);
    const created=await request('/api/tastebridge/groups',client,'POST',{members});
    expect(created.status).toBe(200); expect(await created.json()).toMatchObject({version:1,members});
    return client;
  }
  async function recommend(client:Client,input:RecommendInput) {
    const submitted=await request('/api/tastebridge/recommendations',client,'POST',input);
    expect(submitted.status).toBe(200);
    const {run_id}=await submitted.json() as {run_id:string};
    const fetched=await request(`/api/tastebridge/recommendations/${run_id}`,client);
    expect(fetched.status).toBe(200);
    return await fetched.json() as MovieRun;
  }
  async function group(client:Client) {return await (await request('/api/tastebridge/groups',client)).json() as Group;}

  it('creates secure session, confirms choices, and commits an initial shortlist plus three exact watched updates',async () => {
    const client=await setup();
    let run=await recommend(client,{expected_version:1});
    expect(run.status).toBe('completed'); expect(run.group_version).toBe(1);
    expect(run.counters).toEqual({model_attempts:2,tool_calls:2});
    expect(run.candidates).toHaveLength(3);
    expect(run.evidence.filter(item=>item.kind==='candidate_rank')).toHaveLength(12);
    expect(run.evidence.filter(item=>item.kind==='qloo_explainability')).toHaveLength(12);
    const excluded:string[]=[];
    for(let round=1;round<=3;round++) {
      excluded.push(run.candidates[0].entity_id);
      run=await recommend(client,{expected_version:run.group_version,seen_entity_id:excluded.at(-1)});
      expect(run.status).toBe('completed');
      expect(run.group_version).toBe(round+1);
      expect(run.counters).toEqual({model_attempts:3,tool_calls:3});
      expect(run.candidates.every(candidate=>!excluded.includes(candidate.entity_id))).toBe(true);
      expect(await group(client)).toMatchObject({version:run.group_version,feedback_rounds:round,excluded_ids:excluded});
    }
    expect(aiCalls).toBe(11);
    expect(calls.filter(call=>call.path==='/v2/insights')).toHaveLength(16);
    const modelQuota=await db.prepare("SELECT count FROM quotas WHERE kind='model'").first('count');
    expect(modelQuota).toBe(11);
    const immediateFourth=await request('/api/tastebridge/recommendations',client,'POST',{expected_version:4,seen_entity_id:run.candidates[0].entity_id});
    expect(immediateFourth.status).toBe(429);
    expect(await immediateFourth.json()).toEqual({detail:'session_rate_limit'});
    // After the separate four-attempt session window expires, the feedback cap itself denies the fourth update.
    now+=600001;
    const blocked=await recommend(client,{expected_version:4,seen_entity_id:run.candidates[0].entity_id});
    expect(blocked.status).toBe('rate_limited'); expect(blocked.error_code).toBe('feedback_limit');
    expect(blocked.candidates).toEqual([]);
    expect(await group(client)).toMatchObject({version:4,feedback_rounds:3,excluded_ids:excluded});
    expect(aiCalls).toBe(11); expect(calls.filter(call=>call.path==='/v2/insights')).toHaveLength(16);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE released=0').first('n')).toBe(0);
  });

  it('keeps the previous shortlist and version after failed Qloo feedback, then safely retries the same watched film',async () => {
    const client=await setup(2), previous=await recommend(client,{expected_version:1});
    const watched=previous.candidates[0].entity_id; failInsights=true;
    const failed=await recommend(client,{expected_version:1,seen_entity_id:watched});
    expect(failed).toMatchObject({status:'failed',error_code:'service_error',group_version:1,candidates:[],evidence:[]});
    expect(JSON.stringify(failed)).not.toContain('synthetic upstream unavailable');
    expect(await group(client)).toMatchObject({version:1,feedback_rounds:0,excluded_ids:[]});
    expect(await (await request(`/api/tastebridge/recommendations/${previous.run_id}`,client)).json()).toEqual(previous);
    expect(await db.prepare('SELECT published_run FROM groups WHERE session_id=?').bind(client.sessionId).first('published_run')).toBe(previous.run_id);
    failInsights=false;
    const retried=await recommend(client,{expected_version:failed.group_version,seen_entity_id:watched});
    expect(retried).toMatchObject({status:'completed',group_version:2});
    expect(retried.candidates.every(candidate=>candidate.entity_id!==watched)).toBe(true);
    expect(await group(client)).toMatchObject({version:2,feedback_rounds:1,excluded_ids:[watched]});
  });

  it('keeps a real four-member request with every physical Qloo call retried below 50 D1 statements',async () => {
    const client=await setup(); retryEveryMember=true; statements=0;
    const run=await recommend(client,{expected_version:1});
    const saved=await group(client);
    expect(run.status).toBe('completed'); expect(saved.version).toBe(run.group_version);
    expect(calls.filter(call=>call.path==='/v2/insights')).toHaveLength(8);
    expect(aiCalls).toBe(2);
    expect(statements).toBe(41);
    expect(statements).toBeLessThanOrEqual(50);
  });
});
