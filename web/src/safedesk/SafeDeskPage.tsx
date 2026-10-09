import {useState,useRef,useEffect} from 'react';
import {requestJson,pause} from '../shared/api';
import type {SafeRun,Task} from '../shared/types';
import {AuditTrail} from './AuditTrail';
import {DocumentPane,nextCalendarDate} from './DocumentPane';
import {DraftPane} from './DraftPane';
import {SdIcon} from './icons';
import {CalendarPane} from './CalendarPane';
import {DockWorkspace} from './DockWorkspace';
import {deniedReason,describeError,operationName} from './wording';
const zoneList=(()=>{try{return (Intl as typeof Intl&{supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.('timeZone')||[]}catch{return []}})();
function isZone(zone:string){try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return true}catch{return false}}
function ErrorNote({message}:{message:string}){
 const d=describeError(message);
 return <div role="alert" className="sd-note is-error"><SdIcon name="alert" size={16}/><div><strong>{d.title}</strong><p>{d.detail}</p>{d.code&&<code>{d.code}</code>}</div></div>;
}
function Seal(){return <svg className="sd-seal" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
 <defs><path id="sd-seal-ring" d="M50 50m-35 0a35 35 0 1 1 70 0a35 35 0 1 1-70 0"/></defs>
 <circle cx="50" cy="50" r="46" className="seal-outer"/><circle cx="50" cy="50" r="27" className="seal-inner"/>
 <text className="seal-text"><textPath href="#sd-seal-ring" startOffset="0" textLength="214">APPROVED · SAFEDESK · LOCAL DEMO ·</textPath></text>
 <path d="M38 51l8 8 16-18" className="seal-tick"/>
</svg>}
type Step='done'|'current'|'todo'|'attention';
// The real sequence of a SafeDesk run, derived only from recorded state.
function Progress({run,busy,dirty,approved,count}:{run:SafeRun|null;busy:boolean;dirty:boolean;approved:boolean;count:number}){
 let s:[Step,Step,Step],note:string;
 const events=count+' event'+(count===1?'':'s');
 if(busy||run?.state==='running'){s=['current','todo','todo'];note='Drafting. Nothing is written while SafeDesk reads.'}
 else if(!run){s=['current','todo','todo'];note='Start from the source document. Nothing is written without your approval.'}
 else if(run.state==='needs_clarification'){s=run.draft?['done','attention','todo']:['attention','todo','todo'];note='A detail needs your review before anything can be scheduled.'}
 else if(run.state==='failed'){s=['attention','todo','todo'];note='This draft stopped. Your notes are unchanged.'}
 else if(run.state==='awaiting_confirmation'){s=dirty?['done','current','todo']:approved?['done','done','current']:['done','current','todo'];note=dirty?'Save your edits to refresh the calendar preview.':approved?'Approved. Confirm to write '+events+'.':events[0].toUpperCase()+events.slice(1)+' to review, each linked to its source.'}
 else if(run.state==='completed'){s=['done','done','done'];note='Written to your local demo calendar.'}
 else{s=['current','todo','todo'];note='Start from the source document.'}
 const labels=['Draft from the source','Check each task','Approve the preview'];
 return <div className="sd-progress"><ol>{labels.map((label,i)=><li key={label} className={'is-'+s[i]} aria-current={s[i]==='current'?'step':undefined}><span className="sd-step-mark">{s[i]==='done'?<SdIcon name="check" size={12}/>:i+1}</span><span className="sd-step-label">{label}</span></li>)}</ol><p className="sd-progress-note">{note}</p></div>;
}
export function SafeDeskPage(){
 const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA')),[zone,setZone]=useState('Asia/Shanghai');
 const [text,setText]=useState(()=>`Meet on ${nextCalendarDate(date)} from 10:00 to 11:00 to review the demo.`);
 const [goal,setGoal]=useState('Draft tasks and preview my calendar.');
 const [run,setRun]=useState<SafeRun|null>(null),[items,setItems]=useState<Task[]>([]);
 const [busy,setBusy]=useState(false),[committing,setCommitting]=useState(false),[dirty,setDirty]=useState(false),[approved,setApproved]=useState(false),[error,setError]=useState(''),[source,setSource]=useState('');
 const [peek,setPeek]=useState(''),[startedAt,setStartedAt]=useState(0),[docRequest,setDocRequest]=useState(0);
 const epoch=useRef(0),inflight=useRef(false),audit=useRef<HTMLDetailsElement>(null);
 function revealSource(id:string){setSource(id);setDocRequest(v=>v+1)}
 useEffect(()=>()=>{epoch.current++},[]);
 function invalidate(value:string){epoch.current++;setText(value);setRun(null);setItems([]);setApproved(false);setDirty(false);setBusy(false);setError('');setSource('');setPeek('')}
 async function start(){
  if(inflight.current)return;inflight.current=true;const version=++epoch.current;setBusy(true);setError('');setRun(null);setApproved(false);setDirty(false);setStartedAt(Date.now());
  try{const created=await requestJson<{run_id:string}>('/api/safedesk/runs',{method:'POST',body:JSON.stringify({text,goal,reference_date:date,timezone:zone})});
   let finished=false;for(let i=0;i<260&&version===epoch.current;i++){
    const next=await requestJson<SafeRun>(`/api/safedesk/runs/${created.run_id}`);
    if(version!==epoch.current)break;setRun(next);setItems(next.draft?.items||[]);
    if(next.state!=='running'){finished=true;if(next.error_code)setError(next.error_code);break}await pause(1500);
   }
   if(!finished&&version===epoch.current)setError('Still processing. Check the current run without starting another request.');
  }catch(e){if(version===epoch.current)setError((e as Error).message)}finally{inflight.current=false;if(version===epoch.current)setBusy(false)}
 }
 async function checkCurrent(){if(!run||inflight.current)return;inflight.current=true;const version=epoch.current;setBusy(true);
  try{const next=await requestJson<SafeRun>(`/api/safedesk/runs/${run.run_id}`);if(version===epoch.current){setRun(next);setItems(next.draft?.items||[]);setError(next.error_code||(next.state==='running'?'Still processing. Check the current run again shortly.':''))}}
  catch(e){if(version===epoch.current)setError((e as Error).message)}finally{inflight.current=false;if(version===epoch.current)setBusy(false)}
 }
 async function save(){if(!run?.draft)return;setCommitting(true);setError('');setApproved(false);
  try{const next=await requestJson<SafeRun>(`/api/safedesk/runs/${run.run_id}/draft`,{method:'PATCH',body:JSON.stringify({expected_version:run.draft.version,items})});setRun(next);setItems(next.draft?.items||[]);setDirty(false)}catch(e){setError((e as Error).message)}finally{setCommitting(false)}
 }
 async function confirm(){if(!approved||!run?.preview||dirty)return;const version=epoch.current;const id=run.run_id,preview=run.preview.preview_id;setCommitting(true);setError('');
  try{const receipt=await requestJson<{token:string}>(`/api/safedesk/runs/${id}/approval`,{method:'POST',body:JSON.stringify({preview_id:preview})});if(version!==epoch.current)return;
   await requestJson(`/api/safedesk/runs/${id}/commit`,{method:'POST',body:JSON.stringify({preview_id:preview,token:receipt.token})});setRun(await requestJson<SafeRun>(`/api/safedesk/runs/${id}`));setApproved(false);
  }catch(e){setError((e as Error).message)}finally{setCommitting(false)}
 }
 const eventCount=run?.preview?.events.length||0,committed=run?.state==='completed';
 const denied=run?.events.filter(e=>e.decision==='denied')||[];
 const flagged=[...new Set((run?.events||[]).filter(e=>e.kind==='risk_hint'&&e.source).map(e=>e.source!.paragraph_id))];
 function showAudit(){const el=audit.current;if(!el)return;el.open=true;el.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});el.querySelector<HTMLElement>('summary')?.focus()}
 const protection=denied.length?<aside className="sd-protect" aria-label="Protected operations"><div className="sd-protect-head"><SdIcon name="shieldCheck" size={18}/><strong>SafeDesk stopped {denied.length} operation{denied.length===1?'':'s'}</strong></div><ul>{denied.map(e=><li key={e.seq}><strong>{operationName(e.tool_name)}</strong><span>{deniedReason(e.payload.reason)}</span></li>)}</ul><button className="sd-link" onClick={showAudit}>See the record</button></aside>
  :flagged.length?<aside className="sd-protect is-quiet" aria-label="Flagged text"><div className="sd-protect-head"><SdIcon name="shield" size={18}/><strong>{flagged.length===1?'One paragraph reads':flagged.length+' paragraphs read'} like an instruction</strong></div><p>Documents provide context only. Your permissions are unchanged.</p><button className="sd-link" onClick={showAudit}>See the record</button></aside>:null;
 const zoneOk=!zone.trim()||isZone(zone.trim()),textCount=Array.from(text).length;
 const documentPanel=<div className="sd-doc"><div className="sd-doc-scroll">
  <DocumentPane text={text} onText={invalidate} referenceDate={date} disabled={committing} paragraphs={run?.document.paragraphs} source={source} onClearSource={()=>setSource('')} flagged={flagged} peek={peek}/>
  <div className="sd-request"><label htmlFor="goal">Your request</label><input id="goal" value={goal} disabled={committing} onChange={e=>{setGoal(e.target.value);invalidate(text)}}/>
  <details className="sd-options"><summary><span className="sd-options-title">Planning options</span><span className="sd-options-context">{date} · {zone}<SdIcon name="chevron" size={15} className="sd-disclosure"/></span></summary><div className="sd-field-row"><div><label htmlFor="date">Reference date</label><input id="date" type="date" value={date} disabled={committing} onChange={e=>{setDate(e.target.value);invalidate(text)}}/></div><div><label htmlFor="zone">Timezone</label><input id="zone" list="sd-zones" value={zone} disabled={committing} aria-describedby={zoneOk?undefined:'zone-hint'} onChange={e=>{setZone(e.target.value);invalidate(text)}}/><datalist id="sd-zones">{zoneList.map(z=><option key={z} value={z}/>)}</datalist>{!zoneOk&&<small id="zone-hint" className="sd-field-hint">Use an IANA time zone, such as Asia/Shanghai.</small>}</div></div></details></div>
 </div><div className="sd-doc-action">
  <button className="sd-btn sd-btn-primary sd-btn-wide" disabled={busy||committing||run?.state==='running'||!text.trim()||!goal.trim()||!date||!zone.trim()||!zoneOk||textCount>20000} onClick={start}>{busy?<span className="sd-spinner" aria-hidden="true"/>:<SdIcon name="plus" size={17}/>}<span>{busy?'Creating draft…':'Create task draft'}</span></button>
  <p className="sd-doc-reassure">Drafting reads your notes. Nothing reaches the calendar until you approve it.</p>
  {run?.state==='running'&&!busy&&<button className="sd-btn" onClick={checkCurrent}><SdIcon name="refresh" size={15}/>Check current run</button>}{error&&<ErrorNote message={error}/>}
 </div></div>;
 const taskPanel=<><DraftPane run={run} items={items} disabled={committing||committed} zone={zone} busy={busy} startedAt={startedAt} onPeek={setPeek} protection={protection} onShowDocument={()=>setDocRequest(v=>v+1)} onItems={v=>{setItems(v);setDirty(true);setApproved(false)}} onSource={revealSource}/>{dirty&&<div className="sd-savebar"><p>Edited titles refresh the calendar preview when saved.</p><button className="sd-btn sd-btn-primary" disabled={committing} onClick={save}>Save draft changes</button></div>}</>;
 const ready=run?.state==='awaiting_confirmation'&&!dirty;
 const approveLabel=committed?(eventCount===1?'You approved this event':eventCount?'You approved these '+eventCount+' events':'You approved the previewed events'):eventCount===1?'I approve this event':eventCount?'I approve these '+eventCount+' events':'I approve the previewed events';
 const hint=committed?'Calendar updated · confirmed by the server':dirty?'Save task changes to refresh the preview.':ready?'Only these previewed events will be added to your local demo calendar.':busy||run?.state==='running'?'Approval opens when the preview is ready.':run?'Approval opens once there is a calendar preview to review.':'Create a draft first. You will review every event before anything is written.';
 const tasksNote=items.length?items.length+' task'+(items.length===1?'':'s'):undefined;
 const calendarNote=eventCount?(committed?eventCount+' written':eventCount+' pencilled in'):undefined;
 return <div className="sd-page">
 <DockWorkspace lead={<Progress run={run} busy={busy} dirty={dirty} approved={approved} count={eventCount}/>} notes={{tasks:tasksNote,calendar:calendarNote}} focusRequest={docRequest?{panel:'document',request:docRequest}:undefined} panels={{tasks:taskPanel,calendar:<CalendarPane events={run?.preview?.events||[]} zone={zone} referenceDate={date} previewId={run?.preview?.preview_id} committed={committed}/>,document:documentPanel}}/>
 <div className={'sd-approval is-'+(committed?'done':approved&&ready?'approved':ready?'ready':'idle')}>
  <div className="sd-consent"><label className="sd-check"><input type="checkbox" checked={approved||committed} disabled={dirty||committing||run?.state!=='awaiting_confirmation'} onChange={e=>setApproved(e.target.checked)}/><span>{approveLabel}</span></label><small>{hint}</small></div>
  {committed?<Seal/>:<div className="sd-destination"><SdIcon name="calendar" size={20}/><span><strong>Demo calendar</strong><small>{eventCount} event{eventCount===1?'':'s'} · {zone}</small></span></div>}
  <button className="sd-btn sd-btn-commit" disabled={!approved||dirty||committing||run?.state!=='awaiting_confirmation'} onClick={confirm}><SdIcon name="check" size={17}/>{committing?'Saving…':'Confirm demo calendar'}</button>
  {committed&&<span className="sd-sr" role="status">Calendar updated. The server confirmed {eventCount} event{eventCount===1?'':'s'} on your local demo calendar.</span>}
 </div>
 <AuditTrail detailsRef={audit} events={run?.events||[]} blocked={denied.length} onSource={revealSource} footnote={run?((run.mode==='live'?'Live model':'Test fixture')+' · '+(run.counters.model_attempts||0)+' model attempts · '+(run.counters.tool_calls||0)+' tool calls'):'Local demo · no real calendar account connected'}/>
 </div>;
}
