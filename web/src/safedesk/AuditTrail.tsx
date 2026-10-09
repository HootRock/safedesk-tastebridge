import type {Ref} from 'react';
import type {RunEvent} from '../shared/types';
import {SdIcon} from './icons';
import {deniedReason,operationName,stepTitle} from './wording';
// SafeDesk's execution ledger: every read, proposal and refusal, in order.
export function AuditTrail({events,blocked,footnote,onSource,detailsRef}:{events:RunEvent[];blocked:number;footnote:string;onSource:(id:string)=>void;detailsRef?:Ref<HTMLDetailsElement>}){
 return <details className="sd-audit" ref={detailsRef}>
  <summary><span className="sd-audit-title"><SdIcon name="shield" size={17}/>Permissions & execution record</span><span className="sd-audit-meta">{blocked?blocked+' blocked operation'+(blocked===1?'':'s'):'No real calendar account connected'}<SdIcon name="chevron" size={15} className="sd-disclosure"/></span></summary>
  <div className="sd-audit-body">
   <ul className="sd-rules"><li><SdIcon name="document" size={15}/>Documents provide context, never permissions.</li><li><SdIcon name="lock" size={15}/>No email access and no real calendar account.</li><li><SdIcon name="check" size={15}/>Calendar writes need your approval of the current preview.</li></ul>
   {!events.length?<p className="sd-ledger-empty">Each step SafeDesk takes appears here: what it read, what it proposed and what it refused.</p>:<ol className="sd-ledger">{events.map(e=>{const denied=e.decision==='denied';return <li key={e.seq} className={denied?'is-denied':e.kind==='risk_hint'?'is-flagged':''}>
    <span className="sd-ledger-seq">{String(e.seq).padStart(2,'0')}</span>
    <div className="sd-ledger-entry"><div className="sd-ledger-head"><strong>{denied?'Blocked: '+operationName(e.tool_name):stepTitle(e.kind,e.tool_name)}</strong><span className="sd-tag">{denied?'Protected':e.mode==='test'?'Test':e.decision==='allowed'?'Verified':'Recorded'}</span></div>
     <p>{denied?deniedReason(e.payload.reason):String(e.payload.message||e.payload.reason||'Recorded by the server.')}</p>
     {e.source&&<button className="sd-link" onClick={()=>onSource(e.source!.paragraph_id)}>Show paragraph {e.source.paragraph_id}</button>}
     <details className="sd-tech"><summary>Technical detail</summary><code>{e.tool_name||e.kind}{e.decision?' · '+e.decision:''}{denied&&e.payload.reason?' · '+String(e.payload.reason):''}</code></details>
    </div></li>})}</ol>}
   <p className="sd-footnote">{footnote}</p>
  </div>
 </details>;
}
