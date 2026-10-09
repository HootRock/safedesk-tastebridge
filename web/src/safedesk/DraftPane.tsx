import {useEffect,useState,type ReactNode} from 'react';
import type {SafeRun,Task} from '../shared/types';
import {SdIcon} from './icons';
import {formatSchedule} from '../shared/presentation';
import {stepTitle} from './wording';
function EmptyArt(){return <svg className="sd-empty-art" viewBox="0 0 160 96" aria-hidden="true" focusable="false">
 <rect className="art-sheet" x="8" y="8" width="62" height="80" rx="4"/><path className="art-line" d="M18 24h42M18 33h36M18 60h40M18 69h28"/>
 <rect className="art-mark" x="15" y="40" width="46" height="10" rx="2"/><path className="art-line" d="M18 45h38"/>
 <path className="art-thread" d="M63 45c16 0 20-12 35-12"/>
 <rect className="art-card" x="98" y="18" width="54" height="30" rx="4"/><path className="art-line" d="M107 29h34M107 37h22"/>
 <rect className="art-card is-soft" x="98" y="56" width="54" height="26" rx="4"/><path className="art-tick" d="M106 69l4 4 8-9"/><path className="art-line" d="M124 66h20M124 73h13"/>
</svg>}
// Tasks read like index cards: an editable title, an exact time and the quoted words behind it.
export function DraftPane({run,items,onItems,onSource,disabled,zone='Asia/Shanghai',busy=false,startedAt=0,onPeek=()=>{},protection,onShowDocument}:{run:SafeRun|null;items:Task[];onItems:(items:Task[])=>void;onSource:(id:string)=>void;disabled:boolean;zone?:string;busy?:boolean;startedAt?:number;onPeek?:(id:string)=>void;protection?:ReactNode;onShowDocument?:()=>void}){
 const drafting=(busy||run?.state==='running')&&!run?.draft;
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!drafting)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[drafting]);
 const clarification=run?.state==='needs_clarification'&&!run.draft?[...run.events].reverse().find(e=>e.kind==='clarification')?.payload.message:undefined;
 const last=run?.events[run.events.length-1],seconds=startedAt?Math.max(0,Math.round((now-startedAt)/1000)):0;
 let body:ReactNode;
 if(!run?.draft&&typeof clarification==='string')body=<div className="sd-empty is-attention"><SdIcon name="info" size={22}/><h3>A detail needs your review</h3><p role="status">{clarification}</p><p>Edit the document or request, then create a new draft.</p></div>;
 else if(drafting)body=<div className="sd-drafting"><div className="sd-drafting-head"><span className="sd-pencil"><SdIcon name="pen" size={17}/></span><div><strong>Drafting tasks from your notes</strong><p aria-live="polite">{last?stepTitle(last.kind,last.tool_name):'Reading the document'}</p></div>{startedAt>0&&<span className="sd-elapsed">{seconds}s</span>}</div><div className="sd-ghost" aria-hidden="true"><span/><span/><span/></div><p className="sd-drafting-note">Drafting never touches your calendar.</p></div>;
 else if(!run?.draft)body=<div className="sd-empty"><EmptyArt/><h3>Keep the original in view.</h3><p className="sd-empty-lead">Your task draft will appear here.</p><p>Check dates, edit titles and trace each task back to the words that support it.</p>{onShowDocument&&<button className="sd-btn sd-btn-quiet" onClick={onShowDocument}><SdIcon name="document" size={15}/>Open the source document</button>}</div>;
 else body=<><p className="sd-tasks-intro">Each task quotes the words it came from. Titles are yours to edit.</p>
  <ol className="sd-task-list">{items.map((t,i)=>{const when=formatSchedule(t.start_at,t.end_at,zone);return <li className="sd-task" key={t.task_id} onMouseEnter={()=>onPeek(t.source.paragraph_id)} onMouseLeave={()=>onPeek('')} onFocus={()=>onPeek(t.source.paragraph_id)} onBlur={()=>onPeek('')}>
   <span className="sd-task-num" aria-hidden="true">{i+1}</span>
   <div className="sd-task-main">
    <label htmlFor={'task-'+i} className="sd-sr">Task {i+1}</label>
    <input id={'task-'+i} className="sd-task-title" disabled={disabled} value={t.title} onChange={e=>onItems(items.map((x,j)=>j===i?{...x,title:e.target.value}:x))}/>
    <p className={'sd-task-when'+(t.start_at?'':' is-unscheduled')}><SdIcon name={t.start_at?'calendar':'clock'} size={14}/>{t.start_at?<span>{when.date}<span className="sd-time">{when.time}</span></span>:<span>No time yet. This task stays off the calendar.</span>}</p>
    <button className="sd-quote" aria-label={`View source ${t.source.paragraph_id}`} onClick={()=>onSource(t.source.paragraph_id)}><q>{t.source.quote}</q><span className="sd-quote-ref"><SdIcon name="source" size={13}/>{t.source.paragraph_id}</span></button>
   </div></li>})}</ol></>;
 return <div className="sd-tasks">{protection}{body}{run?.draft?.clarifications.map((c,i)=><p className="sd-note is-attention" key={i}><SdIcon name="info" size={14}/>{c}</p>)}</div>;
}
