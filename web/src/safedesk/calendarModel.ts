export type CalendarView='day'|'week'|'month';
export type CalendarEvent={title:string;start_at:string;end_at:string};
export type EventSegment={event:CalendarEvent;index:number;day:string;start:number;end:number;lane:number;lanes:number;clockFold:boolean};
const dateOnly=(date:Date)=>date.toISOString().slice(0,10);
function dateValue(value:string){return new Date(value+'T12:00:00Z')}
export function addDays(value:string,amount:number){const date=dateValue(value);date.setUTCDate(date.getUTCDate()+amount);return dateOnly(date)}
export function calendarDays(anchor:string,view:CalendarView):string[]{
 const date=dateValue(anchor);if(Number.isNaN(date.valueOf()))return [];
 if(view==='day')return [anchor];
 if(view==='month')date.setUTCDate(1);
 const start=addDays(dateOnly(date),-((date.getUTCDay()+6)%7));
 return Array.from({length:view==='week'?7:42},(_,i)=>addDays(start,i));
}
export function moveAnchor(anchor:string,view:CalendarView,delta:number){
 if(view!=='month')return addDays(anchor,delta*(view==='week'?7:1));
 const date=dateValue(anchor),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+delta);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return dateOnly(date);
}
export function zonedStamp(value:string,zone:string){
 const instant=new Date(value);if(Number.isNaN(instant.valueOf()))return null;
 try{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const get=(key:string)=>parts.find(p=>p.type===key)?.value||'0';
 return {day:get('year')+'-'+get('month')+'-'+get('day'),minute:Number(get('hour'))*60+Number(get('minute'))+Number(get('second'))/60};
 }catch{return null}
}
export function dayLabel(day:string,options:Intl.DateTimeFormatOptions){
 return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(dateValue(day));
}
export function calendarClockChange(event:CalendarEvent,zone:string){
 const a=zonedStamp(event.start_at,zone),b=zonedStamp(event.end_at,zone);
 if(!a||!b)return null;
 const elapsed=(new Date(event.end_at).valueOf()-new Date(event.start_at).valueOf())/60000;
 const wall=(dateValue(b.day).valueOf()-dateValue(a.day).valueOf())/60000+b.minute-a.minute;
 if(elapsed<=0||Math.abs(wall-elapsed)<.5)return null;
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
 return {start:clock.format(new Date(event.start_at)),end:clock.format(new Date(event.end_at)),elapsed};
}
export function segmentEvents(events:CalendarEvent[],days:string[],zone:string):EventSegment[]{
 const segments:EventSegment[]=[];
 events.forEach((event,index)=>{
 const a=zonedStamp(event.start_at,zone),b=zonedStamp(event.end_at,zone);
 if(!a||!b||new Date(event.end_at).valueOf()<=new Date(event.start_at).valueOf())return;
 for(const day of days){
 if(day<a.day||day>b.day||(day===b.day&&b.minute===0))continue;
 const start=day===a.day?a.minute:0,wallEnd=day===b.day?b.minute:1440;
 const clockFold=a.day===b.day&&wallEnd<=start;
 if(wallEnd>start||clockFold)segments.push({event,index,day,start,end:clockFold?start:wallEnd,lane:0,lanes:1,clockFold});
 }
 });
 for(const day of days){
 const rows=segments.filter(s=>s.day===day).sort((a,b)=>a.start-b.start||b.end-a.end);
 let group:EventSegment[]=[],groupEnd=-1;
 // A clock-fold marker occupies a small hit target, not an invented duration bar.
 const collisionEnd=(s:EventSegment)=>s.clockFold?s.start+30:s.end;
 const assign=()=>{const ends:number[]=[];for(const s of group){let lane=ends.findIndex(end=>end<=s.start);if(lane<0)lane=ends.length;ends[lane]=collisionEnd(s);s.lane=lane}for(const s of group)s.lanes=ends.length;group=[]};
 for(const s of rows){if(group.length&&s.start>=groupEnd)assign();group.push(s);groupEnd=Math.max(group.length===1?-1:groupEnd,collisionEnd(s))}if(group.length)assign();
 }
 return segments.sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start||a.index-b.index);
}

