import {useEffect,useState,useRef} from 'react';
import {requestJson} from '../shared/api';
import type {Entity} from '../shared/types';
import {TbIcon} from './icons';
import {searchMessage} from './wording';
export type Member={id:string;nickname:string;query:string;kind:'movie'|'artist';selected:Entity[]};
const noResults='No results. Try the original title or artist name.';
// Each friend holds a ticket: a seat colour, a name and up to five confirmed favorites.
export function MemberInput({member,onChange,disabled,index=0,compact=false,onRemove}:{member:Member;onChange:(m:Member)=>void;disabled:boolean;index?:number;compact?:boolean;onRemove?:()=>void}){
 const [results,setResults]=useState<Entity[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);const epoch=useRef(0);
 useEffect(()=>{const version=++epoch.current;setResults([]);setError('');if(!member.query.trim()){setLoading(false);return}setLoading(true);
  const timer=setTimeout(()=>requestJson<Entity[]>(`/api/tastebridge/entities/search?query=${encodeURIComponent(member.query)}&kind=${member.kind}`).then(rows=>{if(version===epoch.current){setResults(rows);setError(rows.length?'':noResults)}}).catch(e=>{if(version===epoch.current)setError(e.message)}).finally(()=>{if(version===epoch.current)setLoading(false)}),300);
  return ()=>{clearTimeout(timer);epoch.current++};
 },[member.query,member.kind]);
 const initial=(member.nickname.trim()||'?').slice(0,1).toUpperCase(),seat='tb-seat-'+index%4,full=member.selected.length>=5;
 const remove=onRemove&&<button className="tb-icon-btn tb-ticket-remove" aria-label={'Remove '+member.nickname} title={'Remove '+member.nickname} disabled={disabled} onClick={onRemove}><TbIcon name="close" size={15}/></button>;
 if(compact)return <article className={'tb-ticket is-compact '+seat}><span className="tb-avatar" aria-hidden="true">{initial}</span><div className="tb-ticket-body">
  <div className="tb-ticket-head"><strong className="tb-ticket-name">{member.nickname}</strong><small className="tb-confirmed-state"><TbIcon name="check" size={12}/>Confirmed</small>{remove}</div>
  <ul className="tb-confirmed">{member.selected.map(entity=><li key={entity.entity_id}><TbIcon name={entity.kind==='movie'?'film':'music'} size={13}/><span><small>{entity.kind==='movie'?'Favorite movie':'Favorite artist'}</small>{entity.name}</span></li>)}</ul>
 </div></article>;
 return <article className={'tb-ticket '+seat}><span className="tb-avatar" aria-hidden="true">{initial}</span><div className="tb-ticket-body">
  <div className="tb-ticket-head"><div className="tb-ticket-who"><small>Friend {index+1}</small><input aria-label="Friend nickname" disabled={disabled} value={member.nickname} onChange={e=>onChange({...member,nickname:e.target.value})}/></div><span className={'tb-count'+(member.selected.length?' is-ready':'')} title="Confirmed favorites">{member.selected.length>0&&<TbIcon name="check" size={12}/>}{member.selected.length}/5</span>{remove}</div>
  <div className="tb-search">
   <div className="tb-kind" role="group" aria-label="Preference type">{(['movie','artist'] as const).map(k=><button key={k} type="button" aria-pressed={member.kind===k} disabled={disabled} onClick={()=>onChange({...member,kind:k})}><TbIcon name={k==='movie'?'film':'music'} size={13}/>{k==='movie'?'Movie':'Music artist'}</button>)}</div>
   <label className="tb-search-field"><TbIcon name="search" size={15}/><input aria-label="Search preference" placeholder={member.kind==='movie'?'A movie you love…':'An artist you love…'} disabled={disabled} value={member.query} onChange={e=>onChange({...member,query:e.target.value})}/>{loading&&<span className="tb-spinner" aria-hidden="true"/>}</label>
  </div>
  {loading&&<small className="tb-search-status" role="status">Searching…</small>}
  {error&&<p className="tb-search-note">{error===noResults?noResults:searchMessage(error)}</p>}
  {results.length>0&&<ul className="tb-results" aria-label={'Search results for '+member.nickname}>{results.map(entity=>{const chosen=member.selected.some(x=>x.entity_id===entity.entity_id);return <li key={entity.entity_id}><button disabled={disabled||full||chosen} aria-label={`Select ${entity.name}${entity.year?` (${entity.year})`:''}`} onClick={()=>{onChange({...member,query:'',selected:[...member.selected,entity]});setResults([])}}><TbIcon name={entity.kind==='movie'?'film':'music'} size={15}/><span className="tb-result-name">{entity.name}<small>{entity.year||'Year unknown'}</small></span><span className="tb-result-add">{chosen?'Added':<TbIcon name="plus" size={15}/>}</span></button></li>})}</ul>}
  {full&&member.query.trim()!==''&&<p className="tb-search-note">Five favorites is the limit. Remove one to add another.</p>}
  {member.selected.length>0&&<ul className="tb-stubs" aria-label={member.nickname+"'s favorites"}>{member.selected.map(e=><li key={e.entity_id}><TbIcon name={e.kind==='movie'?'film':'music'} size={12}/><span>{e.name}</span><button className="tb-stub-remove" disabled={disabled} aria-label={`Remove ${e.name}`} onClick={()=>onChange({...member,selected:member.selected.filter(x=>x.entity_id!==e.entity_id)})}><TbIcon name="close" size={12}/></button></li>)}</ul>}
 </div></article>;
}
