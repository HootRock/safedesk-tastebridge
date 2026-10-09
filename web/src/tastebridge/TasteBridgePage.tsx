import {useState,useRef,useEffect} from 'react';
import {requestJson,pause} from '../shared/api';
import type {MovieRun} from '../shared/types';
import {MemberInput,type Member} from './MemberInput';
import {RecommendationCards,ShortlistGuidance} from './RecommendationCards';
import {ShortlistLog} from './ShortlistLog';
import {TbIcon} from './icons';
import {describeError,listNames,runErrorMessage} from './wording';
const initial:Member[]=[{id:'friend-1',nickname:'Alex',query:'',kind:'movie',selected:[]},{id:'friend-2',nickname:'Sam',query:'',kind:'artist',selected:[]}];
function ErrorNote({message}:{message:string}){const d=describeError(message);return <div role="alert" className="tb-note is-error"><TbIcon name="alert" size={16}/><div><strong>{d.title}</strong><p>{d.detail}</p>{d.code&&<code>{d.code}</code>}</div></div>}
// Projector warming up: three empty frames hold the layout while Qloo answers.
function Warmup(){return <div className="tb-warmup" aria-hidden="true"><span className="tb-leader"/><div className="tb-warmup-frames"><span/><span/><span/></div></div>}
export function TasteBridgePage(){
 const [members,setMembers]=useState(initial),[version,setVersion]=useState(0),[run,setRun]=useState<MovieRun|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[lastSuccessful,setLastSuccessful]=useState<MovieRun|null>(null);
 const [editingTastes,setEditingTastes]=useState(true);
 useEffect(()=>{if(run?.status==='completed')setEditingTastes(false)},[run?.status]);
 const epoch=useRef(0),inflight=useRef(false),saved=useRef('');useEffect(()=>()=>{epoch.current++},[]);
 function change(next:Member[]){setEditingTastes(true);setMembers(next);setRun(null);setLastSuccessful(null);epoch.current++}
 async function recommend(note?:string,seenId?:string){if(inflight.current)return;inflight.current=true;const current=++epoch.current;setBusy(true);setError('');
  try{let v=version;const prefs=members.map(m=>({member_id:m.id,nickname:m.nickname,entity_ids:m.selected.map(e=>e.entity_id)}));const signature=JSON.stringify(prefs);
   if(!note&&(!v||saved.current!==signature)){
    let group:{version:number};
    try{group=await requestJson<{version:number}>(v?'/api/tastebridge/groups/preferences':'/api/tastebridge/groups',{method:v?'PUT':'POST',body:JSON.stringify({members:prefs,...(v?{expected_version:v}:{})})})}
    catch(e){
      if(v||(e as Error).message!=='group_exists')throw e;
      const existing=await requestJson<{version:number}>('/api/tastebridge/groups');
      group=await requestJson<{version:number}>('/api/tastebridge/groups/preferences',{method:'PUT',body:JSON.stringify({members:prefs,expected_version:existing.version})});
    }
    v=group.version;setVersion(v);saved.current=signature;
   }
   const created=await requestJson<{run_id:string}>('/api/tastebridge/recommendations',{method:'POST',body:JSON.stringify({expected_version:v,feedback:note||null,seen_entity_id:seenId||null})});
   let finished=false;for(let i=0;i<260&&current===epoch.current;i++){
    const next=await requestJson<MovieRun>(`/api/tastebridge/recommendations/${created.run_id}`);if(current!==epoch.current)break;setRun(next);if(next.status==='completed')setLastSuccessful(next);else if(next.status==='empty')setLastSuccessful(null);
    if(next.status!=='running'){finished=true;setVersion(next.group_version);break}await pause(1500);
   }
   if(!finished&&current===epoch.current)setError('Still processing. Check the current run without starting another request.');
  }catch(e){if(current===epoch.current)setError((e as Error).message)}finally{inflight.current=false;if(current===epoch.current)setBusy(false)}
 }
 async function checkCurrent(){if(!run||inflight.current)return;inflight.current=true;const current=epoch.current;setBusy(true);
  try{const next=await requestJson<MovieRun>(`/api/tastebridge/recommendations/${run.run_id}`);if(current===epoch.current){setRun(next);if(next.status==='completed')setLastSuccessful(next);else if(next.status==='empty')setLastSuccessful(null);setVersion(next.group_version);setError(next.status==='running'?'Still processing. Check the current run again shortly.':'')}}
  catch(e){if(current===epoch.current)setError((e as Error).message)}finally{inflight.current=false;if(current===epoch.current)setBusy(false)}
 }
 const shortlist=(lastSuccessful&&lastSuccessful.group_version===run?.group_version&&['failed','rate_limited','cancelled','running','needs_clarification'].includes(run.status))?lastSuccessful:run;
 const names=Object.fromEntries(members.map(m=>[m.id,m.nickname]));
 const ready=members.filter(m=>m.selected.length>0),waiting=members.filter(m=>!m.selected.length).map((m,i)=>m.nickname.trim()||'Friend '+(members.indexOf(m)+1||i+1));
 const progress=ready.length===members.length?'Everyone is ready':ready.length+' of '+members.length+' ready · waiting for '+listNames(waiting);
 return <div className="tb-page">
 <section className="tb-group" aria-label="Group preferences">
  <div className="tb-group-head"><div><h2>Who's watching</h2><p>{members.length} of 4 seats · one to five favorites each</p></div></div>
  <div className="tb-tickets">{members.map((m,i)=><MemberInput key={m.id} index={i} member={m} compact={!editingTastes&&m.selected.length>0} disabled={busy} onRemove={members.length>2?()=>change(members.filter(x=>x.id!==m.id)):undefined} onChange={next=>change(members.map((x,j)=>i===j?next:x))}/>)}
   <button className="tb-add-friend" disabled={busy||members.length===4} onClick={()=>change([...members,{id:'friend-'+Date.now(),nickname:'Friend '+(members.length+1),query:'',kind:'movie',selected:[]}])}><TbIcon name="userPlus" size={17}/><span>{members.length===4?'All four seats are taken':'Add a friend'}</span></button>
  </div>
  <div className="tb-group-actions">
   <button className="tb-btn tb-btn-find" disabled={busy||run?.status==='running'||members.some(m=>!m.nickname.trim()||m.selected.length<1||m.selected.length>5)} onClick={()=>recommend()}>{busy?<span className="tb-spinner" aria-hidden="true"/>:<TbIcon name="ticket" size={19}/>}<span>{busy?'Finding our movie…':'Find our movie'}</span></button>
   <p className={'tb-readiness'+(ready.length===members.length?' is-ready':'')}>{progress}</p>
   <div className="tb-group-links"><button className="tb-link" disabled={busy} onClick={()=>setEditingTastes(!editingTastes)}><TbIcon name="pen" size={14}/>{editingTastes&&ready.length===members.length?'Done editing':'Edit tastes'}</button>{editingTastes&&<button className="tb-link tb-link-quiet" disabled={busy} onClick={()=>change(initial.map((m,i)=>({...m,query:i?'Taylor Swift':'Interstellar'})))}>Try example searches</button>}</div>
   {run?.status==='running'&&!busy&&<button className="tb-btn" onClick={checkCurrent}><TbIcon name="refresh" size={15}/>Check current run</button>}
   {error&&<ErrorNote message={error}/>}
   {editingTastes&&<p className="tb-hint">Choose a search result to confirm each favorite. Typing a title alone does not count.</p>}
  </div>
 </section>
 <section className="tb-screen" aria-label="Film shortlist">
  {busy&&<p className="tb-progress" role="status"><span className="tb-spinner" aria-hidden="true"/>Comparing your confirmed preferences…</p>}
  {run?<>
   {shortlist!==run&&<p className="tb-retained"><TbIcon name="clock" size={16}/>Showing your previous shortlist. {run.status==='running'?'Your update is still in progress.':'The latest update was not applied.'}</p>}
   <RecommendationCards run={shortlist!} memberNames={names} disabled={busy||run.status==='running'} onSeen={movie=>recommend('I have seen '+movie.name+'. Exclude only the selected entity and suggest another movie.',movie.entity_id)}/>
   {shortlist!==run&&run.status==='needs_clarification'&&<RecommendationCards run={run} onSeen={()=>{}}/>}
   {run.status==='running'&&shortlist===run&&<Warmup/>}
   {run.error_code&&<div className="tb-note is-error" role="alert"><TbIcon name="alert" size={16}/><div><p>{runErrorMessage(run.error_code)}</p><details className="tb-tech"><summary>Technical detail</summary><code>{run.error_code}</code></details></div></div>}
   {(shortlist?.candidates.length||run.status==='needs_clarification')?<details className="tb-panel"><summary><span><TbIcon name="eye" size={16}/>Adjust the shortlist</span><TbIcon name="chevron" size={15} className="tb-disclosure"/></summary><div className="tb-panel-body"><label htmlFor="feedback">Tell us which movie you've seen</label><div className="tb-field-row"><input id="feedback" value={feedback} disabled={busy||run.status==='running'} placeholder="Movie title and year…" onChange={e=>setFeedback(e.target.value)}/><button className="tb-btn tb-btn-primary" disabled={busy||run.status==='running'||!feedback.trim()} onClick={()=>recommend(feedback)}>Update</button></div><p className="tb-hint">Up to three seen-movie updates. Use a film's seen button for an exact match.</p></div></details>:null}
   <details className="tb-panel"><summary><span><TbIcon name="list" size={16}/>Behind the shortlist</span><TbIcon name="chevron" size={15} className="tb-disclosure"/></summary><div className="tb-panel-body"><ShortlistLog events={run.events} names={names}/></div></details>
  </>:busy?<Warmup/>:<ShortlistGuidance/>}
  <p className="tb-credit">Powered by Qloo</p>
 </section>
 </div>;
}
