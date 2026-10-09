import {useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {SdIcon} from './icons';
import {formatSchedule} from '../shared/presentation';
import {calendarDays,calendarClockChange,dayLabel,moveAnchor,segmentEvents,zonedStamp,type CalendarEvent,type CalendarView,type EventSegment} from './calendarModel';

type Peek={title:string;events:CalendarEvent[];x:number;y:number;pinned:boolean};
// Previewed events are pencilled in; only a server-confirmed write inks them.
export function CalendarPane({events,zone,referenceDate,previewId,committed=false}:{events:CalendarEvent[];zone:string;referenceDate:string;previewId?:string;committed?:boolean}){
 const reference=new Date(referenceDate+'T12:00:00Z');
 const safeReference=!Number.isNaN(reference.valueOf())&&reference.toISOString().slice(0,10)===referenceDate?referenceDate:(zonedStamp(new Date().toISOString(),zone)?.day||new Date().toISOString().slice(0,10));
 const [view,setView]=useState<CalendarView>('week');
 const [anchor,setAnchor]=useState(safeReference),[peek,setPeek]=useState<Peek|null>(null),[motion,setMotion]=useState('compress'),[clock,setClock]=useState(()=>Date.now());
 const scroll=useRef<HTMLDivElement>(null),lastPreview=useRef(''),dismiss=useRef<ReturnType<typeof setTimeout>|null>(null),tooltipId=useId();
 const days=useMemo(()=>calendarDays(anchor,view),[anchor,view]);
 const segments=useMemo(()=>segmentEvents(events,days,zone),[events,days,zone]);
 const hourHeight=view==='day'?52:42;
 useEffect(()=>{
 if(previewId&&lastPreview.current!==previewId){lastPreview.current=previewId;const first=events.map(e=>zonedStamp(e.start_at,zone)?.day).find(Boolean);if(first)setAnchor(first)}
 },[previewId,events,zone]);
 useEffect(()=>{if(!previewId)setAnchor(safeReference)},[safeReference,previewId]);
 useEffect(()=>{if(scroll.current&&view!=='month')scroll.current.scrollTop=Math.max(0,8*hourHeight-18)},[view,anchor,hourHeight]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setPeek(null)};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);if(dismiss.current)clearTimeout(dismiss.current)}},[]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer)},[]);
 useEffect(()=>setPeek(null),[view,anchor,events,zone]);
 function changeView(next:CalendarView){
 if(next===view)return;
 const weight={day:0,week:1,month:2};setMotion(weight[next]>weight[view]?'compress':'expand');
 const update=()=>{setPeek(null);setView(next)};
 const transition=(document as Document&{startViewTransition?:(fn:()=>void)=>{finished:Promise<void>}}).startViewTransition;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 if(transition&&!reduced){try{transition.call(document,()=>flushSync(update)).finished.catch(()=>{});return}catch{/* CSS fallback */}}
 update();
 }
 function openPeek(target:HTMLElement,title:string,rows:CalendarEvent[],pinned=false){
 if(dismiss.current)clearTimeout(dismiss.current);
 const box=target.getBoundingClientRect(),width=Math.min(320,window.innerWidth-24);
 setPeek({title,events:rows,x:Math.max(12,Math.min(box.left,window.innerWidth-width-12)),y:Math.max(12,Math.min(box.bottom+8,window.innerHeight-260)),pinned});
 }
 function closeLater(){if(dismiss.current)clearTimeout(dismiss.current);dismiss.current=setTimeout(()=>setPeek(current=>current?.pinned?current:null),180)}
 const now=zonedStamp(new Date(clock).toISOString(),zone),today=now?.day||safeReference;
 const title=view==='month'?dayLabel(anchor,{month:'long',year:'numeric'}):view==='day'?dayLabel(anchor,{weekday:'short',month:'short',day:'numeric',year:'numeric'}):days.length?dayLabel(days[0],{month:'short',day:'numeric'})+' – '+dayLabel(days[6],{month:'short',day:'numeric',year:'numeric'}):'Choose a date';
 function eventButton(s:EventSegment,compact=false){
 const when=formatSchedule(s.event.start_at,s.event.end_at,zone);
 const style:CSSProperties={viewTransitionName:'cal-event-'+s.index+'-'+s.day,...(!compact?{top:(s.start/1440*100)+'%',height:s.clockFold?22:Math.max((s.end-s.start)/1440*100,2)+'%',left:(s.lane/s.lanes*100)+'%',width:(100/s.lanes)+'%'}:{})};
 return <button key={s.index+'-'+s.day} type="button" className={'sd-ev '+(compact?'sd-ev-month':'sd-ev-timed')+(s.clockFold?' is-fold':'')+(committed?' is-inked':'')} style={style} aria-label={s.event.title+', '+when.date+', '+when.time+(s.clockFold?', clock changes':'')} aria-describedby={peek?.events.includes(s.event)?tooltipId:undefined}
 onMouseEnter={e=>openPeek(e.currentTarget,s.event.title,[s.event])} onMouseLeave={closeLater} onFocus={e=>openPeek(e.currentTarget,s.event.title,[s.event])} onBlur={closeLater} onClick={e=>openPeek(e.currentTarget,s.event.title,[s.event],true)}>
 <strong>{s.event.title}</strong>{!compact&&<span>{s.clockFold?'Clock changes':when.time}</span>}</button>;
 }
 return <div className="sd-cal">
 <div className="sd-cal-top"><div className="sd-cal-nav"><button className="sd-icon-btn" aria-label="Previous calendar period" onClick={()=>setAnchor(moveAnchor(anchor,view,-1))}><SdIcon name="chevron" className="sd-flip" size={15}/></button><h3 className="sd-cal-title">{title}</h3><button className="sd-icon-btn" aria-label="Next calendar period" onClick={()=>setAnchor(moveAnchor(anchor,view,1))}><SdIcon name="chevron" size={15}/></button></div><button className="sd-btn sd-btn-small" onClick={()=>setAnchor(today)}>Today</button></div>
 <div className="sd-cal-views"><div className="sd-seg" role="group" aria-label="Calendar view">{(['day','week','month'] as const).map(v=><button key={v} aria-pressed={view===v} onClick={()=>changeView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div><span className="sd-cal-zone" title={'All times shown in '+zone}><SdIcon name="clock" size={13}/>{zone}</span></div>
 <div className={'sd-cal-canvas sd-cal-'+view} data-motion={motion} key={view}>
 {view==='month'?<div className="sd-month" role="grid" aria-label="Month schedule"><div className="sd-month-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div><div className="sd-month-days">{days.map(day=>{
 const rows=segments.filter(s=>s.day===day),date=dayLabel(day,{weekday:'long',month:'long',day:'numeric'});
 return <div className={'sd-month-day'+(day.slice(0,7)!==anchor.slice(0,7)?' is-outside':'')+(day===today?' is-today':'')} role="gridcell" aria-label={date} key={day}>
 <button className="sd-month-num" aria-label={'Open day '+day} onClick={()=>{setAnchor(day);changeView('day')}}>{Number(day.slice(-2))}</button>
 <div className="sd-month-entries">{rows.slice(0,2).map(s=>eventButton(s,true))}{rows.length>2&&<button className="sd-month-more" onMouseEnter={e=>openPeek(e.currentTarget,date,rows.map(s=>s.event))} onMouseLeave={closeLater} onFocus={e=>openPeek(e.currentTarget,date,rows.map(s=>s.event))} onBlur={closeLater} onClick={e=>openPeek(e.currentTarget,date,rows.map(s=>s.event),true)}>+{rows.length-2} more</button>}</div></div>;
 })}</div></div>:<>
 <div className="sd-time-scroll" ref={scroll}><div className="sd-time-heads" style={{gridTemplateColumns:'44px repeat('+days.length+', minmax(0, 1fr))'}}><span/>{days.map(day=><button key={day} className={day===today?'is-today':''} aria-label={'Open day '+day} onClick={()=>{setAnchor(day);changeView('day')}}><span>{dayLabel(day,{weekday:'short'})}</span><strong>{Number(day.slice(-2))}</strong></button>)}</div>
 <div className="sd-time-grid" role="grid" aria-label={(view==='day'?'Day':'Week')+' schedule · '+zone} style={{height:24*hourHeight,gridTemplateColumns:'44px repeat('+days.length+', minmax(0, 1fr))','--hour-height':hourHeight+'px'} as CSSProperties}>
 <div className="sd-time-axis">{Array.from({length:24},(_,h)=><span key={h} style={{top:h*hourHeight}}>{String(h).padStart(2,'0')}:00</span>)}</div>{days.map(day=><div key={day} className={'sd-time-day'+(day===today?' is-today':'')} aria-label={day} role="row">{now&&day===now.day&&<span className="sd-now" style={{top:(now.minute/1440*100)+'%'}} aria-hidden="true"/>}{segments.filter(s=>s.day===day).map(s=>eventButton(s))}</div>)}
 </div></div></>}
 </div>
 {!events.length&&<p className="sd-cal-status">Dated tasks appear here in pencil until you approve them.</p>}
 {events.length>0&&!segments.length&&<p className="sd-cal-status">No events in this period.</p>}
 {events.length>0&&<p className="sd-cal-legend"><span className={'sd-swatch'+(committed?' is-inked':'')} aria-hidden="true"/>{committed?'Written to your demo calendar':'Pencilled in until you approve'}</p>}
 {peek&&createPortal(<div id={tooltipId} role={peek.pinned?'dialog':'tooltip'} aria-label="Event details" className="sd-peek" style={{left:peek.x,top:peek.y,width:Math.min(320,window.innerWidth-24)}} onMouseEnter={()=>{if(dismiss.current)clearTimeout(dismiss.current)}} onMouseLeave={closeLater}>
 <div className="sd-peek-head"><strong>{peek.title}</strong><button className="sd-icon-btn" aria-label="Close event details" onClick={()=>setPeek(null)}><SdIcon name="close" size={16}/></button></div><div className="sd-peek-agenda">{peek.events.map((e,i)=>{const when=formatSchedule(e.start_at,e.end_at,zone),shift=calendarClockChange(e,zone);return <div className="sd-peek-event" key={i}>{peek.events.length>1&&<strong>{e.title}</strong>}<span>{when.date}</span><span><SdIcon name="clock" size={13}/>{when.time}</span>{shift&&<><span>Clock changes · {shift.elapsed} min elapsed</span><span>{shift.start} → {shift.end}</span></>}</div>})}</div><small>{zone} · {committed?'Written to the demo calendar':'Preview only, not written yet'}</small>
 </div>,document.body)}
 </div>;
}
