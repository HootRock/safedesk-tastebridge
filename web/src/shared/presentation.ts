export function formatSchedule(start:string|null,end:string|null,zone='Asia/Shanghai'){
 if(!start||!end)return {date:'Time to be confirmed',time:'Unscheduled'};
 const a=new Date(start),b=new Date(end);
 if(Number.isNaN(a.valueOf())||Number.isNaN(b.valueOf()))return {date:start,time:end};
 try{
  const date=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(a);
  const fraction=(value:string)=>value.match(/T\d{2}:\d{2}:\d{2}(\.\d+)/)?.[1]||'';
  const hasFraction=[fraction(start),fraction(end)].some(value=>/[1-9]/.test(value));
  const withSeconds=a.getUTCSeconds()!==0||b.getUTCSeconds()!==0||hasFraction;
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',...(withSeconds?{second:'2-digit' as const}:{}),hour12:false});
  const time=(value:Date,raw:string)=>clock.format(value)+(hasFraction?fraction(raw):'');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:zone});
  const year=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric'});
  const endDate=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',...(year.format(a)!==year.format(b)?{year:'numeric' as const}:{})}).format(b);
  return {date,time:day.format(a)===day.format(b)?`${time(a,start)} – ${time(b,end)}`:`${time(a,start)} – ${endDate}, ${time(b,end)}`};
 }catch{return {date:start,time:end}};
}
