import {SafeDeskPage} from './SafeDeskPage';
import {useServiceHealth,useDocumentIdentity,type ServiceHealth} from '../shared/useServiceHealth';
import './safedesk.css';
const favicon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#1f3f8f"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#f6f2ea" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M11 16.5l3.4 3.4L21.5 13" fill="none" stroke="#f6f2ea" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
function status(h:ServiceHealth):{label:string;tone:'wait'|'ok'|'off';title:string}{
 if(h.state==='connecting')return {label:'Connecting',tone:'wait',title:'Checking the service'};
 if(h.state==='unavailable')return {label:'Service unavailable',tone:'off',title:'Check your connection and try again shortly'};
 if(h.mode==='test')return {label:'Test fixture',tone:'ok',title:'Responses come from recorded test fixtures'};
 if(!h.modelEnabled)return {label:h.publicHosting?'Planner unavailable':'Setup needed',tone:'off',title:h.publicHosting?'The operator needs to restore planning. Please try again later':'Enable the configured model in .env, then restart the service'};
 return h.modelProvider==='groq'?{label:'Live · hosted',tone:'ok',title:'Drafting with the Groq hosted planner'}:{label:'Live · local',tone:'ok',title:'Drafting with the local Codex planner on this computer'};
}
function Mark(){return <svg className="sd-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="15" className="mark-disc"/><circle cx="16" cy="16" r="10.5" className="mark-ring"/><path d="M11 16.5l3.4 3.4L21.5 13" className="mark-tick"/></svg>}
export function SafeDeskApp(){
 const health=useServiceHealth(),s=status(health);
 useDocumentIdentity('SafeDesk','#ebe5d9',favicon,'safedesk');
 return <div className="sd-app">
  <a className="sd-skip" href="#sd-main">Skip to workspace</a>
  <header className="sd-header">
   <a className="sd-brand" href="/safedesk" aria-label="SafeDesk" aria-current="page" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();window.scrollTo?.({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}}><Mark/><span>SafeDesk</span></a>
   <span className={'sd-status is-'+s.tone} title={s.title}><span className="sd-status-dot" aria-hidden="true"/>{s.label}</span>
  </header>
  <main id="sd-main" tabIndex={-1}><SafeDeskPage/></main>
  <footer className="sd-footer"><span>SafeDesk · Independent Alexa+ experience simulation</span><span>Local demo calendar · your approval comes first</span></footer>
 </div>;
}
