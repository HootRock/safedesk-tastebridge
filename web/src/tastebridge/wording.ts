import type {RunEvent} from '../shared/types';
// TasteBridge's plain-language vocabulary. Server codes stay visible for support.
const runErrors:Record<string,string>={
 feedback_needs_clarification:"Your movie update wasn't applied. Choose the exact film below and try the seen button again.",
 feedback_limit:"This group has used its three seen-movie updates. You can still review the previous shortlist.",
 session_rate_limit:"This session has reached its four-request limit. Wait up to ten minutes before trying again.",
 model_attempt_limit:"The planner reached this run's request limit before finishing. Your preferences have been kept.",
 tool_call_limit:"The planner reached this run's tool limit before finishing. Your preferences have been kept.",
 rate_limited:"Qloo is limiting requests right now. Wait a moment before trying again.",
 daily_limit:"This service has reached its daily Qloo request limit. Please try again tomorrow.",
};
export function runErrorMessage(code?:string|null){return runErrors[code||'']||"This attempt couldn't finish. Please try again or check the record below."}
export function listNames(names:string[]){return names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names[names.length-1]}
const errors:Record<string,[string,string]>={
 run_in_progress:['A search is already running','Wait for it to finish, or use Check current run.'],
 version_conflict:['Your group changed in another tab','Find your movie again to use the latest favorites.'],
 invalid_group:['The group needs two to four friends','Each friend needs one to five confirmed favorites.'],
 unconfirmed_entity:['A favorite needs confirming again','Remove it and choose it from the search results.'],
 group_unavailable:['This group expired','Confirm everyone\'s favorites and find your movie again.'],
 run_unavailable:['That shortlist expired','Find your movie again to get a fresh shortlist.'],
 session_required:['Your session expired','Reload the page to start a new session.'],
 action_token_required:['This tab lost its secure session','Reload the page, then try again.'],
 wrong_origin:['Request blocked','Open TasteBridge from its own address and try again.'],
 qloo_unconfigured:['Qloo is unavailable','The operator needs to restore Qloo access. Please try again later.'],
 unauthorized:['Qloo access is unavailable','The operator needs to restore Qloo access. Please try again later.'],
 timeout:['Qloo took too long to answer','Try again in a moment.'],
 service_error:['Qloo is not responding','Try again in a moment.'],
 invalid_response:['Qloo sent an unreadable answer','Try again in a moment.'],
 invalid_query:['That search could not be sent','Use 1 to 200 characters.'],
 rate_limited:['Qloo is limiting requests','Wait a moment before searching again.'],
 daily_limit:['Daily Qloo limit reached','Searching works again tomorrow.'],
};
export function describeError(message:string):{title:string;detail:string;code?:string}{
 if(message.startsWith('Still processing'))return {title:'Still comparing',detail:message};
 const known=errors[message];if(known)return {title:known[0],detail:known[1],code:message};
 if(/failed to fetch|networkerror|load failed|unexpected token|session unavailable/i.test(message))return {title:'Cannot reach the service',detail:'Check your connection and try again shortly.',code:message};
 if(/^[a-z]+(_[a-z]+)+$/.test(message))return {title:'This step could not finish',detail:'Your favorites are kept. Try again.',code:message};
 return {title:'This step could not finish',detail:message};
}
export function searchMessage(message:string){const known=errors[message];return known?known[0]+'. '+known[1]:describeError(message).title+'. '+describeError(message).detail}
// One readable line per recorded step behind a shortlist.
export function describeStep(e:RunEvent,names:Record<string,string>):{title:string;detail:string}{
 const p=e.payload as Record<string,unknown>,name=(id:unknown)=>names[String(id)]||String(id);
 if(e.decision==='denied')return {title:'Stopped before finishing',detail:runErrorMessage(String(p.reason||''))};
 if(e.decision==='reused')return {title:e.tool_name==='refine_preferences'?'Seen films already set aside':'Reused the earlier results',detail:'No new Qloo request was made.'};
 if(e.tool_name==='recommend_movies'){const n=Number(p.candidate_count)||0;return {title:'Qloo candidates for '+name(p.member_id),detail:n+' film'+(n===1?'':'s')+' returned from '+name(p.member_id)+"'s confirmed favorites."}}
 if(e.tool_name==='recommend_for_group'){const counts=p.members&&typeof p.members==='object'?Object.entries(p.members as Record<string,number>):[];return {title:"Every friend's list is in",detail:counts.map(([id,n])=>name(id)+': '+n).join(', ')}}
 if(e.tool_name==='rank_for_group'){const n=Array.isArray(p.ranked_entities)?p.ranked_entities.length:0;return {title:'Lists compared',detail:'Kept the top '+n+' by group score.'}}
 if(e.tool_name==='refine_preferences'){const n=Array.isArray(p.pending_exclusions)?p.pending_exclusions.length:0;return {title:'Seen film set aside',detail:n+' film'+(n===1?'':'s')+' excluded from this search.'}}
 return {title:'Step recorded',detail:String(p.message||'')};
}
