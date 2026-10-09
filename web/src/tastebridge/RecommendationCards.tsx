import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {MovieRun} from '../shared/types';
import {TbIcon} from './icons';
import {listNames} from './wording';
type Candidate=MovieRun['candidates'][number];
type Friend={id:string;name:string;tone:number};
const words=['No','One','Two','Three','Four','Five'];
// The UI is English, so the fetch time is too, whatever the system locale.
const fetchedFormat=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'});
function fetchedLabel(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'':fetchedFormat.format(d)}
function posterUrl(metadata:Record<string,unknown>){
 const image=metadata.image;
 const value=typeof image==='object'&&image!==null&&'url' in image?String(image.url):'';
 try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch{return ''}
}
// Seats under a poster: whose Qloo candidate list returned this film, and at which rank.
function Seats({movie,friends}:{movie:Candidate;friends:Friend[]}){
 if(!friends.length)return null;
 const ranks=movie.ranking.ranks,count=friends.filter(f=>typeof ranks[f.id]==='number').length;
 return <div className="tb-seats"><ul aria-label={'Candidate lists for '+movie.name}>{friends.map(f=>{const rank=ranks[f.id],has=typeof rank==='number';return <li key={f.id} className={'tb-seat tb-seat-'+f.tone+(has?' is-lit':'')} title={f.name+(has?': rank '+rank:': not returned for them')}>
  <span aria-hidden="true">{f.name.slice(0,1).toUpperCase()}</span><b aria-hidden="true">{has?'#'+rank:'–'}</b><span className="tb-sr">{f.name+(has?': candidate rank '+rank:': not returned for them')}</span></li>})}</ul><small>In {count} of {friends.length} lists</small></div>;
}
function FilmCard({movie,index,selected,friends,onExplore}:{movie:Candidate;index:number;selected:boolean;friends:Friend[];onExplore:()=>void}){
 const [failed,setFailed]=useState(false),url=posterUrl(movie.metadata),shown=!!url&&!failed;
 const rating=typeof movie.metadata.content_rating==='string'?movie.metadata.content_rating:'';
 return <article className="tb-film" aria-label={'Film option: '+movie.name} data-selected={selected?'true':undefined} style={{'--i':index} as CSSProperties}>
  {shown&&<img className="tb-film-glow" src={url} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>}
  <div className="tb-poster" onClick={onExplore}>{shown?<img src={url} alt={movie.name+' poster'} width={300} height={450} loading="eager" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="tb-poster-fallback"><TbIcon name="film" size={34}/><strong>{movie.name}</strong><span>Poster unavailable</span></div>}</div>
  <div className="tb-film-info"><h3>{movie.name}</h3>
   <p className="tb-film-meta"><span>{String(movie.metadata.release_year||'Year unknown')}</span>{typeof movie.metadata.duration==='number'&&<span>{movie.metadata.duration} min</span>}{rating&&<span>{rating}</span>}</p>
   <Seats movie={movie} friends={friends}/>
   <button className="tb-btn tb-btn-ghost" aria-label={'Explore '+movie.name} aria-pressed={selected} onClick={onExplore}>View details<TbIcon name="chevron" size={14}/></button>
  </div>
 </article>;
}
function Empty({text}:{text:string}){return <div className="tb-empty" role="status"><div className="tb-empty-frames" aria-hidden="true"><span/><span/><span/></div><h2>Find your middle ground</h2><p>{text}</p></div>}
export function ShortlistGuidance(){return <Empty text="Confirm each friend's favorites, then find a movie together. Your shortlist will appear here."/>}
export function RecommendationCards({run,onSeen,disabled=false,memberNames={}}:{run:MovieRun;onSeen:(movie:{entity_id:string;name:string})=>void;disabled?:boolean;memberNames?:Record<string,string>}){
 const [selectedId,setSelectedId]=useState(''),[detailsOpen,setDetailsOpen]=useState(false),details=useRef<HTMLElement>(null);
 useEffect(()=>{if(detailsOpen)details.current?.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})},[detailsOpen,selectedId]);
 if(run.status==='needs_clarification')return <div className="tb-note is-clarify" role="status"><TbIcon name="info" size={18}/><div><h2>One detail before we continue</h2>{run.explanations.map((message,i)=><p key={i}>{message}</p>)}</div></div>;
 if(['failed','rate_limited','cancelled','running'].includes(run.status))return null;
 if(run.status==='empty')return <Empty text="No candidates. Try adding another preference."/>;
 const selected=run.candidates.find(c=>c.entity_id===selectedId)||run.candidates[0];
 if(!selected)return <Empty text="No films were returned. Try adding another favorite."/>;
 const noCommon=run.candidates.every(c=>Object.values(c.ranking.ranks).some(rank=>rank===null));
 const genres=Array.isArray(selected.metadata.genres)?selected.metadata.genres.filter(x=>typeof x==='string').slice(0,3):[];
 const description=typeof selected.metadata.plot_summary==='string'?selected.metadata.plot_summary:typeof selected.metadata.description==='string'?selected.metadata.description:'';
 const rankIds=[...new Set(run.candidates.flatMap(c=>Object.keys(c.ranking.ranks)))],known=Object.keys(memberNames).filter(id=>rankIds.includes(id));
 const friends:Friend[]=(known.length?known:rankIds).map((id,tone)=>({id,name:memberNames[id]||id,tone:tone%4}));
 const count=run.candidates.length,word=words[count]||String(count),noun=count===1?'film':'films';
 const heading=known.length?word+' '+noun+' for '+listNames(friends.map(f=>f.name)):word+' '+noun+' to compare';
 const backdrop=posterUrl(selected.metadata);
 return <div className="tb-shortlist">
  <div className="tb-shortlist-head"><h2>{heading}</h2><span className="tb-source">{run.mode==='live'?'Live Qloo data':'Test fixture'}</span></div>
  {noCommon&&<p className="tb-overlap-note">None of these shortlisted films appears in every friend's candidate list. Add another favorite to look for a stronger overlap.</p>}
  <div className="tb-wall" style={{'--count':count} as CSSProperties}>{run.candidates.map((movie,i)=><FilmCard key={movie.entity_id} index={i} movie={movie} friends={friends} selected={selected.entity_id===movie.entity_id} onExplore={()=>{setSelectedId(movie.entity_id);setDetailsOpen(true)}}/>)}</div>
  {friends.length>0&&<p className="tb-seat-key">A lit seat shows where the film ranks in that friend's Qloo candidate list. An empty seat means it was not returned for them, not that they dislike it.</p>}
  <div className="tb-seen-bar"><span className="tb-seen-current"><small>Selected film</small><strong>{selected.name}</strong></span><button className="tb-btn" disabled={disabled} aria-label={"I've seen this: "+selected.name} onClick={()=>onSeen({entity_id:selected.entity_id,name:selected.name})}><TbIcon name="eye" size={16}/>I've seen this</button><small className="tb-seen-hint">Swaps this exact film for another. Up to three updates.</small></div>
  {detailsOpen&&<section className="tb-details" aria-label="Selected film details" ref={details}>
   {backdrop&&<img className="tb-details-backdrop" src={backdrop} alt="" aria-hidden="true" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none'}}/>}
   <div className="tb-details-body"><div className="tb-details-head"><h4>{selected.name}</h4><button className="tb-icon-btn" aria-label="Close film details" onClick={()=>setDetailsOpen(false)}><TbIcon name="close" size={16}/></button></div>
    {genres.length>0&&<p className="tb-genres">{genres.map(g=><span key={g}>{g}</span>)}</p>}
    {description?<p className="tb-plot">{description}</p>:<p className="tb-plot is-missing">Qloo did not return a description for this film.</p>}</div>
  </section>}
  <details className="tb-evidence"><summary><span className="tb-evidence-title"><TbIcon name="list" size={17}/>Taste details</span><span className="tb-evidence-meta">Candidate ranks by friend<TbIcon name="chevron" size={15} className="tb-disclosure"/></span></summary>
   <div className="tb-evidence-body">
    <div className="tb-score"><div><h4>How {selected.name} meets your tastes</h4><p className="tb-score-caption">Based on candidate ranks, not a probability.</p></div><span className="tb-score-value"><strong>{Math.round(selected.ranking.score*100)}</strong>/100 group score</span></div>
    <ul className="tb-ranks">{friends.map(f=>{const rank=selected.ranking.ranks[f.id];return <li key={f.id} className={'tb-rank tb-seat-'+f.tone}><span className="tb-avatar" aria-hidden="true">{f.name.slice(0,1).toUpperCase()}</span><span className="tb-rank-name">{f.name}</span><span className="tb-rank-track" aria-hidden="true">{typeof rank==='number'&&<i style={{left:Math.min(100,(rank-1)/19*100)+'%'}}/>}</span><strong className={typeof rank==='number'?'':'is-missing'}>{typeof rank==='number'?'Candidate rank #'+rank:'Not in this candidate list'}</strong></li>})}</ul>
    <p className="tb-rank-scale" aria-hidden="true">Each line runs from rank 1 on the left to rank 20.</p>{run.explanations.map((x,i)=><p className="tb-evidence-note" key={i}>{x}</p>)}
    {run.fetched_at&&fetchedLabel(run.fetched_at)&&<p className="tb-footnote">Data fetched {fetchedLabel(run.fetched_at)} · cached up to 15 minutes</p>}
   </div>
   <small className="tb-evidence-credit">Poster and film metadata provided by Qloo. Images may be unavailable from their original host.</small>
  </details>
 </div>;
}
