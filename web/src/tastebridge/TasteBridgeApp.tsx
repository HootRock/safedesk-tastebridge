import {TasteBridgePage} from './TasteBridgePage';
import {useServiceHealth,useDocumentIdentity,type ServiceHealth} from '../shared/useServiceHealth';
import './tastebridge.css';
const favicon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#160f13"/><circle cx="12.5" cy="16" r="7.5" fill="none" stroke="#f5ead9" stroke-width="1.6"/><circle cx="19.5" cy="16" r="7.5" fill="none" stroke="#f5ead9" stroke-width="1.6"/><path d="M16 9.37A7.5 7.5 0 0 1 16 22.63A7.5 7.5 0 0 1 16 9.37Z" fill="#f2b45a"/></svg>');
function status(h:ServiceHealth):{label:string;tone:'wait'|'ok'|'off';title:string}{
 if(h.state==='connecting')return {label:'Connecting',tone:'wait',title:'Checking the service'};
 if(h.state==='unavailable')return {label:'Service unavailable',tone:'off',title:'Check your connection and try again shortly'};
 if(h.mode==='test')return {label:'Test fixture',tone:'ok',title:'Responses come from recorded test fixtures'};
 if(!h.qlooConfigured)return {label:h.publicHosting?'Qloo unavailable':'Qloo key needed',tone:'off',title:h.publicHosting?'The operator needs to restore Qloo access. Please try again later':'Add QLOO_API_KEY to .env, then restart the service'};
 if(!h.modelEnabled)return {label:h.publicHosting?'Planner unavailable':'Setup needed',tone:'off',title:h.publicHosting?'The operator needs to restore planning. Please try again later':'Enable the configured model in .env, then restart the service'};
 if(h.modelProvider==='cloudflare')return {label:'Live · hosted',tone:'ok',title:'Live Qloo data with the Cloudflare Workers AI hosted planner'};
 return h.modelProvider==='groq'?{label:'Live · hosted',tone:'ok',title:'Live Qloo data with the Groq hosted planner'}:{label:'Live · local',tone:'ok',title:'Live Qloo data with the local Codex planner'};
}
// Two tastes overlapping; the lit lens is the film you share.
function Mark(){return <svg className="tb-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="12.5" cy="16" r="7.5" className="mark-ring"/><circle cx="19.5" cy="16" r="7.5" className="mark-ring"/><path d="M16 9.37A7.5 7.5 0 0 1 16 22.63A7.5 7.5 0 0 1 16 9.37Z" className="mark-lens"/></svg>}
export function TasteBridgeApp(){
 const health=useServiceHealth(),s=status(health);
 useDocumentIdentity('TasteBridge','#160f13',favicon,'tastebridge');
 return <div className="tb-app">
  <a className="tb-skip" href="#tb-main">Skip to the group</a>
  <header className="tb-header">
   <a className="tb-brand" href="/tastebridge" aria-label="TasteBridge" aria-current="page" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();window.scrollTo?.({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}}><Mark/><span>Taste<em>Bridge</em></span></a>
   <span className={'tb-status is-'+s.tone} title={s.title}><span className="tb-status-dot" aria-hidden="true"/>{s.label}</span>
  </header>
  <main id="tb-main" tabIndex={-1}><h1 className="tb-sr">TasteBridge: choose a film together</h1><TasteBridgePage/></main>
  <footer className="tb-footer"><span>TasteBridge · Taste intelligence by Qloo</span></footer>
 </div>;
}
