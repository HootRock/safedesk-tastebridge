import type {RunEvent} from '../shared/types';
import {TbIcon} from './icons';
import {describeStep} from './wording';
// The record behind a shortlist, read like a film's end credits.
export function ShortlistLog({events,names}:{events:RunEvent[];names:Record<string,string>}){
 if(!events.length)return <p className="tb-log-empty"><TbIcon name="list" size={15}/>Each Qloo request and comparison appears here once a search runs.</p>;
 return <ol className="tb-log">{events.map(e=>{const s=describeStep(e,names),stopped=e.decision==='denied';return <li key={e.seq} className={stopped?'is-stopped':''}>
  <span className="tb-log-seq">{String(e.seq).padStart(2,'0')}</span>
  <div className="tb-log-entry"><div className="tb-log-head"><strong>{s.title}</strong><span className="tb-tag">{stopped?'Stopped':e.mode==='test'?'Test':e.decision==='reused'?'Reused':'Verified'}</span></div>{s.detail&&<p>{s.detail}</p>}
   <details className="tb-tech"><summary>Technical detail</summary><code>{(e.tool_name||e.kind)+(e.decision?' · '+e.decision:'')}</code></details></div>
 </li>})}</ol>;
}
